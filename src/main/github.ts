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
  meetingCount: number
  lastSeen: string
  role: string
}

export async function listPeople(): Promise<PersonEntry[]> {
  const files = await listFiles('people')
  const mdFiles = files.filter((f) => f.endsWith('.md') && f !== '.gitkeep')

  const people: PersonEntry[] = []
  for (const f of mdFiles) {
    try {
      const content = await getFileContent(`people/${f}`)
      const nameMatch = content.match(/^#\s+(.+)/m)
      const roleMatch = content.match(/\*\*Role\*\*:\s*(.+)/i) || content.match(/Role:\s*(.+)/i)
      const meetingMatch = content.match(/## Meetings?\b/i)

      let meetingCount = 0
      if (meetingMatch) {
        const meetingSection = content.slice(content.indexOf(meetingMatch[0]))
        meetingCount = (meetingSection.match(/^- /gm) || []).length
      }

      const lastSeenMatch = content.match(/(\d{4}-\d{2}-\d{2})(?!.*\d{4}-\d{2}-\d{2})/)

      people.push({
        name: nameMatch?.[1] || f.replace('.md', ''),
        slug: f.replace('.md', ''),
        meetingCount,
        lastSeen: lastSeenMatch?.[1] || '',
        role: roleMatch?.[1]?.trim() || ''
      })
    } catch {
      // Skip malformed files
    }
  }

  return people.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
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
