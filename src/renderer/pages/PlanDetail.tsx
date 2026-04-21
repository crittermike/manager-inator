import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Trash2, Plus } from 'lucide-react'
import { useTeamOverview } from '../hooks/useData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useToast } from '../components/common/Toast'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { PlanGrid } from '../components/plan/PlanGrid'
import { ProjectsTable } from '../components/plan/ProjectsTable'
import { nextIterationLabels, nextUnusedColor } from '../utils/planColors'
import type { Plan, PlanColor, PlanIteration, PlanPerson, PlanProject } from '../../shared/types'

function uid(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function PlanDetail() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showAddPerson, setShowAddPerson] = useState(false)

  useDocumentTitle(plan?.name || 'Plan')

  useEffect(() => {
    let cancel = false
    setLoading(true)
    window.api.getPlan(slug).then(p => {
      if (cancel) return
      setPlan(p)
      setLoading(false)
    }).catch(err => {
      console.error('Failed to load plan', err)
      if (!cancel) setLoading(false)
    })
    return () => { cancel = true }
  }, [slug])

  // Debounced save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const handleChange = useCallback((next: Plan) => {
    setPlan(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSavingState('saving')
    saveTimer.current = setTimeout(async () => {
      try {
        const serialized = JSON.stringify(next)
        if (serialized === lastSavedRef.current) {
          setSavingState('saved')
          return
        }
        await window.api.savePlan(next)
        lastSavedRef.current = serialized
        setSavingState('saved')
        setTimeout(() => setSavingState(s => s === 'saved' ? 'idle' : s), 1500)
      } catch (err) {
        console.error('Save failed', err)
        setSavingState('error')
        toast.error('Failed to save plan')
      }
    }, 600)
  }, [toast])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // Initialize lastSavedRef when plan loads
  useEffect(() => {
    if (plan && !lastSavedRef.current) {
      lastSavedRef.current = JSON.stringify(plan)
    }
  }, [plan])

  const handleAddIteration = useCallback(() => {
    if (!plan) return
    const allLabels = plan.iterations.flatMap(it => it.columns.map(c => c.label))
    const labels = nextIterationLabels(allLabels, 2)
    const newIt: PlanIteration = {
      id: uid(),
      columns: labels.map(label => ({ id: uid(), label })),
    }
    handleChange({ ...plan, iterations: [...plan.iterations, newIt] })
  }, [plan, handleChange])

  const handleAddPersonFromReport = useCallback((reportName: string, displayName: string, github?: string) => {
    if (!plan) return
    const newPerson: PlanPerson = {
      id: uid(),
      name: displayName,
      reportSlug: reportName,
      github,
    }
    handleChange({ ...plan, people: [...plan.people, newPerson] })
    setShowAddPerson(false)
  }, [plan, handleChange])

  const handleAddPersonCustom = useCallback((name: string) => {
    if (!plan || !name.trim()) return
    const newPerson: PlanPerson = { id: uid(), name: name.trim() }
    handleChange({ ...plan, people: [...plan.people, newPerson] })
    setShowAddPerson(false)
  }, [plan, handleChange])

  const handleAddProject = useCallback(() => {
    if (!plan) return
    const used = plan.projects.map(p => p.color)
    const newProject: PlanProject = {
      id: uid(),
      name: '',
      color: nextUnusedColor(used) as PlanColor,
      estWeeks: null,
    }
    handleChange({ ...plan, projects: [...plan.projects, newProject] })
    // Scroll to bottom of projects table after a tick so the new row is visible
    setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
    }, 30)
  }, [plan, handleChange])

  const handleDelete = useCallback(async () => {
    if (!plan) return
    try {
      await window.api.deletePlan(plan.slug)
      toast.success('Plan deleted')
      navigate('/plans', { replace: true })
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete plan')
    }
  }, [plan, navigate, toast])

  const handleRename = useCallback((name: string) => {
    if (!plan) return
    handleChange({ ...plan, name })
  }, [plan, handleChange])

  const availableReports = useMemo(() => {
    if (!plan) return []
    const usedSlugs = new Set(plan.people.map(p => p.reportSlug).filter(Boolean) as string[])
    return reports.filter(r => !usedSlugs.has(r.name))
  }, [reports, plan])

  if (loading) {
    return <div className="max-w-7xl mx-auto p-8 text-zinc-500 text-sm">Loading plan…</div>
  }

  if (!plan) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <button onClick={() => navigate('/plans')} className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Plans
        </button>
        <div className="mt-6 p-8 rounded-xl bg-surface border border-border text-center">
          <h2 className="text-lg font-semibold text-zinc-200 mb-2">Plan not found</h2>
          <p className="text-sm text-zinc-500">It may have been deleted.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-12 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/plans')}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Back to plans"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <input
            type="text"
            value={plan.name}
            onChange={(e) => handleRename(e.target.value)}
            placeholder="Untitled plan"
            className="text-xl font-semibold bg-transparent border-0 text-zinc-100 focus:outline-none focus:ring-0 px-2 py-1 rounded hover:bg-white/[0.03] focus:bg-white/[0.05] transition-colors min-w-0 flex-1"
          />
          <SaveIndicator state={savingState} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors flex items-center gap-1.5"
            title="Delete plan"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>

      <PlanGrid
        plan={plan}
        onChange={handleChange}
        onAddPerson={() => setShowAddPerson(true)}
        onAddIteration={handleAddIteration}
        onAddProject={handleAddProject}
        draggedProjectId={draggedProjectId}
        setDraggedProjectId={setDraggedProjectId}
      />

      <ProjectsTable
        plan={plan}
        onChange={handleChange}
        onAddProject={handleAddProject}
        draggedProjectId={draggedProjectId}
        setDraggedProjectId={setDraggedProjectId}
      />

      {showAddPerson && (
        <AddPersonDialog
          availableReports={availableReports}
          onPickReport={handleAddPersonFromReport}
          onPickCustom={handleAddPersonCustom}
          onClose={() => setShowAddPerson(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete plan?"
        message={`Permanently delete "${plan.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null
  if (state === 'saving') return <span className="text-xs text-zinc-500">Saving…</span>
  if (state === 'saved') return <span className="text-xs text-emerald-400">Saved</span>
  return <span className="text-xs text-red-400">Save failed</span>
}

function AddPersonDialog({ availableReports, onPickReport, onPickCustom, onClose }: {
  availableReports: { name: string; displayName: string; github?: string }[]
  onPickReport: (reportName: string, displayName: string, github?: string) => void
  onPickCustom: (name: string) => void
  onClose: () => void
}) {
  const [custom, setCustom] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center pt-[12vh] animate-backdrop-fade" onClick={onClose}>
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 p-4 animate-scale-in"
      >
        <h3 className="text-sm font-semibold text-zinc-200 mb-3">Add person to plan</h3>
        <div className="text-[11px] uppercase font-semibold tracking-wider text-zinc-500 mb-1.5">From your team</div>
        <div className="max-h-[260px] overflow-y-auto -mx-1 px-1 space-y-0.5">
          {availableReports.length === 0 && (
            <div className="px-2 py-3 text-xs text-zinc-500 italic">All your reports are already on this plan.</div>
          )}
          {availableReports.map(r => (
            <button
              key={r.name}
              onClick={() => onPickReport(r.name, r.displayName, r.github)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-white/[0.05] transition-colors"
            >
              {r.github ? (
                <img src={`https://github.com/${r.github}.png?size=48`} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-[11px] font-semibold flex items-center justify-center">
                  {r.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-zinc-200">{r.displayName}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-white/[0.06] mt-3 pt-3">
          <div className="text-[11px] uppercase font-semibold tracking-wider text-zinc-500 mb-1.5">Or add a custom name</div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (custom.trim()) onPickCustom(custom) }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. cross-team partner"
              className="flex-1 bg-zinc-800 border border-white/[0.06] rounded-md px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-brand transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={!custom.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add
            </button>
          </form>
        </div>

        <div className="flex justify-end mt-3">
          <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}
