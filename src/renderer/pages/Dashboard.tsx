import { useState, useMemo, useEffect } from 'react'
import { useTeamOverview } from '../hooks/useData'
import { useNavigate } from 'react-router-dom'
import { getDay, format, getMonth, getDate } from 'date-fns'
import type { ReportStatus, WorkflowItem, WorkflowCategory, CadenceSettings } from '../../shared/types'
import {
  Users,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileText,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  Clock,
  ClipboardList,
  ListChecks,
  BarChart3,
  CheckSquare,
  Square,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Target,
  TrendingUp,
  Eye,
  Info
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// ── Workflow computation engine ──

function computeWorkflowItems(
  reports: ReportStatus[],
  now: Date,
  cadence: CadenceSettings
): WorkflowItem[] {
  const items: WorkflowItem[] = []
  const dayIndex = getDay(now)
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const todayName = dayNames[dayIndex]
  const currentMonth = format(now, 'yyyy-MM')
  const dayOfMonth = getDate(now)
  const month = getMonth(now)
  const isFirstWeek = dayOfMonth <= 7
  const isLastWeek = dayOfMonth >= 24
  const isQuarterEnd = [2, 5, 8, 11].includes(month) && isLastWeek
  const isQuarterStart = [0, 3, 6, 9].includes(month) && isFirstWeek

  const isCheckInWeek = isFirstWeek && (
    cadence.checkInFrequency === 'monthly' ||
    (cadence.checkInFrequency === 'bimonthly' && month % 2 === 0) ||
    (cadence.checkInFrequency === 'quarterly' && [0, 3, 6, 9].includes(month))
  )

  // ── Daily items (every workday) ──
  const isWeekend = dayIndex === 0 || dayIndex === 6
  if (!isWeekend) {
    const atRisk = reports.filter(r => r.status === 'at-risk')
    const needsAttention = reports.filter(r => r.status === 'needs-attention')

    if (atRisk.length > 0) {
      items.push({
        id: 'daily-atrisk',
        label: `Review at-risk reports: ${atRisk.map(r => r.displayName).join(', ')}`,
        description: 'Check on team members who are overdue for a 1:1 or have too many open items',
        category: 'daily',
        priority: 'high',
        route: atRisk.length === 1 ? `/report/${atRisk[0].name}` : undefined,
        reportName: atRisk.length === 1 ? atRisk[0].name : undefined
      })
    }

    if (needsAttention.length > 0) {
      items.push({
        id: 'daily-attention',
        label: `Check in on: ${needsAttention.map(r => r.displayName).join(', ')}`,
        description: 'These team members may need a quick touchpoint',
        category: 'daily',
        priority: 'medium',
        route: needsAttention.length === 1 ? `/report/${needsAttention[0].name}` : undefined,
        reportName: needsAttention.length === 1 ? needsAttention[0].name : undefined
      })
    }

    const todayMeetings = reports.filter(r =>
      r.meetingDay && r.meetingDay.toLowerCase() === todayName
    )
    for (const r of todayMeetings) {
      items.push({
        id: `daily-prep-${r.name}`,
        label: `Prep for 1:1 with ${r.displayName}`,
        description: `Your ${todayName} 1:1 — review action items and generate prep notes`,
        category: 'daily',
        priority: 'high',
        route: `/report/${r.name}?tab=prep`,
        reportName: r.name
      })
    }

    const tomorrowIndex = (dayIndex + 1) % 7
    const tomorrowName = dayNames[tomorrowIndex]
    if (tomorrowIndex >= 1 && tomorrowIndex <= 5) {
      const tomorrowMeetings = reports.filter(r =>
        r.meetingDay && r.meetingDay.toLowerCase() === tomorrowName
      )
      for (const r of tomorrowMeetings) {
        items.push({
          id: `daily-prep-tomorrow-${r.name}`,
          label: `Pre-prep tomorrow's 1:1 with ${r.displayName}`,
          description: `Glance at open items so you're not scrambling in the morning`,
          category: 'daily',
          priority: 'low',
          route: `/report/${r.name}?tab=actions`,
          reportName: r.name
        })
      }
    }

    const totalOpenItems = reports.reduce((sum, r) => sum + r.openActionItems, 0)
    if (totalOpenItems > 0) {
      items.push({
        id: 'daily-actions',
        label: `Review open action items (${totalOpenItems} total)`,
        description: 'Scan for anything blocked or overdue across your team',
        category: 'daily',
        priority: 'medium'
      })
    }
  }

  // ── Weekend preview (Saturday/Sunday) ──
  if (isWeekend) {
    const atRisk = reports.filter(r => r.status === 'at-risk')
    const needsAttention = reports.filter(r => r.status === 'needs-attention')

    if (atRisk.length > 0) {
      items.push({
        id: 'preview-atrisk',
        label: `Monday: review at-risk reports — ${atRisk.map(r => r.displayName).join(', ')}`,
        description: 'These team members are overdue for a 1:1 or have too many open items',
        category: 'weekend-preview',
        priority: 'high',
        route: atRisk.length === 1 ? `/report/${atRisk[0].name}` : undefined,
        reportName: atRisk.length === 1 ? atRisk[0].name : undefined
      })
    }

    if (needsAttention.length > 0) {
      items.push({
        id: 'preview-attention',
        label: `Monday: check in on ${needsAttention.map(r => r.displayName).join(', ')}`,
        description: 'These team members may need a quick touchpoint',
        category: 'weekend-preview',
        priority: 'medium',
        route: needsAttention.length === 1 ? `/report/${needsAttention[0].name}` : undefined,
        reportName: needsAttention.length === 1 ? needsAttention[0].name : undefined
      })
    }

    // Monday 1:1 prep
    const mondayMeetings = reports.filter(r =>
      r.meetingDay && r.meetingDay.toLowerCase() === 'monday'
    )
    for (const r of mondayMeetings) {
      items.push({
        id: `preview-prep-${r.name}`,
        label: `Monday: prep 1:1 with ${r.displayName}`,
        description: 'Get a head start on prep notes so Monday morning is smooth',
        category: 'weekend-preview',
        priority: 'medium',
        route: `/report/${r.name}?tab=prep`,
        reportName: r.name
      })
    }

    items.push({
      id: 'preview-priorities',
      label: 'Monday: set the week — review team priorities',
      description: 'Start the week by clarifying what matters most for each person',
      category: 'weekend-preview',
      priority: 'medium'
    })

    const totalOpenItems = reports.reduce((sum, r) => sum + r.openActionItems, 0)
    if (totalOpenItems > 0) {
      items.push({
        id: 'preview-actions',
        label: `Monday: review open action items (${totalOpenItems} total)`,
        description: 'Scan for anything blocked or overdue across your team',
        category: 'weekend-preview',
        priority: 'low'
      })
    }

    // Monthly/quarterly items still show on weekends if applicable
    const needsCheckIn = reports.filter(r => {
      if (!r.lastCheckIn) return true
      return r.lastCheckIn < currentMonth
    })
    if (isCheckInWeek && needsCheckIn.length > 0) {
      for (const r of needsCheckIn) {
        items.push({
          id: `preview-checkin-${r.name}`,
          label: `This week: write monthly check-in for ${r.displayName}`,
          description: r.lastCheckIn
            ? `Last check-in: ${r.lastCheckIn}`
            : 'No check-in on file yet',
          category: 'weekend-preview',
          priority: 'high',
          route: `/report/${r.name}?tab=checkins`,
          reportName: r.name
        })
      }
    }
  }

  // ── Monday-specific ──
  if (todayName === 'monday') {
    items.push({
      id: 'monday-priorities',
      label: 'Set the week: review team priorities',
      description: 'Start the week by clarifying what matters most for each person',
      category: 'weekly',
      priority: 'high'
    })
    items.push({
      id: 'monday-past-actions',
      label: 'Audit last week\'s action items',
      description: 'Which items got done? Which are stale? Close or escalate',
      category: 'weekly',
      priority: 'medium'
    })
  }

  // ── Friday-specific ──
  if (todayName === 'friday') {
    const staleReports = reports.filter(r => {
      if (!r.lastFeedback) return true
      const daysSince = Math.floor(
        (now.getTime() - new Date(r.lastFeedback).getTime()) / (1000 * 60 * 60 * 24)
      )
      return daysSince > cadence.feedbackReminderDays
    })
    if (staleReports.length > 0) {
      items.push({
        id: 'friday-feedback',
        label: `Log feedback for: ${staleReports.map(r => r.displayName).join(', ')}`,
        description: 'End the week by capturing at least one piece of feedback per person',
        category: 'weekly',
        priority: 'high',
        route: staleReports.length === 1 ? `/report/${staleReports[0].name}?tab=feedback` : undefined
      })
    }

    items.push({
      id: 'friday-impact',
      label: 'Log your own impact this week',
      description: 'What did you do this week that made a difference? Write it down before you forget',
      category: 'weekly',
      priority: 'medium',
      route: '/impact'
    })

    items.push({
      id: 'friday-prep-next-week',
      label: 'Prep next week\'s 1:1 agendas',
      description: 'Skim each report and note topics to cover — you\'ll thank yourself Monday',
      category: 'weekly',
      priority: 'low'
    })
  }

  // ── Monthly (first week of month) ──
  if (isCheckInWeek) {
    const needsCheckIn = reports.filter(r => {
      if (!r.lastCheckIn) return true
      return r.lastCheckIn < currentMonth
    })
    if (needsCheckIn.length > 0) {
      for (const r of needsCheckIn) {
        items.push({
          id: `monthly-checkin-${r.name}`,
          label: `Write monthly check-in for ${r.displayName}`,
          description: r.lastCheckIn
            ? `Last check-in: ${r.lastCheckIn}`
            : 'No check-in on file yet',
          category: 'monthly',
          priority: 'high',
          route: `/report/${r.name}?tab=checkins`,
          reportName: r.name
        })
      }
    }

    items.push({
      id: 'monthly-trends',
      label: 'Review team health trends',
      description: 'Look at who improved, who slipped, and what changed this month',
      category: 'monthly',
      priority: 'medium'
    })
  }

  // ── Quarterly ──
  if (isQuarterEnd) {
    items.push({
      id: 'quarterly-reviews',
      label: 'Start performance review prep',
      description: 'Gather feedback, check-ins, and impact evidence for each report',
      category: 'quarterly',
      priority: 'high'
    })
    items.push({
      id: 'quarterly-goals-review',
      label: 'Grade quarterly goals with each report',
      description: 'Review OKRs and growth plans — what was hit, what was missed, and why',
      category: 'quarterly',
      priority: 'high'
    })
  }

  if (isQuarterStart) {
    items.push({
      id: 'quarterly-new-goals',
      label: 'Set new quarterly goals with each report',
      description: 'Align on priorities, growth areas, and success criteria for the quarter',
      category: 'quarterly',
      priority: 'high'
    })
  }

  return items
}

const categoryConfig: Record<WorkflowCategory, { label: string; icon: typeof CircleDot; color: string }> = {
  daily: { label: 'Today', icon: CircleDot, color: 'text-brand-light' },
  weekly: { label: 'This week', icon: Calendar, color: 'text-blue-400' },
  monthly: { label: 'This month', icon: TrendingUp, color: 'text-amber-400' },
  quarterly: { label: 'This quarter', icon: Target, color: 'text-emerald-400' },
  'weekend-preview': { label: 'Monday preview', icon: Eye, color: 'text-indigo-400' }
}

const priorityDot: Record<string, string> = {
  high: 'bg-danger',
  medium: 'bg-warning',
  low: 'bg-zinc-500'
}

export function Dashboard() {
  const { overview, loading, error, refresh } = useTeamOverview()
  const navigate = useNavigate()
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<WorkflowCategory>>(
    new Set(['daily', 'weekly', 'monthly', 'quarterly', 'weekend-preview'])
  )
  const [cadence, setCadence] = useState<CadenceSettings>({ checkInFrequency: 'monthly', feedbackReminderDays: 14 })
  const [showSystemOverview, setShowSystemOverview] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setCadence({
        checkInFrequency: s.checkInFrequency || 'monthly',
        feedbackReminderDays: s.feedbackReminderDays ?? 14
      })
    }).catch(() => {})
  }, [])

  const workflowItems = useMemo(() => {
    if (!overview) return []
    return computeWorkflowItems(overview.reports, new Date(), cadence)
  }, [overview, cadence])

  const toggleChecked = (id: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCategory = (cat: WorkflowCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading team data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" aria-hidden="true" />
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            onClick={refresh}
            className="text-sm text-brand-light hover:text-brand transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Users className="w-8 h-8 text-zinc-600 mx-auto" aria-hidden="true" />
          <p className="text-sm text-zinc-400">No team data available.</p>
          <button
            onClick={refresh}
            className="text-sm text-brand-light hover:text-brand transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  if (overview.reports.length === 0) {
    return (
      <div className="max-w-5xl mx-auto animate-fade-in">
        <h1 className="text-2xl font-bold text-zinc-100 mb-8">Team dashboard</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="w-10 h-10 text-zinc-700 mb-4" aria-hidden="true" />
          <p className="text-lg font-medium text-zinc-300 mb-2">No direct reports found</p>
          <p className="text-sm text-zinc-500 max-w-md mb-6">
            Make sure your data repo has a <code className="text-zinc-400 bg-surface-raised px-1.5 py-0.5 rounded text-xs">reports/</code> directory with subdirectories containing <code className="text-zinc-400 bg-surface-raised px-1.5 py-0.5 rounded text-xs">profile.md</code> files.
          </p>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 text-sm text-brand-light hover:text-brand bg-brand/10 hover:bg-brand/20 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>
    )
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const todayIndex = getDay(new Date())
  const isWeekend = todayIndex === 0 || todayIndex === 6
  const nextPrepTarget = (() => {
    let best = overview.reports[0] || null
    let bestDaysAway = 8
    for (const r of overview.reports) {
      if (!r.meetingDay) continue
      const targetDay = dayNames.indexOf(r.meetingDay.toLowerCase())
      if (targetDay === -1) continue
      let daysAway = (targetDay - todayIndex + 7) % 7
      if (daysAway === 0) daysAway = 0
      if (daysAway < bestDaysAway) {
        bestDaysAway = daysAway
        best = r
      }
    }
    return best
  })()

  const statusColors = {
    'on-track': 'bg-success',
    'needs-attention': 'bg-warning',
    'at-risk': 'bg-danger'
  }

  const statusLabels = {
    'on-track': 'On track',
    'needs-attention': 'Needs attention',
    'at-risk': 'At risk'
  }

  const itemsByCategory = workflowItems.reduce<Record<WorkflowCategory, WorkflowItem[]>>(
    (acc, item) => {
      acc[item.category].push(item)
      return acc
    },
    { daily: [], weekly: [], monthly: [], quarterly: [], 'weekend-preview': [] }
  )

  const completedCount = workflowItems.filter(i => checkedItems.has(i.id)).length
  const totalCount = workflowItems.length
  const allDone = totalCount > 0 && completedCount === totalCount
  const categoryOrder: WorkflowCategory[] = ['weekend-preview', 'daily', 'weekly', 'monthly', 'quarterly']
  const activeCategories = categoryOrder.filter(c => itemsByCategory[c].length > 0)

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Team dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {overview.reports.length} direct report{overview.reports.length !== 1 ? 's' : ''} · {format(new Date(), 'EEEE, MMMM d')}
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* How this system works */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setShowSystemOverview(!showSystemOverview)}
          className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-surface-raised/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-brand-light" aria-hidden="true" />
            <span className="text-sm font-medium text-zinc-200">How this system works</span>
          </div>
          {showSystemOverview
            ? <ChevronUp className="w-4 h-4 text-zinc-500" aria-hidden="true" />
            : <ChevronDown className="w-4 h-4 text-zinc-500" aria-hidden="true" />
          }
        </button>
        {showSystemOverview && (
          <div className="px-5 pb-5 border-t border-border">
            <div className="grid gap-4 mt-4 text-sm">
              <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-3">
                <span className="text-zinc-500 font-medium whitespace-nowrap">Every 1:1 day</span>
                <span className="text-zinc-300">AI generates prep notes from recent meetings, open action items, and feedback. Check off discussion topics during the call and save the prep to your repo.</span>

                <span className="text-zinc-500 font-medium whitespace-nowrap">After each 1:1</span>
                <span className="text-zinc-300">Paste the meeting transcript to auto-generate a summary, extract action items, pull out feedback, and log your impact.</span>

                <span className="text-zinc-500 font-medium whitespace-nowrap">Every Monday</span>
                <span className="text-zinc-300">Set the week's priorities and audit last week's action items. Close stale items or escalate blockers.</span>

                <span className="text-zinc-500 font-medium whitespace-nowrap">Every Friday</span>
                <span className="text-zinc-300">Log feedback for anyone who hasn't had any in {cadence.feedbackReminderDays} days. Record your own impact for the week.</span>

                <span className="text-zinc-500 font-medium whitespace-nowrap">
                  {cadence.checkInFrequency === 'monthly' ? 'First week of each month' : cadence.checkInFrequency === 'bimonthly' ? 'Every other month' : 'Start of each quarter'}
                </span>
                <span className="text-zinc-300">Write a private performance check-in for each report covering accomplishments, concerns, and growth since the last check-in.</span>

                <span className="text-zinc-500 font-medium whitespace-nowrap">End of quarter</span>
                <span className="text-zinc-300">Gather feedback, check-ins, and impact evidence for performance review prep. Grade quarterly goals with each report.</span>

                <span className="text-zinc-500 font-medium whitespace-nowrap">Start of quarter</span>
                <span className="text-zinc-300">Set new quarterly goals with each report. Align on priorities, growth areas, and success criteria.</span>
              </div>
              <p className="text-xs text-zinc-600 mt-1">
                Customize the cadence in Settings. All data lives in your Git repo — nothing is stored in the cloud.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Workflow checklist */}
      {totalCount > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-brand/10 rounded-lg">
                <Sparkles className="w-5 h-5 text-brand" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">
                  {isWeekend ? 'Coming up Monday' : 'Your plan for today'}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {allDone
                    ? (isWeekend ? 'You\'re prepped for Monday — enjoy your weekend' : 'All done — you\'re crushing it')
                    : `${completedCount} of ${totalCount} complete`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-300"
                  style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 tabular-nums">
                {Math.round(totalCount > 0 ? (completedCount / totalCount) * 100 : 0)}%
              </span>
            </div>
          </div>

          <div className="divide-y divide-border">
            {activeCategories.map(cat => {
              const config = categoryConfig[cat]
              const catItems = itemsByCategory[cat]
              const catCompleted = catItems.filter(i => checkedItems.has(i.id)).length
              const isExpanded = expandedCategories.has(cat)
              const Icon = config.icon

              return (
                <div key={cat}>
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="flex items-center justify-between w-full px-5 py-3 hover:bg-surface-raised/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${config.color}`} aria-hidden="true" />
                      <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
                        {config.label}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {catCompleted}/{catItems.length}
                      </span>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" aria-hidden="true" />
                      : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" aria-hidden="true" />
                    }
                  </button>

                  {isExpanded && (
                    <div className="pb-2">
                      {catItems.map(item => {
                        const done = checkedItems.has(item.id)
                        return (
                          <div
                            key={item.id}
                            className={`flex items-start gap-3 px-5 py-2.5 group ${done ? 'opacity-50' : ''}`}
                          >
                            <button
                              onClick={() => toggleChecked(item.id)}
                              className="mt-0.5 shrink-0"
                              aria-label={done ? `Uncheck: ${item.label}` : `Check: ${item.label}`}
                            >
                              {done
                                ? <CheckSquare className="w-4 h-4 text-brand" aria-hidden="true" />
                                : <Square className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" aria-hidden="true" />
                              }
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${priorityDot[item.priority]} shrink-0`} />
                                {item.route ? (
                                  <button
                                    onClick={() => navigate(item.route!)}
                                    className={`text-sm text-left hover:text-brand-light transition-colors ${done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}
                                  >
                                    {item.label}
                                  </button>
                                ) : (
                                  <span className={`text-sm ${done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                                    {item.label}
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-zinc-600 mt-0.5 ml-3.5">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {allDone && (
            <div className="px-5 py-4 border-t border-border bg-success/5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" />
                <span className="text-sm text-success">
                  {isWeekend
                    ? 'You\'re prepped for Monday. Enjoy your weekend.'
                    : 'You\'ve completed everything for today. Great managing.'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/transcript')}
          className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group"
        >
          <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors">
            <FileText className="w-5 h-5 text-brand" aria-hidden="true" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-zinc-200">
              Process transcript
            </div>
            <div className="text-xs text-zinc-500">Summarize a 1:1</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/chat')}
          className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group"
        >
          <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors">
            <MessageSquare className="w-5 h-5 text-brand" aria-hidden="true" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-zinc-200">
              AI assistant
            </div>
            <div className="text-xs text-zinc-500">Ask anything</div>
          </div>
        </button>

        <button
          onClick={() => {
            if (nextPrepTarget) navigate(`/report/${nextPrepTarget.name}?tab=prep`)
            else navigate('/transcript')
          }}
          className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group"
        >
          <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors">
            <Calendar className="w-5 h-5 text-brand" aria-hidden="true" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-zinc-200">
              Prep for 1:1{nextPrepTarget ? ` with ${nextPrepTarget.displayName}` : ''}
            </div>
            <div className="text-xs text-zinc-500">Generate prep notes</div>
          </div>
        </button>
      </div>

      {/* Team grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Your team
        </h2>

        <div className="grid gap-3">
          {overview.reports.map((r) => (
            <div
              key={r.name}
              className="bg-surface rounded-xl border border-border hover:border-brand/30 transition-all group"
            >
              <button
                onClick={() => navigate(`/report/${r.name}`)}
                className="flex items-center gap-4 p-4 w-full text-left"
              >
                <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                  {r.displayName.split(' ').map(n => n[0]).join('')}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">
                      {r.displayName}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        r.status === 'on-track'
                          ? 'bg-success/10 text-success'
                          : r.status === 'needs-attention'
                          ? 'bg-warning/10 text-warning'
                          : 'bg-danger/10 text-danger'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${statusColors[r.status]} ${
                          r.status !== 'on-track' ? 'animate-pulse-dot' : ''
                        }`}
                      />
                      {statusLabels[r.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {r.lastOneOnOne
                        ? `Last 1:1 ${formatDistanceToNow(new Date(r.lastOneOnOne), { addSuffix: true })}`
                        : 'No 1:1 recorded'}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                      {r.openActionItems} open items
                    </span>
                  </div>
                  {r.status !== 'on-track' && (
                    <div className={`mt-1.5 text-xs ${r.status === 'at-risk' ? 'text-danger/80' : 'text-warning/80'}`}>
                      {r.daysGap > 14
                        ? `⚠ No 1:1 in ${r.daysGap} days`
                        : r.daysGap > 7
                        ? `Last 1:1 was ${r.daysGap} days ago`
                        : r.openActionItems > 100
                        ? `${r.openActionItems} action items piling up`
                        : `${r.openActionItems} open action items`}
                    </div>
                  )}
                </div>

                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" aria-hidden="true" />
              </button>

              <div className="flex items-center gap-1 px-4 pb-3 -mt-1">
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/report/${r.name}?tab=prep`) }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 hover:text-brand-light hover:bg-brand/10 rounded-md transition-colors"
                  aria-label={`Prep 1:1 for ${r.displayName}`}
                >
                  <ClipboardList className="w-3 h-3" aria-hidden="true" />
                  Prep 1:1
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/report/${r.name}?tab=actions`) }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 hover:text-brand-light hover:bg-brand/10 rounded-md transition-colors"
                  aria-label={`Action items for ${r.displayName}`}
                >
                  <ListChecks className="w-3 h-3" aria-hidden="true" />
                  Actions
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/report/${r.name}?tab=checkins`) }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 hover:text-brand-light hover:bg-brand/10 rounded-md transition-colors"
                  aria-label={`Check-ins for ${r.displayName}`}
                >
                  <BarChart3 className="w-3 h-3" aria-hidden="true" />
                  Check-ins
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
