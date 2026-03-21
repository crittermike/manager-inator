import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execSync, spawn } from 'child_process'
import { getSettings } from './store'
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

function repoPath(): string {
  const settings = getSettings()
  const p = settings.repoPath
  if (!p) throw new Error('No repo path configured')
  return p
}

// ── File operations (local filesystem) ──

export function getFileContent(path: string): string {
  return readFileSync(join(repoPath(), path), 'utf-8')
}

function listDirectory(path: string): string[] {
  try {
    const fullPath = join(repoPath(), path)
    return readdirSync(fullPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch { return [] }
}

function listFiles(path: string): string[] {
  try {
    const fullPath = join(repoPath(), path)
    return readdirSync(fullPath, { withFileTypes: true })
      .filter(d => d.isFile())
      .map(d => d.name)
  } catch { return [] }
}

export function commitFile(path: string, content: string, message: string): void {
  const fullPath = join(repoPath(), path)
  // Ensure directory exists
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')

  // Invalidate all caches since file contents changed
  invalidateMeetingsCache()
  invalidateReportCache()
  invalidatePeopleCache()

  const rp = repoPath()
  execSync(`git add "${path}"`, { cwd: rp })
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: rp })
  // Push fully async — don't block the UI
  const child = spawn('git', ['push'], { cwd: rp, stdio: 'ignore', detached: true })
  child.unref()
}

// ── Parsing helpers ──

function parseProfile(content: string, name: string): ReportProfile {
  const getField = (field: string): string => {
    const tableMatch = content.match(
      new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*(?:${field}:\\s*)?(.+?)\\s*\\|`, 'i')
    )
    if (tableMatch) return tableMatch[1].trim()
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

function parseActionItems(content: string, sourceFile?: string): ActionItem[] {
  const items: ActionItem[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^- \[([ xX])\]\s+(.+)/)
    if (match) {
      const completed = match[1] !== ' '
      let text = match[2]
      let owner = 'Unknown'
      const ownerMatch = text.match(/\*\*(.+?)\*\*:?\s*/)
      if (ownerMatch) {
        owner = ownerMatch[1]
        text = text.replace(ownerMatch[0], '').trim()
      }
      items.push({ text, owner, completed, sourceFile, sourceLine: line })
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
      date, type,
      source: sourceMatch?.[1]?.trim() || '',
      context: contextMatch?.[1]?.trim(),
      content: quoteMatch?.[1]?.replace(/^>\s*/gm, '').trim() || block.trim()
    })
  }
  return entries
}

function parseGoals(content: string): Goal[] {
  return [] // Goals removed per user request
}

// ── High-level data fetching ──

export function getReports(): string[] {
  const dirs = listDirectory('reports')
  return dirs.filter((d) => {
    if (d === '_template' || d.startsWith('.')) return false
    // Only include directories that have a profile.md
    try {
      readFileSync(join(repoPath(), 'reports', d, 'profile.md'))
      return true
    } catch { return false }
  })
}

// ── Report data cache ──
// Caches are only invalidated on writes (commitFile). No time-based expiry since we control all writes.

let _reportDataCache: Map<string, Report> = new Map()
let _teamOverviewCache: TeamOverview | null = null

function invalidateReportCache(): void {
  _reportDataCache.clear()
  _teamOverviewCache = null
}

export function getReportProfile(name: string): ReportProfile {
  const content = getFileContent(`reports/${name}/profile.md`)
  return parseProfile(content, name)
}

export function getReportData(name: string): Report {
  const cached = _reportDataCache.get(name)
  if (cached) return cached

  const profile = getReportProfile(name)

  // Read from local filesystem - instant
  const checkInFiles = listFiles(`reports/${name}/check-ins/monthly`)
  const allMeetingFiles = listFiles('meetings')
  let feedbackRaw = ''
  try { feedbackRaw = getFileContent(`reports/${name}/feedback/log.md`) } catch {}
  let goalsRaw = ''
  try { goalsRaw = getFileContent(`reports/${name}/goals/current.md`) } catch {}
  const reviewFiles = listFiles(`reports/${name}/reviews`)
  let dashboardRaw = ''
  try { dashboardRaw = getFileContent(`reports/${name}/DASHBOARD.md`) } catch {}

  // Filter meetings for this person
  const personMeetings = allMeetingFiles.filter(
    (f) => f.includes(`${name}-1-1`) && !f.includes('-summary')
  )
  const personSummaries = allMeetingFiles.filter(
    (f) => f.includes(`${name}-1-1-summary`)
  )

  // Parse check-ins
  const mdCheckIns = checkInFiles.filter((f) => f.endsWith('.md') && f !== '.gitkeep')
  const recentCheckIns = mdCheckIns.slice(-6)
  const checkIns: CheckIn[] = recentCheckIns.map((f) => {
    const content = getFileContent(`reports/${name}/check-ins/monthly/${f}`)
    return { date: f.replace('.md', ''), content, accomplishments: [], concerns: [], githubActivity: {} }
  })

  // Parse summaries
  const summaries: Summary[] = personSummaries.map((f) => {
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/)
    return { date: dateMatch?.[1] || f.replace('-summary.md', ''), content: '', keyTopics: [], actionItems: [], sentiment: '' }
  })

  // Parse transcripts
  const transcripts: Transcript[] = personMeetings.map((f) => {
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/)
    const date = dateMatch?.[1] || f.replace('.md', '')
    return { date, content: '', hasSummary: personSummaries.some((s) => s.startsWith(date)) }
  })

  // Extract action items from recent meeting summaries
  const actionItems: ActionItem[] = []
  const recentSummaries = personSummaries.sort().slice(-5)
  for (const sf of recentSummaries) {
    try {
      const content = getFileContent(`meetings/${sf}`)
      actionItems.push(...parseActionItems(content, `meetings/${sf}`))
    } catch { /* skip */ }
  }

  const feedback = parseFeedbackLog(feedbackRaw)
  const goals = parseGoals(goalsRaw)

  const mdReviews = reviewFiles.filter((f) => f.endsWith('.md') && f !== '.gitkeep' && !f.startsWith('YYYY'))
  const reviews = mdReviews.map((f) => ({ period: f.replace('.md', ''), content: '' }))

  const result = { name, profile, checkIns, summaries, transcripts, actionItems, feedback, goals, reviews, dashboard: dashboardRaw }
  _reportDataCache.set(name, result)
  return result
}

export function getTeamOverview(): TeamOverview {
  if (_teamOverviewCache) return _teamOverviewCache

  const reportNames = getReports()
  const reports: ReportStatus[] = []

  for (const name of reportNames) {
    try {
      const data = getReportData(name)
      const lastTranscript = data.transcripts.length > 0
        ? data.transcripts[data.transcripts.length - 1].date
        : null

      let daysGap = 999
      if (lastTranscript) {
        const lastDate = new Date(lastTranscript)
        daysGap = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      }

      const openItems = data.actionItems.filter((i) => !i.completed).length
      let status: ReportStatus['status'] = 'on-track'
      if (daysGap > 14 || openItems > 100) status = 'at-risk'
      else if (daysGap > 7 || openItems > 50) status = 'needs-attention'

      reports.push({
        name, displayName: data.profile.displayName, lastOneOnOne: lastTranscript,
        daysGap, openActionItems: openItems, status
      })
    } catch (err) {
      console.warn(`[Data] Skipping report ${name}:`, (err as Error).message)
    }
  }

  const result = { reports, attentionItems: [], lastUpdated: new Date().toISOString() }
  _teamOverviewCache = result
  return result
}

// ── Meetings cache ──
// Cache meeting file lists and speaker map to avoid re-scanning 300+ files on every call.
// Invalidated after 10 seconds or on commit (which means we wrote new data).

let _meetingsCache: { files: string[]; meetings: string[]; summaries: string[]; speakerMap: Map<string, string[]>; titleMap: Map<string, string> } | null = null
const CACHE_TTL = 10_000 // only used as a safety net, primary invalidation is on writes

function invalidateMeetingsCache(): void { _meetingsCache = null }

function getMeetingsCache() {
  if (_meetingsCache) return _meetingsCache
  const files = listFiles('meetings')
  const meetings = files.filter(f => f.endsWith('.md') && !f.includes('-summary'))
  const summaries = files.filter(f => f.includes('-summary.md'))

  // Build speaker map and title map from summary frontmatter
  const speakerMap = new Map<string, string[]>()
  const titleMap = new Map<string, string>()
  for (const sf of summaries) {
    try {
      const content = getFileContent(`meetings/${sf}`).slice(0, 800)
      const speakers = parseSpeakers(content)
      const meetingFile = sf.replace('-summary.md', '.md')
      if (speakers.length > 0) {
        speakerMap.set(meetingFile, speakers)
      }
      // Check for title override in frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
      if (fmMatch) {
        const titleMatch = fmMatch[1].match(/^title:\s*(.+)/m)
        if (titleMatch) titleMap.set(meetingFile, titleMatch[1].trim())
      }
    } catch { /* skip */ }
  }

  _meetingsCache = { files, meetings, summaries, speakerMap, titleMap }
  return _meetingsCache
}

// ── Meetings ──

export interface MeetingEntry {
  date: string
  title: string
  filename: string
}

export function listMeetings(): MeetingEntry[] {
  const cache = getMeetingsCache()
  return cache.meetings
    .map((f) => {
      const name = f.replace('.md', '')
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
      const filenameTitle = dateMatch?.[2]?.replace(/-/g, ' ') || name
      // Use title from summary frontmatter if available
      const title = cache.titleMap.get(f) || filenameTitle
      return { date: dateMatch?.[1] || name, title, filename: f }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Save a title override into a meeting summary's YAML frontmatter */
export function saveMeetingTitle(meetingFilename: string, title: string): void {
  const summaryFile = meetingFilename.replace('.md', '-summary.md')
  const summaryPath = `meetings/${summaryFile}`

  try {
    let content = getFileContent(summaryPath)
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (fmMatch) {
      let fm = fmMatch[1]
      if (/^title:\s/m.test(fm)) {
        fm = fm.replace(/^title:\s*.*/m, `title: ${title}`)
      } else {
        fm = `title: ${title}\n${fm}`
      }
      content = `---\n${fm}\n---` + content.slice(fmMatch[0].length)
    } else {
      content = `---\ntitle: ${title}\n---\n\n${content}`
    }
    commitFile(summaryPath, content, `Update meeting title: ${title}`)
  } catch {
    commitFile(summaryPath, `---\ntitle: ${title}\n---\n`, `Set meeting title: ${title}`)
  }
  invalidateMeetingsCache()
}

// ── People helpers ──

/** Parse speakers list from YAML frontmatter of a summary file */
function parseSpeakers(content: string): string[] {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return []
  const speakersMatch = fmMatch[1].match(/speakers:\s*\n((?:\s+-\s+.+\n?)*)/)
  if (!speakersMatch) return []
  return speakersMatch[1]
    .split('\n')
    .map(l => l.replace(/^\s*-\s*/, '').replace(/\s*\(.*?\)\s*/g, '').trim())
    .filter(Boolean)
}

/** Check if a meeting filename (slug part) matches a person */
function filenameMatchesPerson(meetingSlug: string, personSlug: string): boolean {
  const segments = meetingSlug.split('-')
  const personFirst = personSlug.split('-')[0]
  return meetingSlug === personSlug ||
    meetingSlug.startsWith(personSlug + '-') ||
    meetingSlug.endsWith('-' + personSlug) ||
    segments.includes(personFirst)
}

/** Check if any speaker name matches a person */
function speakerMatchesPerson(speakers: string[], personName: string, aliases: string[]): boolean {
  const allNames = [personName, ...aliases]
  const allFirstNames = allNames.map(n => n.split(' ')[0].toLowerCase())
  const allFullNames = allNames.map(n => n.toLowerCase())

  for (const speaker of speakers) {
    const sLower = speaker.toLowerCase()
    const sFirst = speaker.split(' ')[0].toLowerCase()
    if (allFullNames.includes(sLower)) return true
    if (allFirstNames.includes(sFirst) || allFirstNames.includes(sLower)) return true
  }
  return false
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

let _peopleCache: PersonEntry[] | null = null
function invalidatePeopleCache(): void { _peopleCache = null }

export function listPeople(): PersonEntry[] {
  if (_peopleCache) return _peopleCache

  const files = listFiles('people')
  const mdFiles = files.filter((f) => f.endsWith('.md') && f !== '.gitkeep')

  const cache = getMeetingsCache()
  const meetingFiles = cache.meetings
  const speakerMap = cache.speakerMap

  const people: PersonEntry[] = []
  for (const f of mdFiles) {
    try {
      const content = getFileContent(`people/${f}`)
      const slug = f.replace('.md', '')

      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
      const fm: Record<string, string> = {}
      if (fmMatch) {
        for (const line of fmMatch[1].split('\n')) {
          const m = line.match(/^(\w+):\s*(.*)/)
          if (m) fm[m[1]] = m[2].trim()
        }
      }

      const aliases: string[] = fm.aliases ? fm.aliases.split(',').map(a => a.trim()).filter(Boolean) : []
      const personName = fm.name || slug.replace(/-/g, ' ')

      // Match by filename segments
      const filenameMatched = new Set<string>()
      for (const m of meetingFiles) {
        const mSlug = m.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')
        if (filenameMatchesPerson(mSlug, slug)) {
          filenameMatched.add(m)
        }
      }

      // Also match by speaker frontmatter
      const speakerMatched = new Set<string>()
      for (const [meetingFile, speakers] of speakerMap) {
        if (filenameMatched.has(meetingFile)) continue
        if (!meetingFiles.includes(meetingFile)) continue
        if (speakerMatchesPerson(speakers, personName, aliases)) {
          speakerMatched.add(meetingFile)
        }
      }

      const allMatched = [...filenameMatched, ...speakerMatched]
      const dates = allMatched.map(m => m.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean).sort()

      people.push({
        name: personName, slug, aliases,
        meetingCount: allMatched.length,
        lastSeen: dates.length > 0 ? dates[dates.length - 1]! : '',
        role: fm.role || '', github: fm.github || '',
        location: fm.location || '', relationship: fm.relationship || ''
      })
    } catch { /* skip */ }
  }

  const sorted = people.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
  _peopleCache = sorted
  return sorted
}

export function getPersonMeetings(slug: string): { date: string; title: string; filename: string }[] {
  const cache = getMeetingsCache()
  const meetingFiles = cache.meetings
  const speakerMap = cache.speakerMap

  let personName = slug.replace(/-/g, ' ')
  let aliases: string[] = []
  try {
    const content = getFileContent(`people/${slug}.md`)
    const nameMatch = content.match(/name:\s*(.+)/)
    if (nameMatch) personName = nameMatch[1].trim()
    const aliasMatch = content.match(/aliases:\s*(.+)/)
    if (aliasMatch) aliases = aliasMatch[1].split(',').map(a => a.trim()).filter(Boolean)
  } catch { /* use slug */ }

  // Filename segment matching
  const filenameMatched = new Set<string>()
  for (const m of meetingFiles) {
    const mSlug = m.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')
    if (filenameMatchesPerson(mSlug, slug)) {
      filenameMatched.add(m)
    }
  }

  // Speaker frontmatter matching (uses cached speaker map)
  const speakerMatched = new Set<string>()
  for (const [meetingFile, speakers] of speakerMap) {
    if (filenameMatched.has(meetingFile)) continue
    if (!meetingFiles.includes(meetingFile)) continue
    if (speakerMatchesPerson(speakers, personName, aliases)) {
      speakerMatched.add(meetingFile)
    }
  }

  const allMatched = [...filenameMatched, ...speakerMatched]
  return allMatched
    .map(f => {
      const name = f.replace('.md', '')
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
      return { date: dateMatch?.[1] || name, title: dateMatch?.[2]?.replace(/-/g, ' ') || name, filename: f }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function findPersonByName(name: string): string | null {
  const people = listPeople()
  // Strip parenthetical suffixes like "(VP Engineering)"
  const cleanName = name.replace(/\s*\(.*?\)\s*/g, '').trim()
  const nameLower = cleanName.toLowerCase()
  const firstName = cleanName.split(' ')[0].toLowerCase()

  const exact = people.find(p => p.name.toLowerCase() === nameLower)
  if (exact) return exact.slug

  const aliasMatch = people.find(p =>
    p.aliases.some(a => a.toLowerCase() === nameLower || a.toLowerCase() === firstName)
  )
  if (aliasMatch) return aliasMatch.slug

  const firstMatch = people.find(p => p.name.split(' ')[0].toLowerCase() === firstName)
  if (firstMatch) return firstMatch.slug

  return null
}

// ── Impact Log ──

export function getImpactLog(): string {
  try {
    return getFileContent('mike-impact-log.md')
  } catch {
    return '# Impact log\n\n_No entries yet._'
  }
}

// ── Action item toggle ──

export function toggleActionItem(sourceFile: string, sourceLine: string): void {
  const content = getFileContent(sourceFile)
  let newLine: string
  if (sourceLine.includes('- [ ] ')) {
    newLine = sourceLine.replace('- [ ] ', '- [x] ')
  } else {
    newLine = sourceLine.replace('- [x] ', '- [ ] ')
  }
  const updated = content.replace(sourceLine, newLine)
  if (updated !== content) {
    const shortText = sourceLine.replace(/^- \[.\]\s+/, '').slice(0, 50)
    commitFile(sourceFile, updated, `Toggle action item: ${shortText}`)
  }
}

// ── Settings options (from settings.md) ──

export function getSettingsOptions(): { roles: string[]; relationships: string[] } {
  try {
    const content = getFileContent('settings.md')
    const rolesMatch = content.match(/## Roles\n([\s\S]*?)(?=\n##|$)/)
    const relsMatch = content.match(/## Relationships\n([\s\S]*?)(?=\n##|$)/)

    const parseList = (text: string) =>
      text.split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)

    return {
      roles: rolesMatch ? parseList(rolesMatch[1]) : [],
      relationships: relsMatch ? parseList(relsMatch[1]) : []
    }
  } catch {
    return { roles: [], relationships: [] }
  }
}

/** Pre-warm all caches at startup so first navigation is instant */
export function preWarmCaches(): void {
  try {
    console.log('[Cache] Pre-warming...')
    const t0 = Date.now()
    getMeetingsCache()
    getTeamOverview()
    listPeople()
    console.log(`[Cache] Pre-warmed in ${Date.now() - t0}ms`)
  } catch (e) {
    console.warn('[Cache] Pre-warm failed:', (e as Error).message)
  }
}
