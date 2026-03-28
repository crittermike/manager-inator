import { readFileSync, readdirSync, writeFileSync, mkdirSync, realpathSync, existsSync, unlinkSync, lstatSync, openSync, readSync, closeSync } from 'fs'
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
  ContextNote,
  TeamOverview,
  ReportStatus,
  TeamActionItem,
  MeetingEntry,
  PersonEntry
} from '../shared/types'

function repoPath(): string {
  const settings = getSettings()
  const p = settings.repoPath
  if (!p) throw new Error('No repo path configured')
  return p
}

// ── Path safety ──

let _resolvedRepoPath: string | null = null
let _resolvedRepoPathSource: string | null = null

function resolvedRepoPath(): string {
  const source = resolve(repoPath())
  if (_resolvedRepoPath && _resolvedRepoPathSource === source) return _resolvedRepoPath
  _resolvedRepoPathSource = source
  _resolvedRepoPath = realpathSync(source)
  return _resolvedRepoPath
}

function invalidateResolvedRepoPath(): void {
  _resolvedRepoPath = null
  _resolvedRepoPathSource = null
  _realpathCache.clear()
}

/** Resolve a renderer-supplied path and verify it stays within the repo root */
const _realpathCache = new Map<string, string>()

function cachedRealpathSync(p: string): string {
  let cached = _realpathCache.get(p)
  if (cached !== undefined) return cached
  cached = realpathSync(p)
  _realpathCache.set(p, cached)
  return cached
}

function safePath(userPath: string): string {
  const rp = resolvedRepoPath()
  const full = resolve(rp, userPath)

  const relFull = relative(rp, full)
  if (relFull.startsWith('..') || isAbsolute(relFull)) {
    throw new Error(`Path traversal blocked: ${userPath}`)
  }

  // Walk up to nearest existing ancestor for canonicalization
  let ancestor = dirname(full)
  while (ancestor !== rp && !existsSync(ancestor)) {
    ancestor = dirname(ancestor)
  }
  const canonDir = cachedRealpathSync(ancestor)
  const relCanon = relative(rp, canonDir)
  if (relCanon.startsWith('..') || isAbsolute(relCanon)) {
    throw new Error(`Path traversal blocked: ${userPath}`)
  }

  // Reject symlink files that could point outside the repo
  if (existsSync(full) && lstatSync(full).isSymbolicLink()) {
    const target = realpathSync(full)
    const relTarget = relative(rp, target)
    if (relTarget.startsWith('..') || isAbsolute(relTarget)) {
      throw new Error(`Path traversal blocked (symlink): ${userPath}`)
    }
  }

  return full
}

// ── File operations (local filesystem) ──

function readFileHead(absPath: string, bytes: number): string {
  const fd = openSync(absPath, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const bytesRead = readSync(fd, buf, 0, bytes, 0)
    return buf.toString('utf-8', 0, bytesRead)
  } finally {
    closeSync(fd)
  }
}

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

export function commitAiModifiedFiles(absolutePaths: string[]): void {
  if (absolutePaths.length === 0) return
  const rp = repoPath()
  for (const absPath of absolutePaths) {
    const rel = absPath.startsWith(rp)
      ? absPath.slice(rp.length).replace(/^\//, '')
      : absPath
    invalidateCachesForPath(rel)
    _scheduleCommit(rel, `AI chat: update ${rel}`, rp)
  }
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

export function invalidateCachesForPath(filePath: string): void {
  const p = filePath.replace(/\\/g, '/')

  if (p.startsWith('contexts/')) {
    const contextFile = p.replace('contexts/', '')
    if (_contextsCache && contextFile.endsWith('.md')) {
      const priorEntry = _contextsCache.entries.find(e => e.filename === contextFile)
      const priorPeople = priorEntry?.people || []
      try {
        const content = readFileHead(safePath(p), 2048)
        const parsed = parseContextsCacheEntry(contextFile, content)

        const existingIndex = _contextsCache.entries.findIndex(e => e.filename === contextFile)
        if (existingIndex >= 0) {
          _contextsCache.entries[existingIndex] = parsed
        } else {
          _contextsCache.entries.push(parsed)
          _contextsCache.entriesSet.add(contextFile)
        }

        _contextsCache.titleMap.set(contextFile, parsed.title)

        for (const slug of priorPeople) {
          const arr = _contextsCache.byPersonSlug.get(slug)
          if (!arr) continue
          const next = arr.filter(f => f !== contextFile)
          if (next.length > 0) _contextsCache.byPersonSlug.set(slug, next)
          else _contextsCache.byPersonSlug.delete(slug)
        }
        for (const slug of parsed.people) {
          const arr = _contextsCache.byPersonSlug.get(slug)
          if (arr) {
            if (!arr.includes(contextFile)) arr.push(contextFile)
          } else {
            _contextsCache.byPersonSlug.set(slug, [contextFile])
          }
        }
      } catch {
        if (priorEntry) {
          _contextsCache.entries = _contextsCache.entries.filter(e => e.filename !== contextFile)
          _contextsCache.entriesSet.delete(contextFile)
          _contextsCache.titleMap.delete(contextFile)
          for (const slug of priorPeople) {
            const arr = _contextsCache.byPersonSlug.get(slug)
            if (!arr) continue
            const next = arr.filter(f => f !== contextFile)
            if (next.length > 0) _contextsCache.byPersonSlug.set(slug, next)
            else _contextsCache.byPersonSlug.delete(slug)
          }
        }
      }
      invalidatePeopleCache()
      _invalidateReportsForContext(contextFile)
    } else if (!_contextsCache) {
    } else {
      _contextsCache = null
      invalidatePeopleCache()
    }
    invalidateSearchIndex()
    _teamOverviewCache = null
    _teamActionItemsCache = null
  } else if (p.startsWith('reports/')) {
    const reportName = p.split('/')[1]
    if (reportName) {
      _reportDataCache.delete(reportName)
    } else {
      _reportDataCache.clear()
    }
    _teamOverviewCache = null
    _teamActionItemsCache = null
    invalidateReportsCache()

    const subPath = p.split('/').slice(2).join('/')
    if (subPath === 'profile.md') {
      invalidatePeopleCache()
      invalidateSearchIndex()
    }
  } else if (p.startsWith('people/')) {
    invalidatePeopleCache()
    invalidateSearchIndex()
  }
}

async function _commitFileImpl(path: string, content: string, message: string): Promise<void> {
  const fullPath = safePath(path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')

  invalidateCachesForPath(path)

  const rp = repoPath()
  _scheduleCommit(path, message, rp)
}

// Batched commit: accumulate dirty paths then commit once after 2s idle
let _pendingCommitPaths: Map<string, string> = new Map()
let _commitTimer: ReturnType<typeof setTimeout> | null = null
let _commitCwd: string | null = null

function _scheduleCommit(path: string, message: string, cwd: string): void {
  _pendingCommitPaths.set(path, message)
  _commitCwd = cwd
  if (_commitTimer) clearTimeout(_commitTimer)
  _commitTimer = setTimeout(() => {
    _commitTimer = null
    _flushCommit()
  }, 2000)
}

export function flushPendingCommits(): void {
  if (_commitTimer) {
    clearTimeout(_commitTimer)
    _commitTimer = null
  }
  _flushCommit()
}

/** Flush pending commits and wait for the git queue to drain. */
export async function flushPendingCommitsAsync(): Promise<void> {
  flushPendingCommits()
  await _gitQueue
}

/** Cancel pending commits without flushing (used on repo-path change). */
export function cancelPendingCommits(): void {
  if (_commitTimer) {
    clearTimeout(_commitTimer)
    _commitTimer = null
  }
  _pendingCommitPaths = new Map()
  _commitCwd = null
}

function _flushCommit(): void {
  const paths = _pendingCommitPaths
  const cwd = _commitCwd
  _pendingCommitPaths = new Map()
  _commitCwd = null
  if (paths.size === 0 || !cwd) return

  const pathList = [...paths.keys()]
  let message: string
  if (paths.size === 1) {
    message = paths.values().next().value!
  } else if (paths.size <= 20) {
    message = `Update ${paths.size} files: ${pathList.join(', ')}`
  } else {
    message = `Update ${paths.size} files`
  }

  _gitQueue = _gitQueue.then(async () => {
    try {
      if (pathList.length <= 50) {
        await spawnAsync('git', ['add', '-A', '--', ...pathList], cwd)
      } else {
        await spawnAsync('git', ['add', '-A'], cwd)
      }
      try {
        await spawnAsync('git', ['diff', '--cached', '--quiet'], cwd)
        // Exit 0 = no staged changes
      } catch {
        // Exit 1 = staged changes exist
        await spawnAsync('git', ['commit', '-m', message], cwd)
        schedulePush(cwd)
      }
    } catch (err) {
      console.error(`[Git] Batched commit failed for [${pathList.join(', ')}]:`, (err as Error).message)
    }
  })
}

let _gitQueue: Promise<void> = Promise.resolve()

let _pushTimer: ReturnType<typeof setTimeout> | null = null
let _pushInFlight = false

function schedulePush(cwd: string): void {
  // Debounce: wait 5s of inactivity before pushing.
  // If a push is already in flight, the timer will fire after it completes.
  if (_pushTimer) clearTimeout(_pushTimer)
  _pushTimer = setTimeout(() => {
    _pushTimer = null
    _executePush(cwd)
  }, 5000)
}

function _executePush(cwd: string): void {
  if (_pushInFlight) {
    // Another push running — reschedule so we don't overlap
    schedulePush(cwd)
    return
  }
  _pushInFlight = true
  const child = spawn('git', ['push'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  child.unref()
  let stderr = ''
  child.stdout?.resume()
  child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
  child.on('exit', (code) => {
    _pushInFlight = false
    const win = BrowserWindow.getAllWindows()[0]
    if (code !== 0) {
      const msg = stderr.trim() || `push exited with code ${code}`
      console.error(`[Git] push failed (exit ${code}): ${msg}`)
      safeSend(win, 'github:push-status', { success: false, error: `${msg}. Changes saved locally.` })
    } else {
      safeSend(win, 'github:push-status', { success: true })
    }
  })
  child.on('error', (err) => {
    _pushInFlight = false
    console.error('[Git] push spawn error:', err.message)
    safeSend(BrowserWindow.getAllWindows()[0], 'github:push-status', { success: false, error: err.message })
  })
}

async function _deleteFileImpl(path: string): Promise<void> {
  const fullPath = safePath(path)
  if (!existsSync(fullPath)) return

  unlinkSync(fullPath)

  invalidateCachesForPath(path)

  const rp = repoPath()
  _scheduleCommit(path, `Delete file: ${path}`, rp)
}

// ── Parsing helpers ──

const _fieldRegexCache = new Map<string, { table: RegExp; inline: RegExp }>()
function getFieldRegexes(field: string) {
  let cached = _fieldRegexCache.get(field)
  if (!cached) {
    cached = {
      table: new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*(?:${field}:\\s*)?(.+?)\\s*\\|`, 'i'),
      inline: new RegExp(`${field}:\\s*(.+)`, 'i')
    }
    _fieldRegexCache.set(field, cached)
  }
  return cached
}

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
    const re = getFieldRegexes(field)
    const tableMatch = content.match(re.table)
    if (tableMatch) return tableMatch[1].trim()
    const inlineMatch = content.match(re.inline)
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
    // Format 1: ### YYYY-MM-DD — type (legacy)
    const headerMatch = block.match(
      /\[?(\d{4}-\d{2}-\d{2})\]?\s*[—–-]\s*(.+)/
    )
    // Format 2: ### YYYY-MM-DD\n**Type:** type (canonical)
    const dateOnlyMatch = !headerMatch ? block.match(/\[?(\d{4}-\d{2}-\d{2})\]?\s*\n/) : null
    
    if (!headerMatch && !dateOnlyMatch) continue
    
    const date = headerMatch ? headerMatch[1] : dateOnlyMatch![1]

    let type: FeedbackEntry['type']
    if (headerMatch) {
      const rawType = headerMatch[2].split('\n')[0].trim().toLowerCase()
      if (/constructive/.test(rawType)) {
        type = 'constructive'
      } else if (/observation/.test(rawType)) {
        type = 'observation'
      } else if (/mixed/.test(rawType)) {
        type = 'mixed'
      } else {
        type = 'positive'
      }
    } else {
      const typeLineMatch = block.match(/\*\*Type:\*\*\s*(positive|constructive|mixed|observation)/i)
      const rawType = typeLineMatch?.[1]?.toLowerCase() || 'positive'
      type = rawType as FeedbackEntry['type']
    }

    const sourceMatch = block.match(/\*\*Source:?\*\*:?\s*(.+)/i)
    const contextMatch = block.match(/\*\*Context:?\*\*:?\s*(.+)/i)
    const quoteMatch = block.match(/>\s*(.+(?:\n>\s*.+)*)/m)
    
    let feedbackContent: string
    if (quoteMatch) {
      feedbackContent = quoteMatch[1].replace(/^>\s*/gm, '').trim()
    } else {
      // For canonical format: content is everything after the metadata lines
      const lines = block.split('\n')
      const contentLines = lines.filter(l => 
        !l.match(/^\[?\d{4}-\d{2}-\d{2}\]?/) &&
        !l.match(/^\*\*Type:\*\*/i) &&
        !l.match(/^\*\*Source:?\*\*:?/i) &&
        !l.match(/^\*\*Context:?\*\*:?/i) &&
        !l.match(/^---\s*$/) &&
        l.trim()
      )
      feedbackContent = contentLines.join('\n').trim() || block.trim()
    }
    
    entries.push({
      date, type,
      source: sourceMatch?.[1]?.trim() || '',
      context: contextMatch?.[1]?.trim(),
      content: feedbackContent
    })
  }
  return entries
}

export function serializeFeedbackLog(entries: FeedbackEntry[]): string {
  if (entries.length === 0) return ''
  return entries.map(e => {
    let block = `### ${e.date}\n**Type:** ${e.type}\n`
    if (e.source) block += `**Source:** ${e.source}\n`
    if (e.context) block += `**Context:** ${e.context}\n`
    block += `\n${e.content.trim()}\n`
    return block
  }).join('\n---\n\n')
}

export function updateFeedbackEntry(
  reportName: string,
  entryIndex: number,
  newContent: string,
  newType: FeedbackEntry['type']
): void {
  const feedbackLogPath = `reports/${reportName}/feedback/log.md`
  const raw = getFileContent(feedbackLogPath)
  const entries = parseFeedbackLog(raw)
  if (entryIndex < 0 || entryIndex >= entries.length) {
    throw new Error(`Feedback entry index ${entryIndex} out of range (${entries.length} entries)`)
  }
  entries[entryIndex] = { ...entries[entryIndex], content: newContent.trim(), type: newType }
  commitFile(feedbackLogPath, serializeFeedbackLog(entries), `Update feedback for ${reportName}`)
}

export function deleteFeedbackEntry(reportName: string, entryIndex: number): void {
  const feedbackLogPath = `reports/${reportName}/feedback/log.md`
  const raw = getFileContent(feedbackLogPath)
  const entries = parseFeedbackLog(raw)
  if (entryIndex < 0 || entryIndex >= entries.length) {
    throw new Error(`Feedback entry index ${entryIndex} out of range (${entries.length} entries)`)
  }
  entries.splice(entryIndex, 1)
  commitFile(feedbackLogPath, serializeFeedbackLog(entries), `Delete feedback for ${reportName}`)
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
  directory: 'contexts' | 'reports' | 'people' | 'notes'
  content: string
  lowered: string
}

let _prewarmComplete = false

let _searchIndexCache: SearchIndexEntry[] | null = null

function invalidateSearchIndex(): void { _searchIndexCache = null }

function getSearchIndex(): SearchIndexEntry[] {
  if (_searchIndexCache) return _searchIndexCache

  const entries: SearchIndexEntry[] = []

  const contextsCache = getContextsCache()
  for (const entry of contextsCache.entries) {
    const title = entry.title || entry.filename.replace(/\.(md|txt)$/i, '').replace(/-/g, ' ')
    const content = `${entry.filename} ${title} ${entry.summary}`
    entries.push({ filename: entry.filename, directory: 'contexts', content, lowered: content.toLowerCase() })
  }

  const reports = getReports()
  for (const name of reports) {
    const content = `${name} report`
    entries.push({ filename: name, directory: 'reports', content, lowered: content.toLowerCase() })
  }

  const peopleCache = listPeople()
  for (const person of peopleCache) {
    const content = [person.name, person.slug, person.role || '', ...(person.aliases || [])].filter(Boolean).join(' ')
    entries.push({ filename: `${person.slug}.md`, directory: 'people', content, lowered: content.toLowerCase() })
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

    if (entry.directory === 'contexts') {
      const name = entry.filename.replace(/\.(md|txt)$/i, '')
      const date = name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
      const contextsCache = getContextsCache()
      const title = contextsCache.titleMap.get(entry.filename) || formatMeetingTitle(name.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/-/g, ' ') || name)
      results.push({
        filename: entry.filename,
        directory: 'contexts',
        title,
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

let _reportsCache: string[] | null = null

function invalidateReportsCache(): void {
  _reportsCache = null
}

export function getReports(): string[] {
  if (_reportsCache) return _reportsCache
  const dirs = listDirectory('reports')
  _reportsCache = dirs.filter((d) => {
    if (d === '_template' || d.startsWith('.')) return false
    // Only include directories that have a profile.md
    try {
      readFileSync(safePath(`reports/${d}/profile.md`))
      return true
    } catch { return false }
  })
  return _reportsCache
}

// ── Report data cache ──
// Caches are only invalidated on writes (commitFile). No time-based expiry since we control all writes.

let _reportDataCache: Map<string, Report> = new Map()
let _teamOverviewCache: TeamOverview | null = null
let _teamActionItemsCache: TeamActionItem[] | null = null

function invalidateReportCache(): void {
  _reportDataCache.clear()
  _teamOverviewCache = null
  _teamActionItemsCache = null
  invalidateReportsCache()
}

function _invalidateReportsForContext(contextFile: string): void {
  if (_reportDataCache.size === 0) return

  const entry = _contextsCache?.entries.find(e => e.filename === contextFile)
  const slugs = entry?.people || []
  let anyDeleted = false
  for (const slug of slugs) {
    if (_reportDataCache.delete(slug)) anyDeleted = true
  }

  if (anyDeleted) {
    _teamOverviewCache = null
    _teamActionItemsCache = null
  }
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
    return { date: dateMatch?.[1] || f.replace('.md', ''), content: '', keyTopics: [], actionItems: [], sentiment: '', filename: f }
  })

  // Parse transcripts (derived from meeting files — raw transcripts live in transcripts/processed/)
  const transcripts: Transcript[] = personMeetings.map((f) => {
    const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})/)
    const date = dateMatch?.[1] || f.replace('.md', '')
    return { date, content: '', filename: f }
  })

  // Extract action items from recent meeting summaries
  const actionItems: ActionItem[] = []
  const recentSummaries = personMeetings.sort().slice(-5)
  for (const sf of recentSummaries) {
    try {
      const content = getFileContent(`contexts/${sf}`)
      actionItems.push(...parseActionItems(content, `contexts/${sf}`))
    } catch { /* skip */ }
  }

  const personFirstName = (profile.displayName || profile.name || name).split(/\s+/)[0].toLowerCase()
  const relevantActions = actionItems.filter(a => {
    const ownerLower = a.owner.toLowerCase()
    const ownerFirst = ownerLower.split(/\s+/)[0]
    return ownerFirst === personFirstName || ownerFirst === 'mike' || ownerLower === 'unknown'
  })

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

  const contextsCache = getContextsCache()
  let personContextFiles = contextsCache.byPersonSlug.get(name) || []
  if (personContextFiles.length === 0) {
    for (const [personSlug, personFiles] of contextsCache.byPersonSlug) {
      if (personSlug.startsWith(name + '-') || personSlug === name) {
        personContextFiles = personFiles
        break
      }
    }
  }
  const contextNotes: ContextNote[] = personContextFiles.map((f) => {
    const entry = contextsCache.entries.find(e => e.filename === f)
    if (!entry) return null
    return {
      date: entry.date,
      source: (entry.source || 'other') as ContextNote['source'],
      title: entry.title,
      summary: entry.summary,
      tags: entry.tags,
      people: entry.people,
      content: '',
      filename: f
    }
  }).filter((n): n is ContextNote => n !== null)

  const result = { name, profile, checkIns, summaries, transcripts, actionItems: relevantActions, feedback, reviews, preps, contextNotes, dashboard: dashboardRaw, jobExpectations: jobExpectationsRaw }
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
        ? data.feedback.reduce((max, f) => f.date > max ? f.date : max, data.feedback[0].date)
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

interface ContextsCacheEntry {
  filename: string
  date: string
  source: string
  title: string
  summary: string
  tags: string[]
  people: string[]
  speakers: string[]
  hasFrontmatter: boolean
}

let _contextsCache: {
  entries: ContextsCacheEntry[]
  entriesSet: Set<string>
  byPersonSlug: Map<string, string[]>
  titleMap: Map<string, string>
} | null = null

function parseYamlList(frontmatter: string, key: 'people' | 'tags'): string[] {
  const match = frontmatter.match(new RegExp(`${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)*)`))
  if (!match) return []
  return match[1]
    .split('\n')
    .map(l => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
}

function parseContextsCacheEntry(filename: string, content: string): ContextsCacheEntry {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const frontmatter = fmMatch?.[1] || ''
  const name = filename.replace('.md', '')
  const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
  const fallbackDate = dateMatch?.[1] || name
  const fallbackTitle = formatMeetingTitle((dateMatch?.[2] || name).replace(/-/g, ' ').trim() || name)

  return {
    filename,
    date: frontmatter.match(/^date:\s*(.+)$/m)?.[1]?.trim() || fallbackDate,
    source: frontmatter.match(/^source:\s*(.+)$/m)?.[1]?.trim() || 'other',
    title: frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim() || fallbackTitle,
    summary: frontmatter.match(/^summary:\s*(.+)$/m)?.[1]?.trim() || '',
    tags: parseYamlList(frontmatter, 'tags'),
    people: parseYamlList(frontmatter, 'people'),
    speakers: parseSpeakers(content),
    hasFrontmatter: Boolean(fmMatch)
  }
}

function getContextsCache() {
  if (_contextsCache) return _contextsCache

  const files = listFiles('contexts').sort()
  const mdFiles = files.filter(f => f.endsWith('.md'))
  const entries: ContextsCacheEntry[] = []
  const titleMap = new Map<string, string>()
  const byPersonSlug = new Map<string, string[]>()

  for (const f of mdFiles) {
    try {
      const content = readFileHead(safePath(`contexts/${f}`), 2048)
      const entry = parseContextsCacheEntry(f, content)
      entries.push(entry)
      titleMap.set(f, entry.title)
      for (const slug of entry.people) {
        const arr = byPersonSlug.get(slug)
        if (arr) arr.push(f)
        else byPersonSlug.set(slug, [f])
      }
    } catch { /* skip */ }
  }

  _contextsCache = {
    entries,
    entriesSet: new Set(entries.map(e => e.filename)),
    byPersonSlug,
    titleMap
  }
  return _contextsCache
}

// ── Meetings ──

export function listMeetings(): MeetingEntry[] {
  const cache = getContextsCache()
  return cache.entries
    .filter(e => e.source === 'meeting' || e.speakers.length > 0)
    .map(e => ({
      date: e.date,
      title: e.title || formatMeetingTitle(e.filename.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace('.md', '').replace(/-/g, ' ')),
      filename: e.filename,
      processed: e.hasFrontmatter
    }))
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
  const meetingPath = `contexts/${meetingFilename}`
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
}

export async function saveMeetingSpeakers(meetingFilename: string, speakerNames: string[]): Promise<void> {
  const meetingPath = `contexts/${meetingFilename}`
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

// ── People ──

let _peopleCache: PersonEntry[] | null = null
function invalidatePeopleCache(): void { _peopleCache = null }

export function listPeople(): PersonEntry[] {
  if (_peopleCache) return _peopleCache

  const files = listFiles('people')
  const mdFiles = files.filter((f) => f.endsWith('.md') && f !== '.gitkeep')

  const contextsCache = getContextsCache()

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

      const contextFiles = contextsCache.byPersonSlug.get(slug) || []
      const dates = contextFiles.map(f => f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]).filter((d): d is string => Boolean(d)).sort()

      people.push({
        name: personName, slug, aliases,
        meetingCount: contextFiles.length,
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

          let contextFiles = contextsCache.byPersonSlug.get(reportName) || []
          if (contextFiles.length === 0) {
            for (const [pSlug, pFiles] of contextsCache.byPersonSlug) {
              if (pSlug.startsWith(reportName + '-') || pSlug === reportName) {
                contextFiles = pFiles
                break
              }
            }
          }
          const dates = contextFiles.map(f => f.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]).filter((d): d is string => Boolean(d)).sort()

          people.push({
            name: personName, slug: reportName, aliases: [],
            meetingCount: contextFiles.length,
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
  const cache = getContextsCache()
  let files = cache.byPersonSlug.get(slug) || []

  if (files.length === 0) {
    for (const [personSlug, personFiles] of cache.byPersonSlug) {
      if (personSlug.startsWith(slug + '-') || personSlug === slug) {
        files = personFiles
        break
      }
    }
  }

  return files
    .map(f => {
      const entry = cache.entries.find(e => e.filename === f)
      const name = f.replace('.md', '')
      const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
      const filenameTitle = dateMatch?.[2]?.replace(/-/g, ' ') || name
      return {
        date: entry?.date || dateMatch?.[1] || name,
        title: entry?.title || cache.titleMap.get(f) || filenameTitle,
        filename: f
      }
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

// ── Resolve action item from prep text ──

export function resolveActionItemByText(
  reportName: string,
  prepText: string
): { sourceFile: string; lineNumber: number } | null {
  const normalizedPrep = prepText
    .replace(/^\*\*.*?\*\*:?\s*/, '')
    .replace(/^[^:]+:\s*/, '')
    .trim()
    .toLowerCase()

  if (!normalizedPrep) return null

  const contextsCache = getContextsCache()
  let personContextFiles = contextsCache.byPersonSlug.get(reportName) || []
  if (personContextFiles.length === 0) {
    for (const [personSlug, personFiles] of contextsCache.byPersonSlug) {
      if (personSlug.startsWith(reportName + '-') || personSlug === reportName) {
        personContextFiles = personFiles
        break
      }
    }
  }

  const sorted = [...personContextFiles].sort().reverse()
  for (const filename of sorted) {
    try {
      const content = getFileContent(`contexts/${filename}`)
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const match = line.match(/^- \[ \]\s+(.+)/)
        if (!match) continue

        const contextText = match[1]
          .replace(/^\*\*.*?\*\*:?\s*/, '')
          .trim()
          .toLowerCase()

        if (contextText === normalizedPrep) {
          return { sourceFile: `contexts/${filename}`, lineNumber: i }
        }

        if (contextText.length > 10 && normalizedPrep.length > 10) {
          if (contextText.includes(normalizedPrep) || normalizedPrep.includes(contextText)) {
            return { sourceFile: `contexts/${filename}`, lineNumber: i }
          }
        }
      }
    } catch { /* skip */ }
  }

  return null
}

export async function resolveAndToggleActionItem(
  reportName: string,
  prepText: string
): Promise<boolean> {
  const match = resolveActionItemByText(reportName, prepText)
  if (!match) return false

  await toggleActionItem(match.sourceFile, match.lineNumber)
  return true
}

// ── Get open action items for specific people (for AI context) ──

export function getOpenActionItemsForPeople(
  slugs: string[]
): { slug: string; items: ActionItem[] }[] {
  const results: { slug: string; items: ActionItem[] }[] = []
  for (const slug of slugs) {
    try {
      const data = getReportData(slug)
      const openItems = data.actionItems.filter(a => !a.completed)
      if (openItems.length > 0) {
        results.push({ slug, items: openItems })
      }
    } catch { /* skip */ }
  }
  return results
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
  if (_teamActionItemsCache) return _teamActionItemsCache
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
  _teamActionItemsCache = items
  return items
}


export function getTodayBootstrap(): {
  meetings: MeetingEntry[]
  teamActionItems: TeamActionItem[]
} {
  return {
    meetings: listMeetings(),
    teamActionItems: getTeamActionItems()
  }
}

export function getRecentTeamContext(days: number): Record<string, { date: string; source: string; title: string; summary: string }[]> {
  const cache = getContextsCache()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const result: Record<string, { date: string; source: string; title: string; summary: string }[]> = {}

  for (const entry of cache.entries) {
    if (entry.date < cutoffStr) continue
    for (const slug of entry.people) {
      if (!result[slug]) result[slug] = []
      result[slug].push({
        date: entry.date,
        source: entry.source,
        title: entry.title,
        summary: entry.summary
      })
    }
  }

  return result
}

export function clearAllCaches(): void {
  _resolvedRepoPath = null
  _resolvedRepoPathSource = null
  _realpathCache.clear()
  _contextsCache = null
  invalidateReportCache()
  invalidatePeopleCache()
  invalidateSearchIndex()
}

/** Pre-warm all caches at startup so first navigation is instant */
export async function preWarmCaches(onProgress?: (message: string) => void): Promise<void> {
  const yield_ = () => new Promise<void>(resolve => setImmediate(resolve))
  try {
    const rp = repoPath()
    if (!existsSync(rp)) {
      console.warn('[Cache] Repo path does not exist, skipping pre-warm:', rp)
      return
    }
    console.log('[Cache] Pre-warming...')
    const t0 = Date.now()
    onProgress?.('Scanning context files...')
    await yield_()
    getContextsCache()
    // Warm each report individually with yields between them to avoid blocking the event loop
    const reportNames = getReports()
    for (let i = 0; i < reportNames.length; i++) {
      onProgress?.(`Loading report ${i + 1}/${reportNames.length}...`)
      await yield_()
      try { getReportData(reportNames[i]) } catch { /* skip */ }
    }
    // Now getTeamOverview is instant — all reportData is cached
    onProgress?.('Building team overview...')
    await yield_()
    getTeamOverview()
    onProgress?.('Building people index...')
    await yield_()
    listPeople()
    onProgress?.('Ready!')
    _prewarmComplete = true
    console.log(`[Cache] Pre-warmed in ${Date.now() - t0}ms`)
  } catch (e) {
    // Even on failure, mark complete so the app doesn't hang on LoadingScreen
    _prewarmComplete = true
    console.warn('[Cache] Pre-warm failed:', (e as Error).message)
  }
}

/** Returns whether preWarmCaches() has finished (success or failure) */
export function isPrewarmComplete(): boolean {
  return _prewarmComplete
}
