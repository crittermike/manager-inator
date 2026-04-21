import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Plus, Calendar } from 'lucide-react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useToast } from '../components/common/Toast'
import type { PlanSummary } from '../../shared/types'

export function Plans() {
  const navigate = useNavigate()
  const toast = useToast()
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useDocumentTitle('Plans')

  const load = useCallback(async () => {
    try {
      const list = await window.api.listPlans()
      setPlans(list)
    } catch (err) {
      console.error('Failed to load plans', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = useCallback(async () => {
    const name = newName.trim() || 'Untitled plan'
    setCreating(true)
    try {
      const plan = await window.api.createPlan(name)
      toast.success('Plan created')
      navigate(`/plans/${plan.slug}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to create plan')
      setCreating(false)
    }
  }, [newName, navigate, toast])

  return (
    <div className="max-w-5xl mx-auto pt-2 pb-12">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6 text-brand-light" aria-hidden="true" /> Plans
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Iteration-by-iteration plans for your team's work.</p>
        </div>
      </header>

      {/* Create new */}
      <div className="rounded-xl bg-surface border border-border p-4 mb-6">
        <form
          onSubmit={(e) => { e.preventDefault(); if (!creating) handleCreate() }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New plan name (e.g. FY26Q3 Roadmap)"
            className="flex-1 bg-zinc-900 border border-border rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand transition-colors"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark disabled:opacity-50 text-white rounded-md transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create plan
          </button>
        </form>
      </div>

      {/* Existing list */}
      {loading ? (
        <div className="text-sm text-zinc-500 px-1">Loading…</div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl bg-surface border border-border p-10 text-center">
          <Calendar className="w-10 h-10 text-zinc-700 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-zinc-300 mb-1">No plans yet</h2>
          <p className="text-sm text-zinc-500">
            Create your first plan above. Plans live in your data repo so they're versioned and shareable.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {plans.map(p => (
            <li key={p.slug}>
              <button
                onClick={() => navigate(`/plans/${p.slug}`)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-surface hover:bg-surface-raised border border-border hover:border-brand/30 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <LayoutGrid className="w-4 h-4 text-zinc-500 group-hover:text-brand-light transition-colors shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium text-zinc-200 truncate">{p.name}</span>
                </div>
                <span className="text-xs text-zinc-600 shrink-0">
                  Updated {formatRelative(p.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatRelative(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  const min = 60_000
  const hr = 60 * min
  const day = 24 * hr
  if (diffMs < min) return 'just now'
  if (diffMs < hr) return `${Math.round(diffMs / min)}m ago`
  if (diffMs < day) return `${Math.round(diffMs / hr)}h ago`
  if (diffMs < 30 * day) return `${Math.round(diffMs / day)}d ago`
  return new Date(iso).toLocaleDateString()
}
