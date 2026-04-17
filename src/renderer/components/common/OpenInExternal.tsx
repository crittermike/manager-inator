import { useEffect, useState } from 'react'
import { FolderOpen, Code2, FileText } from 'lucide-react'

interface Props {
  filePath: string
  className?: string
}

interface Detection {
  vscode: boolean
  obsidian: boolean
  finder: boolean
}

let _detectionPromise: Promise<Detection> | null = null

function getDetection(): Promise<Detection> {
  if (!_detectionPromise) {
    const api = (window as unknown as { api?: { detectExternalApps?: () => Promise<Detection> } }).api
    if (!api?.detectExternalApps) {
      _detectionPromise = Promise.resolve({ vscode: false, obsidian: false, finder: false })
    } else {
      _detectionPromise = api.detectExternalApps().catch(() => ({ vscode: false, obsidian: false, finder: false }))
    }
  }
  return _detectionPromise
}

export function OpenInExternal({ filePath, className }: Props) {
  const [detection, setDetection] = useState<Detection | null>(null)

  useEffect(() => {
    let cancelled = false
    getDetection().then((d) => {
      if (!cancelled) setDetection(d)
    })
    return () => { cancelled = true }
  }, [])

  if (!detection) return null
  if (!detection.vscode && !detection.obsidian && !detection.finder) return null

  const api = window.api
  const btnClass = 'p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-colors'

  return (
    <div className={`flex items-center gap-1 ${className || ''}`}>
      {detection.vscode && (
        <button
          type="button"
          onClick={() => api.openInVSCode(filePath).catch((err) => console.error('Open in VS Code failed:', err))}
          className={btnClass}
          title="Open in VS Code"
          aria-label="Open in VS Code"
        >
          <Code2 className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      {detection.obsidian && (
        <button
          type="button"
          onClick={() => api.openInObsidian(filePath).catch((err) => console.error('Open in Obsidian failed:', err))}
          className={btnClass}
          title="Open in Obsidian"
          aria-label="Open in Obsidian"
        >
          <FileText className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      {detection.finder && (
        <button
          type="button"
          onClick={() => api.revealInFinder(filePath).catch((err) => console.error('Reveal in Finder failed:', err))}
          className={btnClass}
          title="Reveal in Finder"
          aria-label="Reveal in Finder"
        >
          <FolderOpen className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** Reset detection cache (testing only). */
export function _resetExternalAppsDetectionCache(): void {
  _detectionPromise = null
}
