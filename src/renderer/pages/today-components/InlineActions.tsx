import { useState, useCallback, useRef } from 'react'
import { useToast } from '../../components/common/Toast'
import type { TeamActionItem } from '../../../shared/types'
import { CheckCircle2, Clock, ChevronDown } from 'lucide-react'

const SNOOZE_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 }
] as const

export function InlineActions({
  reportName,
  actions,
  onDone,
  onCancel,
  onToggleAction,
  onSnooze
}: {
  reportName: string
  actions: TeamActionItem[]
  onDone: () => void
  onCancel: () => void
  onToggleAction: (action: TeamActionItem) => Promise<void>
  onSnooze?: (actionKey: string, untilDate: string) => void
}) {
  const toast = useToast()
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set())
  const [localActions, setLocalActions] = useState(actions)
  const [snoozeOpenFor, setSnoozeOpenFor] = useState<string | null>(null)
  const snoozeRef = useRef<HTMLDivElement>(null)

  const handleToggle = useCallback(async (a: TeamActionItem) => {
    if (!a.sourceFile || a.sourceLineNumber == null) return
    const toggleKey = `${a.sourceFile}:${a.sourceLineNumber}`
    setTogglingItems(prev => new Set(prev).add(toggleKey))
    try {
      await onToggleAction(a)
      setLocalActions(prev => prev.filter(item =>
        !(item.sourceFile === a.sourceFile && item.sourceLineNumber === a.sourceLineNumber)
      ))
      toast.success('Action item completed')
    } catch {
      toast.error('Failed to toggle action item')
    } finally {
      setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
    }
  }, [onToggleAction, toast])

  const handleSnooze = useCallback((a: TeamActionItem, days: number) => {
    const key = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
    const until = new Date()
    until.setDate(until.getDate() + days)
    const untilStr = until.toISOString()
    setLocalActions(prev => prev.filter(item =>
      !(item.sourceFile === a.sourceFile && item.sourceLineNumber === a.sourceLineNumber)
    ))
    setSnoozeOpenFor(null)
    onSnooze?.(key, untilStr)
    toast.success(`Snoozed for ${days} day${days !== 1 ? 's' : ''}`)
  }, [onSnooze, toast])

  if (localActions.length === 0) {
    return (
      <div className="py-4 px-1 text-center">
        <CheckCircle2 className="w-6 h-6 text-emerald-500/60 mx-auto mb-2" />
        <p className="text-sm text-zinc-400">All caught up!</p>
        <button onClick={onDone} className="text-xs text-brand-light hover:text-brand mt-2 transition-colors">
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1 py-3 px-1">
      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
        Stale action items for {actions[0]?.displayName ?? reportName}
      </h4>
      <div className="space-y-1">
        {localActions.map((a, i) => {
          const toggleKey = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
          const isToggling = togglingItems.has(toggleKey)
          const isSnoozeOpen = snoozeOpenFor === toggleKey
          return (
            <div key={i} className="relative group">
              <div className="flex items-start gap-2.5 py-1.5 px-1 rounded-lg hover:bg-surface-raised transition-colors">
                <button
                  disabled={isToggling || !a.sourceFile || a.sourceLineNumber == null}
                  onClick={() => handleToggle(a)}
                  className="flex items-start gap-2.5 flex-1 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={`Complete: ${a.text}`}
                >
                  {isToggling ? (
                    <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 group-hover:border-emerald-400 group-hover:bg-emerald-400/20 transition-colors" />
                  )}
                  <span className="text-sm text-zinc-300">{a.text}</span>
                </button>
                {a.owner && a.owner !== 'Unknown' && (
                  <span className="text-xs text-zinc-500 shrink-0 mt-0.5">({a.owner})</span>
                )}
                {onSnooze && (
                  <button
                    onClick={() => setSnoozeOpenFor(isSnoozeOpen ? null : toggleKey)}
                    className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-surface-overlay transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Snooze action item: ${a.text}`}
                  >
                    <Clock className="w-3 h-3" />
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              {isSnoozeOpen && (
                <div ref={snoozeRef} className="absolute right-0 bottom-full mb-1 z-20 bg-surface-raised border border-border rounded-lg shadow-lg py-1 min-w-[120px]">
                  {SNOOZE_OPTIONS.map(opt => (
                    <button
                      key={opt.days}
                      onClick={() => handleSnooze(a, opt.days)}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-surface-overlay transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-2 pt-2">
        <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Collapse
        </button>
      </div>
    </div>
  )
}
