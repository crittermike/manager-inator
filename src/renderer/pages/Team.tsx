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

// ── SVG Chart with hover tooltips ──

function ActivityChart({ members, startDate, endDate }: {
  members: TeamMemberDashboard[]
  startDate: string
  endDate: string
}) {
  const { buckets, people } = useMemo(
    () => aggregateActivityByWeek(members, startDate, endDate),
    [members, startDate, endDate]
  )
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  if (people.length === 0) {
    return <div className="py-8 text-center text-sm text-zinc-500">No PR activity in this period</div>
  }

  const width = 700
  const height = 200
  const pL = 36, pR = 16, pT = 16, pB = 36
  const cW = width - pL - pR
  const cH = height - pT - pB
  const xStep = cW / Math.max(buckets.length - 1, 1)

  // Per-person line data (not stacked — individual lines are easier to read)
  const maxVal = Math.max(1, ...buckets.map(b =>
    Math.max(...people.map(p => {
      const d = b.byPerson[p]
      return d ? d.authored + d.reviewed : 0
    }))
  ))

  const yTicks: number[] = []
  const step = maxVal <= 5 ? 1 : maxVal <= 20 ? 5 : 10
  for (let v = 0; v <= maxVal; v += step) yTicks.push(v)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* Grid */}
        {yTicks.map(v => {
          const y = pT + cH - (v / maxVal) * cH
          return (
            <g key={v}>
              <line x1={pL} y1={y} x2={width - pR} y2={y} stroke="rgba(255,255,255,0.04)" />
              <text x={pL - 8} y={y + 3} textAnchor="end" className="fill-zinc-600" fontSize={9}>{v}</text>
            </g>
          )
        })}

        {/* X labels */}
        {buckets.map((b, i) => (
          <text key={b.weekStart} x={pL + i * xStep} y={height - 8} textAnchor="middle" className="fill-zinc-600" fontSize={9}>
            {b.label}
          </text>
        ))}

        {/* Lines per person */}
        {people.map((person, pi) => {
          const color = COLORS[pi % COLORS.length]
          const points = buckets.map((b, i) => {
            const d = b.byPerson[person]
            const val = d ? d.authored + d.reviewed : 0
            return { x: pL + i * xStep, y: pT + cH - (val / maxVal) * cH, val }
          })
          const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

          return (
            <g key={person}>
              <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeOpacity={0.8} />
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x} cy={p.y} r={p.val > 0 ? 3.5 : 0}
                  fill={color} fillOpacity={0.9}
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect()
                    if (!rect) return
                    const authored = buckets[i].byPerson[person]?.authored ?? 0
                    const reviewed = buckets[i].byPerson[person]?.reviewed ?? 0
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top - 40,
                      content: `${person.split(' ')[0]}: ${authored} authored, ${reviewed} reviewed (${buckets[i].label})`
                    })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 bg-zinc-800 border border-border rounded-lg text-xs text-zinc-200 shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}
        >
          {tooltip.content}
        </div>
      )}

      {/* Legend */}
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
    return <div className="py-8 text-center text-sm text-zinc-500">No feedback in this period</div>
  }

  const barHeight = 28
  const gap = 6
  const labelWidth = 80
  const chartWidth = 400
  const totalHeight = data.length * (barHeight + gap)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${labelWidth + chartWidth + 40} ${totalHeight}`} className="w-full">
        {data.map((d, i) => {
          const y = i * (barHeight + gap)
          const posW = (d.positive / maxTotal) * chartWidth
          const conW = (d.constructive / maxTotal) * chartWidth
          const othW = (d.other / maxTotal) * chartWidth

          return (
            <g key={d.name}>
              <text x={labelWidth - 8} y={y + barHeight / 2 + 4} textAnchor="end" className="fill-zinc-400" fontSize={11}>
                {d.name.split(' ')[0]}
              </text>
              {/* Positive */}
              <rect
                x={labelWidth} y={y + 2} width={Math.max(posW, 0)} height={barHeight - 4}
                rx={4} fill="#34d399" fillOpacity={0.7}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect()
                  if (!rect) return
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 40, content: `${d.name}: ${d.positive} positive` })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {/* Constructive */}
              <rect
                x={labelWidth + posW} y={y + 2} width={Math.max(conW, 0)} height={barHeight - 4}
                rx={conW > 0 && posW === 0 ? 4 : 0} fill="#f59e0b" fillOpacity={0.7}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect()
                  if (!rect) return
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 40, content: `${d.name}: ${d.constructive} constructive` })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {/* Other */}
              {othW > 0 && (
                <rect
                  x={labelWidth + posW + conW} y={y + 2} width={Math.max(othW, 0)} height={barHeight - 4}
                  rx={0} fill="#94a3b8" fillOpacity={0.5}
                />
              )}
              {/* Count */}
              <text x={labelWidth + posW + conW + othW + 6} y={y + barHeight / 2 + 4} className="fill-zinc-600" fontSize={10}>
                {d.total}
              </text>
            </g>
          )
        })}
      </svg>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 bg-zinc-800 border border-border rounded-lg text-xs text-zinc-200 shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}
        >
          {tooltip.content}
        </div>
      )}

      <div className="flex gap-4 mt-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] text-zinc-400">Positive</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-[11px] text-zinc-400">Constructive</span>
        </div>
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
          {/* PR Activity Chart */}
          <div className="bg-surface rounded-xl border border-border/60 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-brand-light" aria-hidden="true" />
              PR activity over time
            </h2>
            <ActivityChart members={members} startDate={startDate} endDate={endDate} />
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
