import { useMemo, useState } from 'react'
import { X, Plus } from 'lucide-react'
import { PLAN_COLOR_THEMES } from '../../utils/planColors'
import { AssignCellPopover } from './AssignCellPopover'
import type { Plan, PlanIteration, PlanPerson } from '../../../shared/types'

interface Props {
  plan: Plan
  onChange: (next: Plan) => void
  onAddPerson: () => void
  onAddIteration: () => void
  onAddProject: () => void
  /** Project being dragged from the projects table (for drop-on-cell) */
  draggedProjectId: string | null
  setDraggedProjectId: (id: string | null) => void
}

export function PlanGrid({
  plan,
  onChange,
  onAddPerson,
  onAddIteration,
  onAddProject,
  draggedProjectId,
  setDraggedProjectId,
}: Props) {
  const [activeCell, setActiveCell] = useState<{ personId: string; columnId: string; anchor: { x: number; y: number } } | null>(null)
  const [hoverCell, setHoverCell] = useState<string | null>(null) // `${personId}:${columnId}`

  const cellAssignments = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const a of plan.assignments) {
      const k = `${a.personId}:${a.columnId}`
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(a.projectId)
    }
    return map
  }, [plan.assignments])

  const projectById = useMemo(() => {
    const m = new Map<string, Plan['projects'][number]>()
    for (const p of plan.projects) m.set(p.id, p)
    return m
  }, [plan.projects])

  const removeIteration = (id: string) => {
    const removed = plan.iterations.find(i => i.id === id)
    if (!removed) return
    const colIds = new Set(removed.columns.map(c => c.id))
    onChange({
      ...plan,
      iterations: plan.iterations.filter(i => i.id !== id),
      assignments: plan.assignments.filter(a => !colIds.has(a.columnId)),
    })
  }

  const removePerson = (id: string) => {
    onChange({
      ...plan,
      people: plan.people.filter(p => p.id !== id),
      assignments: plan.assignments.filter(a => a.personId !== id),
      projects: plan.projects.map(p => p.driPersonId === id ? { ...p, driPersonId: undefined } : p),
    })
  }

  const updateColumnLabel = (columnId: string, label: string) => {
    onChange({
      ...plan,
      iterations: plan.iterations.map(it => ({
        ...it,
        columns: it.columns.map(c => c.id === columnId ? { ...c, label } : c),
      })),
    })
  }

  const updateIterationName = (iterationId: string, name: string) => {
    onChange({
      ...plan,
      iterations: plan.iterations.map(it => it.id === iterationId ? { ...it, name } : it),
    })
  }

  const updatePersonName = (personId: string, name: string) => {
    onChange({
      ...plan,
      people: plan.people.map(p => p.id === personId ? { ...p, name } : p),
    })
  }

  const assignProject = (personId: string, columnId: string, projectId: string) => {
    if (plan.assignments.some(a => a.personId === personId && a.columnId === columnId && a.projectId === projectId)) return
    onChange({
      ...plan,
      assignments: [...plan.assignments, { personId, columnId, projectId }],
    })
  }

  const unassignProject = (personId: string, columnId: string, projectId: string) => {
    onChange({
      ...plan,
      assignments: plan.assignments.filter(
        a => !(a.personId === personId && a.columnId === columnId && a.projectId === projectId)
      ),
    })
  }

  const flatColumns = plan.iterations.flatMap(it => it.columns)
  const totalCols = flatColumns.length

  // Grid template: first col = person name (180px), then equal columns for each week
  const gridTemplate = `180px repeat(${Math.max(totalCols, 1)}, minmax(110px, 1fr))`

  return (
    <div className="rounded-xl bg-surface border border-border overflow-hidden">
      {/* Header bar with add buttons */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-zinc-900/40">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Plan</div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddIteration}
            className="px-3 py-1.5 text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 rounded-md transition-colors border border-white/[0.06]"
          >
            + Iteration
          </button>
          <button
            onClick={onAddPerson}
            className="px-3 py-1.5 text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 rounded-md transition-colors border border-white/[0.06]"
          >
            + Person
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: `calc(180px + ${Math.max(totalCols, 1)} * 110px)` }}>
          {/* Iteration row */}
          <div className="grid border-b border-border-subtle bg-zinc-900/30" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-r border-border-subtle">
              Person
            </div>
            {plan.iterations.length === 0 ? (
              <div className="px-4 py-2 text-xs text-zinc-600 italic">No iterations yet — click + Iteration to add one.</div>
            ) : (
              plan.iterations.map(it => (
                <IterationHeader
                  key={it.id}
                  iteration={it}
                  span={it.columns.length}
                  onRename={(name) => updateIterationName(it.id, name)}
                  onRemove={() => removeIteration(it.id)}
                />
              ))
            )}
          </div>

          {/* Column-label row */}
          {plan.iterations.length > 0 && (
            <div className="grid border-b border-border bg-zinc-900/20" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="border-r border-border-subtle" />
              {flatColumns.map(c => (
                <input
                  key={c.id}
                  type="text"
                  value={c.label}
                  onChange={(e) => updateColumnLabel(c.id, e.target.value)}
                  className="px-2 py-1.5 text-xs text-center text-zinc-400 bg-transparent border-0 border-r border-border-subtle focus:outline-none focus:bg-white/[0.04] focus:text-zinc-200 transition-colors"
                />
              ))}
            </div>
          )}

          {/* Body: one row per person */}
          {plan.people.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              No people on this plan yet. Click <span className="text-brand-light">+ Person</span> above.
            </div>
          ) : (
            plan.people.map(person => (
              <PersonRow
                key={person.id}
                person={person}
                gridTemplate={gridTemplate}
                columns={flatColumns}
                cellAssignments={cellAssignments}
                projectById={projectById}
                hoverCell={hoverCell}
                setHoverCell={setHoverCell}
                draggedProjectId={draggedProjectId}
                setDraggedProjectId={setDraggedProjectId}
                onCellClick={(columnId, e) => setActiveCell({
                  personId: person.id,
                  columnId,
                  anchor: { x: e.clientX, y: e.clientY }
                })}
                onUnassign={(columnId, projectId) => unassignProject(person.id, columnId, projectId)}
                onDropProject={(columnId, projectId) => assignProject(person.id, columnId, projectId)}
                onRename={(name) => updatePersonName(person.id, name)}
                onRemove={() => removePerson(person.id)}
              />
            ))
          )}

          {/* Add-person footer row */}
          <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
            <button
              onClick={onAddPerson}
              className="text-left px-4 py-2.5 text-xs text-zinc-500 hover:text-brand-light hover:bg-white/[0.02] transition-colors border-r border-border-subtle"
            >
              + Add person
            </button>
            <div className="col-span-full" />
          </div>
        </div>
      </div>

      {activeCell && (
        <AssignCellPopover
          open={true}
          anchor={activeCell.anchor}
          plan={plan}
          selectedProjectIds={cellAssignments.get(`${activeCell.personId}:${activeCell.columnId}`) || []}
          onSelectProject={(pid) => assignProject(activeCell.personId, activeCell.columnId, pid)}
          onRemoveProject={(pid) => unassignProject(activeCell.personId, activeCell.columnId, pid)}
          onClose={() => setActiveCell(null)}
          onCreateProject={onAddProject}
        />
      )}
    </div>
  )
}

function IterationHeader({ iteration, span, onRename, onRemove }: {
  iteration: PlanIteration
  span: number
  onRename: (name: string) => void
  onRemove: () => void
}) {
  return (
    <div
      className="relative px-2 py-1.5 border-r border-border-subtle bg-purple-500/[0.08] group flex items-center justify-center"
      style={{ gridColumn: `span ${span} / span ${span}` }}
    >
      <input
        type="text"
        value={iteration.name || ''}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Iteration"
        className="bg-transparent border-0 text-xs text-purple-200 text-center focus:outline-none focus:bg-white/[0.04] rounded px-1 py-0.5 w-full"
      />
      <button
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-purple-300/60 hover:text-red-400 transition-all"
        aria-label="Remove iteration"
        title="Remove iteration"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function PersonRow({
  person,
  gridTemplate,
  columns,
  cellAssignments,
  projectById,
  hoverCell,
  setHoverCell,
  draggedProjectId,
  setDraggedProjectId,
  onCellClick,
  onUnassign,
  onDropProject,
  onRename,
  onRemove,
}: {
  person: PlanPerson
  gridTemplate: string
  columns: { id: string; label: string }[]
  cellAssignments: Map<string, string[]>
  projectById: Map<string, Plan['projects'][number]>
  hoverCell: string | null
  setHoverCell: (key: string | null) => void
  draggedProjectId: string | null
  setDraggedProjectId: (id: string | null) => void
  onCellClick: (columnId: string, e: React.MouseEvent) => void
  onUnassign: (columnId: string, projectId: string) => void
  onDropProject: (columnId: string, projectId: string) => void
  onRename: (name: string) => void
  onRemove: () => void
}) {
  return (
    <div className="grid border-b border-border-subtle group/row" style={{ gridTemplateColumns: gridTemplate }}>
      <div className="px-3 py-2 border-r border-border-subtle flex items-center gap-2 group/person">
        {person.github ? (
          <img src={`https://github.com/${person.github}.png?size=48`} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-[11px] font-semibold flex items-center justify-center shrink-0">
            {person.name.charAt(0).toUpperCase()}
          </div>
        )}
        <input
          type="text"
          value={person.name}
          onChange={(e) => onRename(e.target.value)}
          className="bg-transparent border-0 text-sm text-zinc-200 focus:outline-none focus:bg-white/[0.04] rounded px-1 py-0.5 w-full min-w-0"
        />
        <button
          onClick={onRemove}
          className="opacity-0 group-hover/person:opacity-100 text-zinc-500 hover:text-red-400 transition-all shrink-0"
          aria-label="Remove person"
          title="Remove person"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {columns.map(c => {
        const key = `${person.id}:${c.id}`
        const assigned = cellAssignments.get(key) || []
        const isHover = hoverCell === key
        const isDragTarget = isHover && draggedProjectId
        return (
          <div
            key={c.id}
            onClick={(e) => onCellClick(c.id, e)}
            onMouseEnter={() => setHoverCell(key)}
            onMouseLeave={() => setHoverCell(null)}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-plan-project')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDrop={(e) => {
              const pid = e.dataTransfer.getData('application/x-plan-project')
              if (!pid) return
              e.preventDefault()
              onDropProject(c.id, pid)
              setDraggedProjectId(null)
              setHoverCell(null)
            }}
            className={`min-h-[44px] px-1 py-1 border-r border-border-subtle flex flex-wrap content-start gap-1 cursor-pointer transition-colors ${
              isDragTarget
                ? 'bg-brand/15 ring-1 ring-inset ring-brand/40'
                : isHover ? 'bg-white/[0.025]' : ''
            }`}
          >
            {assigned.map(pid => {
              const project = projectById.get(pid)
              if (!project) return null
              const theme = PLAN_COLOR_THEMES[project.color]
              return (
                <span
                  key={pid}
                  onClick={(e) => { e.stopPropagation(); onUnassign(c.id, pid) }}
                  title={`${project.name} — click to remove`}
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border cursor-pointer max-w-full ${theme.chip}`}
                >
                  <span className="truncate">{project.name || 'Untitled'}</span>
                </span>
              )
            })}
            {assigned.length === 0 && isHover && !draggedProjectId && (
              <span className="text-zinc-700 text-[11px] flex items-center gap-1 px-1">
                <Plus className="w-3 h-3" aria-hidden="true" /> assign
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
