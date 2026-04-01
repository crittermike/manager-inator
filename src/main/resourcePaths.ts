import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export function getResourcePathCandidates(fileName: string): string[] {
  const candidates = [
    join(app.getAppPath(), 'resources', fileName)
  ]

  if (process.resourcesPath) {
    candidates.push(
      join(process.resourcesPath, 'resources', fileName),
      join(process.resourcesPath, fileName)
    )
  }

  candidates.push(join(__dirname, '../../resources', fileName))

  return candidates
}

export function getResourcePath(fileName: string): string {
  return getResourcePathCandidates(fileName).find(candidate => existsSync(candidate)) || getResourcePathCandidates(fileName)[0]
}
