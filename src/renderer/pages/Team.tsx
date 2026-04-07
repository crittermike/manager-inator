import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeamOverview } from '../hooks/useData'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useToast } from '../components/common/Toast'
import { format, subDays, subWeeks, startOfWeek, parseISO } from 'date-fns'
import {
  Users,
  Calendar,
  RefreshCw,
  Loader2,
  MapPin,
  Briefcase,
  MessageSquare,
  CheckSquare,
  GitPullRequest,
  AlertCircle
} from 'lucide-react'
import { GitHubMark } from '../components/common/GitHubMark'
import type { PersonActivityResult, FeedbackEntry, ReportStatus, Report } from '../../shared/types'

// ── Types ──

interface TeamMemberDashboard {
  report: ReportStatus
  activity: PersonActivityResult | null
  feedback: FeedbackEntry[]
}

type DatePreset = '1w' | '2w' | '1m' | '3m' | 'custom'

// ── Chart color palette ──
const COLORS = [
  '#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa',
  '#fb923c', '#2dd4bf', '#e879f9', '#94a3b8', '#f87171',
]

// ── Helpers ──

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

interface WeekBucket {
  weekStart: string
  label: string
  byPerson: Record<string, { authored: number; reviewed: number }>
}

function aggregateActivityByWeek(
  members: TeamMemberDashboard[],
  startDate: string,
  endDate: string
): { buckets: WeekBucket[]; people: string[] } {
  const start = getWeekStart(new Date(startDate))
  const end = new Date(endDate)

  const buckets: WeekBucket[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    buckets.push({
      weekStart: cursor.toISOString().split('T')[0],
      label: format(cursor, 'MMM d'),
      byPerson: {}
    })
    cursor.setDate(cursor.getDate() + 7)
  }

  const people = new Set<string>()

  for (const member of members) {
    if (!member.activity?.items.length) continue
    const name = member.report.displayName
    const hasPRs = member.activity.items.some(i => i.type === 'pr')
    if (hasPRs) people.add(name)

    for (const item of member.activity.items) {
      if (item.type !== 'pr') continue
      const itemWeekStart = getWeekStart(new Date(item.createdAt))
      const itemWeekStr = itemWeekStart.toISOString().split('T')[0]
      const bucket = buckets.find(b => b.weekStart === itemWeekStr)
      if (!bucket) continue
      if (!bucket.byPerson[name]) bucket.byPerson[name] = { authored: 0, reviewed: 0 }
      if (item.role === 'author') bucket.byPerson[name].authored++
      else bucket.byPerson[name].reviewed++
    }
  }

  return { buckets, people: Array.from(people).sort() }
}

// ── SVG Line Chart (reusable for authored OR reviewed) ──

function LineChart({ members, startDate, endDate, mode }: {
  members: TeamMemberDashboard[]
  startDate: string
  endDate: string
  mode: 'authored' | 'reviewed'
}) {
  const { buckets, people } = useMemo(
    () => aggregateActivityByWeek(members, startDate, endDate),
    [members, startDate, endDate]
  )
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  if (people.length === 0) {
    return <div className="py-6 text-center text-sm text-zinc-500">No PR activity in this period</div>
  }

  const width = 700, height = 180
  const pL = 36, pR = 16, pT = 16, pB = 32
  const cW = width - pL - pR, cH = height - pT - pB
  const xStep = cW / Math.max(buckets.length - 1, 1)

  const maxVal = Math.max(1, ...buckets.map(b =>
    Math.max(...people.map(p => {
      const d = b.byPerson[p]
      return d ? d[mode] : 0
    }))
  ))

  const yTicks: number[] = []
  const step = maxVal <= 5 ? 1 : maxVal <= 20 ? 5 : 10
  for (let v = 0; v <= maxVal; v += step) yTicks.push(v)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {yTicks.map(v => {
          const y = pT + cH - (v / maxVal) * cH
          return (
            <g key={v}>
              <line x1={pL} y1={y} x2={width - pR} y2={y} stroke="rgba(255,255,255,0.04)" />
              <text x={pL - 8} y={y + 3} textAnchor="end" className="fill-zinc-600" fontSize={9}>{v}</text>
            </g>
          )
        })}
        {buckets.map((b, i) => (
          <text key={b.weekStart} x={pL + i * xStep} y={height - 6} textAnchor="middle" className="fill-zinc-600" fontSize={9}>{b.label}</text>
        ))}
        {people.map((person, pi) => {
          const color = COLORS[pi % COLORS.length]
          const points = buckets.map((b, i) => {
            const d = b.byPerson[person]
            const val = d ? d[mode] : 0
            return { x: pL + i * xStep, y: pT + cH - (val / maxVal) * cH, val }
          })
          const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
          return (
            <g key={person}>
              <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeOpacity={0.8} />
              {points.map((p, i) => p.val > 0 ? (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={color} fillOpacity={0.9}
                  onMouseEnter={(e) => {
                    const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect()
                    if (!rect) return
                    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 40, content: `${person.split(' ')[0]}: ${p.val} ${mode} (${buckets[i].label})` })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ) : null)}
            </g>
          )
        })}
      </svg>
      {tooltip && (
        <div className="absolute pointer-events-none z-10 px-2.5 py-1.5 bg-zinc-800 border border-border rounded-lg text-xs text-zinc-200 shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}>{tooltip.content}</div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
        {people.map((person, pi) => (
          <div key={person} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[pi % COLORS.length] }} />
            <span className="text-[11px] text-zinc-400">{person.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Pie Chart (reusable for authored OR reviewed totals) ──

function PieChart({ members, mode }: {
  members: TeamMemberDashboard[]
  mode: 'authored' | 'reviewed'
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  const data = useMemo(() => {
    return members
      .map(m => {
        const items = m.activity?.items ?? []
        const count = items.filter(i => i.type === 'pr' && (mode === 'authored' ? i.role === 'author' : i.role !== 'author')).length
        return { name: m.report.displayName, count }
      })
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [members, mode])

  const total = data.reduce((s, d) => s + d.count, 0)

  if (total === 0) {
    return <div className="py-6 text-center text-sm text-zinc-500">No data</div>
  }

  const size = 160
  const cx = size / 2, cy = size / 2, r = 60

  let cumAngle = -Math.PI / 2
  const slices = data.map((d, i) => {
    const angle = (d.count / total) * Math.PI * 2
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const path = data.length === 1
      ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
    return { ...d, path, color: COLORS[i % COLORS.length], pct: Math.round((d.count / total) * 100) }
  })

  return (
    <div className="relative flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} fillOpacity={0.75} stroke="#111113" strokeWidth={1.5}
            onMouseEnter={(e) => {
              const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect()
              if (!rect) return
              setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 40, content: `${s.name}: ${s.count} (${s.pct}%)` })
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-zinc-200" fontSize={18} fontWeight={600}>{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-zinc-500" fontSize={9}>{mode}</text>
      </svg>
      {tooltip && (
        <div className="absolute pointer-events-none z-10 px-2.5 py-1.5 bg-zinc-800 border border-border rounded-lg text-xs text-zinc-200 shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}>{tooltip.content}</div>
      )}
      <div className="flex flex-col gap-1">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-zinc-400">{s.name.split(' ')[0]}</span>
            <span className="text-[10px] text-zinc-600">{s.count} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Feedback balance chart ──

function FeedbackChart({ members }: { members: TeamMemberDashboard[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  const data = useMemo(() => {
    return members
      .map(m => {
        const positive = m.feedback.filter(f => f.type === 'positive').length
        const constructive = m.feedback.filter(f => f.type === 'constructive').length
        const other = m.feedback.filter(f => f.type !== 'positive' && f.type !== 'constructive').length
        return { name: m.report.displayName, positive, constructive, other, total: positive + constructive + other }
      })
      .sort((a, b) => b.total - a.total)
  }, [members])

  const maxTotal = Math.max(1, ...data.map(d => d.total))

  if (data.every(d => d.total === 0)) {
    return <div className="py-6 text-center text-sm text-zinc-500">No feedback in this period</div>
  }

  const barH = 20, gap = 8, labelW = 70, chartW = 350
  const totalH = data.length * (barH + gap)

  function handleHover(e: React.MouseEvent<SVGRectElement>, text: string) {
    const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect()
    if (!rect) return
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 36, content: text })
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${labelW + chartW + 40} ${totalH}`} className="w-full" style={{ maxHeight: Math.max(totalH * 1.5, 120) }}>
        {data.map((d, i) => {
          const y = i * (barH + gap)
          const posW = (d.positive / maxTotal) * chartW
          const conW = (d.constructive / maxTotal) * chartW
          const othW = (d.other / maxTotal) * chartW
          const totalW = posW + conW + othW

          return (
            <g key={d.name}>
              <text x={labelW - 6} y={y + barH / 2 + 4} textAnchor="end" className="fill-zinc-500" fontSize={10}>
                {d.name.split(' ')[0]}
              </text>
              {/* Background track */}
              <rect x={labelW} y={y + 1} width={chartW} height={barH - 2} rx={3} fill="rgba(255,255,255,0.02)" />
              {/* Clip path for rounded ends */}
              <clipPath id={`bar-clip-${i}`}>
                <rect x={labelW} y={y + 1} width={Math.max(totalW, 1)} height={barH - 2} rx={3} />
              </clipPath>
              <g clipPath={`url(#bar-clip-${i})`}>
                {posW > 0 && (
                  <rect x={labelW} y={y + 1} width={posW} height={barH - 2} fill="#34d399" fillOpacity={0.7}
                    onMouseEnter={(e) => handleHover(e, `${d.name}: ${d.positive} positive`)}
                    onMouseLeave={() => setTooltip(null)} />
                )}
                {conW > 0 && (
                  <rect x={labelW + posW} y={y + 1} width={conW} height={barH - 2} fill="#f59e0b" fillOpacity={0.7}
                    onMouseEnter={(e) => handleHover(e, `${d.name}: ${d.constructive} constructive`)}
                    onMouseLeave={() => setTooltip(null)} />
                )}
                {othW > 0 && (
                  <rect x={labelW + posW + conW} y={y + 1} width={othW} height={barH - 2} fill="#94a3b8" fillOpacity={0.5}
                    onMouseEnter={(e) => handleHover(e, `${d.name}: ${d.other} other`)}
                    onMouseLeave={() => setTooltip(null)} />
                )}
              </g>
              <text x={labelW + totalW + 6} y={y + barH / 2 + 4} className="fill-zinc-600" fontSize={9}>{d.total}</text>
            </g>
          )
        })}
      </svg>
      {tooltip && (
        <div className="absolute pointer-events-none z-10 px-2.5 py-1.5 bg-zinc-800 border border-border rounded-lg text-xs text-zinc-200 shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}>{tooltip.content}</div>
      )}
      <div className="flex gap-4 mt-2 px-1">
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[11px] text-zinc-400">Positive</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-[11px] text-zinc-400">Constructive</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-400" /><span className="text-[11px] text-zinc-400">Other</span></div>
      </div>
    </div>
  )
}

// ── Team Roster Grid ──

function RosterCard({ report, activity, feedback, navigate }: {
  report: ReportStatus
  activity: PersonActivityResult | null
  feedback: FeedbackEntry[]
  navigate: (path: string) => void
}) {
  const statusColor = report.status === 'at-risk' ? 'border-rose-500/30' : report.status === 'needs-attention' ? 'border-amber-500/30' : 'border-border/60'
  const dotColor = report.status === 'at-risk' ? 'bg-rose-400' : report.status === 'needs-attention' ? 'bg-amber-400' : 'bg-emerald-400'
  const prAuthored = activity?.items.filter(i => i.type === 'pr' && i.role === 'author').length ?? 0
  const prReviewed = activity?.items.filter(i => i.type === 'pr' && i.role !== 'author').length ?? 0

  return (
    <button
      onClick={() => navigate(`/report/${report.name}`)}
      className={`flex flex-col p-4 bg-surface rounded-xl border ${statusColor} hover:bg-surface-raised/50 transition-all text-left group`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="relative shrink-0">
          {report.github ? (
            <img src={`https://github.com/${report.github}.png?size=48`} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-semibold text-zinc-500">
              {report.displayName.charAt(0)}
            </div>
          )}
          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-surface`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{report.displayName}</p>
          {report.github && (
            <p className="text-[11px] text-zinc-500 truncate">@{report.github}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center gap-1 text-zinc-500">
          <Calendar className="w-3 h-3" aria-hidden="true" />
          {report.lastOneOnOne ? `${report.daysGap}d ago` : 'No 1:1s'}
        </div>
        <div className="flex items-center gap-1 text-zinc-500">
          <CheckSquare className="w-3 h-3" aria-hidden="true" />
          {report.openActionItems} actions
        </div>
        <div className="flex items-center gap-1 text-zinc-500">
          <GitPullRequest className="w-3 h-3" aria-hidden="true" />
          {prAuthored}a / {prReviewed}r
        </div>
        <div className="flex items-center gap-1 text-zinc-500">
          <MessageSquare className="w-3 h-3" aria-hidden="true" />
          {feedback.length} feedback
        </div>
      </div>
    </button>
  )
}

// ── Main Team Page ──

export function Team() {
  useDocumentTitle('Team')
  const { overview, loading: overviewLoading } = useTeamOverview()
  const navigate = useNavigate()
  const toast = useToast()

  const [preset, setPreset] = useState<DatePreset>('1m')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [members, setMembers] = useState<TeamMemberDashboard[]>([])
  const [loadingData, setLoadingData] = useState(false)

  const reports = overview?.reports ?? []

  const { startDate, endDate } = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd }
    }
    const now = new Date()
    const end = format(now, 'yyyy-MM-dd')
    const daysMap: Record<string, number> = { '1w': 7, '2w': 14, '1m': 30, '3m': 90 }
    const days = daysMap[preset] ?? 30
    const start = format(subDays(now, days), 'yyyy-MM-dd')
    return { startDate: start, endDate: end }
  }, [preset, customStart, customEnd])

  const fetchDashboardData = useCallback(async () => {
    if (!reports.length) return
    setLoadingData(true)

    try {
      const results = await Promise.all(
        reports.map(async (report): Promise<TeamMemberDashboard> => {
          const [activity, reportData] = await Promise.all([
            window.api.fetchActivityForPerson(report.name, startDate, endDate).catch(() => null),
            window.api.getReportData(report.name).catch(() => null)
          ])

          // Filter feedback to date range
          const allFeedback = reportData?.feedback ?? []
          const filtered = allFeedback.filter(f => {
            if (!f.date) return false
            return f.date >= startDate && f.date <= endDate
          })

          return { report, activity, feedback: filtered }
        })
      )
      setMembers(results)
    } catch (e) {
      console.error('Failed to fetch team dashboard data:', e)
      toast.error('Failed to load team data')
    } finally {
      setLoadingData(false)
    }
  }, [reports.length, startDate, endDate, toast])

  useEffect(() => {
    if (reports.length > 0) fetchDashboardData()
  }, [reports.length, startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Summary stats ──
  const stats = useMemo(() => {
    let totalPRs = 0, totalReviews = 0, totalFeedback = 0, totalActions = 0
    for (const m of members) {
      const items = m.activity?.items ?? []
      totalPRs += items.filter(i => i.type === 'pr' && i.role === 'author').length
      totalReviews += items.filter(i => i.type === 'pr' && i.role !== 'author').length
      totalFeedback += m.feedback.length
      totalActions += m.report.openActionItems
    }
    return { totalPRs, totalReviews, totalFeedback, totalActions }
  }, [members])

  if (overviewLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-40 rounded" />
        <div className="skeleton h-4 w-64 rounded" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-light" aria-hidden="true" />
            Team
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {reports.length} report{reports.length !== 1 ? 's' : ''} · {format(parseISO(startDate), 'MMM d')} to {format(parseISO(endDate), 'MMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loadingData}
          className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] rounded-lg transition-colors disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {/* Date range picker */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: '1w', label: '1 week' },
          { id: '2w', label: '2 weeks' },
          { id: '1m', label: '1 month' },
          { id: '3m', label: '3 months' },
          { id: 'custom', label: 'Custom' },
        ] as { id: DatePreset; label: string }[]).map(p => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
              preset === p.id
                ? 'bg-brand/10 border-brand/30 text-brand-light font-medium'
                : 'border-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-surface-raised border border-border rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-brand/40"
            />
            <span className="text-xs text-zinc-600">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-surface-raised border border-border rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-brand/40"
            />
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-surface rounded-xl border border-border/60 px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-500 mb-1">
            <GitPullRequest className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-xs">PRs authored</span>
          </div>
          <p className="text-xl font-semibold text-zinc-100">{loadingData ? '...' : stats.totalPRs}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border/60 px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-500 mb-1">
            <GitPullRequest className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-xs">PRs reviewed</span>
          </div>
          <p className="text-xl font-semibold text-zinc-100">{loadingData ? '...' : stats.totalReviews}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border/60 px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-500 mb-1">
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-xs">Feedback given</span>
          </div>
          <p className="text-xl font-semibold text-zinc-100">{loadingData ? '...' : stats.totalFeedback}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border/60 px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-500 mb-1">
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="text-xs">Open actions</span>
          </div>
          <p className="text-xl font-semibold text-zinc-100">{loadingData ? '...' : stats.totalActions}</p>
        </div>
      </div>

      {loadingData && members.length === 0 && (
        <div className="flex items-center justify-center py-12 gap-2 text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading team data...</span>
        </div>
      )}

      {members.length > 0 && (
        <>
          {/* PR Pie Charts — side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl border border-border/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                <GitPullRequest className="w-4 h-4 text-brand-light" aria-hidden="true" />
                PRs authored
              </h2>
              <PieChart members={members} mode="authored" />
            </div>
            <div className="bg-surface rounded-xl border border-border/60 p-5">
              <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                <GitPullRequest className="w-4 h-4 text-brand-light" aria-hidden="true" />
                PRs reviewed
              </h2>
              <PieChart members={members} mode="reviewed" />
            </div>
          </div>

          {/* PR Activity Line Charts — separate authored and reviewed */}
          <div className="bg-surface rounded-xl border border-border/60 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-brand-light" aria-hidden="true" />
              PRs authored over time
            </h2>
            <LineChart members={members} startDate={startDate} endDate={endDate} mode="authored" />
          </div>

          <div className="bg-surface rounded-xl border border-border/60 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-brand-light" aria-hidden="true" />
              PRs reviewed over time
            </h2>
            <LineChart members={members} startDate={startDate} endDate={endDate} mode="reviewed" />
          </div>

          {/* Feedback Balance Chart */}
          <div className="bg-surface rounded-xl border border-border/60 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-brand-light" aria-hidden="true" />
              Feedback balance
            </h2>
            <FeedbackChart members={members} />
          </div>

          {/* Team Roster */}
          <div>
            <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-light" aria-hidden="true" />
              Team roster
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map(m => (
                <RosterCard
                  key={m.report.name}
                  report={m.report}
                  activity={m.activity}
                  feedback={m.feedback}
                  navigate={navigate}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
