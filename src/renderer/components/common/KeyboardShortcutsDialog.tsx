import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface KeyboardShortcutsDialogProps {
  open: boolean
  onClose: () => void
}

const shortcuts = {
  General: [
    ['Cmd K', 'Search'],
    ['Cmd Shift N', 'Capture'],
    ['Cmd ,', 'Settings'],
    ['Cmd 1-4', 'Switch views'],
    ['Cmd Shift M', 'Show / hide app (global)'],
    ['Cmd Enter', 'Submit / save'],
    ['?', 'Show shortcuts'],
  ],
  Chat: [
    ['Cmd N', 'New chat'],
    ['Cmd Shift E', 'Export chat'],
  ],
  Lists: [
    ['j', 'Next item'],
    ['k', 'Previous item'],
    ['Enter', 'Expand / select'],
    ['Esc', 'Clear focus'],
  ],
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 animate-backdrop-fade" />
      <div
        className="relative bg-zinc-900 border border-border rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm p-6 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="shortcuts-dialog-title" className="text-sm font-semibold text-zinc-200">Keyboard shortcuts</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-surface-raised transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4">
          {Object.entries(shortcuts).map(([section, items]) => (
            <div key={section} className="space-y-2">
              <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{section}</h3>
              <div className="space-y-1.5">
                {items.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between py-1">
                    <span className="text-sm text-zinc-400">{label}</span>
                    <div className="flex items-center gap-1">
                      {keys.split(' ').map((k, i) => (
                        <kbd key={i} className="text-[11px] font-mono bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded min-w-[24px] text-center">{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
