import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
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
    return readdirSync(fullPath).filter(f => {
      try {
        return statSync(join(fullPath, f)).isDirectory()
      } catch { return false }
    })
  } catch { return [] }
}

function listFiles(path: string): string[] {
  try {
    const fullPath = join(repoPath(), path)
    return readdirSync(fullPath).filter(f => {
      try {
        return statSync(join(fullPath, f)).isFile()
      } catch { return false }
    })
  } catch { return [] }
}

export function commitFile(path: string, content: string, message: string): void {
  const fullPath = join(repoPath(), path)
  // Ensure directory exists
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')

  const rp = repoPath()
  execSync(`git add "${path}"`, { cwd: rp })
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: rp })
  // Push in background (don't block the UI)
  try {
    execSync('git push', { cwd: rp, timeout: 10000 })
  } catch (e) {
    console.warn('[Git] Push failed (will retry later):', (e as Error).message)
  }
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

function parseActionItems(content: string): ActionItem[] {
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
  return dirs.filter((d) => d !== '_template' && !d.startsWith('.'))
}

export function getReportProfile(name: string): ReportProfile {
  const content = getFileContent(`reports/${name}/profile.md`)
  return parseProfile(content, name)
}

export function getReportData(name: string): Report {
  const profile = getReportProfile(name)

  // Read from local filesystem - instant
  const checkInFiles = listFiles(`reports/${name}/check-ins/monthly`)
  const allMeetingFiles = listFiles('meetings')
  let actionItemsRaw = ''
  try { actionItemsRaw = getFileContent(`reports/${name}/action-items.md`) } catch {}
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

  const actionItems = parseActionItems(actionItemsRaw)
  const feedback = parseFeedbackLog(feedbackRaw)
  const goals = parseGoals(goalsRaw)

  const mdReviews = reviewFiles.filter((f) => f.endsWith('.md') && f !== '.gitkeep' && !f.startsWith('YYYY'))
  const reviews = mdReviews.map((f) => ({ period: f.replace('.md', ''), content: '' }))

  return { name, profile, checkIns, summaries, transcripts, actionItems, feedback, goals, reviews, dashboard: dashboardRaw }
}

export function getTeamOverview(): TeamOverview {
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

  return { reports, attentionItems: [], lastUpdated: new Date().toISOString() }
}

// ── Meetings ──

export interface MeetingEntry {
  date: string
  title: string
  filename: string
}

export function listMeetings(): MeetingEntry[] {
  const files = listFiles('meetings')
  const mdFiles = files.filter((f) => f.endsWith('.md') && !f.includes('-summary'))

  return mdFiles
    .map((f) => {
      const name = f.replace('.md', '')
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
      return { date: dateMatch?.[1] || name, title: dateMatch?.[2]?.replace(/-/g, ' ') || name, filename: f }
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

export function listPeople(): PersonEntry[] {
  const files = listFiles('people')
  const mdFiles = files.filter((f) => f.endsWith('.md') && f !== '.gitkeep')

  const meetingFiles = listFiles('meetings').filter(f => !f.includes('-summary'))

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
      const slugFirst = slug.split('-')[0]

      const personMeetings = meetingFiles.filter(m => {
        const mSlug = m.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')
        return mSlug.includes(slugFirst) || mSlug.includes(slug)
      })

      const dates = personMeetings.map(m => m.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean).sort()

      people.push({
        name: personName, slug, aliases,
        meetingCount: personMeetings.length,
        lastSeen: dates.length > 0 ? dates[dates.length - 1]! : '',
        role: fm.role || '', github: fm.github || '',
        location: fm.location || '', relationship: fm.relationship || ''
      })
    } catch { /* skip */ }
  }

  return people.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
}

export function getPersonMeetings(slug: string): { date: string; title: string; filename: string }[] {
  const meetingFiles = listFiles('meetings').filter(f => !f.includes('-summary'))

  let personName = slug.replace(/-/g, ' ')
  let aliases: string[] = []
  try {
    const content = getFileContent(`people/${slug}.md`)
    const nameMatch = content.match(/name:\s*(.+)/)
    if (nameMatch) personName = nameMatch[1].trim()
    const aliasMatch = content.match(/aliases:\s*(.+)/)
    if (aliasMatch) aliases = aliasMatch[1].split(',').map(a => a.trim()).filter(Boolean)
  } catch { /* use slug */ }

  const slugFirst = slug.split('-')[0]

  // Fast pass: filename matching
  const filenameMatched = new Set<string>()
  const matched = meetingFiles.filter(m => {
    const mSlug = m.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')
    if (mSlug.includes(slugFirst) || mSlug.includes(slug)) {
      filenameMatched.add(m)
      return true
    }
    return false
  })

  // Also check: if this person has a summary with their name as speaker,
  // add those meetings too. Only check summaries that exist alongside non-matched meetings.
  // We do this lazily — scan summaries for just the first name (quick string search)
  const allFirstNames = [personName, ...aliases].map(n => n.split(' ')[0].toLowerCase())
  const summaryFiles = listFiles('meetings').filter(f => f.includes('-summary.md'))
  for (const sf of summaryFiles) {
    const meetingFile = sf.replace('-summary.md', '.md')
    if (filenameMatched.has(meetingFile)) continue
    if (!meetingFiles.includes(meetingFile)) continue

    try {
      // Quick check: just read first 500 chars for frontmatter speakers
      const content = getFileContent(`meetings/${sf}`).slice(0, 500)
      const hasMatch = allFirstNames.some(fn => content.toLowerCase().includes(fn))
      if (hasMatch) matched.push(meetingFile)
    } catch { /* skip */ }
  }

  return matched
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
