import { shell } from 'electron'
import { existsSync } from 'fs'
import { resolve, isAbsolute, relative } from 'path'
import { homedir, platform } from 'os'
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
