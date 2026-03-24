import { readFileSync, readdirSync, writeFileSync, mkdirSync, realpathSync, existsSync, unlinkSync } from 'fs'
import { join, dirname, resolve, relative, isAbsolute } from 'path'
import { spawn } from 'child_process'
import { BrowserWindow } from 'electron'
import { getSettings } from './store'
import type {
  ReportProfile,
  Report,
  CheckIn,
  Summary,
  Transcript,
  ActionItem,
  FeedbackEntry,
  PrepEntry,
  TeamOverview,
  ReportStatus,
  TeamActionItem,
  MeetingEntry,
  RawTranscriptEntry
} from '../shared/types'

function repoPath(): string {
  const settings = getSettings()
  const p = settings.repoPath
  if (!p) throw new Error('No repo path configured')
  return p
}

// ── Path safety ──

/** Resolve a renderer-supplied path and verify it stays within the repo root */
function safePath(userPath: string): string {
  const rp = realpathSync(resolve(repoPath()))
  const full = resolve(rp, userPath)

  // Canonicalize the nearest existing ancestor to catch symlinks
  let check = full
  while (!existsSync(check)) {
    const parent = dirname(check)
    if (parent === check) break
    check = parent
  }
  const canonicalized = realpathSync(check)
  const relCanon = relative(rp, canonicalized)
  if (relCanon.startsWith('..') || isAbsolute(relCanon)) {
    throw new Error(`Path traversal blocked: ${userPath}`)
  }

  // Also verify the full resolved path doesn't escape via '..' segments
  const relFull = relative(rp, full)
  if (relFull.startsWith('..') || isAbsolute(relFull)) {
    throw new Error(`Path traversal blocked: ${userPath}`)
  }
  return full
}

// ── File operations (local filesystem) ──

export function getFileContent(path: string): string {
  return readFileSync(safePath(path), 'utf-8')
}

export function getFilesContentBulk(paths: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const p of paths) {
    try {
      result[p] = readFileSync(safePath(p), 'utf-8')
    } catch {}
  }
  return result
}

export function fileExists(relPath: string): boolean {
  try {
    const full = safePath(relPath)
    return existsSync(full)
  } catch { return false }
}

function listDirectory(path: string): string[] {
  try {
    const fullPath = safePath(path)
    return readdirSync(fullPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch { return [] }
}

function listFiles(path: string): string[] {
  try {
    const fullPath = safePath(path)
    return readdirSync(fullPath, { withFileTypes: true })
      .filter(d => d.isFile())
      .map(d => d.name)
  } catch { return [] }
}

function listFilesRecursive(path: string): string[] {
  const results: string[] = []
  const stack: string[] = [path]

  while (stack.length > 0) {
    const current = stack.pop()!
    try {
      const fullPath = safePath(current)
      const entries = readdirSync(fullPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        const rel = join(current, entry.name).replace(/\\/g, '/')
        if (entry.isDirectory()) {
          stack.push(rel)
        } else if (entry.isFile()) {
          results.push(rel)
        }
      }
    } catch {}
  }

  return results
}

let _writeQueue: Promise<void> = Promise.resolve()

export function commitFile(path: string, content: string, message: string): Promise<void> {
  const task = _writeQueue.then(() => _commitFileImpl(path, content, message))
  _writeQueue = task.catch(() => {})
  return task
}

export function deleteFile(path: string): Promise<void> {
  const task = _writeQueue.then(() => _deleteFileImpl(path))
  _writeQueue = task.catch(() => {})
  return task
}

/** Run a git command asynchronously and resolve/reject based on exit code */
function spawnAsync(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${command} ${args[0]} failed (exit ${code}): ${stderr.trim()}`))
      else resolve(stdout)
    })
  })
}

/** Send an IPC message to a window, silently catching errors if the window was destroyed */
export function safeSend(win: BrowserWindow | null, channel: string, payload: unknown): void {
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  } catch (err) {
    console.warn(`[safeSend] Failed to send ${channel}:`, (err as Error).message)
  }
}

function invalidateCachesForPath(filePath: string): void {
  const p = filePath.replace(/\\/g, '/')
  invalidateSearchIndex()

  if (p.startsWith('meetings/')) {
    invalidateMeetingsCache()
  } else if (p.startsWith('reports/')) {
    invalidateReportCache()
    _teamOverviewCache = null
  } else if (p.startsWith('people/')) {
    invalidatePeopleCache()
  }
}

async function _commitFileImpl(path: string, content: string, message: string): Promise<void> {
  const fullPath = safePath(path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')

  const rp = repoPath()
  await spawnAsync('git', ['add', '--', path], rp)

  // Skip commit/push if file content is unchanged (git add was a no-op)
  try {
    await spawnAsync('git', ['diff', '--cached', '--quiet', '--', path], rp)
    // Exit 0 means no staged changes for this file — nothing to commit
    invalidateCachesForPath(path)
    return
  } catch {
    // Exit 1 means there are staged changes — proceed with commit
  }

  await spawnAsync('git', ['commit', '-m', message], rp)

  invalidateCachesForPath(path)

  fireAndForgetPush(rp)
}

function fireAndForgetPush(cwd: string): void {
  const tryPush = (isRetry: boolean): void => {
    const child = spawn('git', ['push'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    child.unref()
    let stderr = ''
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('exit', (code) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (code !== 0) {
        if (!isRetry) {
          // First push failed — try pulling with rebase then push again
          console.warn(`[Git] push failed, attempting pull --rebase and retry`)
          const pull = spawn('git', ['pull', '--rebase'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
          pull.unref()
          let pullStderr = ''
          pull.stderr?.on('data', (d: Buffer) => { pullStderr += d.toString() })
          pull.on('exit', (pullCode) => {
            if (pullCode === 0) {
              tryPush(true)
            } else {
              const msg = pullStderr.trim() || `pull --rebase failed (exit ${pullCode})`
              console.error(`[Git] pull --rebase failed: ${msg}`)
              safeSend(win, 'github:push-status', { success: false, error: `Pull failed: ${msg}. Changes saved locally.` })
            }
          })
          pull.on('error', (err) => {
            console.error('[Git] pull spawn error:', err.message)
            safeSend(win, 'github:push-status', { success: false, error: err.message })
          })
        } else {
          const msg = stderr.trim() || `push exited with code ${code}`
          console.error(`[Git] push failed after retry (exit ${code}): ${msg}`)
          safeSend(win, 'github:push-status', { success: false, error: msg })
        }
      } else {
        safeSend(win, 'github:push-status', { success: true })
      }
    })
    child.on('error', (err) => {
      console.error('[Git] push spawn error:', err.message)
      safeSend(BrowserWindow.getAllWindows()[0], 'github:push-status', { success: false, error: err.message })
    })
  }
  tryPush(false)
}

async function _deleteFileImpl(path: string): Promise<void> {
  const fullPath = safePath(path)
  if (!existsSync(fullPath)) return

  unlinkSync(fullPath)

  const rp = repoPath()
  await spawnAsync('git', ['add', '--', path], rp)

  try {
    await spawnAsync('git', ['diff', '--cached', '--quiet', '--', path], rp)
    invalidateCachesForPath(path)
    return
  } catch {}

  await spawnAsync('git', ['commit', '-m', `Delete file: ${path}`], rp)

  invalidateCachesForPath(path)

  fireAndForgetPush(rp)
}

// ── Parsing helpers ──

export function parseProfile(content: string, name: string): ReportProfile {
  // Try YAML frontmatter first (preferred format)
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    const fm: Record<string, string> = {}
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^([a-zA-Z][\w-]*):\s*(.*)/)
      if (m) fm[m[1].toLowerCase()] = m[2].trim()
    }

    const body = content.slice(fmMatch[0].length)
    const aboutMatch = body.match(/## About\s*\n([\s\S]*?)(?=\n##|$)/)
    const commMatch = body.match(/## Communication Preferences\s*\n([\s\S]*?)(?=\n##|$)/)
    const prefs: Record<string, string> = {}
    if (commMatch) {
      const lines = commMatch[1].split('\n').filter((l) => l.startsWith('-'))
      for (const line of lines) {
        const pm = line.match(/-\s*\*\*(.+?)\*\*:\s*(.+)/)
        if (pm) prefs[pm[1]] = pm[2]
      }
    }

    const nameMatch = body.match(/^#\s+(.+)/m)
    const displayName =
      fm.name ||
      nameMatch?.[1]?.replace(/profile/i, '').trim() ||
      name.charAt(0).toUpperCase() + name.slice(1)

    return {
      name,
      displayName,
      role: fm.role || '',
      team: fm.team || '',
      github: (fm.github || '').replace('@', ''),
      startDate: fm.startdate || fm['start-date'] || '',
      meetingDay: fm.meetingday || fm['meeting-day'] || '',
      location: fm.location || '',
      timezone: fm.timezone || fm['time-zone'] || '',
      manager: (fm.manager || '').replace('@', ''),
      about: aboutMatch?.[1]?.trim() || '',
      communicationPreferences: prefs
    }
  }

  // Fall back to markdown table / inline format
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
    timezone: getField('Timezone') || getField('Time Zone') || '',
    manager: getField('Manager') || '',
    about: aboutMatch?.[1]?.trim() || '',
    communicationPreferences: prefs
  }
}

export function parseActionItems(content: string, sourceFile?: string): ActionItem[] {
  const items: ActionItem[] = []
  const lines = content.split('\n')
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
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
      items.push({ text, owner, completed, sourceFile, sourceLine: line, sourceLineNumber: lineIndex })
    }
  }
  return items
}

export function parseFeedbackLog(content: string): FeedbackEntry[] {
  const entries: FeedbackEntry[] = []
  const blocks = content.split(/^#{2,3}\s+/m).filter((b) => b.trim())
  for (const block of blocks) {
    const headerMatch = block.match(
      /\[?(\d{4}-\d{2}-\d{2})\]?\s*[—–-]\s*(.+)/
    )
    if (!headerMatch) continue
    const date = headerMatch[1]
    const rawType = headerMatch[2].split('\n')[0].trim().toLowerCase()

    let type: FeedbackEntry['type']
    if (/constructive/.test(rawType)) {
      type = 'constructive'
    } else if (/observation/.test(rawType)) {
      type = 'observation'
    } else if (/mixed/.test(rawType)) {
      type = 'mixed'
    } else {
      type = 'positive'
    }

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

export function extractSnippet(content: string, matchIndex: number, matchLength: number): string {
  const radius = 50
  const start = Math.max(0, matchIndex - radius)
  const end = Math.min(content.length, matchIndex + matchLength + radius)
  const core = content.slice(start, end).replace(/\s+/g, ' ').trim()
  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  return `${prefix}${core}${suffix}`
}

export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Title-case a meeting title and normalize "1 1" → "1-1" */
export function formatMeetingTitle(str: string): string {
  const fixed = str.replace(/\b1\s+1\b/g, '1-1')
  return fixed.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

export function deriveMeetingTitleFromContent(filename: string, content: string): string {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    const titleMatch = fmMatch[1].match(/^title:\s*(.+)/m)
    if (titleMatch?.[1]) return titleMatch[1].trim()
  }

  const name = filename.replace(/\.(md|txt)$/i, '')
  const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
  const slug = dateMatch?.[2] || name
  const raw = slug.replace(/-/g, ' ').trim() || name
  return formatMeetingTitle(raw)
}

export function deriveReportTitle(relativePath: string): string {
  const parts = relativePath.split('/').filter(Boolean)
  const reportName = titleCase((parts[0] || '').replace(/[-_]/g, ' '))
  const tail = parts.slice(1)

  if (tail.length === 0) return reportName

  const normalizedTail = tail.map((segment) => segment.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' '))
  let detail = normalizedTail.map(titleCase).join(' / ')

  if (normalizedTail.length >= 2 && normalizedTail[normalizedTail.length - 2] === 'feedback' && normalizedTail[normalizedTail.length - 1] === 'log') {
    detail = 'Feedback Log'
  }

  return `${reportName} — ${detail}`
}

interface SearchIndexEntry {
  filename: string
  directory: 'meetings' | 'reports' | 'people' | 'notes'
  content: string
  lowered: string
}

let _searchIndexCache: SearchIndexEntry[] | null = null

function invalidateSearchIndex(): void { _searchIndexCache = null }

function getSearchIndex(): SearchIndexEntry[] {
  if (_searchIndexCache) return _searchIndexCache

  const entries: SearchIndexEntry[] = []

  const meetingsCache = getMeetingsCache()
  for (const f of meetingsCache.meetings) {
    try {
      const content = getFileContent(`meetings/${f}`)
      entries.push({ filename: f, directory: 'meetings', content, lowered: content.toLowerCase() })
    } catch { /* skip */ }
  }

  const otherDirs: { dir: string; category: 'reports' | 'people' | 'notes' }[] = [
    { dir: 'reports', category: 'reports' },
    { dir: 'people', category: 'people' },
    { dir: 'weekly-log', category: 'notes' }
  ]

  for (const { dir, category } of otherDirs) {
    const files = listFilesRecursive(dir)
    for (const relPath of files) {
      if (!/\.(md|txt)$/i.test(relPath)) continue
      try {
        const content = readFileSync(safePath(relPath), 'utf-8')
        const filename = relPath.slice(dir.length + 1)
        entries.push({ filename, directory: category, content, lowered: content.toLowerCase() })
      } catch { /* skip */ }
    }
  }

  _searchIndexCache = entries
  return entries
}

export function searchContent(query: string): { filename: string; directory: string; title: string; snippet: string; date?: string }[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const results: { filename: string; directory: string; title: string; snippet: string; date?: string }[] = []
  const index = getSearchIndex()

  for (const entry of index) {
    if (results.length >= 50) break
    const idx = entry.lowered.indexOf(q)
    if (idx === -1) continue

    const snippet = extractSnippet(entry.content, idx, q.length)

    if (entry.directory === 'meetings') {
      const name = entry.filename.replace(/\.(md|txt)$/i, '')
      const date = name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
      results.push({
        filename: entry.filename,
        directory: 'meetings',
        title: deriveMeetingTitleFromContent(entry.filename, entry.content),
        snippet,
        date
      })
    } else if (entry.directory === 'reports') {
      const date = entry.filename.split('/').pop()?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
      results.push({ filename: entry.filename, directory: 'reports', title: deriveReportTitle(entry.filename), snippet, date })
    } else if (entry.directory === 'people') {
      results.push({ filename: entry.filename, directory: 'people', title: titleCase(entry.filename.replace(/\.(md|txt)$/i, '').replace(/-/g, ' ')), snippet })
    } else {
      const name = entry.filename.replace(/\.(md|txt)$/i, '')
      const date = name.match(/^(\d{4})/)?.[1]
      const titleParts = name.replace(/^\d{4}-W\d{2}-/, '').replace(/-/g, ' ')
      results.push({ filename: entry.filename, directory: 'notes', title: titleParts.charAt(0).toUpperCase() + titleParts.slice(1), snippet, date })
    }
  }

  return results
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
  let feedbackRaw = ''
  try { feedbackRaw = getFileContent(`reports/${name}/feedback/log.md`) } catch {}
  const reviewFiles = listFiles(`reports/${name}/reviews`)
  let dashboardRaw = ''
  try { dashboardRaw = getFileContent(`reports/${name}/DASHBOARD.md`) } catch {}
  let jobExpectationsRaw = ''
  try { jobExpectationsRaw = getFileContent(`reports/${name}/job-expectations.md`) } catch {}

  // Match meetings via filename segments + speaker/attendee frontmatter (rich matching)
  const personMeetings = getPersonMeetings(name).map(m => m.filename).sort()

  // Parse check-ins
  const mdCheckIns = checkInFiles.filter((f) => f.endsWith('.md') && f !== '.gitkeep').sort()
  const recentCheckIns = mdCheckIns.slice(-6)
  const checkIns: CheckIn[] = recentCheckIns.map((f) => {
    try {
      const content = getFileContent(`reports/${name}/check-ins/monthly/${f}`)
      return { date: f.replace('.md', ''), content, accomplishments: [], concerns: [], githubActivity: {} }
    } catch {
      return { date: f.replace('.md', ''), content: '', accomplishments: [], concerns: [], githubActivity: {} }
    }
  })

  // Parse summaries (every meeting file IS a summary)
  const summaries: Summary[] = personMeetings.map((f) => {
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/)
    return { date: dateMatch?.[1] || f.replace('.md', ''), content: '', keyTopics: [], actionItems: [], sentiment: '' }
  })

  // Parse transcripts (derived from meeting files — raw transcripts live in transcripts/processed/)
  const transcripts: Transcript[] = personMeetings.map((f) => {
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/)
    const date = dateMatch?.[1] || f.replace('.md', '')
    return { date, content: '' }
  })

  // Extract action items from recent meeting summaries
  const actionItems: ActionItem[] = []
  const recentSummaries = personMeetings.sort().slice(-5)
  for (const sf of recentSummaries) {
    try {
      const content = getFileContent(`meetings/${sf}`)
      actionItems.push(...parseActionItems(content, `meetings/${sf}`))
    } catch { /* skip */ }
  }

  const feedback = parseFeedbackLog(feedbackRaw)

  const mdReviews = reviewFiles.filter((f) => f.endsWith('.md') && f !== '.gitkeep' && !f.startsWith('YYYY')).sort()
  const reviews = mdReviews.map((f) => ({ period: f.replace('.md', ''), content: '' }))

  const prepFiles = listFiles(`reports/${name}/prep`).filter(f => f.endsWith('.md')).sort()
  const preps: PrepEntry[] = prepFiles.map((f) => {
    const date = f.replace('.md', '')
    try {
      const content = getFileContent(`reports/${name}/prep/${f}`)
      return { date, content }
    } catch {
      return { date, content: '' }
    }
  })

  const result = { name, profile, checkIns, summaries, transcripts, actionItems, feedback, reviews, preps, dashboard: dashboardRaw, jobExpectations: jobExpectationsRaw }
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

      const lastCheckIn = data.checkIns.length > 0
        ? data.checkIns[data.checkIns.length - 1].date
        : null
      const lastFeedback = data.feedback.length > 0
        ? data.feedback.sort((a, b) => b.date.localeCompare(a.date))[0].date
        : null

      reports.push({
        name, displayName: data.profile.displayName, lastOneOnOne: lastTranscript,
        daysGap, openActionItems: openItems, status, meetingDay: data.profile.meetingDay,
        lastCheckIn, lastFeedback,
        feedbackCount: data.feedback.length,
        checkInCount: data.checkIns.length
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
// Invalidated on commit (which means we wrote new data).

let _meetingsCache: { files: string[]; meetings: string[]; speakerMap: Map<string, string[]>; titleMap: Map<string, string>; hasFrontmatter: Set<string> } | null = null

function invalidateMeetingsCache(): void { _meetingsCache = null }

function getMeetingsCache() {
  if (_meetingsCache) return _meetingsCache
  const files = listFiles('meetings').sort()
  const meetings = files.filter(f => f.endsWith('.md'))

  const speakerMap = new Map<string, string[]>()
  const titleMap = new Map<string, string>()
  const hasFrontmatter = new Set<string>()
  for (const mf of meetings) {
    try {
      const content = getFileContent(`meetings/${mf}`).slice(0, 2000)
      const speakers = parseSpeakers(content)
      if (speakers.length > 0) {
        speakerMap.set(mf, speakers)
      }
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (fmMatch) {
        hasFrontmatter.add(mf)
        const titleMatch = fmMatch[1].match(/^title:\s*(.+)/m)
        if (titleMatch) titleMap.set(mf, titleMatch[1].trim())
      }
    } catch { /* skip */ }
  }

  _meetingsCache = { files, meetings, speakerMap, titleMap, hasFrontmatter }
  return _meetingsCache
}

// ── Meetings ──

export function listMeetings(): MeetingEntry[] {
  const cache = getMeetingsCache()
  return cache.meetings
    .map((f) => {
      const name = f.replace('.md', '')
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
      const filenameTitle = formatMeetingTitle(dateMatch?.[2]?.replace(/-/g, ' ') || name)
      const title = cache.titleMap.get(f) || filenameTitle
      const processed = cache.hasFrontmatter.has(f)
      return { date: dateMatch?.[1] || name, title, filename: f, processed }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function listRawTranscripts(): RawTranscriptEntry[] {
  const files = listFiles('transcripts/raw')
    .filter((f) => f.endsWith('.txt') || f.endsWith('.md'))
    .sort()

  return files
    .map((f) => {
      const name = f.replace(/\.(txt|md)$/i, '')
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
      const filenameTitle = dateMatch?.[2]?.replace(/-/g, ' ') || name
      return {
        date: dateMatch?.[1] || name,
        title: filenameTitle,
        filename: f
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function yamlEscapeValue(value: string): string {
  const sanitized = value.replace(/[\n\r]/g, ' ').trim()
  if (/[:#{}[\]|>&*!?,]/.test(sanitized) || sanitized !== value.trim() || /^['"]/.test(sanitized)) {
    return `"${sanitized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return sanitized
}

/** Save a title override into a meeting file's YAML frontmatter */
export async function saveMeetingTitle(meetingFilename: string, title: string): Promise<void> {
  const meetingPath = `meetings/${meetingFilename}`
  const safeTitle = yamlEscapeValue(title)

  try {
    let content = getFileContent(meetingPath)
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (fmMatch) {
      let fm = fmMatch[1]
      if (/^title:\s/m.test(fm)) {
        fm = fm.replace(/^title:\s*.*/m, `title: ${safeTitle}`)
      } else {
        fm = `title: ${safeTitle}\n${fm}`
      }
      content = `---\n${fm}\n---` + content.slice(fmMatch[0].length)
    } else {
      content = `---\ntitle: ${safeTitle}\n---\n\n${content}`
    }
    await commitFile(meetingPath, content, `Update meeting title: ${title}`)
  } catch {
    await commitFile(meetingPath, `---\ntitle: ${safeTitle}\n---\n`, `Set meeting title: ${title}`)
  }
  invalidateMeetingsCache()
}

export async function saveMeetingSpeakers(meetingFilename: string, speakerNames: string[]): Promise<void> {
  const meetingPath = `meetings/${meetingFilename}`
  const speakersYaml = speakerNames.map(n => `  - ${yamlEscapeValue(n)}`).join('\n')

  try {
    let content = getFileContent(meetingPath)
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (fmMatch) {
      let fm = fmMatch[1]
      if (/^speakers:\s/m.test(fm)) {
        fm = fm.replace(/^speakers:\s*\n(?:\s+-\s+.+\n?)*/m, `speakers:\n${speakersYaml}\n`)
      } else {
        fm = `${fm}\nspeakers:\n${speakersYaml}`
      }
      content = `---\n${fm}\n---` + content.slice(fmMatch[0].length)
    } else {
      content = `---\nspeakers:\n${speakersYaml}\n---\n\n${content}`
    }
    await commitFile(meetingPath, content, `Update meeting speakers: ${speakerNames.join(', ')}`)
  } catch {
    await commitFile(meetingPath, `---\nspeakers:\n${speakersYaml}\n---\n`, `Set meeting speakers: ${speakerNames.join(', ')}`)
  }
  invalidateMeetingsCache()
}

// ── People helpers ──

/** Strip parenthetical suffixes and clean a raw attendee name */
function cleanAttendeeName(raw: string): string {
  return raw.replace(/\s*\(.*?\)\s*/g, '').trim()
}

/**
 * Parse attendees/speakers from meeting content.
 * Checks three sources in order:
 *   1. YAML frontmatter `speakers:` list
 *   2. Inline `**Attendees:**` or `**Attendees**:` line (comma-separated)
 *   3. `## Attendees` heading followed by bullet list
 * Returns deduplicated names with parenthetical suffixes stripped.
 */
export function parseSpeakers(content: string): string[] {
  // 1. YAML frontmatter speakers
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    const speakersMatch = fmMatch[1].match(/speakers:\s*\n((?:\s+-\s+.+\n?)*)/)
    if (speakersMatch) {
      const speakers = speakersMatch[1]
        .split('\n')
        .map(l => cleanAttendeeName(l.replace(/^\s*-\s*/, '')))
        .filter(Boolean)
      if (speakers.length > 0) return speakers
    }
  }

  // 2. Inline **Attendees:** or **Attendees**: or - **Attendees**: (comma-separated on same line)
  const inlineMatch = content.match(/(?:^|\n)-?\s*\*\*Attendees\*?\*?\s*:?\*{0,2}\s*:?\s*(.+)/m)
  if (inlineMatch) {
    const names = inlineMatch[1]
      .split(',')
      .map(n => cleanAttendeeName(n))
      .filter(Boolean)
    if (names.length > 0) return names
  }

  // 3. ## Attendees heading followed by bullet list
  const sectionMatch = content.match(/^#{1,3}\s+Attendees\s*\n((?:\s*[-*]\s+.+\n?)*)/m)
  if (sectionMatch) {
    const names = sectionMatch[1]
      .split('\n')
      .map(l => cleanAttendeeName(l.replace(/^\s*[-*]\s*/, '')))
      .filter(Boolean)
    if (names.length > 0) return names
  }

  return []
}

/** Check if a meeting filename (slug part) matches a person */
export function filenameMatchesPerson(meetingSlug: string, personSlug: string): boolean {
  const segments = meetingSlug.split('-')
  const personFirst = personSlug.split('-')[0]
  return meetingSlug === personSlug ||
    meetingSlug.startsWith(personSlug + '-') ||
    meetingSlug.endsWith('-' + personSlug) ||
    segments.includes(personFirst)
}

/** Check if any speaker name matches a person */
export function speakerMatchesPerson(speakers: string[], personName: string, aliases: string[]): boolean {
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

      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
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

  // Merge direct reports: use report dir name as slug (e.g. 'nic') so /report/<slug> routes work
  const existingSlugs = new Set(people.map(p => p.slug))
  const existingNames = new Map(people.map(p => [p.name.toLowerCase(), p]))
  try {
    const reports = getReports()
    for (const reportName of reports) {
      try {
        const profile = getReportProfile(reportName)
        const displayName = profile.displayName || profile.name
        const existing = existingNames.get(displayName.toLowerCase())
        if (existing) {
          if (!existing.role) existing.role = profile.role
          if (!existing.github) existing.github = profile.github
          if (!existing.location) existing.location = profile.location
          existing.relationship = 'Direct Report'
          existing.slug = reportName
        } else if (!existingSlugs.has(reportName)) {
          const personName = displayName

          const filenameMatched = new Set<string>()
          for (const m of meetingFiles) {
            const mSlug = m.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '')
            if (filenameMatchesPerson(mSlug, reportName)) {
              filenameMatched.add(m)
            }
          }

          const speakerMatched = new Set<string>()
          for (const [meetingFile, speakers] of speakerMap) {
            if (filenameMatched.has(meetingFile)) continue
            if (!meetingFiles.includes(meetingFile)) continue
            if (speakerMatchesPerson(speakers, personName, [])) {
              speakerMatched.add(meetingFile)
            }
          }

          const allMatched = [...filenameMatched, ...speakerMatched]
          const dates = allMatched.map(m => m.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean).sort()

          people.push({
            name: personName, slug: reportName, aliases: [],
            meetingCount: allMatched.length,
            lastSeen: dates.length > 0 ? dates[dates.length - 1]! : '',
            role: profile.role, github: profile.github,
            location: profile.location, relationship: 'Direct Report'
          })
        }
      } catch { /* skip individual report errors */ }
    }
  } catch { /* skip if reports can't be listed */ }

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
  } catch {
    try {
      const profile = getReportProfile(slug)
      personName = profile.displayName || profile.name
    } catch { /* use slug-derived name */ }
  }

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
      const filenameTitle = dateMatch?.[2]?.replace(/-/g, ' ') || name
      return { date: dateMatch?.[1] || name, title: cache.titleMap.get(f) || filenameTitle, filename: f }
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

export async function toggleActionItem(sourceFile: string, lineNumber: number): Promise<void> {
  const content = getFileContent(sourceFile)
  const lines = content.split('\n')
  if (lineNumber < 0 || lineNumber >= lines.length) return

  const sourceLine = lines[lineNumber]
  // Verify the line is actually a checkbox item
  if (!sourceLine.match(/^- \[[ xX]\]/)) return

  let newLine: string
  if (sourceLine.includes('- [ ] ')) {
    newLine = sourceLine.replace('- [ ] ', '- [x] ')
  } else {
    newLine = sourceLine.replace(/- \[[xX]\] /, '- [ ] ')
  }
  lines[lineNumber] = newLine
  const updated = lines.join('\n')
  if (updated !== content) {
    const shortText = sourceLine.replace(/^- \[.\]\s+/, '').slice(0, 50)
    await commitFile(sourceFile, updated, `Toggle action item: ${shortText}`)
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

export function getTeamActionItems(): TeamActionItem[] {
  const reportNames = getReports()
  const items: TeamActionItem[] = []
  for (const name of reportNames) {
    try {
      const data = getReportData(name)
      for (const ai of data.actionItems) {
        items.push({ ...ai, reportName: name, displayName: data.profile.displayName })
      }
    } catch { /* skip */ }
  }
  return items
}


export function clearAllCaches(): void {
  invalidateMeetingsCache()
  invalidateReportCache()
  invalidatePeopleCache()
  invalidateSearchIndex()
}

/** Pre-warm all caches at startup so first navigation is instant */
export async function preWarmCaches(onProgress?: (message: string) => void): Promise<void> {
  const yield_ = () => new Promise<void>(resolve => setImmediate(resolve))
  try {
    console.log('[Cache] Pre-warming...')
    const t0 = Date.now()
    onProgress?.('Scanning meeting files...')
    await yield_()
    getMeetingsCache()
    onProgress?.('Scanning raw transcripts...')
    await yield_()
    listRawTranscripts()
    onProgress?.('Loading team data...')
    await yield_()
    getTeamOverview()
    onProgress?.('Building people index...')
    await yield_()
    listPeople()
    onProgress?.('Building search index...')
    await yield_()
    getSearchIndex()
    onProgress?.('Ready!')
    console.log(`[Cache] Pre-warmed in ${Date.now() - t0}ms`)
  } catch (e) {
    console.warn('[Cache] Pre-warm failed:', (e as Error).message)
  }
}
