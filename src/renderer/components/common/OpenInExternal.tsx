import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Code2, FileText, ExternalLink, Maximize2, Github } from 'lucide-react'

interface Props {
  filePath: string
  className?: string
  /** If provided, an "Open full view" menu item is added at the top. */
  onOpenFullView?: () => void
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
      console.warn('[OpenInExternal] window.api.detectExternalApps is not available — preload may be out of date. Restart the dev server.')
      _detectionPromise = Promise.resolve({ vscode: false, obsidian: false, finder: false })
    } else {
      _detectionPromise = api.detectExternalApps().catch((err) => {
        console.error('[OpenInExternal] detectExternalApps failed:', err)
        return { vscode: false, obsidian: false, finder: false }
      })
    }
  }
  return _detectionPromise
}

export function OpenInExternal({ filePath, className, onOpenFullView }: Props) {
  const [detection, setDetection] = useState<Detection | null>(null)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    getDetection().then((d) => {
      if (!cancelled) setDetection(d)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!detection) return null
  const hasExternal = detection.vscode || detection.obsidian || detection.finder
  // Always show the menu — Open in GitHub is unconditional (no app detection needed).
  // hasExternal is no longer a hard gate, but kept for future logic.
  void hasExternal
  if (!onOpenFullView && !detection) return null

  const api = window.api

  const items: { label: string; icon: typeof Code2; onClick: () => void }[] = []
  if (onOpenFullView) {
    items.push({
      label: 'Open full view',
      icon: Maximize2,
      onClick: onOpenFullView
    })
  }
  if (detection.vscode) {
    items.push({
      label: 'Open in VS Code',
      icon: Code2,
      onClick: () => api.openInVSCode(filePath).catch((err) => console.error('Open in VS Code failed:', err))
    })
  }
  if (detection.obsidian) {
    items.push({
      label: 'Open in Obsidian',
      icon: FileText,
      onClick: () => api.openInObsidian(filePath).catch((err) => console.error('Open in Obsidian failed:', err))
    })
  }
  if (detection.finder) {
    items.push({
      label: 'Reveal in Finder',
      icon: FolderOpen,
      onClick: () => api.revealInFinder(filePath).catch((err) => console.error('Reveal in Finder failed:', err))
    })
  }
  items.push({
    label: 'Open on GitHub',
    icon: Github,
    onClick: () => {
      if (typeof api.openInGitHub !== 'function') {
        console.warn('[OpenInExternal] openInGitHub unavailable — restart dev server.')
        return
      }
      api.openInGitHub(filePath).catch((err) => console.error('Open on GitHub failed:', err))
    }
  })

  return (
    <div ref={menuRef} className={`relative inline-block ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Open in…"
        aria-label="Open in…"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Open in…"
          className="absolute right-0 top-full z-20 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-border bg-surface-raised py-1 shadow-2xl shadow-black/30"
        >
          {items.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              role="menuitem"
              onClick={() => { setOpen(false); onClick() }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-surface-overlay hover:text-zinc-100"
            >
              <Icon className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Reset detection cache (testing only). */
export function _resetExternalAppsDetectionCache(): void {
  _detectionPromise = null
}
