import { Octokit } from '@octokit/rest'
import { getToken, getRepoConfig, getCached, setCache } from './store'
import type {
  ReportProfile,
  Report,
  CheckIn,
  Summary,
  Transcript,
  ActionItem,
  FeedbackEntry,
  Goal,
  TeamOverview,
  ReportStatus
} from '../shared/types'

let octokit: Octokit | null = null

function getOctokit(): Octokit {
  if (!octokit) {
    const token = getToken()
    if (!token) throw new Error('Not authenticated')
    octokit = new Octokit({ auth: token })
  }
  return octokit
}

export function resetOctokit(): void {
  octokit = null
}

function repo() {
  const config = getRepoConfig()
  console.log('[GitHub] repo config:', config)
  return { owner: config.owner, repo: config.name }
}

// ── File operations ──

async function getFileContent(path: string): Promise<string> {
  const cached = getCached<string>(`file:${path}`)
  if (cached) return cached

  const { data } = await getOctokit().repos.getContent({ ...repo(), path })
  if ('content' in data && data.content) {
    const content = Buffer.from(data.content, 'base64').toString('utf-8')
    setCache(`file:${path}`, content)
    return content
  }
  throw new Error(`Not a file: ${path}`)
}

async function listDirectory(path: string): Promise<string[]> {
  const cached = getCached<string[]>(`dir:${path}`)
  if (cached) return cached

  try {
    const { data } = await getOctokit().repos.getContent({ ...repo(), path })
    if (Array.isArray(data)) {
      // Only return directories, not files
      const names = data
        .filter((f) => f.type === 'dir')
        .map((f) => f.name)
      setCache(`dir:${path}`, names)
      return names
    }
  } catch {
    return []
  }
  return []
}

async function listFiles(path: string): Promise<string[]> {
  const cached = getCached<string[]>(`files:${path}`)
  if (cached) return cached

  try {
    const { data } = await getOctokit().repos.getContent({ ...repo(), path })
    if (Array.isArray(data)) {
      const names = data
        .filter((f) => f.type === 'file')
        .map((f) => f.name)
      setCache(`files:${path}`, names)
      return names
    }
  } catch {
    return []
  }
  return []
}

export async function commitFile(
  path: string,
  content: string,
  message: string
): Promise<void> {
  const { owner, repo: repoName } = repo()
  let sha: string | undefined

  try {
    const { data } = await getOctokit().repos.getContent({
      owner,
      repo: repoName,
      path
    })
    if ('sha' in data) sha = data.sha
  } catch {
    // File doesn't exist yet
  }

  await getOctokit().repos.createOrUpdateFileContents({
    owner,
    repo: repoName,
    path,
    message,
    content: Buffer.from(content).toString('base64'),
    sha,
    committer: {
      name: 'manager-inator-app',
      email: 'manager-inator-app@users.noreply.github.com'
    }
  })
}

// ── Parsing helpers ──

function parseProfile(content: string, name: string): ReportProfile {
  const getField = (field: string): string => {
    // Try table format: | **Field** | Value: actual |
    const tableMatch = content.match(
      new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*(?:${field}:\\s*)?(.+?)\\s*\\|`, 'i')
    )
    if (tableMatch) return tableMatch[1].trim()

    // Try inline format: Field: value
    const inlineMatch = content.match(new RegExp(`${field}:\\s*(.+)`, 'i'))
    if (inlineMatch) return inlineMatch[1].trim()

    return ''
  }

  const aboutMatch = content.match(/## About\s*\n([\s\S]*?)(?=\n##|$)/)
  const commMatch = content.match(/## Communication Preferences\s*\n([\s\S]*?)(?=\n##|$)/)

  const prefs: Record<string, string> = {}
  if (commMatch) {
    const lines = commMatch[1].split('\n').filter((l) => l.startsWith('-'))
    for (const line of lines) {
      const m = line.match(/-\s*\*\*(.+?)\*\*:\s*(.+)/)
      if (m) prefs[m[1]] = m[2]
    }
  }

  // Extract display name from heading or first line
  const nameMatch = content.match(/^#\s+(.+)/m)
  const displayName =
    nameMatch?.[1]?.replace(/profile/i, '').trim() ||
    name.charAt(0).toUpperCase() + name.slice(1)

  return {
    name,
    displayName,
    role: getField('Role'),
    team: getField('Team'),
    github: getField('GitHub').replace('@', ''),
    startDate: getField('Start Date'),
    meetingDay: getField('Meeting Day'),
    location: getField('Location') || '',
    manager: getField('Manager') || '',
    about: aboutMatch?.[1]?.trim() || '',
    communicationPreferences: prefs
  }
}

function parseActionItems(content: string): ActionItem[] {
  const items: ActionItem[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const match = line.match(/^- \[([ xX])\]\s+(.+)/)
    if (match) {
      const completed = match[1] !== ' '
      let text = match[2]

      // Extract owner if present
      let owner = 'Unknown'
      const ownerMatch = text.match(/\*\*(.+?)\*\*:?\s*/)
      if (ownerMatch) {
        owner = ownerMatch[1]
        text = text.replace(ownerMatch[0], '').trim()
      }

      items.push({ text, owner, completed })
    }
  }

  return items
}

function parseFeedbackLog(content: string): FeedbackEntry[] {
  const entries: FeedbackEntry[] = []
  const blocks = content.split(/^###\s+/m).filter((b) => b.trim())

  for (const block of blocks) {
    const headerMatch = block.match(
      /^(🌟|🔧|💬)?\s*(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(positive|constructive|mixed)/i
    )
    if (!headerMatch) continue

    const date = headerMatch[2]
    const type = headerMatch[3].toLowerCase() as FeedbackEntry['type']

    const sourceMatch = block.match(/\*\*Source\*\*:\s*(.+)/i)
    const contextMatch = block.match(/\*\*Context\*\*:\s*(.+)/i)
    const quoteMatch = block.match(/>\s*(.+(?:\n>\s*.+)*)/m)

    entries.push({
      date,
      type,
      source: sourceMatch?.[1]?.trim() || '',
      context: contextMatch?.[1]?.trim(),
      content: quoteMatch?.[1]?.replace(/^>\s*/gm, '').trim() || block.trim()
    })
  }

  return entries
}

function parseGoals(content: string): Goal[] {
  const goals: Goal[] = []
  const sections = content.split(/^##\s+/m)

  for (const section of sections) {
    let sectionType: Goal['section'] = 'active'
    if (/stretch/i.test(section.split('\n')[0])) sectionType = 'stretch'
    if (/development/i.test(section.split('\n')[0])) sectionType = 'development'

    const goalBlocks = section.split(/^###\s+/m).slice(1)

    for (const block of goalBlocks) {
      const titleLine = block.split('\n')[0]
      const title = titleLine.replace(/^\d+\.\s*/, '').trim()
      if (!title || title === 'Goal title') continue

      const getVal = (key: string): string => {
        const m = block.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`, 'i'))
        return m?.[1]?.trim() || ''
      }

      goals.push({
        title,
        category: (getVal('Category') || 'Technical') as Goal['category'],
        description: getVal('Description'),
        successCriteria: getVal('Success Criteria'),
        timeline: getVal('Timeline'),
        status: (getVal('Status') || '🔴 Not Started') as Goal['status'],
        section: sectionType
      })
    }
  }

  return goals
}

// ── High-level data fetching ──

export async function getReports(): Promise<string[]> {
  const dirs = await listDirectory('reports')
  return dirs.filter((d) => d !== '_template' && !d.startsWith('.'))
}

export async function getReportProfile(name: string): Promise<ReportProfile> {
  const content = await getFileContent(`reports/${name}/profile.md`)
  return parseProfile(content, name)
}

export async function getReportData(name: string): Promise<Report> {
  const cacheKey = `report:${name}`
  const cached = getCached<Report>(cacheKey)
  if (cached) return cached

  const profile = await getReportProfile(name)

  // Fetch all data in parallel
  const [
    checkInFiles,
    allMeetingFiles,
    actionItemsRaw,
    feedbackRaw,
    goalsRaw,
    reviewFiles,
    dashboardRaw
  ] = await Promise.all([
    listFiles(`reports/${name}/check-ins/monthly`),
    listFiles('meetings'),
    getFileContent(`reports/${name}/action-items.md`).catch(() => ''),
    getFileContent(`reports/${name}/feedback/log.md`).catch(() => ''),
    getFileContent(`reports/${name}/goals/current.md`).catch(() => ''),
    listFiles(`reports/${name}/reviews`),
    getFileContent(`reports/${name}/DASHBOARD.md`).catch(() => '')
  ])

  // Filter meetings for this person (match name in filename)
  const personMeetings = allMeetingFiles.filter(
    (f) => f.includes(`${name}-1-1`) && !f.includes('-summary')
  )
  const personSummaries = allMeetingFiles.filter(
    (f) => f.includes(`${name}-1-1-summary`)
  )

  // Parse check-ins (load content for recent ones)
  const mdCheckIns = checkInFiles.filter((f) => f.endsWith('.md') && f !== '.gitkeep')
  const recentCheckIns = mdCheckIns.slice(-6)
  const checkIns: CheckIn[] = await Promise.all(
    recentCheckIns.map(async (f) => {
      const content = await getFileContent(
        `reports/${name}/check-ins/monthly/${f}`
      )
      return {
        date: f.replace('.md', ''),
        content,
        accomplishments: [],
        concerns: [],
        githubActivity: {}
      }
    })
  )

  // Parse summaries from meetings/ (metadata only, load content on demand)
  const summaries: Summary[] = personSummaries.map((f) => {
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/)
    return {
      date: dateMatch?.[1] || f.replace('-summary.md', ''),
      content: '',
      keyTopics: [],
      actionItems: [],
      sentiment: ''
    }
  })

  // Parse transcripts from meetings/
  const transcripts: Transcript[] = personMeetings.map((f) => {
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/)
    const date = dateMatch?.[1] || f.replace('.md', '')
    return {
      date,
      content: '',
      hasSummary: personSummaries.some((s) => s.startsWith(date))
    }
  })

  // Parse other data
  const actionItems = parseActionItems(actionItemsRaw)
  const feedback = parseFeedbackLog(feedbackRaw)
  const goals = parseGoals(goalsRaw)

  // Reviews (metadata only)
  const mdReviews = reviewFiles.filter(
    (f) => f.endsWith('.md') && f !== '.gitkeep' && !f.startsWith('YYYY')
  )
  const reviews = mdReviews.map((f) => ({
    period: f.replace('.md', ''),
    content: ''
  }))

  const report: Report = {
    name,
    profile,
    checkIns,
    summaries,
    transcripts,
    actionItems,
    feedback,
    goals,
    reviews,
    dashboard: dashboardRaw
  }

  setCache(cacheKey, report)
  return report
}

export async function getTeamOverview(): Promise<TeamOverview> {
  const cached = getCached<TeamOverview>('teamOverview')
  if (cached) return cached

  const reportNames = await getReports()
  const reports: ReportStatus[] = []

  for (const name of reportNames) {
    try {
      const data = await getReportData(name)
      const lastTranscript =
        data.transcripts.length > 0
          ? data.transcripts[data.transcripts.length - 1].date
          : null

    let daysGap = 999
    if (lastTranscript) {
      const lastDate = new Date(lastTranscript)
      daysGap = Math.floor(
        (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    }

    const openItems = data.actionItems.filter((i) => !i.completed).length

    let status: ReportStatus['status'] = 'on-track'
    if (daysGap > 14 || openItems > 100) status = 'at-risk'
    else if (daysGap > 7 || openItems > 50) status = 'needs-attention'

    reports.push({
      name,
      displayName: data.profile.displayName,
      lastOneOnOne: lastTranscript,
      daysGap,
      openActionItems: openItems,
      status
    })
    } catch (err) {
      console.warn(`[GitHub] Skipping report ${name}:`, (err as Error).message)
    }
  }

  const overview: TeamOverview = {
    reports,
    attentionItems: [],
    lastUpdated: new Date().toISOString()
  }

  setCache('teamOverview', overview)
  return overview
}

// ── Meetings ──

export interface MeetingEntry {
  date: string
  title: string
  filename: string
}

export async function listMeetings(): Promise<MeetingEntry[]> {
  const files = await listFiles('meetings')
  const mdFiles = files.filter((f) => f.endsWith('.md') && !f.includes('-summary'))

  return mdFiles
    .map((f) => {
      const name = f.replace('.md', '')
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
      return {
        date: dateMatch?.[1] || name,
        title: dateMatch?.[2]?.replace(/-/g, ' ') || name,
        filename: f
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

// ── People ──

export interface PersonEntry {
  name: string
  slug: string
  aliases: string[]
  meetingCount: number
  lastSeen: string
  role: string
  github: string
  location: string
  relationship: string
}

// Build a map of meeting filename → speakers from summary frontmatter
async function buildSpeakerIndex(): Promise<Map<string, string[]>> {
  const cached = getCached<Record<string, string[]>>('speakerIndex')
  if (cached) return new Map(Object.entries(cached))

  const allFiles = await listFiles('meetings')
  const summaryFiles = allFiles.filter(f => f.includes('-summary.md'))

  const index = new Map<string, string[]>()
  // Process in parallel batches of 10 to avoid rate limits
  for (let i = 0; i < summaryFiles.length; i += 10) {
    const batch = summaryFiles.slice(i, i + 10)
    const results = await Promise.all(
      batch.map(async (sf) => {
        try {
          const content = await getFileContent(`meetings/${sf}`)
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
          if (fmMatch) {
            const speakerBlock = fmMatch[1].match(/speakers:\n((?:\s+-\s+.+\n?)+)/)
            if (speakerBlock) {
              const speakers = speakerBlock[1]
                .split('\n')
                .map(l => l.replace(/^\s*-\s*/, '').trim())
                .filter(Boolean)
              // Map back to the transcript filename
              const transcriptFile = sf.replace('-summary.md', '.md')
              return { file: transcriptFile, speakers }
            }
          }
          return null
        } catch { return null }
      })
    )
    for (const r of results) {
      if (r) index.set(r.file, r.speakers)
    }
  }

  // Cache it
  const obj: Record<string, string[]> = {}
  index.forEach((v, k) => { obj[k] = v })
  setCache('speakerIndex', obj)

  return index
}

function personMatchesMeeting(
  personName: string,
  slug: string,
  aliases: string[],
  meetingFilename: string,
  speakerIndex: Map<string, string[]>
): boolean {
  // All names to check: display name + aliases + slug variations
  const allNames = [personName, ...aliases]
  const allFirstNames = allNames.map(n => n.split(' ')[0].toLowerCase())
  const allLower = allNames.map(n => n.toLowerCase())

  // Check speaker frontmatter first
  const speakers = speakerIndex.get(meetingFilename)
  if (speakers) {
    for (const speaker of speakers) {
      const sLower = speaker.toLowerCase()
      const sFirst = speaker.split(' ')[0].toLowerCase()
      if (allLower.some(n => n === sLower) || allFirstNames.some(f => f === sFirst)) {
        return true
      }
    }
  }

  // Fallback: check filename
  const mSlug = meetingFilename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')
  const slugFirst = slug.split('-')[0]
  return mSlug.includes(slugFirst) || mSlug.includes(slug)
}

export async function listPeople(): Promise<PersonEntry[]> {
  const files = await listFiles('people')
  const mdFiles = files.filter((f) => f.endsWith('.md') && f !== '.gitkeep')

  const allMeetings = await listFiles('meetings')
  const meetingFiles = allMeetings.filter(f => !f.includes('-summary'))
  const speakerIndex = await buildSpeakerIndex()

  const people: PersonEntry[] = []
  for (const f of mdFiles) {
    try {
      const content = await getFileContent(`people/${f}`)
      const slug = f.replace('.md', '')

      // Parse YAML frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
      const fm: Record<string, string> = {}
      if (fmMatch) {
        for (const line of fmMatch[1].split('\n')) {
          const m = line.match(/^(\w+):\s*(.*)/)
          if (m) fm[m[1]] = m[2].trim()
        }
      }

      // Parse aliases from frontmatter (comma-separated or YAML list)
      const aliases: string[] = []
      if (fm.aliases) {
        aliases.push(...fm.aliases.split(',').map(a => a.trim()).filter(Boolean))
      }
      // Also check for YAML list format
      if (fmMatch) {
        const aliasBlock = fmMatch[1].match(/aliases:\n((?:\s+-\s+.+\n?)+)/)
        if (aliasBlock) {
          aliases.push(...aliasBlock[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean))
        }
      }

      const personName = fm.name || slug.replace(/-/g, ' ')
      const personMeetings = meetingFiles.filter(m =>
        personMatchesMeeting(personName, slug, aliases, m, speakerIndex)
      )

      const dates = personMeetings
        .map(m => m.match(/^(\d{4}-\d{2}-\d{2})/)?.[1])
        .filter(Boolean)
        .sort()

      people.push({
        name: personName,
        slug,
        aliases,
        meetingCount: personMeetings.length,
        lastSeen: dates.length > 0 ? dates[dates.length - 1]! : '',
        role: fm.role || '',
        github: fm.github || '',
        location: fm.location || '',
        relationship: fm.relationship || ''
      })
    } catch {
      // Skip malformed files
    }
  }

  return people.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
}

export async function getPersonMeetings(slug: string): Promise<{ date: string; title: string; filename: string }[]> {
  const allMeetings = await listFiles('meetings')
  const meetingFiles = allMeetings.filter(f => !f.includes('-summary'))
  const speakerIndex = await buildSpeakerIndex()

  // Get the person's name and aliases from their profile
  let personName = slug.replace(/-/g, ' ')
  let aliases: string[] = []
  try {
    const content = await getFileContent(`people/${slug}.md`)
    const nameMatch = content.match(/name:\s*(.+)/)
    if (nameMatch) personName = nameMatch[1].trim()
    const aliasMatch = content.match(/aliases:\s*(.+)/)
    if (aliasMatch) aliases = aliasMatch[1].split(',').map(a => a.trim()).filter(Boolean)
  } catch { /* use slug */ }

  return meetingFiles
    .filter(m => personMatchesMeeting(personName, slug, aliases, m, speakerIndex))
    .map(f => {
      const name = f.replace('.md', '')
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
      return {
        date: dateMatch?.[1] || name,
        title: dateMatch?.[2]?.replace(/-/g, ' ') || name,
        filename: f
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

// Find an existing person by name (fuzzy first-name match)
export async function findPersonByName(name: string): Promise<string | null> {
  const people = await listPeople()
  const nameLower = name.toLowerCase()
  const firstName = name.split(' ')[0].toLowerCase()

  // Exact match first
  const exact = people.find(p => p.name.toLowerCase() === nameLower)
  if (exact) return exact.slug

  // Check aliases
  const aliasMatch = people.find(p =>
    p.aliases.some(a => a.toLowerCase() === nameLower || a.toLowerCase() === firstName)
  )
  if (aliasMatch) return aliasMatch.slug

  // First name match
  const firstMatch = people.find(p => p.name.split(' ')[0].toLowerCase() === firstName)
  if (firstMatch) return firstMatch.slug

  return null
}

// ── Impact Log ──

export async function getImpactLog(): Promise<string> {
  try {
    return await getFileContent('mike-impact-log.md')
  } catch {
    return '# Impact log\n\n_No entries yet._'
  }
}

export { getFileContent }
