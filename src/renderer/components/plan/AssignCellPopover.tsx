import { useEffect, useRef } from 'react'
import { PLAN_COLOR_THEMES } from '../../utils/planColors'
import type { Plan, PlanProject } from '../../../shared/types'

interface Props {
  open: boolean
  anchor: { x: number; y: number } | null
  plan: Plan
  selectedProjectIds: string[]
  onSelectProject: (projectId: string) => void
  onRemoveProject: (projectId: string) => void
  onClose: () => void
  onCreateProject: () => void
}

export function AssignCellPopover({ open, anchor, plan, selectedProjectIds, onSelectProject, onRemoveProject, onClose, onCreateProject }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    // Defer so the opening click doesn't immediately dismiss
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
      clearTimeout(t)
    }
  }, [open, onClose])

  if (!open || !anchor) return null

  // Position popover near the anchor; clamp to viewport
  const top = Math.min(anchor.y + 4, window.innerHeight - 360)
  const left = Math.min(anchor.x, window.innerWidth - 280)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Assign project"
      className="fixed z-50 w-[260px] rounded-lg bg-zinc-900 border border-white/10 shadow-2xl shadow-black/50 p-2 animate-fade-in"
      style={{ top, left }}
    >
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2 pt-1 pb-1.5">
        Assign project
      </div>
      <div className="max-h-[280px] overflow-y-auto -mx-1 px-1">
        {plan.projects.length === 0 && (
          <div className="px-2 py-3 text-xs text-zinc-500 italic">
            No projects yet. Add one below.
          </div>
        )}
        {plan.projects.map(p => {
          const checked = selectedProjectIds.includes(p.id)
          return (
            <ProjectPickerRow
              key={p.id}
              project={p}
              checked={checked}
              onToggle={() => (checked ? onRemoveProject(p.id) : onSelectProject(p.id))}
            />
          )
        })}
      </div>
      <div className="border-t border-white/[0.06] mt-1 pt-1">
        <button
          onClick={() => { onCreateProject(); onClose() }}
          className="w-full text-left px-2 py-1.5 text-xs text-zinc-400 hover:text-brand-light hover:bg-white/[0.04] rounded transition-colors"
        >
          + New project…
        </button>
      </div>
    </div>
  )
}

function ProjectPickerRow({ project, checked, onToggle }: { project: PlanProject; checked: boolean; onToggle: () => void }) {
  const theme = PLAN_COLOR_THEMES[project.color]
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${checked ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
    >
      <span className={`w-3 h-3 rounded-full shrink-0 ${theme.swatch}`} />
      <span className="flex-1 text-sm text-zinc-200 truncate">{project.name || 'Untitled'}</span>
      {checked && <span className="text-xs text-brand-light shrink-0">✓</span>}
    </button>
  )
}
