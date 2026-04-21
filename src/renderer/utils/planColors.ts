import type { PlanColor } from '../../shared/types'

export const PLAN_COLOR_PALETTE: PlanColor[] = [
  'amber',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'orange',
  'red',
  'teal',
  'indigo',
  'gray',
]

interface ColorTheme {
  /** Solid swatch dot */
  swatch: string
  /** Chip background + text color (used in cells) */
  chip: string
  /** Picker tile bg when selected */
  selectedRing: string
}

export const PLAN_COLOR_THEMES: Record<PlanColor, ColorTheme> = {
  amber:   { swatch: 'bg-amber-400',   chip: 'bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/30',   selectedRing: 'ring-amber-400' },
  yellow:  { swatch: 'bg-yellow-300',  chip: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30 hover:bg-yellow-500/30', selectedRing: 'ring-yellow-300' },
  green:   { swatch: 'bg-green-400',   chip: 'bg-green-500/20 text-green-200 border-green-500/30 hover:bg-green-500/30',   selectedRing: 'ring-green-400' },
  blue:    { swatch: 'bg-sky-400',     chip: 'bg-sky-500/20 text-sky-200 border-sky-500/30 hover:bg-sky-500/30',           selectedRing: 'ring-sky-400' },
  purple:  { swatch: 'bg-purple-400',  chip: 'bg-purple-500/20 text-purple-200 border-purple-500/30 hover:bg-purple-500/30', selectedRing: 'ring-purple-400' },
  pink:    { swatch: 'bg-pink-400',    chip: 'bg-pink-500/20 text-pink-200 border-pink-500/30 hover:bg-pink-500/30',       selectedRing: 'ring-pink-400' },
  orange:  { swatch: 'bg-orange-400',  chip: 'bg-orange-500/20 text-orange-200 border-orange-500/30 hover:bg-orange-500/30', selectedRing: 'ring-orange-400' },
  red:     { swatch: 'bg-red-400',     chip: 'bg-red-500/20 text-red-200 border-red-500/30 hover:bg-red-500/30',           selectedRing: 'ring-red-400' },
  teal:    { swatch: 'bg-teal-400',    chip: 'bg-teal-500/20 text-teal-200 border-teal-500/30 hover:bg-teal-500/30',       selectedRing: 'ring-teal-400' },
  indigo:  { swatch: 'bg-indigo-400',  chip: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30 hover:bg-indigo-500/30', selectedRing: 'ring-indigo-400' },
  gray:    { swatch: 'bg-zinc-500',    chip: 'bg-zinc-500/20 text-zinc-200 border-zinc-500/30 hover:bg-zinc-500/30',       selectedRing: 'ring-zinc-400' },
}

/** Pick the next color from the palette that isn't already used by another project. */
export function nextUnusedColor(usedColors: PlanColor[]): PlanColor {
  for (const c of PLAN_COLOR_PALETTE) {
    if (!usedColors.includes(c)) return c
  }
  return PLAN_COLOR_PALETTE[usedColors.length % PLAN_COLOR_PALETTE.length]
}

/**
 * Generate two consecutive Mon-Fri week labels starting at the Monday on or after
 * the given anchor date. Used as default labels for new iterations (which have 2 cols).
 */
export function defaultIterationColumnLabels(anchor: Date = new Date(), count = 2): string[] {
  const labels: string[] = []
  // advance to next Monday on or after anchor
  const d = new Date(anchor)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sun, 1 = Mon
  const diff = (8 - day) % 7 // next Monday (or today if already Mon)
  d.setDate(d.getDate() + diff)

  for (let i = 0; i < count; i++) {
    const start = new Date(d)
    const end = new Date(d)
    end.setDate(end.getDate() + 4) // Mon-Fri
    labels.push(formatRange(start, end))
    d.setDate(d.getDate() + 7)
  }
  return labels
}

function formatRange(start: Date, end: Date): string {
  const sMonth = start.toLocaleString('en-US', { month: 'short' })
  const eMonth = end.toLocaleString('en-US', { month: 'short' })
  if (sMonth === eMonth) {
    return `${sMonth} ${start.getDate()}-${end.getDate()}`
  }
  return `${sMonth} ${start.getDate()}-${eMonth} ${end.getDate()}`
}

/** After the latest column in a plan, what should the next iteration's labels be? */
export function nextIterationLabels(allLabels: string[], count = 2): string[] {
  // Try to parse the last label and continue from it; otherwise default to "today".
  const last = allLabels[allLabels.length - 1]
  if (last) {
    const parsed = parseLabelEnd(last)
    if (parsed) {
      const anchor = new Date(parsed)
      anchor.setDate(anchor.getDate() + 3) // skip weekend → next Monday
      return defaultIterationColumnLabels(anchor, count)
    }
  }
  return defaultIterationColumnLabels(new Date(), count)
}

function parseLabelEnd(label: string): Date | null {
  // Match e.g. "Jan 5-9" → end "Jan 9"; "Jan 30-Feb 3" → end "Feb 3"
  const m = label.match(/([A-Za-z]+)\s+\d+\s*-\s*(?:([A-Za-z]+)\s+)?(\d+)/)
  if (!m) return null
  const startMonth = m[1]
  const endMonth = m[2] || startMonth
  const endDay = parseInt(m[3], 10)
  const monthIdx = MONTHS.indexOf(endMonth)
  if (monthIdx < 0 || isNaN(endDay)) return null
  const now = new Date()
  let year = now.getFullYear()
  // If the parsed month is much earlier than current, assume next year
  if (monthIdx < now.getMonth() - 6) year += 1
  return new Date(year, monthIdx, endDay)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
