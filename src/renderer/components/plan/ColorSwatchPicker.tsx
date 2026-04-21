import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { PLAN_COLOR_PALETTE, PLAN_COLOR_THEMES } from '../../utils/planColors'
import type { PlanColor } from '../../../shared/types'

interface Props {
  value: PlanColor
  onChange: (color: PlanColor) => void
}

export function ColorSwatchPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const theme = PLAN_COLOR_THEMES[value]

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-5 h-5 rounded-full ${theme.swatch} ring-1 ring-white/20 hover:ring-2 hover:ring-white/40 transition-all`}
        aria-label="Change color"
        title="Change color"
      />
      {open && (
        <div className="absolute z-30 top-7 left-0 p-2 rounded-lg bg-zinc-900 border border-white/10 shadow-xl shadow-black/50 grid grid-cols-6 gap-1.5 animate-fade-in">
          {PLAN_COLOR_PALETTE.map(c => {
            const t = PLAN_COLOR_THEMES[c]
            const isCurrent = c === value
            return (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false) }}
                className={`w-5 h-5 rounded-full ${t.swatch} flex items-center justify-center hover:scale-110 transition-transform ${isCurrent ? `ring-2 ${t.selectedRing} ring-offset-2 ring-offset-zinc-900` : 'ring-1 ring-white/10'}`}
                aria-label={c}
                title={c}
              >
                {isCurrent && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
