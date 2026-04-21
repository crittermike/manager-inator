import { useMemo, useState, useCallback } from 'react'
import { GripVertical, X, ExternalLink } from 'lucide-react'
import { ColorSwatchPicker } from './ColorSwatchPicker'
import { PLAN_COLOR_THEMES } from '../../utils/planColors'
import type { Plan, PlanProject } from '../../../shared/types'

interface Props {
  plan: Plan
  onChange: (next: Plan) => void
  onAddProject: () => void
  /** When user clicks a row, set this as the chip-being-dragged (so cells can drop) */
  draggedProjectId: string | null
  setDraggedProjectId: (id: string | null) => void
}

export function ProjectsTable({ plan, onChange, onAddProject, draggedProjectId, setDraggedProjectId }: Props) {
  const planned = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of plan.assignments) {
      counts[a.projectId] = (counts[a.projectId] || 0) + 1
    }
    return counts
  }, [plan.assignments])

  const updateProject = useCallback((id: string, patch: Partial<PlanProject>) => {
    onChange({ ...plan, projects: plan.projects.map(p => p.id === id ? { ...p, ...patch } : p) })
  }, [plan, onChange])

  const removeProject = useCallback((id: string) => {
    onChange({
      ...plan,
      projects: plan.projects.filter(p => p.id !== id),
      assignments: plan.assignments.filter(a => a.projectId !== id),
    })
  }, [plan, onChange])

  // Reorder via drag (within table only)
  const [dragRowId, setDragRowId] = useState<string | null>(null)

  const handleRowDragStart = (e: React.DragEvent, id: string) => {
    setDragRowId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Also empty data so cell drop won't trigger
    e.dataTransfer.setData('text/plain', '__plan-row__')
  }

  const handleRowDragOver = (e: React.DragEvent) => {
    if (dragRowId) e.preventDefault()
  }

  const handleRowDrop = (e: React.DragEvent, targetId: string) => {
    if (!dragRowId || dragRowId === targetId) return
    e.preventDefault()
    const ids = plan.projects.map(p => p.id)
    const from = ids.indexOf(dragRowId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const reordered = [...plan.projects]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    onChange({ ...plan, projects: reordered })
    setDragRowId(null)
  }

  return (
    <div className="rounded-xl bg-surface border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-zinc-900/40">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Projects</span>
          <span className="text-xs text-zinc-600">Drag a chip onto a cell, or click a cell to pick.</span>
        </div>
        <button
          onClick={onAddProject}
          className="px-3 py-1.5 text-xs font-medium bg-brand hover:bg-brand-dark text-white rounded-md transition-colors"
        >
          + Add project
        </button>
      </div>

      <div className="grid text-xs text-zinc-500 px-4 py-2 border-b border-border-subtle gap-3 items-center" style={{ gridTemplateColumns: 'auto auto 1fr 140px 80px 100px 1fr 24px' }}>
        <span></span>
        <span className="uppercase tracking-wider text-[10px] font-semibold">Color</span>
        <span className="uppercase tracking-wider text-[10px] font-semibold">Name</span>
        <span className="uppercase tracking-wider text-[10px] font-semibold">DRI</span>
        <span className="uppercase tracking-wider text-[10px] font-semibold">Est. wk</span>
        <span className="uppercase tracking-wider text-[10px] font-semibold">Planned</span>
        <span className="uppercase tracking-wider text-[10px] font-semibold">URL</span>
        <span></span>
      </div>

      <div>
        {plan.projects.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            No projects yet. Click <span className="text-brand-light">+ Add project</span> to create one.
          </div>
        )}
        {plan.projects.map(p => {
          const planCount = planned[p.id] || 0
          const est = p.estWeeks
          const ratioClass = est == null
            ? 'text-zinc-500'
            : planCount === est
              ? 'text-emerald-400'
              : planCount > est
                ? 'text-amber-300'
                : planCount === 0
                  ? 'text-zinc-500'
                  : 'text-zinc-300'
          const isBeingDragged = draggedProjectId === p.id
          return (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => handleRowDragStart(e, p.id)}
              onDragOver={handleRowDragOver}
              onDrop={(e) => handleRowDrop(e, p.id)}
              onDragEnd={() => { setDragRowId(null); setDraggedProjectId(null) }}
              className={`grid items-center gap-3 px-4 py-2 border-b border-border-subtle hover:bg-white/[0.02] transition-colors group ${isBeingDragged ? 'opacity-50' : ''}`}
              style={{ gridTemplateColumns: 'auto auto 1fr 140px 80px 100px 1fr 24px' }}
            >
              <span className="text-zinc-600 cursor-grab active:cursor-grabbing" title="Drag to reorder">
                <GripVertical className="w-4 h-4" aria-hidden="true" />
              </span>

              <ColorSwatchPicker value={p.color} onChange={(c) => updateProject(p.id, { color: c })} />

              <DraggableNameCell
                project={p}
                onChangeName={(v) => updateProject(p.id, { name: v })}
                onChipDragStart={() => setDraggedProjectId(p.id)}
                onChipDragEnd={() => setDraggedProjectId(null)}
              />

              <select
                value={p.driPersonId || ''}
                onChange={(e) => updateProject(p.id, { driPersonId: e.target.value || undefined })}
                className="bg-zinc-900 border border-border rounded-md px-2 py-1 text-sm text-zinc-300 focus:outline-none focus:border-brand transition-colors"
              >
                <option value="">—</option>
                {plan.people.map(pp => (
                  <option key={pp.id} value={pp.id}>{pp.name}</option>
                ))}
              </select>

              <input
                type="number"
                min={0}
                step={0.5}
                value={p.estWeeks ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  updateProject(p.id, { estWeeks: v === '' ? null : Number(v) })
                }}
                className="bg-zinc-900 border border-border rounded-md px-2 py-1 text-sm text-zinc-300 w-full focus:outline-none focus:border-brand transition-colors"
                placeholder="—"
              />

              <span className={`text-sm tabular-nums ${ratioClass}`}>
                {est == null ? `${planCount} wk` : `${planCount} / ${est} wk`}
              </span>

              <UrlCell value={p.url || ''} onChange={(v) => updateProject(p.id, { url: v || undefined })} />

              <button
                onClick={() => removeProject(p.id)}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity"
                aria-label="Delete project"
                title="Delete project"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DraggableNameCell({ project, onChangeName, onChipDragStart, onChipDragEnd }: {
  project: PlanProject
  onChangeName: (v: string) => void
  onChipDragStart: () => void
  onChipDragEnd: () => void
}) {
  const theme = PLAN_COLOR_THEMES[project.color]
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.setData('application/x-plan-project', project.id)
          e.dataTransfer.effectAllowed = 'copy'
          onChipDragStart()
        }}
        onDragEnd={(e) => { e.stopPropagation(); onChipDragEnd() }}
        className={`shrink-0 w-5 h-5 rounded-full border ${theme.chip} cursor-grab active:cursor-grabbing flex items-center justify-center`}
        title="Drag onto a cell to assign"
      >
        <span className="text-[10px] opacity-60">⋮⋮</span>
      </span>
      <input
        type="text"
        value={project.name}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder="Project name"
        className="bg-transparent border-0 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-brand/40 rounded px-1.5 py-0.5 w-full min-w-0"
      />
    </div>
  )
}

function UrlCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://github.com/.../issues/123"
        className="bg-zinc-900 border border-border rounded-md px-2 py-1 text-xs text-zinc-300 w-full focus:outline-none focus:border-brand transition-colors min-w-0"
      />
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-zinc-500 hover:text-brand-light transition-colors"
          title="Open URL"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      )}
    </div>
  )
}
