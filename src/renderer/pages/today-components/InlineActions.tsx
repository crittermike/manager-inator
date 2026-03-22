import { useState, useCallback } from 'react'
import { useToast } from '../../components/common/Toast'
import type { TeamActionItem, ActionItem } from '../../../shared/types'
import { CheckCircle2 } from 'lucide-react'

export function InlineActions({
  reportName,
  actions,
  onDone,
  onCancel,
  onRefresh
}: {
  reportName: string
  actions: TeamActionItem[]
  onDone: () => void
  onCancel: () => void
  onRefresh: () => void
}) {
  const toast = useToast()
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set())
  const [localActions, setLocalActions] = useState(actions)

  const handleToggle = useCallback(async (a: ActionItem) => {
    if (!a.sourceFile || a.sourceLineNumber == null) return
    const toggleKey = `${a.sourceFile}:${a.sourceLineNumber}`
    setTogglingItems(prev => new Set(prev).add(toggleKey))
    try {
      await window.api.toggleActionItem(a.sourceFile, a.sourceLineNumber)
      setLocalActions(prev => prev.filter(item =>
        !(item.sourceFile === a.sourceFile && item.sourceLineNumber === a.sourceLineNumber)
      ))
      onRefresh()
      toast.success('Action item completed')
    } catch {
      toast.error('Failed to toggle action item')
    } finally {
      setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
    }
  }, [onRefresh, toast])

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
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {localActions.map((a, i) => {
          const toggleKey = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
          const isToggling = togglingItems.has(toggleKey)
          return (
            <button
              key={i}
              disabled={isToggling || !a.sourceFile || a.sourceLineNumber == null}
              onClick={() => handleToggle(a)}
              className="w-full flex items-start gap-2.5 py-1.5 px-1 rounded-lg hover:bg-surface-raised transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isToggling ? (
                <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 group-hover:border-emerald-400 group-hover:bg-emerald-400/20 transition-colors" />
              )}
              <span className="text-sm text-zinc-300">{a.text}</span>
              {a.owner && a.owner !== 'Unknown' && (
                <span className="text-xs text-zinc-500 shrink-0 ml-auto">({a.owner})</span>
              )}
            </button>
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
