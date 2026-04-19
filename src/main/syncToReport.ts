/**
 * On-demand sync from the manager's source repo to a per-direct-report private
 * repo (e.g. crittermike/1-1-laserlemon).
 *
 * Design notes:
 *  - **Append/update only**. We never delete files from the destination repo.
 *  - **Strict 1:1 detection**: we only push meeting summaries/transcripts when
 *    the source frontmatter says `source: meeting` AND the speakers list (after
 *    case-insensitive dedup) is exactly {currentUser, thisReport}. This prevents
 *    team standups or multi-attendee meetings from leaking into a private repo.
 *  - **Stable date-collision suffixes**: when two 1:1s share a date, suffixes
 *    `-2`, `-3` are derived from the source filename sort order so previews and
 *    actual syncs always agree, and a summary always pairs with its transcript.
 *  - **Auth-safe git invocations**: GIT_TERMINAL_PROMPT=0 + GIT_ASKPASS=echo
 *    so we fail fast instead of hanging if the user's credential helper is
 *    missing.
 *  - **Path safety on dest writes**: every write canonicalizes the destination
 *    path and rejects symlink escapes — even though the dest is a clone of a
 *    user-owned GitHub repo, it could contain malicious symlinks.
 */

import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync } from 'fs'
import { join, resolve, relative, isAbsolute, dirname } from 'path'
import { app } from 'electron'
import { getSettings } from './store'
import { getReportProfile, getFileContent } from './github'

const MANAGED_DIRS = ['check-ins', 'reviews', 'summaries', 'transcripts'] as const

const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/

export interface SyncStatus {
  canSync: boolean
  ghUsername: string
  owner: string
  destPath: string
  cloned: boolean
  error?: string
}

export interface SyncEntry {
  source: string
  dest: string
}

export interface SyncPreview {
  added: SyncEntry[]
  updated: SyncEntry[]
  unchanged: SyncEntry[]
}

export interface SyncResult {
  added: SyncEntry[]
  updated: SyncEntry[]
  pushed: boolean
  pushError?: string
  commitSha?: string
}

export type SyncProgressStage =
  | 'starting'
  | 'cloning'
  | 'fetching'
  | 'planning'
  | 'comparing'
  | 'writing'
  | 'committing'
  | 'pushing'
  | 'done'

export interface SyncProgress {
  stage: SyncProgressStage
  message: string
  /** For stages that iterate (e.g. writing), 1-based current item index. */
  current?: number
  /** For stages that iterate, the total number of items. */
  total?: number
}

export type ProgressFn = (p: SyncProgress) => void
const noopProgress: ProgressFn = () => {}

// ── Git helpers (auth-safe) ──

function spawnGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolveP, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        SSH_ASKPASS: 'echo',
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', err => reject(err))
    child.on('close', code => {
      if (code !== 0) reject(new Error(`git ${args[0]} failed (exit ${code}): ${stderr.trim() || stdout.trim()}`))
      else resolveP(stdout)
    })
  })
}

// ── Owner/username derivation & validation ──

/** Parse owner from a GitHub HTTPS or SSH origin URL. Returns null for non-GitHub remotes. */
export function parseGithubOwnerFromOrigin(origin: string): string | null {
  // https://github.com/owner/repo(.git)
  let m = origin.match(/^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/[^/]+?(?:\.git)?\/?$/i)
  if (m) return m[1]
  // git@github.com:owner/repo(.git)
  m = origin.match(/^git@github\.com:([^/]+)\/[^/]+?(?:\.git)?$/i)
  if (m) return m[1]
  return null
}

/** Pure helper: does a profile.github value pass GitHub's username rules? */
export function isValidGithubUsername(name: string): boolean {
  return GITHUB_USERNAME_RE.test(name)
}

async function resolveOwner(sourceRepoPath: string): Promise<string> {
  const settingsOwner = (getSettings().repoOwner || '').trim()
  if (settingsOwner && isValidGithubUsername(settingsOwner)) return settingsOwner

  let origin = ''
  try {
    origin = (await spawnGit(['remote', 'get-url', 'origin'], sourceRepoPath)).trim()
  } catch {
    throw new Error('Source repo has no "origin" remote — cannot infer destination repo owner')
  }
  const parsed = parseGithubOwnerFromOrigin(origin)
  if (!parsed) {
    throw new Error(`Source repo origin is not a GitHub URL (got: ${origin}) — cannot infer destination repo owner`)
  }
  return parsed
}

// ── Path safety inside the destination clone ──

function destSafePath(destRoot: string, relPath: string): string {
  const resolvedRoot = realpathSync(destRoot)
  const full = resolve(resolvedRoot, relPath)
  const rel = relative(resolvedRoot, full)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Destination path traversal blocked: ${relPath}`)
  }
  // If the full path or any existing ancestor is a symlink that escapes the
  // root, reject.
  let cursor = full
  while (cursor !== resolvedRoot && cursor !== dirname(cursor)) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      const target = realpathSync(cursor)
      const relTarget = relative(resolvedRoot, target)
      if (relTarget.startsWith('..') || isAbsolute(relTarget)) {
        throw new Error(`Destination path traversal blocked (symlink): ${relPath}`)
      }
    }
    cursor = dirname(cursor)
  }
  return full
}

// ── Frontmatter / content helpers ──

function stripFrontmatter(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?/)
  return (m ? content.slice(m[0].length) : content).trimStart()
}

function parseFrontmatter(content: string): Record<string, string | string[]> {
  const m = content.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const fm: Record<string, string | string[]> = {}
  const lines = m[1].split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const single = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/)
    if (!single) { i++; continue }
    const [, key, val] = single
    if (val.trim() === '') {
      // possibly a YAML list
      const list: string[] = []
      let j = i + 1
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        list.push(lines[j].replace(/^\s+-\s+/, '').trim())
        j++
      }
      if (list.length > 0) {
        fm[key] = list
        i = j
        continue
      }
    }
    fm[key] = val.trim()
    i++
  }
  return fm
}

/** Extract just the "summary" portion of a meeting context file (everything before `## Raw content`). */
export function extractSummary(content: string): string {
  const noFm = stripFrontmatter(content)
  const idx = noFm.search(/\n## Raw content\b/)
  if (idx === -1) return noFm.trimEnd()
  return noFm.slice(0, idx).trimEnd()
}

/** Extract just the raw transcript portion (everything after `## Raw content`). Returns empty string if absent. */
export function extractTranscript(content: string): string {
  const noFm = stripFrontmatter(content)
  const m = noFm.match(/\n## Raw content\s*\n([\s\S]*)$/)
  if (!m) return ''
  return m[1].trim()
}

// ── 1:1 predicate ──

function normalizeName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase()
}

/**
 * Returns true iff the file is a 1:1 between the current user and the given
 * report. Accepts speakers in any of these shapes (after case-insensitive,
 * paren-stripping normalization):
 *   - {me, report}         canonical
 *   - {report}             current user not listed (common when only one party speaks)
 *   - {me}                 — REJECTED (no report present)
 *   - {report, third}      — REJECTED (third party present)
 *   - {me, report, third}  — REJECTED (third party present)
 *
 * In other words: speakers must be a non-empty subset of {me, report-or-alias}
 * AND must contain the report. This guarantees no cross-report leakage —
 * speakers can never include anyone other than the user and this report.
 *
 * Empty speakers lists are rejected since we cannot verify it's actually a 1:1.
 *
 * Pure for testability.
 */
export function isOneOnOneWith(opts: {
  source: string | undefined
  speakers: string[]
  currentUserName: string
  reportName: string
  reportAliases: string[]
}): boolean {
  if ((opts.source || '').toLowerCase() !== 'meeting') return false
  if (!opts.reportName.trim()) return false

  const speakers = new Set<string>()
  for (const s of opts.speakers) {
    const n = normalizeName(s)
    if (n) speakers.add(n)
  }
  if (speakers.size === 0) return false
  if (speakers.size > 2) return false

  const userKey = normalizeName(opts.currentUserName)
  const reportKeys = [opts.reportName, ...opts.reportAliases].map(normalizeName).filter(Boolean)
  const reportKeySet = new Set(reportKeys)

  // Speakers must contain the report.
  let containsReport = false
  for (const s of speakers) {
    if (reportKeySet.has(s)) { containsReport = true; break }
  }
  if (!containsReport) return false

  // Every speaker must be either the report (or alias) or the current user.
  for (const s of speakers) {
    if (reportKeySet.has(s)) continue
    if (userKey && s === userKey) continue
    return false
  }
  return true
}

// ── Mapping computation ──

function listContextFiles(sourceRepoPath: string): string[] {
  const dir = join(sourceRepoPath, 'contexts')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep')
    .sort()
}

function listReviewFiles(sourceRepoPath: string, slug: string): string[] {
  const dir = join(sourceRepoPath, 'reports', slug, 'reviews')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep').sort()
}

function listCheckinFiles(sourceRepoPath: string, slug: string): string[] {
  const dir = join(sourceRepoPath, 'reports', slug, 'check-ins', 'monthly')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep').sort()
}

function dateFromContextFilename(filename: string): string | null {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

interface PlannedWrite {
  source: string  // relative to source repo root
  dest: string    // relative to dest repo root
  content: string
}

/**
 * Compute the full set of files we'd write to the destination repo.
 * Pure, deterministic, takes pre-loaded inputs.
 */
export function planWrites(opts: {
  sourceRepoPath: string
  slug: string
  currentUserName: string
  reportName: string
  reportAliases: string[]
  readFile: (relPath: string) => string  // injected for testability
  listCheckins: () => string[]
  listReviews: () => string[]
  listContexts: () => string[]
}): PlannedWrite[] {
  const writes: PlannedWrite[] = []

  // Check-ins
  for (const f of opts.listCheckins()) {
    const src = `reports/${opts.slug}/check-ins/monthly/${f}`
    const content = opts.readFile(src)
    writes.push({ source: src, dest: `check-ins/${f}`, content: stripFrontmatter(content) + (content.endsWith('\n') ? '' : '\n') })
  }

  // Reviews
  for (const f of opts.listReviews()) {
    const src = `reports/${opts.slug}/reviews/${f}`
    const content = opts.readFile(src)
    writes.push({ source: src, dest: `reviews/${f}`, content: stripFrontmatter(content) + (content.endsWith('\n') ? '' : '\n') })
  }

  // 1:1 contexts → summaries + transcripts
  // Group by date for stable suffixes.
  const oneOnOnesByDate = new Map<string, string[]>()
  for (const f of opts.listContexts()) {
    const date = dateFromContextFilename(f)
    if (!date) continue
    const content = opts.readFile(`contexts/${f}`)
    const fm = parseFrontmatter(content)
    const speakersRaw = fm['speakers']
    const speakers = Array.isArray(speakersRaw) ? speakersRaw : []
    const source = typeof fm['source'] === 'string' ? fm['source'] as string : undefined
    if (!isOneOnOneWith({
      source,
      speakers,
      currentUserName: opts.currentUserName,
      reportName: opts.reportName,
      reportAliases: opts.reportAliases,
    })) continue

    const arr = oneOnOnesByDate.get(date) || []
    arr.push(f)
    oneOnOnesByDate.set(date, arr)
  }

  // Sorted dates → sorted filenames within each date → stable suffixes
  for (const [date, files] of [...oneOnOnesByDate.entries()].sort()) {
    files.sort()
    files.forEach((srcFilename, idx) => {
      const suffix = idx === 0 ? '' : `-${idx + 1}`
      const content = opts.readFile(`contexts/${srcFilename}`)
      const summary = extractSummary(content)
      if (summary.trim()) {
        writes.push({
          source: `contexts/${srcFilename}`,
          dest: `summaries/${date}${suffix}.md`,
          content: summary.trimEnd() + '\n',
        })
      }
      const transcript = extractTranscript(content)
      if (transcript.trim()) {
        writes.push({
          source: `contexts/${srcFilename}`,
          dest: `transcripts/${date}${suffix}.md`,
          content: transcript.trimEnd() + '\n',
        })
      }
    })
  }

  return writes
}

// ── Public API ──

function getSyncedReposRoot(): string {
  return join(app.getPath('userData'), 'synced-repos')
}

export function getDestPath(ghUsername: string): string {
  if (!isValidGithubUsername(ghUsername)) throw new Error(`Invalid GitHub username: ${ghUsername}`)
  return join(getSyncedReposRoot(), `1-1-${ghUsername}`)
}

export async function getRepoSyncStatus(slug: string): Promise<SyncStatus> {
  const blank: SyncStatus = { canSync: false, ghUsername: '', owner: '', destPath: '', cloned: false }
  let profile
  try {
    profile = getReportProfile(slug)
  } catch (e) {
    return { ...blank, error: `Could not load profile for ${slug}: ${(e as Error).message}` }
  }
  const gh = (profile.github || '').trim().replace(/^@/, '')
  if (!gh) return { ...blank, error: 'No GitHub username on this report\'s profile' }
  if (!isValidGithubUsername(gh)) return { ...blank, error: `Invalid GitHub username on profile: "${gh}"` }

  const settings = getSettings()
  if (!settings.repoPath) return { ...blank, ghUsername: gh, error: 'No source repo configured' }

  let owner: string
  try {
    owner = await resolveOwner(settings.repoPath)
  } catch (e) {
    return { ...blank, ghUsername: gh, error: (e as Error).message }
  }

  const destPath = getDestPath(gh)
  const cloned = existsSync(join(destPath, '.git'))
  return { canSync: true, ghUsername: gh, owner, destPath, cloned }
}

async function ensureCloned(status: SyncStatus, onProgress: ProgressFn = noopProgress): Promise<void> {
  if (status.cloned) return
  const root = getSyncedReposRoot()
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  const repoUrl = `https://github.com/${status.owner}/1-1-${status.ghUsername}.git`
  onProgress({ stage: 'cloning', message: `Cloning ${status.owner}/1-1-${status.ghUsername}…` })
  await spawnGit(['clone', '--depth', '50', repoUrl, status.destPath], root)
}

async function ensureClean(destPath: string): Promise<void> {
  // Only fail if managed paths have uncommitted changes. Anything outside is the user's business.
  const status = (await spawnGit(['status', '--porcelain'], destPath)).trim()
  if (!status) return
  const lines = status.split('\n')
  const dirtyManaged = lines.filter(l => {
    const path = l.slice(3)
    return MANAGED_DIRS.some(d => path.startsWith(d + '/'))
  })
  if (dirtyManaged.length > 0) {
    throw new Error(`Destination repo has uncommitted changes in managed paths:\n${dirtyManaged.join('\n')}\nResolve them in ${destPath} before syncing.`)
  }
}

async function pullFastForward(destPath: string): Promise<void> {
  await spawnGit(['fetch', 'origin'], destPath)
  // Get current branch
  let branch: string
  try {
    branch = (await spawnGit(['rev-parse', '--abbrev-ref', 'HEAD'], destPath)).trim()
  } catch {
    throw new Error('Could not determine current branch in destination repo')
  }
  // Try fast-forward merge
  try {
    await spawnGit(['merge', '--ff-only', `origin/${branch}`], destPath)
  } catch (e) {
    throw new Error(`Cannot fast-forward destination repo (would need a merge). Resolve manually in ${destPath}. Underlying: ${(e as Error).message}`)
  }
}

function buildPlanFromStatus(status: SyncStatus, slug: string): PlannedWrite[] {
  const settings = getSettings()
  const profile = getReportProfile(slug)
  return planWrites({
    sourceRepoPath: settings.repoPath,
    slug,
    currentUserName: settings.userName,
    reportName: profile.displayName || profile.name || '',
    reportAliases: (profile as any).aliases || [],
    readFile: (rel) => getFileContent(rel),
    listCheckins: () => listCheckinFiles(settings.repoPath, slug),
    listReviews: () => listReviewFiles(settings.repoPath, slug),
    listContexts: () => listContextFiles(settings.repoPath),
  })
}

function classifyChange(destPath: string, w: PlannedWrite): 'added' | 'updated' | 'unchanged' {
  const full = destSafePath(destPath, w.dest)
  if (!existsSync(full)) return 'added'
  try {
    const existing = readFileSync(full, 'utf8')
    return existing === w.content ? 'unchanged' : 'updated'
  } catch {
    return 'updated'
  }
}

export async function previewSync(slug: string, onProgress: ProgressFn = noopProgress): Promise<SyncPreview> {
  onProgress({ stage: 'starting', message: 'Checking sync status…' })
  const status = await getRepoSyncStatus(slug)
  if (!status.canSync) throw new Error(status.error || 'Cannot sync')

  // For preview, try to ensure cloned so we can compare against actual dest contents.
  // If clone fails (e.g. offline), fall back to "everything is added".
  let canCompare = status.cloned
  if (!canCompare) {
    try {
      await ensureCloned(status, onProgress)
      canCompare = true
    } catch {
      canCompare = false
    }
  }

  onProgress({ stage: 'planning', message: 'Scanning source repo for changes…' })
  const writes = buildPlanFromStatus(status, slug)
  onProgress({ stage: 'comparing', message: `Comparing ${writes.length} file${writes.length === 1 ? '' : 's'}…` })
  const preview: SyncPreview = { added: [], updated: [], unchanged: [] }
  for (const w of writes) {
    const entry: SyncEntry = { source: w.source, dest: w.dest }
    if (!canCompare) { preview.added.push(entry); continue }
    const cls = classifyChange(status.destPath, w)
    preview[cls].push(entry)
  }
  onProgress({ stage: 'done', message: 'Preview ready' })
  return preview
}

export async function syncReport(slug: string, onProgress: ProgressFn = noopProgress): Promise<SyncResult> {
  onProgress({ stage: 'starting', message: 'Preparing sync…' })
  const status = await getRepoSyncStatus(slug)
  if (!status.canSync) throw new Error(status.error || 'Cannot sync')

  await ensureCloned(status, onProgress)
  onProgress({ stage: 'fetching', message: 'Fetching latest from remote…' })
  await ensureClean(status.destPath)
  await pullFastForward(status.destPath)

  onProgress({ stage: 'planning', message: 'Building file plan…' })
  const writes = buildPlanFromStatus(status, slug)
  const added: SyncEntry[] = []
  const updated: SyncEntry[] = []

  const changedWrites = writes.filter(w => classifyChange(status.destPath, w) !== 'unchanged')
  let i = 0
  for (const w of writes) {
    const cls = classifyChange(status.destPath, w)
    if (cls === 'unchanged') continue
    i++
    onProgress({
      stage: 'writing',
      message: `Writing ${w.dest}`,
      current: i,
      total: changedWrites.length,
    })
    const full = destSafePath(status.destPath, w.dest)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, w.content, 'utf8')
    if (cls === 'added') added.push({ source: w.source, dest: w.dest })
    else updated.push({ source: w.source, dest: w.dest })
  }

  if (added.length === 0 && updated.length === 0) {
    onProgress({ stage: 'done', message: 'Already up to date' })
    return { added, updated, pushed: false }
  }

  const settings = getSettings()
  const profile = getReportProfile(slug)
  const message = `Sync from manager-inator: ${profile.displayName || slug} (${added.length} added, ${updated.length} updated)`

  onProgress({ stage: 'committing', message: 'Committing changes…' })
  await spawnGit(['add', '-A', '--', ...MANAGED_DIRS], status.destPath)
  await spawnGit(['-c', `user.name=${settings.userName || 'manager-inator'}`, '-c', 'user.email=manager-inator@local', 'commit', '-m', message], status.destPath)

  let commitSha: string | undefined
  try {
    commitSha = (await spawnGit(['rev-parse', 'HEAD'], status.destPath)).trim()
  } catch { /* ignore */ }

  onProgress({ stage: 'pushing', message: 'Pushing to remote…' })
  let pushed = true
  let pushError: string | undefined
  try {
    await spawnGit(['push'], status.destPath)
  } catch (e) {
    pushed = false
    pushError = (e as Error).message
  }

  onProgress({ stage: 'done', message: pushed ? 'Push complete' : 'Saved locally; push failed' })
  return { added, updated, pushed, pushError, commitSha }
}

// Internal exports for tests
export const __test = {
  parseFrontmatter,
  stripFrontmatter,
  dateFromContextFilename,
  classifyChange,
  destSafePath,
}
