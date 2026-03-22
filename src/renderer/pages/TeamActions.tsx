import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TeamActionItem } from '../../shared/types'
import {
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import { useToast } from '../components/common/Toast'

export function TeamActions() {
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState<TeamActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [expandedPeople, setExpandedPeople] = useState<Set<string>>(new Set())
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getTeamActionItems()
      setItems(result)
      setExpandedPeople(new Set(
        [...new Set(result.filter(i => !i.completed).map(i => i.reportName))]
      ))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggleItem = async (item: TeamActionItem) => {
    if (!item.sourceFile || item.sourceLineNumber == null) return
    const key = `${item.sourceFile}:${item.sourceLineNumber}`
    setTogglingItems(prev => new Set(prev).add(key))
    try {
      await window.api.toggleActionItem(item.sourceFile, item.sourceLineNumber)
      await load()
    } catch (e) {
      console.error('Failed to toggle:', e)
      toast.error('Failed to update action item')
    } finally {
      setTogglingItems(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const togglePerson = (name: string) => {
    setExpandedPeople(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" aria-hidden="true" />
          <p className="text-sm text-zinc-400">{error}</p>
          <button onClick={load} className="text-sm text-brand-light hover:text-brand transition-colors">
            Try again
          </button>
        </div>
      </div>
    )
  }

  const openItems = items.filter(i => !i.completed)
  const completedItems = items.filter(i => i.completed)
  const activeItems = showCompleted ? items : openItems

  const byPerson = new Map<string, { displayName: string; items: TeamActionItem[] }>()
  for (const item of activeItems) {
    const existing = byPerson.get(item.reportName)
    if (existing) {
      existing.items.push(item)
    } else {
      byPerson.set(item.reportName, { displayName: item.displayName, items: [item] })
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to dashboard
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Team action items</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {openItems.length} open · {completedItems.length} completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showCompleted ? 'Hide completed' : 'Show completed'}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {byPerson.size === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckSquare className="w-8 h-8 text-zinc-700 mb-3" aria-hidden="true" />
          <p className="text-sm text-zinc-500">
            {showCompleted ? 'No action items found' : 'All action items are complete'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...byPerson.entries()].map(([reportName, { displayName, items: personItems }]) => {
            const isExpanded = expandedPeople.has(reportName)
            const personOpen = personItems.filter(i => !i.completed).length
            const personDone = personItems.filter(i => i.completed).length

            return (
              <div key={reportName} className="bg-surface rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => togglePerson(reportName)}
                  className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-surface-raised/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-xs font-semibold text-brand-light">
                      {displayName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="text-sm font-medium text-zinc-200">{displayName}</span>
                    <span className="text-xs text-zinc-600">
                      {personOpen} open{showCompleted ? ` · ${personDone} done` : ''}
                    </span>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-zinc-600" aria-hidden="true" />
                    : <ChevronDown className="w-4 h-4 text-zinc-600" aria-hidden="true" />
                  }
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-5 py-2">
                    {personItems.map((item, i) => {
                      const key = `${item.sourceFile ?? ''}:${item.sourceLineNumber ?? -1}`
                      const isToggling = togglingItems.has(key)
                      return (
                        <button
                          key={i}
                          disabled={isToggling || !item.sourceFile || item.sourceLineNumber == null}
                          onClick={() => toggleItem(item)}
                          role="checkbox"
                          aria-checked={item.completed}
                          className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-raised/50 transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isToggling ? (
                            <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                          ) : item.completed ? (
                            <CheckSquare className="w-4 h-4 mt-0.5 text-brand shrink-0" aria-hidden="true" />
                          ) : (
                            <Square className="w-4 h-4 mt-0.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors" aria-hidden="true" />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm ${item.completed ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                              {item.text}
                            </span>
                            {item.owner && item.owner !== 'Unknown' && (
                              <span className="ml-2 text-xs text-zinc-600">({item.owner})</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                    <button
                      onClick={() => navigate(`/report/${reportName}?tab=actions`)}
                      className="w-full text-center py-2 text-xs text-brand-light hover:text-brand transition-colors"
                    >
                      View all for {displayName} →
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
