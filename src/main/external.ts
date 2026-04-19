import { shell } from 'electron'
import { existsSync } from 'fs'
import { resolve, isAbsolute, relative } from 'path'
import { homedir, platform } from 'os'
import { spawn } from 'child_process'
import { getSettings } from './store'

export interface ExternalAppDetection {
  vscode: boolean
  obsidian: boolean
  finder: boolean
}

let _detectionCache: ExternalAppDetection | null = null

function detectVSCode(): boolean {
  if (platform() !== 'darwin') return false
  return (
    existsSync('/Applications/Visual Studio Code.app') ||
    existsSync(`${homedir()}/Applications/Visual Studio Code.app`) ||
    existsSync('/Applications/VSCodium.app') ||
    existsSync('/Applications/Cursor.app') ||
    existsSync(`${homedir()}/Applications/Cursor.app`)
  )
}

function detectObsidian(): boolean {
  if (platform() !== 'darwin') return false
  return (
    existsSync('/Applications/Obsidian.app') ||
    existsSync(`${homedir()}/Applications/Obsidian.app`)
  )
}

export function detectExternalApps(): ExternalAppDetection {
  if (_detectionCache) return _detectionCache
  _detectionCache = {
    vscode: detectVSCode(),
    obsidian: detectObsidian(),
    finder: platform() === 'darwin'
  }
  return _detectionCache
}

function repoPath(): string {
  const p = getSettings().repoPath
  if (!p) throw new Error('No repo path configured')
  return p
}

/** Resolve a repo-relative path to an absolute path, blocking traversal. */
function safeAbsolutePath(relPath: string): string {
  const rp = resolve(repoPath())
  const full = resolve(rp, relPath)
  const rel = relative(rp, full)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path traversal blocked: ${relPath}`)
  }
  if (!existsSync(full)) throw new Error(`File not found: ${relPath}`)
  return full
}

export async function openInVSCode(relPath: string): Promise<void> {
  const abs = safeAbsolutePath(relPath)
  await shell.openExternal(`vscode://file${abs}`)
}

export async function openInObsidian(relPath: string): Promise<void> {
  const abs = safeAbsolutePath(relPath)
  await shell.openExternal(`obsidian://open?path=${encodeURIComponent(abs)}`)
}

export function revealInFinder(relPath: string): void {
  const abs = safeAbsolutePath(relPath)
  shell.showItemInFolder(abs)
}

function gitOutput(args: string[], cwd: string): Promise<string> {
  return new Promise((resolveP, reject) => {
    const proc = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        SSH_ASKPASS: 'echo',
      },
    })
    let out = ''
    let err = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('close', code => {
      if (code === 0) resolveP(out)
      else reject(new Error(`git ${args.join(' ')} failed (exit ${code}): ${err.trim()}`))
    })
  })
}

function parseOriginToOwnerRepo(origin: string): { owner: string; repo: string } | null {
  const url = origin.trim()
  // HTTPS: https://[creds@]github.com/owner/repo(.git)
  let m = url.match(/^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (m) return { owner: m[1], repo: m[2] }
  // SSH: git@github.com:owner/repo(.git)
  m = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (m) return { owner: m[1], repo: m[2] }
  return null
}

export async function openInGitHub(relPath: string): Promise<void> {
  // Validate path exists in repo (also blocks traversal).
  safeAbsolutePath(relPath)
  const rp = repoPath()

  const settings = getSettings()
  let owner = (settings.repoOwner || '').trim()
  let repo = (settings.repoName || '').trim()

  // If owner/repo aren't set in settings, fall back to parsing the source repo's
  // origin URL — same approach used by syncToReport.
  if (!owner || !repo) {
    try {
      const origin = (await gitOutput(['config', '--get', 'remote.origin.url'], rp)).trim()
      const parsed = parseOriginToOwnerRepo(origin)
      if (!parsed) throw new Error(`Cannot derive GitHub owner/repo from origin URL: ${origin}`)
      owner = owner || parsed.owner
      repo = repo || parsed.repo
    } catch (e) {
      throw new Error(`Could not determine GitHub owner/repo. Set them in Settings, or ensure the repo has a GitHub origin remote. (${(e as Error).message})`)
    }
  }

  // Determine current branch (fall back to 'main' if detached HEAD or any failure).
  let branch = 'main'
  try {
    const b = (await gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], rp)).trim()
    if (b && b !== 'HEAD') branch = b
  } catch { /* keep default */ }

  // Build URL. URL-encode each path segment so spaces/special chars work.
  const encodedPath = relPath.split('/').map(encodeURIComponent).join('/')
  const url = `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${encodedPath}`
  await shell.openExternal(url)
}
