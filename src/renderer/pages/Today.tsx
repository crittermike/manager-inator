import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeamOverview } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import { useToast } from '../components/common/Toast'
import { IMPACT_LOG_PATH } from '../../shared/constants'
import { getDay, format, getMonth, getDate, formatDistanceToNow } from 'date-fns'
import type { ReportStatus, MeetingEntry, CadenceSettings, TeamActionItem, ActionItem, Report } from '../../shared/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertCircle,
  Calendar,
  Inbox,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  FileText,
  RefreshCw,
  Users,
  AlertTriangle,
  Loader2,
  Save
} from 'lucide-react'

// ── Timeline section config ──

type TimelineSection = 'overdue' | 'upcoming' | 'inbox' | 'done'

const sectionConfig: Record<TimelineSection, {
  label: string
  icon: typeof AlertCircle
  color: string
  bg: string
  border: string
}> = {
  overdue: {
    label: 'Overdue',
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-l-red-500/50'
  },
  upcoming: {
    label: 'Before your next 1:1',
    icon: Calendar,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500/50'
  },
  inbox: {
    label: 'Inbox',
    icon: Inbox,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-l-emerald-500/50'
  },
  done: {
    label: 'Done today',
    icon: CheckCircle2,
    color: 'text-zinc-500',
    bg: 'bg-zinc-500/10',
    border: 'border-l-zinc-500/50'
  }
}

type PromptType = 'weekly-priorities' | 'sprint-goal' | 'weekly-reflection'

interface TimelineItem {
  id: string
  section: TimelineSection
  title: string
  subtitle?: string
  reportName?: string
  route?: string
  actionLabel?: string
  actionType?: 'navigate' | 'process' | 'dismiss' | 'prep' | 'inline-actions' | 'prompt'
  meetingFilename?: string
  /** For 'prompt' actionType: which kind of free-text prompt */
  promptType?: PromptType
  /** For 'inline-actions' actionType: the stale action items to display */
  staleActionItems?: TeamActionItem[]
}

function computeTimelineItems(
  reports: ReportStatus[],
  meetings: MeetingEntry[],
  cadence: CadenceSettings,
  doneIds: Set<string>,
  teamActions: TeamActionItem[]
): TimelineItem[] {
  const items: TimelineItem[] = []
  const now = new Date()
  const dayIndex = getDay(now)
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const todayName = dayNames[dayIndex]
  const currentMonth = format(now, 'yyyy-MM')
  const dayOfMonth = getDate(now)
  const month = getMonth(now)
  const isFirstWeek = dayOfMonth <= 7
  const isMonday = dayIndex === 1
  const isEndOfWeekDay = todayName === cadence.endOfWeekDay

  // ── Overdue: 1:1s > 14 days ago ──
  for (const r of reports) {
    if (r.daysGap > 14 && r.lastOneOnOne) {
      items.push({
        id: `overdue-1on1-${r.name}`,
        section: doneIds.has(`overdue-1on1-${r.name}`) ? 'done' : 'overdue',
        title: `1:1 with ${r.displayName} is overdue`,
        subtitle: `Last met ${formatDistanceToNow(new Date(r.lastOneOnOne), { addSuffix: true })} (${r.daysGap} days)`,
        reportName: r.name,
        route: `/report/${r.name}`,
        actionLabel: 'View',
        actionType: 'navigate'
      })
    }
  }

  // ── Overdue: stale feedback ──
  for (const r of reports) {
    if (!r.lastFeedback) {
      items.push({
        id: `overdue-feedback-${r.name}`,
        section: doneIds.has(`overdue-feedback-${r.name}`) ? 'done' : 'overdue',
        title: `No feedback logged for ${r.displayName}`,
        subtitle: 'No feedback on file — consider sharing something specific',
        reportName: r.name,
        route: `/report/${r.name}?filter=feedback`,
        actionLabel: 'Add feedback',
        actionType: 'navigate'
      })
    } else {
      const daysSince = Math.floor(
        (now.getTime() - new Date(r.lastFeedback).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSince > cadence.feedbackReminderDays) {
        items.push({
          id: `overdue-feedback-${r.name}`,
          section: doneIds.has(`overdue-feedback-${r.name}`) ? 'done' : 'overdue',
          title: `Feedback for ${r.displayName} is stale`,
          subtitle: `Last feedback ${daysSince} days ago`,
          reportName: r.name,
          route: `/report/${r.name}?filter=feedback`,
          actionLabel: 'Add feedback',
          actionType: 'navigate'
        })
      }
    }
  }

  // ── Overdue: check-ins due ──
  const isCheckInWeek = isFirstWeek && (
    cadence.checkInFrequency === 'monthly' ||
    (cadence.checkInFrequency === 'bimonthly' && month % 2 === 0) ||
    (cadence.checkInFrequency === 'quarterly' && [0, 3, 6, 9].includes(month))
  )
  if (isCheckInWeek) {
    for (const r of reports) {
      if (!r.lastCheckIn || r.lastCheckIn < currentMonth) {
        items.push({
          id: `overdue-checkin-${r.name}`,
          section: doneIds.has(`overdue-checkin-${r.name}`) ? 'done' : 'overdue',
          title: `Monthly check-in due for ${r.displayName}`,
          subtitle: r.lastCheckIn ? `Last check-in: ${r.lastCheckIn}` : 'No check-in on file',
          reportName: r.name,
          route: `/report/${r.name}?filter=checkin`,
          actionLabel: 'Write check-in',
          actionType: 'navigate'
        })
      }
    }
  }

  // ── Overdue: stale action items (open 2+ days) ──
  const staleActions = teamActions.filter(a => {
    if (a.completed) return false
    if (!a.sourceFile) return false
    const dateMatch = a.sourceFile.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) return false
    const itemDate = new Date(dateMatch[1])
    const daysOld = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24))
    return daysOld >= 2
  })
  const staleByReport = new Map<string, number>()
  for (const a of staleActions) {
    staleByReport.set(a.reportName, (staleByReport.get(a.reportName) || 0) + 1)
  }
  for (const [reportName, count] of staleByReport) {
    const r = reports.find(rep => rep.name === reportName)
    if (!r) continue
    items.push({
      id: `overdue-stale-actions-${reportName}`,
      section: doneIds.has(`overdue-stale-actions-${reportName}`) ? 'done' : 'overdue',
      title: `${count} stale action item${count !== 1 ? 's' : ''} for ${r.displayName}`,
      subtitle: 'Open for 2+ days — check for blockers',
      reportName,
      actionLabel: 'Review',
      actionType: 'inline-actions',
      staleActionItems: staleActions.filter(a => a.reportName === reportName)
    })
  }

  // ── Weekly: Monday "set priorities" prompt ──
  if (isMonday) {
    items.push({
      id: 'weekly-priorities',
      section: doneIds.has('weekly-priorities') ? 'done' : 'upcoming',
      title: 'Set your priorities for the week',
      subtitle: 'What are the most important things to accomplish this week?',
      actionLabel: 'Open',
      actionType: 'prompt',
      promptType: 'weekly-priorities'
    })
  }

  // ── Weekly: end-of-week reflection prompt ──
  if (isEndOfWeekDay) {
    items.push({
      id: 'weekly-reflection',
      section: doneIds.has('weekly-reflection') ? 'done' : 'upcoming',
      title: 'Weekly reflection',
      subtitle: 'What shipped, what\'s at risk, what did you learn this week?',
      actionLabel: 'Reflect',
      actionType: 'prompt',
      promptType: 'weekly-reflection'
    })

    for (const r of reports) {
      if (!r.lastFeedback) {
        continue
      }
      const daysSince = Math.floor(
        (now.getTime() - new Date(r.lastFeedback).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSince >= 5) {
        items.push({
          id: `weekly-feedback-gap-${r.name}`,
          section: doneIds.has(`weekly-feedback-gap-${r.name}`) ? 'done' : 'upcoming',
          title: `No feedback for ${r.displayName} this week`,
          subtitle: 'Consider sharing an observation before the week ends',
          reportName: r.name,
          route: `/report/${r.name}?filter=feedback`,
          actionLabel: 'Add feedback',
          actionType: 'navigate'
        })
      }
    }
  }

  // ── Before next 1:1 ──
  const isWeekend = dayIndex === 0 || dayIndex === 6
  if (!isWeekend) {
    const todayMeetings = reports.filter(r =>
      r.meetingDay && r.meetingDay.toLowerCase() === todayName
    )
    for (const r of todayMeetings) {
      items.push({
        id: `prep-today-${r.name}`,
        section: doneIds.has(`prep-today-${r.name}`) ? 'done' : 'upcoming',
        title: `1:1 with ${r.displayName} is today`,
        subtitle: `${r.openActionItems} open action items · prep notes available`,
        reportName: r.name,
        actionLabel: 'Prep',
        actionType: 'prep'
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
          id: `prep-tomorrow-${r.name}`,
          section: doneIds.has(`prep-tomorrow-${r.name}`) ? 'done' : 'upcoming',
          title: `1:1 with ${r.displayName} is tomorrow`,
          subtitle: `${r.openActionItems} open action items`,
          reportName: r.name,
          actionLabel: 'Pre-prep',
          actionType: 'prep'
        })
      }
    }

    const day2Index = (dayIndex + 2) % 7
    const day2Name = dayNames[day2Index]
    if (day2Index >= 1 && day2Index <= 5) {
      const day2Meetings = reports.filter(r =>
        r.meetingDay && r.meetingDay.toLowerCase() === day2Name
      )
      for (const r of day2Meetings) {
        items.push({
          id: `prep-day2-${r.name}`,
          section: doneIds.has(`prep-day2-${r.name}`) ? 'done' : 'upcoming',
          title: `1:1 with ${r.displayName} in 2 days`,
          subtitle: `${r.openActionItems} open action items`,
          reportName: r.name,
          actionLabel: 'View',
          actionType: 'prep'
        })
      }
    }
  }

  // ── Sprint cadence ──
  if (cadence.sprintStartDate) {
    const sprintStart = new Date(cadence.sprintStartDate)
    const sprintMs = cadence.sprintLengthWeeks * 7 * 24 * 60 * 60 * 1000
    const elapsed = now.getTime() - sprintStart.getTime()
    const currentSprintDay = Math.floor((elapsed % sprintMs) / (1000 * 60 * 60 * 24))
    const daysInSprint = cadence.sprintLengthWeeks * 7

    if (currentSprintDay <= 1) {
      items.push({
        id: `sprint-start-${format(now, 'yyyy-MM-dd')}`,
        section: doneIds.has(`sprint-start-${format(now, 'yyyy-MM-dd')}`) ? 'done' : 'upcoming',
        title: 'New sprint — set the sprint goal',
        subtitle: 'What does success look like for this sprint?',
        actionLabel: 'Set goal',
        actionType: 'prompt',
        promptType: 'sprint-goal'
      })
    }

    if (currentSprintDay >= daysInSprint - 2) {
      items.push({
        id: `sprint-end-${format(now, 'yyyy-MM-dd')}`,
        section: doneIds.has(`sprint-end-${format(now, 'yyyy-MM-dd')}`) ? 'done' : 'upcoming',
        title: 'Sprint ending — time for a retro',
        subtitle: 'Run a retro or check in with the team on how the sprint went',
        actionLabel: 'Reflect',
        actionType: 'dismiss'
      })
    }
  }

  // ── Monthly: skip-level reminder ──
  if (isFirstWeek) {
    items.push({
      id: `monthly-skip-level-${currentMonth}`,
      section: doneIds.has(`monthly-skip-level-${currentMonth}`) ? 'done' : 'upcoming',
      title: 'Prep for your skip-level 1:1',
      subtitle: 'Schedule or prep your 1:1 with your own manager',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })
  }

  // ── Monthly: peer EM sync ──
  if (dayOfMonth >= 15 && dayOfMonth <= 21) {
    items.push({
      id: `monthly-peer-sync-${currentMonth}`,
      section: doneIds.has(`monthly-peer-sync-${currentMonth}`) ? 'done' : 'upcoming',
      title: 'Connect with a peer EM',
      subtitle: 'Share notes, trade advice, stay connected with your management peers',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })
  }

  // ── Quarterly: planning prompts (first 2 weeks of Q1/Q2/Q3/Q4) ──
  const isQuarterStart = [0, 3, 6, 9].includes(month) && dayOfMonth <= 14
  if (isQuarterStart) {
    items.push({
      id: `quarterly-okr-${currentMonth}`,
      section: doneIds.has(`quarterly-okr-${currentMonth}`) ? 'done' : 'upcoming',
      title: 'Quarterly planning — review OKRs and initiatives',
      subtitle: 'Set or refresh goals for the quarter',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })

    items.push({
      id: `quarterly-health-${currentMonth}`,
      section: doneIds.has(`quarterly-health-${currentMonth}`) ? 'done' : 'upcoming',
      title: 'Team health check',
      subtitle: 'Is anyone burning out? Bored? On the wrong work?',
      actionLabel: 'Reflect',
      actionType: 'dismiss'
    })

    items.push({
      id: `quarterly-hiring-${currentMonth}`,
      section: doneIds.has(`quarterly-hiring-${currentMonth}`) ? 'done' : 'upcoming',
      title: 'Review your hiring plan',
      subtitle: 'If you lost someone tomorrow, what would hurt most?',
      actionLabel: 'Reflect',
      actionType: 'dismiss'
    })

    for (const r of reports) {
      items.push({
        id: `quarterly-calibration-${r.name}-${currentMonth}`,
        section: doneIds.has(`quarterly-calibration-${r.name}-${currentMonth}`) ? 'done' : 'upcoming',
        title: `Calibration prep for ${r.displayName}`,
        subtitle: 'Review the quarter\'s feedback, 1:1s, and completed actions',
        reportName: r.name,
        route: `/report/${r.name}`,
        actionLabel: 'Review',
        actionType: 'navigate'
      })
    }
  }

  // ── Semi-annual: January and July ──
  const isSemiAnnual = [0, 6].includes(month) && dayOfMonth <= 14
  if (isSemiAnnual) {
    for (const r of reports) {
      items.push({
        id: `semi-review-${r.name}-${currentMonth}`,
        section: doneIds.has(`semi-review-${r.name}-${currentMonth}`) ? 'done' : 'upcoming',
        title: `Performance review due for ${r.displayName}`,
        subtitle: 'Generate a review draft from the past 6 months of artifacts',
        reportName: r.name,
        route: `/report/${r.name}`,
        actionLabel: 'Draft review',
        actionType: 'navigate'
      })
    }

    items.push({
      id: `semi-1on1-format-${currentMonth}`,
      section: doneIds.has(`semi-1on1-format-${currentMonth}`) ? 'done' : 'upcoming',
      title: '1:1 format check',
      subtitle: 'Ask each report: is our 1:1 working for you?',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })

    items.push({
      id: `semi-personal-retro-${currentMonth}`,
      section: doneIds.has(`semi-personal-retro-${currentMonth}`) ? 'done' : 'upcoming',
      title: 'Personal management retro',
      subtitle: 'What kind of manager have you been the last 6 months?',
      actionLabel: 'Reflect',
      actionType: 'dismiss'
    })
  }

  // ── Inbox: unprocessed meetings ──
  const unprocessed = meetings
    .filter(m => !m.hasSummary)
    .sort((a, b) => b.date.localeCompare(a.date))

  for (const m of unprocessed) {
    items.push({
      id: `inbox-${m.filename}`,
      section: doneIds.has(`inbox-${m.filename}`) ? 'done' : 'inbox',
      title: m.title,
      subtitle: m.date,
      meetingFilename: m.filename,
      actionLabel: 'Process',
      actionType: 'process'
    })
  }

  return items
}

// ── Inline transcript processor ──

function InlineProcessor({
  filename,
  onDone,
  onCancel
}: {
  filename: string
  onDone: () => void
  onCancel: () => void
}) {
  const { streaming, streamedText, generate, cancel, reset } = useAI()
  const toast = useToast()
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []

  const [phase, setPhase] = useState<'loading' | 'processing' | 'review' | 'saving'>('loading')
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [actionItems, setActionItems] = useState('')
  const [feedback, setFeedback] = useState('')
  const [impact, setImpact] = useState('')
  const [processingLabel, setProcessingLabel] = useState('')
  const mountedRef = useRef(true)
  const cancelledRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancel()
    }
  }, [cancel])

  useEffect(() => {
    window.api.getFileContent(`meetings/${filename}`)
      .then(content => {
        if (mountedRef.current) {
          setTranscript(content)
          setPhase('processing')
        }
      })
      .catch(() => {
        toast.error('Failed to load transcript')
        onCancel()
      })
  }, [filename, onCancel, toast])

  useEffect(() => {
    if (phase !== 'processing' || !transcript) return
    let cancelled = false
    cancelledRef.current = false

    const run = async () => {
      const reportNames = reports.map(r => r.displayName).join(', ')
      const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch?.[1] || format(new Date(), 'yyyy-MM-dd')
      const titleSlug = filename.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/\.md$/, '').replace(/-/g, ' ')

      setProcessingLabel('Generating summary...')
      try {
        const s = await generate('summarize-meeting', {
          meetingTitle: titleSlug,
          date,
          reportNames,
          transcript
        })
        if (cancelled || !mountedRef.current) return
        setSummary(s)
      } catch {
        if (cancelled || !mountedRef.current) return
      }

      setProcessingLabel('Extracting action items...')
      reset()
      try {
        const a = await generate('extract-action-items', {
          reportName: reportNames,
          transcript
        })
        if (cancelled || !mountedRef.current) return
        setActionItems(a)
      } catch {
        if (cancelled || !mountedRef.current) return
      }

      setProcessingLabel('Extracting feedback...')
      reset()
      try {
        const f = await generate('extract-feedback', {
          reportNames,
          transcript
        })
        if (cancelled || !mountedRef.current) return
        setFeedback(f)
      } catch {
        if (cancelled || !mountedRef.current) return
      }

      setProcessingLabel('Extracting impact...')
      reset()
      try {
        const imp = await generate('extract-impact', {
          transcript
        })
        if (cancelled || !mountedRef.current) return
        setImpact(imp)
      } catch {
        if (cancelled || !mountedRef.current) return
      }

      if (mountedRef.current && !cancelled) {
        setPhase('review')
      }
    }

    run()
    return () => { cancelled = true; cancelledRef.current = true }
  }, [phase, transcript, filename, reports, generate, reset])

  const handleSave = async () => {
    setPhase('saving')
    try {
      const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch?.[1] || format(new Date(), 'yyyy-MM-dd')
      const titleSlug = filename.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/\.md$/, '').replace(/-/g, ' ')
      const summaryFilename = filename.replace('.md', '-summary.md')

      if (summary) {
        let summaryToSave = summary
        if (titleSlug) {
          const fmMatch = summaryToSave.match(/^---\n([\s\S]*?)\n---/)
          if (fmMatch) {
            summaryToSave = `---\ntitle: ${titleSlug}\n${fmMatch[1]}\n---` + summaryToSave.slice(fmMatch[0].length)
          } else {
            summaryToSave = `---\ntitle: ${titleSlug}\n---\n\n${summaryToSave}`
          }
        }
        await window.api.commitFile(
          `meetings/${summaryFilename}`,
          summaryToSave,
          `Add meeting summary: ${titleSlug} on ${date}`
        )
      }

      if (impact && !impact.includes('No manager impact')) {
        try {
          const currentLog = await window.api.getImpactLog()
          const entry = `\n\n### ${date} — ${titleSlug}\n\n${impact}`
          await window.api.commitFile(
            IMPACT_LOG_PATH,
            currentLog + entry,
            `Add impact items from ${titleSlug} on ${date}`
          )
        } catch {
          // Impact log save is best-effort
        }
      }

      toast.success('Meeting processed and saved')
      onDone()
    } catch (e) {
      toast.error('Failed to save: ' + (e instanceof Error ? e.message : 'Unknown error'))
      setPhase('review')
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-3 py-4 px-1">
        <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
        <span className="text-sm text-zinc-500">Loading transcript...</span>
      </div>
    )
  }

  if (phase === 'processing') {
    return (
      <div className="space-y-3 py-4 px-1 animate-shimmer rounded-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-brand" />
            <div className="absolute inset-0 animate-ping">
              <Sparkles className="w-4 h-4 text-brand opacity-30" />
            </div>
          </div>
          <span className="text-sm text-zinc-300">{processingLabel}</span>
        </div>
        {streaming && streamedText && (
          <div className="text-xs text-zinc-600 max-h-24 overflow-hidden rounded-lg bg-surface-raised/50 p-3 line-clamp-4">
            {streamedText.slice(-200)}
          </div>
        )}
        <button
          onClick={() => { cancelledRef.current = true; cancel(); onCancel() }}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (phase === 'saving') {
    return (
      <div className="flex items-center gap-3 py-4 px-1">
        <Loader2 className="w-4 h-4 text-brand animate-spin" />
        <span className="text-sm text-zinc-400">Saving...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4 px-1">
      {summary && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Summary</h4>
          <div className="prose-dark text-sm max-h-48 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          </div>
        </div>
      )}
      {actionItems && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Action items</h4>
          <div className="prose-dark text-sm max-h-32 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{actionItems}</ReactMarkdown>
          </div>
        </div>
      )}
      {feedback && !feedback.includes('No feedback') && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Feedback</h4>
          <div className="prose-dark text-sm max-h-32 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{feedback}</ReactMarkdown>
          </div>
        </div>
      )}
      {impact && !impact.includes('No manager impact') && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Your impact</h4>
          <div className="prose-dark text-sm max-h-32 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{impact}</ReactMarkdown>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-colors"
        >
          Approve & save
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Inline 1:1 prep (expands in Today view) ──

function InlinePrep({
  reportName,
  onDone,
  onCancel
}: {
  reportName: string
  onDone: () => void
  onCancel: () => void
}) {
  const { streaming, streamedText, generate, cancel, reset, fullTextRef } = useAI()
  const toast = useToast()
  const mountedRef = useRef(true)

  const [phase, setPhase] = useState<'loading' | 'context' | 'generating' | 'review'>('loading')
  const [reportData, setReportData] = useState<Report | null>(null)
  const [prepContent, setPrepContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; cancel() }
  }, [cancel])

  useEffect(() => {
    window.api.getReportData(reportName)
      .then(data => {
        if (mountedRef.current) {
          setReportData(data)
          setPhase('context')
        }
      })
      .catch(() => {
        toast.error('Failed to load report data')
        onCancel()
      })
  }, [reportName, onCancel, toast])

  const openActions = reportData?.actionItems.filter(a => !a.completed) ?? []
  const recentFeedback = reportData?.feedback.slice(-3) ?? []
  const lastSummary = reportData?.summaries.slice(-1)[0]

  const handleGenerate = useCallback(async () => {
    if (!reportData) return
    setPhase('generating')
    reset()

    const recentSummaryDates = reportData.summaries.slice(-5)
    const summaryContents = await Promise.all(
      recentSummaryDates.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${reportName}-1-1-summary.md`)
          return content
        } catch { return '' }
      })
    )
    const summariesText = summaryContents.filter(Boolean).join('\n\n---\n\n')
    if (!mountedRef.current) return

    const openActionsText = openActions.map(a => `- [ ] ${a.text}`).join('\n')
    const feedbackText = reportData.feedback.slice(-3).map(f => `${f.date} (${f.type}): ${f.content}`).join('\n---\n')

    const displayName = reportData.profile.displayName
    const firstName = displayName.split(' ')[0]
    const namePattern = new RegExp(`\\b(${firstName}|${displayName})\\b`, 'i')
    const ownSummaryPrefix = `${reportName}-1-1`

    let crossMentions = ''
    try {
      const allMeetings = await window.api.listMeetings()
      const otherWithSummaries = allMeetings
        .filter(m => m.hasSummary && !m.filename.replace('.md', '').includes(ownSummaryPrefix))
        .slice(0, 15)
      const mentionResults = await Promise.all(
        otherWithSummaries.map(async (m) => {
          try {
            const content = await window.api.getFileContent(`meetings/${m.filename.replace('.md', '-summary.md')}`)
            if (namePattern.test(content)) {
              return `### ${m.title} (${m.date})\n${content}`
            }
          } catch { /* skip */ }
          return ''
        })
      )
      crossMentions = mentionResults.filter(Boolean).slice(0, 5).join('\n\n---\n\n')
    } catch { /* non-critical */ }
    if (!mountedRef.current) return

    try {
      const result = await generate('prep-one-on-one', {
        reportName: displayName,
        about: reportData.profile.about || undefined,
        jobExpectations: reportData.jobExpectations || undefined,
        summaries: summariesText || 'No recent summaries available.',
        actionItems: openActionsText || 'No open action items.',
        feedback: feedbackText || undefined,
        crossMeetingMentions: crossMentions || undefined
      })
      if (mountedRef.current) {
        setPrepContent(result || fullTextRef.current)
        setPhase('review')
      }
    } catch {
      if (mountedRef.current) {
        setPrepContent(fullTextRef.current || '_Failed to generate prep._')
        setPhase('review')
      }
    }
  }, [reportData, reportName, openActions, generate, reset, fullTextRef, cancel])

  const handleSave = useCallback(async () => {
    if (!prepContent) return
    setSaving(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    try {
      await window.api.commitFile(
        `reports/${reportName}/prep/${today}.md`,
        prepContent,
        `Save 1:1 prep for ${reportData?.profile.displayName ?? reportName} on ${today}`
      )
      toast.success('Prep saved')
      onDone()
    } catch {
      toast.error('Failed to save prep')
    } finally {
      setSaving(false)
    }
  }, [prepContent, reportName, reportData, toast, onDone])

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-3 py-4 px-1">
        <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
        <span className="text-sm text-zinc-500">Loading context...</span>
      </div>
    )
  }

  if (phase === 'context') {
    return (
      <div className="space-y-3 py-4 px-1">
        {lastSummary && (
          <div>
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Last meeting takeaways</h4>
            <p className="text-sm text-zinc-400">
              {lastSummary.keyTopics.length > 0
                ? lastSummary.keyTopics.join(', ')
                : `Meeting on ${lastSummary.date}`}
            </p>
          </div>
        )}
        {openActions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Open action items ({openActions.length})</h4>
            <ul className="space-y-1">
              {openActions.slice(0, 5).map((a, i) => (
                <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
                  <span className="text-zinc-600 mt-0.5">•</span>
                  <span className="truncate">{a.text}</span>
                </li>
              ))}
              {openActions.length > 5 && (
                <li className="text-xs text-zinc-600">+{openActions.length - 5} more</li>
              )}
            </ul>
          </div>
        )}
        {recentFeedback.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Recent feedback</h4>
            <ul className="space-y-1">
              {recentFeedback.map((f, i) => (
                <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
                  <span className="shrink-0">{f.type === 'positive' ? '🌟' : f.type === 'constructive' ? '🔧' : '💬'}</span>
                  <span className="truncate">{f.content.length > 80 ? f.content.slice(0, 80) + '…' : f.content}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleGenerate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate prep notes
          </button>
          <button onClick={onCancel} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'generating') {
    return (
      <div className="space-y-3 py-4 px-1 animate-shimmer rounded-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-brand" />
            <div className="absolute inset-0 animate-ping">
              <Sparkles className="w-4 h-4 text-brand opacity-30" />
            </div>
          </div>
          <span className="text-sm text-zinc-300">Generating prep notes...</span>
        </div>
        {streaming && streamedText && (
          <div className="text-xs text-zinc-600 max-h-24 overflow-hidden rounded-lg bg-surface-raised/50 p-3 line-clamp-4">
            {streamedText.slice(-200)}
          </div>
        )}
        <button
          onClick={() => { cancel(); onCancel() }}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4 px-1">
      <div className="prose-dark text-sm max-h-64 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{prepContent}</ReactMarkdown>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save prep'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Inline action items (expands in Today view) ──

function InlineActions({
  reportName,
  actions,
  onDone,
  onCancel,
  onRefresh
}: {
  reportName: string
  actions: TeamActionItem[]
  onDone: () => void
  onCancel: () => void
  onRefresh: () => void
}) {
  const toast = useToast()
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set())
  const [localActions, setLocalActions] = useState(actions)

  const handleToggle = useCallback(async (a: ActionItem) => {
    if (!a.sourceFile || a.sourceLineNumber == null) return
    const toggleKey = `${a.sourceFile}:${a.sourceLineNumber}`
    setTogglingItems(prev => new Set(prev).add(toggleKey))
    try {
      await window.api.toggleActionItem(a.sourceFile, a.sourceLineNumber)
      setLocalActions(prev => prev.filter(item =>
        !(item.sourceFile === a.sourceFile && item.sourceLineNumber === a.sourceLineNumber)
      ))
      onRefresh()
      toast.success('Action item completed')
    } catch {
      toast.error('Failed to toggle action item')
    } finally {
      setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
    }
  }, [onRefresh, toast])

  if (localActions.length === 0) {
    return (
      <div className="py-4 px-1 text-center">
        <CheckCircle2 className="w-6 h-6 text-emerald-500/60 mx-auto mb-2" />
        <p className="text-sm text-zinc-400">All caught up!</p>
        <button onClick={onDone} className="text-xs text-brand-light hover:text-brand mt-2 transition-colors">
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1 py-3 px-1">
      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
        Stale action items for {actions[0]?.displayName ?? reportName}
      </h4>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {localActions.map((a, i) => {
          const toggleKey = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
          const isToggling = togglingItems.has(toggleKey)
          return (
            <button
              key={i}
              disabled={isToggling || !a.sourceFile || a.sourceLineNumber == null}
              onClick={() => handleToggle(a)}
              className="w-full flex items-start gap-2.5 py-1.5 px-1 rounded-lg hover:bg-surface-raised transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isToggling ? (
                <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 group-hover:border-emerald-400 group-hover:bg-emerald-400/20 transition-colors" />
              )}
              <span className="text-sm text-zinc-300">{a.text}</span>
              {a.owner && a.owner !== 'Unknown' && (
                <span className="text-xs text-zinc-500 shrink-0 ml-auto">({a.owner})</span>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2 pt-2">
        <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Collapse
        </button>
      </div>
    </div>
  )
}

// ── Inline free-text prompt (expands in Today view) ──

function InlinePrompt({
  promptType,
  onDone,
  onCancel
}: {
  promptType: PromptType
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const promptConfig: Record<PromptType, { placeholder: string; savePath: () => string; commitMsg: () => string }> = {
    'weekly-priorities': {
      placeholder: 'What are your top priorities this week? What must get done?',
      savePath: () => {
        const now = new Date()
        const year = now.getFullYear()
        const weekNum = Math.ceil(((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7)
        return `weekly-log/${year}-W${String(weekNum).padStart(2, '0')}-priorities.md`
      },
      commitMsg: () => `Save weekly priorities for ${format(new Date(), 'yyyy-MM-dd')}`
    },
    'sprint-goal': {
      placeholder: 'What does success look like for this sprint? What are the key deliverables?',
      savePath: () => `weekly-log/sprint-goal-${format(new Date(), 'yyyy-MM-dd')}.md`,
      commitMsg: () => `Save sprint goal for ${format(new Date(), 'yyyy-MM-dd')}`
    },
    'weekly-reflection': {
      placeholder: 'What shipped this week? What\'s at risk? What did you learn?',
      savePath: () => {
        const now = new Date()
        const year = now.getFullYear()
        const weekNum = Math.ceil(((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7)
        return `weekly-log/${year}-W${String(weekNum).padStart(2, '0')}-reflection.md`
      },
      commitMsg: () => `Save weekly reflection for ${format(new Date(), 'yyyy-MM-dd')}`
    }
  }

  const config = promptConfig[promptType]

  const handleSave = async () => {
    if (!text.trim()) return
    setSaving(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const header = promptType === 'weekly-priorities'
      ? `# Weekly Priorities — ${today}`
      : promptType === 'sprint-goal'
      ? `# Sprint Goal — ${today}`
      : `# Weekly Reflection — ${today}`

    try {
      await window.api.commitFile(
        config.savePath(),
        `${header}\n\n${text.trim()}\n`,
        config.commitMsg()
      )
      toast.success('Saved')
      onDone()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 py-4 px-1">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={config.placeholder}
        className="w-full h-28 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Today page ──

export function Today() {
  const { overview, loading, error, refresh } = useTeamOverview()
  const navigate = useNavigate()
  const toast = useToast()
  const [meetings, setMeetings] = useState<MeetingEntry[]>([])
  const [teamActions, setTeamActions] = useState<TeamActionItem[]>([])
  const [cadence, setCadence] = useState<CadenceSettings>({
    checkInFrequency: 'monthly',
    feedbackReminderDays: 14,
    sprintLengthWeeks: 2,
    endOfWeekDay: 'friday',
    sprintStartDate: ''
  })
  const [dragging, setDragging] = useState(false)
  const [doneIds, setDoneIds] = useState<Set<string>>(() => {
    try {
      const todayKey = format(new Date(), 'yyyy-MM-dd')
      const stored = localStorage.getItem(`today-done-${todayKey}`)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
   })
  const [expandedSections, setExpandedSections] = useState<Set<TimelineSection>>(
    new Set(['overdue', 'upcoming', 'inbox'])
  )
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [processingItem, setProcessingItem] = useState<string | null>(null)

  useEffect(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    localStorage.setItem(`today-done-${todayKey}`, JSON.stringify([...doneIds]))
  }, [doneIds])

  // Clean up old done-keys (older than 7 days) on mount
  useEffect(() => {
    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('today-done-')) continue
      const dateStr = key.replace('today-done-', '')
      const keyDate = new Date(dateStr + 'T00:00:00').getTime()
      if (now - keyDate > sevenDaysMs) {
        localStorage.removeItem(key)
      }
    }
  }, [])

  useEffect(() => {
    window.api.listMeetings().then(setMeetings).catch(() => {})
    window.api.getTeamActionItems().then(setTeamActions).catch(() => {})
    window.api.getSettings().then((s) => {
      setCadence({
        checkInFrequency: s.checkInFrequency || 'monthly',
        feedbackReminderDays: s.feedbackReminderDays ?? 14,
        sprintLengthWeeks: s.sprintLengthWeeks ?? 2,
        endOfWeekDay: s.endOfWeekDay || 'friday',
        sprintStartDate: s.sprintStartDate || ''
      })
    }).catch(() => {})
  }, [])

  const reports = overview?.reports ?? []

  const items = useMemo(() => {
    return computeTimelineItems(reports, meetings, cadence, doneIds, teamActions)
  }, [reports, meetings, cadence, doneIds, teamActions])

  const sections: TimelineSection[] = ['overdue', 'upcoming', 'inbox', 'done']

  const itemsBySection = useMemo(() => {
    const grouped: Record<TimelineSection, TimelineItem[]> = {
      overdue: [], upcoming: [], inbox: [], done: []
    }
    for (const item of items) {
      grouped[item.section].push(item)
    }
    return grouped
  }, [items])

  const markDone = useCallback((id: string) => {
    setDoneIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setExpandedItem(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      toast.error('Only .txt and .md files are supported')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const text = reader.result as string
      if (!text.trim()) {
        toast.error('File is empty')
        return
      }
      const stem = file.name.replace(/\.(txt|md)$/, '').replace(/[-_]/g, ' ')
      const today = format(new Date(), 'yyyy-MM-dd')
      const slug = stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
      const filename = `${today}-${slug}`

      try {
        await window.api.commitFile(
          `meetings/${filename}.md`,
          `# ${stem} — ${today}\n\n${text}`,
          `Add meeting transcript: ${stem} on ${today}`
        )
        toast.success(`Transcript saved — process it from your inbox`)
        window.api.listMeetings().then(setMeetings).catch(() => {})
      } catch (err) {
        toast.error('Failed to save transcript: ' + (err instanceof Error ? err.message : 'Unknown error'))
      }
    }
    reader.readAsText(file)
  }, [toast])

  const toggleSection = (section: TimelineSection) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const totalActive = items.filter(i => i.section !== 'done').length
  const doneCount = itemsBySection.done.length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading...</span>
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
          <button onClick={refresh} className="text-sm text-brand-light hover:text-brand transition-colors">
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!overview || overview.reports.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Users className="w-8 h-8 text-zinc-700 mx-auto" aria-hidden="true" />
          <p className="text-sm text-zinc-400">No team data yet.</p>
          <button onClick={refresh} className="text-sm text-brand-light hover:text-brand transition-colors">
            Refresh
          </button>
        </div>
      </div>
    )
  }

  const activeSections = sections.filter(s => itemsBySection[s].length > 0)

  return (
    <div
      className="max-w-3xl mx-auto space-y-6 animate-fade-in relative"
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-30 rounded-2xl border-2 border-dashed border-brand/50 bg-brand/5 flex items-center justify-center backdrop-blur-sm pointer-events-none animate-fade-in">
          <div className="text-center">
            <FileText className="w-8 h-8 text-brand/60 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-brand-light">Drop transcript here</p>
            <p className="text-xs text-zinc-500 mt-1">.txt or .md files</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Today</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {format(new Date(), 'EEEE, MMMM d')} · {totalActive === 0 ? 'All clear' : `${totalActive} item${totalActive !== 1 ? 's' : ''} need attention`}
          </p>
        </div>
        <button
          onClick={() => {
            refresh()
            window.api.listMeetings().then(setMeetings).catch(() => {})
            window.api.getTeamActionItems().then(setTeamActions).catch(() => {})
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* All clear state */}
      {totalActive === 0 && doneCount === 0 && (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/60" aria-hidden="true" />
          </div>
          <p className="text-lg font-medium text-zinc-200">You're all caught up</p>
          <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto leading-relaxed">
            No overdue items, no upcoming 1:1s to prep, and your inbox is clear. Enjoy the calm.
          </p>
        </div>
      )}

      {/* Timeline sections */}
      {activeSections.map(section => {
        const config = sectionConfig[section]
        const sectionItems = itemsBySection[section]
        const isExpanded = expandedSections.has(section)
        const Icon = config.icon

        return (
          <div key={section} className={`bg-surface rounded-xl border border-border overflow-hidden border-l-[3px] ${config.border} transition-all`}>
            <button
              onClick={() => toggleSection(section)}
              className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-surface-raised/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg ${config.bg}`}>
                  <Icon className={`w-4 h-4 ${config.color}`} aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold text-zinc-200">{config.label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                  {sectionItems.length}
                </span>
              </div>
              {isExpanded
                ? <ChevronDown className="w-4 h-4 text-zinc-600" aria-hidden="true" />
                : <ChevronRight className="w-4 h-4 text-zinc-600" aria-hidden="true" />
              }
            </button>

            {isExpanded && (
              <div className="border-t border-border animate-slide-down">
                {sectionItems.map(item => {
                  const isItemExpanded = expandedItem === item.id
                  const isProcessing = processingItem === item.id

                  return (
                    <div key={item.id} className="border-b border-border/30 last:border-b-0">
                      <div
                        className="flex items-center gap-3 px-5 py-3.5 group cursor-pointer hover:bg-surface-raised/40 transition-all duration-150"
                        onClick={() => {
                          if (item.actionType === 'navigate' && item.route) {
                            navigate(item.route)
                          } else {
                            setExpandedItem(isItemExpanded ? null : item.id)
                          }
                        }}
                      >
                        {item.reportName ? (
                          <div className="w-7 h-7 rounded-full bg-brand/15 flex items-center justify-center text-xs font-medium text-brand-light shrink-0">
                            {reports.find(r => r.name === item.reportName)?.displayName.charAt(0) ?? '?'}
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-surface-raised flex items-center justify-center shrink-0">
                            <FileText className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-zinc-200 truncate">{item.title}</div>
                          {item.subtitle && (
                            <div className="text-xs text-zinc-500 truncate mt-0.5">{item.subtitle}</div>
                          )}
                        </div>

                        {item.section !== 'done' && (
                          <div className="flex items-center gap-2 shrink-0">
                            {item.actionLabel && item.actionType === 'process' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpandedItem(item.id)
                                  setProcessingItem(item.id)
                                }}
                                className="px-3 py-1.5 text-xs font-medium bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors"
                              >
                                {item.actionLabel}
                              </button>
                            )}
                            {item.actionLabel && item.actionType === 'navigate' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (item.route) navigate(item.route)
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
                              >
                                {item.actionLabel}
                              </button>
                            )}
                            {item.actionLabel && item.actionType === 'dismiss' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  markDone(item.id)
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
                              >
                                {item.actionLabel}
                              </button>
                            )}
                            {item.actionLabel && (item.actionType === 'prep' || item.actionType === 'inline-actions' || item.actionType === 'prompt') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpandedItem(isItemExpanded ? null : item.id)
                                }}
                                className="px-3 py-1.5 text-xs font-medium bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors"
                              >
                                {item.actionLabel}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                markDone(item.id)
                              }}
                              className="p-1 text-zinc-600 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100"
                              aria-label="Mark done"
                              title="Mark done"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {isProcessing && isItemExpanded && item.meetingFilename && (
                        <div className="px-5 pb-4 border-t border-border/30">
                          <InlineProcessor
                            filename={item.meetingFilename}
                            onDone={() => {
                              markDone(item.id)
                              setProcessingItem(null)
                              window.api.listMeetings().then(setMeetings).catch(() => {})
                              window.api.getTeamActionItems().then(setTeamActions).catch(() => {})
                            }}
                            onCancel={() => {
                              setProcessingItem(null)
                              setExpandedItem(null)
                            }}
                          />
                        </div>
                      )}

                      {isItemExpanded && item.actionType === 'prep' && item.reportName && (
                        <div className="px-5 pb-4 border-t border-border/30">
                          <InlinePrep
                            reportName={item.reportName}
                            onDone={() => {
                              markDone(item.id)
                            }}
                            onCancel={() => {
                              setExpandedItem(null)
                            }}
                          />
                        </div>
                      )}

                      {isItemExpanded && item.actionType === 'inline-actions' && item.staleActionItems && (
                        <div className="px-5 pb-4 border-t border-border/30">
                          <InlineActions
                            reportName={item.reportName ?? ''}
                            actions={item.staleActionItems}
                            onDone={() => {
                              markDone(item.id)
                            }}
                            onCancel={() => {
                              setExpandedItem(null)
                            }}
                            onRefresh={() => {
                              window.api.getTeamActionItems().then(setTeamActions).catch(() => {})
                            }}
                          />
                        </div>
                      )}

                      {isItemExpanded && item.actionType === 'prompt' && item.promptType && (
                        <div className="px-5 pb-4 border-t border-border/30">
                          <InlinePrompt
                            promptType={item.promptType}
                            onDone={() => {
                              markDone(item.id)
                            }}
                            onCancel={() => {
                              setExpandedItem(null)
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
