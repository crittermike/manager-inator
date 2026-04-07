import { useMemo } from 'react'
import type { TeamMemberActivity } from '../../../shared/types'

interface TeamActivityChartProps {
  teamActivity: TeamMemberActivity[]
  weeks?: number
}

// Consistent colors per person index
const PERSON_COLORS = [
  '#60a5fa', // blue
  '#f472b6', // pink
  '#34d399', // emerald
  '#fbbf24', // amber
  '#a78bfa', // violet
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
  '#94a3b8', // slate
  '#f87171', // red
]

interface WeekBucket {
  weekStart: string // YYYY-MM-DD
  label: string     // "Mar 10"
  byPerson: Record<string, { authored: number; reviewed: number }>
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function aggregateWeeklyActivity(
  teamActivity: TeamMemberActivity[],
  numWeeks: number
): { buckets: WeekBucket[]; people: string[] } {
  const now = new Date()
  const currentWeekStart = getWeekStart(now)

  // Build week buckets going back numWeeks
  const buckets: WeekBucket[] = []
  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart)
    weekStart.setDate(weekStart.getDate() - i * 7)
    buckets.push({
      weekStart: weekStart.toISOString().split('T')[0],
      label: formatWeekLabel(weekStart),
      byPerson: {}
    })
  }

  const people = new Set<string>()

  for (const member of teamActivity) {
    if (!member.items.length) continue
    const personKey = member.displayName
    const hasPRs = member.items.some(item => item.type === 'pr')
    if (hasPRs) people.add(personKey)

    for (const item of member.items) {
      if (item.type !== 'pr') continue

      const itemDate = new Date(item.createdAt)
      const itemWeekStart = getWeekStart(itemDate)
      const itemWeekStr = itemWeekStart.toISOString().split('T')[0]

      const bucket = buckets.find(b => b.weekStart === itemWeekStr)
      if (!bucket) continue

      if (!bucket.byPerson[personKey]) {
        bucket.byPerson[personKey] = { authored: 0, reviewed: 0 }
      }

      if (item.role === 'author') {
        bucket.byPerson[personKey].authored++
      } else {
        bucket.byPerson[personKey].reviewed++
      }
    }
  }

  return { buckets, people: Array.from(people).sort() }
}

export function TeamActivityChart({ teamActivity, weeks = 8 }: TeamActivityChartProps) {
  const { buckets, people } = useMemo(
    () => aggregateWeeklyActivity(teamActivity, weeks),
    [teamActivity, weeks]
  )

  // Find max value for Y-axis scaling
  const maxPerWeek = useMemo(() => {
    let max = 0
    for (const bucket of buckets) {
      let weekTotal = 0
      for (const person of people) {
        const data = bucket.byPerson[person]
        if (data) weekTotal += data.authored + data.reviewed
      }
      max = Math.max(max, weekTotal)
    }
    return Math.max(max, 1) // avoid division by zero
  }, [buckets, people])

  if (people.length === 0) return null

  const width = 600
  const height = 160
  const paddingLeft = 28
  const paddingRight = 12
  const paddingTop = 12
  const paddingBottom = 32
  const chartWidth = width - paddingLeft - paddingRight
  const chartHeight = height - paddingTop - paddingBottom

  // Build stacked area paths
  const xStep = chartWidth / Math.max(buckets.length - 1, 1)

  // For each person, compute their stacked Y values at each week
  const stackedData: { person: string; points: { x: number; y0: number; y1: number }[] }[] = []

  for (let pi = 0; pi < people.length; pi++) {
    const person = people[pi]
    const points: { x: number; y0: number; y1: number }[] = []

    for (let wi = 0; wi < buckets.length; wi++) {
      const x = paddingLeft + wi * xStep
      const data = buckets[wi].byPerson[person]
      const value = data ? data.authored + data.reviewed : 0

      // Stack on top of previous person
      const prevY1 = pi > 0 && stackedData[pi - 1]
        ? stackedData[pi - 1].points[wi].y1
        : 0

      const scaledValue = (value / maxPerWeek) * chartHeight
      points.push({
        x,
        y0: prevY1,
        y1: prevY1 + scaledValue
      })
    }

    stackedData.push({ person, points })
  }

  // Y-axis ticks
  const yTicks: number[] = []
  const tickStep = maxPerWeek <= 5 ? 1 : maxPerWeek <= 15 ? 5 : 10
  for (let v = 0; v <= maxPerWeek; v += tickStep) {
    yTicks.push(v)
  }

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        aria-label="Team PR activity over time"
      >
        {/* Y-axis grid lines */}
        {yTicks.map(v => {
          const y = paddingTop + chartHeight - (v / maxPerWeek) * chartHeight
          return (
            <g key={v}>
              <line
                x1={paddingLeft} y1={y}
                x2={width - paddingRight} y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={1}
              />
              <text
                x={paddingLeft - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-zinc-600"
                fontSize={9}
              >
                {v}
              </text>
            </g>
          )
        })}

        {/* Stacked areas (render bottom to top) */}
        {stackedData.map((layer, pi) => {
          const color = PERSON_COLORS[pi % PERSON_COLORS.length]

          // Build area path: forward along top, backward along bottom
          const topLine = layer.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${paddingTop + chartHeight - p.y1}`)
            .join(' ')
          const bottomLine = [...layer.points]
            .reverse()
            .map((p, i) => `${i === 0 ? 'L' : 'L'} ${p.x} ${paddingTop + chartHeight - p.y0}`)
            .join(' ')

          return (
            <path
              key={layer.person}
              d={`${topLine} ${bottomLine} Z`}
              fill={color}
              fillOpacity={0.15}
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={0.6}
              strokeLinejoin="round"
            />
          )
        })}

        {/* Data points */}
        {stackedData.map((layer, pi) => {
          const color = PERSON_COLORS[pi % PERSON_COLORS.length]
          return layer.points.map((p, wi) => {
            const value = (buckets[wi].byPerson[layer.person]?.authored ?? 0) +
                          (buckets[wi].byPerson[layer.person]?.reviewed ?? 0)
            if (value === 0) return null
            return (
              <circle
                key={`${layer.person}-${wi}`}
                cx={p.x}
                cy={paddingTop + chartHeight - p.y1}
                r={2.5}
                fill={color}
                fillOpacity={0.8}
              />
            )
          })
        })}

        {/* X-axis labels */}
        {buckets.map((bucket, i) => (
          <text
            key={bucket.weekStart}
            x={paddingLeft + i * xStep}
            y={height - 6}
            textAnchor="middle"
            className="fill-zinc-600"
            fontSize={9}
          >
            {bucket.label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
        {people.map((person, pi) => {
          const color = PERSON_COLORS[pi % PERSON_COLORS.length]
          // Sum total for this person
          const total = buckets.reduce((sum, b) => {
            const d = b.byPerson[person]
            return sum + (d ? d.authored + d.reviewed : 0)
          }, 0)
          const authored = buckets.reduce((sum, b) => sum + (b.byPerson[person]?.authored ?? 0), 0)
          const reviewed = total - authored

          return (
            <div key={person} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[11px] text-zinc-400">
                {person.split(' ')[0]}
              </span>
              <span className="text-[10px] text-zinc-600">
                {authored}a {reviewed}r
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
