import { useState, useMemo, useEffect, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeamOverview, useSettings } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import { useToast } from '../components/common/Toast'
import { getDay, format, getMonth, getDate } from 'date-fns'
import type { ReportStatus, MeetingEntry, CadenceSettings, TeamActionItem, CustomPractice, TeamMemberActivity } from '../../shared/types'
import { formatActivityCounts } from '../utils/activitySuggestions'
import { matchesMeetingDay } from '../utils/meetingDay'
import { formatRelativeDate } from '../utils/formatDate'

import {
  AlertCircle,
  BookOpen,
  ClipboardList,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw,
  Users,
  AlertTriangle,
  Eye,
  Sparkles,
  GitPullRequest,
  CircleDot,
  MessageSquare,
  Undo2,
  Zap,
  UserPlus,
  Settings
} from 'lucide-react'
import { InlinePrep, InlineActions, InlinePrompt, InlineFeedback } from './today-components'
import type { TimelineSection, TimelineItem } from './today-components'

const sectionConfig: Record<TimelineSection, {
  label: string
  icon: typeof AlertCircle
  color: string
  bg: string
  border: string
}> = {
  reflection: {
    label: 'Weekly Reflection',
    icon: Sparkles,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-l-violet-500/50'
  },
  overdue: {
    label: 'Overdue',
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-l-red-500/50'
  },
  'this-week': {
    label: 'This week',
    icon: ClipboardList,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-l-sky-500/50'
  },

  done: {
    label: 'Done today',
    icon: CheckCircle2,
    color: 'text-zinc-500',
    bg: 'bg-zinc-500/10',
    border: 'border-l-zinc-500/50'
  },
  'coming-up': {
    label: 'Coming up',
    icon: Eye,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500/50'
  }
}

/** Maps a timeline item ID to its corresponding practice ID for disabled/snoozed filtering */
function getPracticeIdForItem(itemId: string): string | null {
  if (itemId.startsWith('overdue-1on1-') || itemId.startsWith('prep-')) return 'one-on-one-prep'
  if (itemId.startsWith('overdue-feedback-') || itemId.startsWith('weekly-feedback-gap-')) return 'feedback-gap'
  if (itemId.startsWith('overdue-checkin-')) return 'monthly-checkin'
  if (itemId === 'weekly-priorities') return 'weekly-priorities'
  if (itemId === 'weekly-reflection') return 'weekly-reflection'
  if (itemId.startsWith('sprint-start-')) return 'sprint-start'
  if (itemId.startsWith('sprint-end-')) return 'sprint-end'
  if (itemId.startsWith('monthly-skip-level-')) return 'skip-level'
  if (itemId.startsWith('monthly-peer-sync-')) return 'peer-sync'
  if (itemId.startsWith('quarterly-okr-')) return 'quarterly-okr'
  if (itemId.startsWith('quarterly-health-')) return 'quarterly-health'
  if (itemId.startsWith('quarterly-hiring-')) return 'quarterly-hiring'
  if (itemId.startsWith('quarterly-calibration-')) return 'quarterly-calibration'
  if (itemId.startsWith('semi-review-')) return 'semi-review'
  if (itemId.startsWith('semi-1on1-format-')) return 'semi-1on1-format'
  if (itemId.startsWith('semi-personal-retro-')) return 'semi-personal-retro'
  if (itemId.startsWith('daily-interaction-')) return 'daily-interaction'
  // Coming Up items: strip the 'coming-up-' prefix and re-map
  if (itemId.startsWith('coming-up-1on1-')) return 'one-on-one-prep'
  if (itemId.startsWith('coming-up-priorities-')) return 'weekly-priorities'
  if (itemId.startsWith('coming-up-reflection-')) return 'weekly-reflection'
  if (itemId.startsWith('coming-up-sprint-start-')) return 'sprint-start'
  if (itemId.startsWith('coming-up-sprint-end-')) return 'sprint-end'
  if (itemId.startsWith('coming-up-checkins-')) return 'monthly-checkin'
  if (itemId.startsWith('coming-up-skip-level-')) return 'skip-level'
  if (itemId.startsWith('coming-up-quarterly-')) return 'quarterly-okr'
  if (itemId.startsWith('coming-up-reviews-')) return 'semi-review'
  // inbox items and stale actions have no practice mapping — always show
  // Custom practices: item IDs are custom-{cpId} or custom-{cpId}-{reportName}
  // where cpId is already "custom-{timestamp}". So full ID is custom-custom-{ts} or custom-custom-{ts}-{name}
  // We need to return the cpId (e.g. "custom-{timestamp}") which matches what's stored in disabledPractices
  if (itemId.startsWith('custom-')) {
    const withoutPrefix = itemId.slice('custom-'.length)
    // cpId starts with "custom-" followed by a timestamp — extract custom-{digits}
    const customTimestampMatch = withoutPrefix.match(/^(custom-\d+)/)
    if (customTimestampMatch) return customTimestampMatch[1]
    // Fallback for UUID-based IDs: custom-{uuid}
    const uuidMatch = withoutPrefix.match(/^([0-9a-f-]{36})/)
    if (uuidMatch) return uuidMatch[1]
    return withoutPrefix
  }
  return null
}

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' }
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤️' }
  return { text: 'Good evening', emoji: '🌙' }
}

const motivationalSubtitles = [
  'Your team is counting on you. You got this.',
  'Small actions, big impact. Let\'s go.',
  'The best managers ship clarity, not chaos.',
  'Today\'s prep is tomorrow\'s smooth 1:1.',
  'Feedback is a gift. Give one today.',
  'You\'re building careers, not just software.',
  'A 2-minute check-in can change someone\'s week.',
  'Great managers notice what others miss.',
  'Your calendar is a reflection of your priorities.',
  'Lead the team you wish you\'d had.',
]

function getDailyMotivation(): string {
  // Deterministic per day so it doesn't change on re-renders
  const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  return motivationalSubtitles[daysSinceEpoch % motivationalSubtitles.length]
}

function computeTimelineItems(
  reports: ReportStatus[],
  meetings: MeetingEntry[],
  cadence: CadenceSettings,
  doneIds: Set<string>,
  teamActions: TeamActionItem[],
  customPractices: CustomPractice[]
): TimelineItem[] {
  const items: TimelineItem[] = []
  const reportMap = new Map(reports.map(r => [r.name, r]))
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

  for (const r of reports) {
    if (r.daysGap > 14 && r.lastOneOnOne) {
      items.push({
        id: `overdue-1on1-${r.name}`,
        section: doneIds.has(`overdue-1on1-${r.name}`) ? 'done' : 'overdue',
        title: `1:1 with ${r.displayName} is overdue`,
        subtitle: `Last met ${formatRelativeDate(new Date(r.lastOneOnOne)).toLowerCase()} (${r.daysGap} days)`,
        reportName: r.name,
        route: `/report/${r.name}`,
        actionLabel: 'View',
        actionType: 'navigate'
      })
    } else if (!r.lastOneOnOne) {
      items.push({
        id: `overdue-no-activity-${r.name}`,
        section: doneIds.has(`overdue-no-activity-${r.name}`) ? 'done' : 'overdue',
        title: `No activity logged for ${r.displayName}`,
        subtitle: 'No 1:1s on file — schedule one or drop a transcript',
        reportName: r.name,
        route: `/report/${r.name}`,
        actionLabel: 'View',
        actionType: 'navigate'
      })
    }
  }

  for (const r of reports) {
    if (!r.lastFeedback) {
      items.push({
        id: `overdue-feedback-${r.name}`,
        section: doneIds.has(`overdue-feedback-${r.name}`) ? 'done' : 'overdue',
        title: `No feedback logged for ${r.displayName}`,
        subtitle: 'No feedback on file — consider sharing something specific',
        reportName: r.name,
        actionLabel: 'Add feedback',
        actionType: 'feedback'
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
          actionLabel: 'Add feedback',
          actionType: 'feedback'
        })
      }
    }
  }

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

  const staleActions = teamActions.filter(a => {
    if (a.completed) return false
    if (!a.sourceFile) return false
    const dateMatch = a.sourceFile.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) return false
    const itemDate = new Date(dateMatch[1])
    const daysOld = Math.floor((now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24))
    return daysOld >= cadence.staleActionDays
  })
  const staleByReport = new Map<string, number>()
  for (const a of staleActions) {
    staleByReport.set(a.reportName, (staleByReport.get(a.reportName) || 0) + 1)
  }
  for (const [reportName, count] of staleByReport) {
    const r = reportMap.get(reportName)
    if (!r) continue
    items.push({
      id: `overdue-stale-actions-${reportName}`,
      section: doneIds.has(`overdue-stale-actions-${reportName}`) ? 'done' : 'overdue',
      title: `${count} stale action item${count !== 1 ? 's' : ''} for ${r.displayName}`,
      subtitle: `Open for ${cadence.staleActionDays}+ days — check for blockers`,
      reportName,
      actionLabel: 'Review',
      actionType: 'inline-actions',
      staleActionItems: staleActions.filter(a => a.reportName === reportName)
    })
  }

  if (isMonday) {
    items.push({
      id: 'weekly-priorities',
      section: doneIds.has('weekly-priorities') ? 'done' : 'this-week',
      title: 'Set your priorities for the week',
      subtitle: 'What are the most important things to accomplish this week?',
      actionLabel: 'Open',
      actionType: 'prompt',
      promptType: 'weekly-priorities'
    })

    const staleOrAtRisk = staleActions.length
    items.push({
      id: `board-status-${format(now, 'yyyy-MM-dd')}`,
      section: doneIds.has(`board-status-${format(now, 'yyyy-MM-dd')}`) ? 'done' : 'this-week',
      title: 'Review your project board',
      subtitle: staleOrAtRisk > 0
        ? `${staleOrAtRisk} stale action item${staleOrAtRisk !== 1 ? 's' : ''} across the team — check for blockers or at-risk work`
        : 'Check for anything stale or at risk based on recent activity',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })
  }

  if (isEndOfWeekDay) {
    items.push({
      id: 'weekly-reflection',
      section: doneIds.has('weekly-reflection') ? 'done' : 'reflection',
      title: 'Week-in-review',
      subtitle: 'What shipped, what\'s at risk, what did you learn this week?',
      actionLabel: 'Reflect',
      actionType: 'prompt',
      promptType: 'weekly-reflection'
    })

    for (const r of reports) {
      if (!r.lastFeedback) {
        items.push({
          id: `weekly-feedback-gap-${r.name}`,
          section: doneIds.has(`weekly-feedback-gap-${r.name}`) ? 'done' : 'reflection',
          title: `No feedback logged for ${r.displayName} this week`,
          subtitle: 'Share an observation before the week ends',
          reportName: r.name,
          actionLabel: 'Add feedback',
          actionType: 'feedback'
        })
        continue
      }
      const daysSince = Math.floor(
        (now.getTime() - new Date(r.lastFeedback).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSince >= 5) {
        items.push({
          id: `weekly-feedback-gap-${r.name}`,
          section: doneIds.has(`weekly-feedback-gap-${r.name}`) ? 'done' : 'reflection',
          title: `No feedback for ${r.displayName} this week`,
          subtitle: 'Consider sharing an observation before the week ends',
          reportName: r.name,
          actionLabel: 'Add feedback',
          actionType: 'feedback'
        })
      }
    }
  }

  const isWeekend = dayIndex === 0 || dayIndex === 6
  if (!isWeekend) {
    const todayMeetings = reports.filter(r =>
      r.meetingDay && matchesMeetingDay(r.meetingDay, todayName)
    )
    for (const r of todayMeetings) {
      items.push({
        id: `prep-today-${r.name}`,
        section: doneIds.has(`prep-today-${r.name}`) ? 'done' : 'this-week',
        title: `Review 1:1 prep for ${r.displayName}`,
        subtitle: `${r.openActionItems} open action items · prep notes available`,
        reportName: r.name,
        actionLabel: 'Review',
        actionType: 'prep'
      })
    }
  }

  if (cadence.sprintStartDate) {
    const sprintStart = new Date(cadence.sprintStartDate)
    const sprintMs = cadence.sprintLengthWeeks * 7 * 24 * 60 * 60 * 1000
    const elapsed = now.getTime() - sprintStart.getTime()

    // Only apply sprint logic if we've reached the first sprint start date.
    // Negative elapsed means the start date is in the future — modulo math breaks.
    if (elapsed >= 0) {
      const currentSprintDay = Math.floor((elapsed % sprintMs) / (1000 * 60 * 60 * 24))
      const daysInSprint = cadence.sprintLengthWeeks * 7

      if (currentSprintDay <= 1) {
        items.push({
          id: `sprint-start-${format(now, 'yyyy-MM-dd')}`,
          section: doneIds.has(`sprint-start-${format(now, 'yyyy-MM-dd')}`) ? 'done' : 'this-week',
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
          section: doneIds.has(`sprint-end-${format(now, 'yyyy-MM-dd')}`) ? 'done' : 'this-week',
          title: 'Sprint ending — time for a retro',
          subtitle: 'Run a retro or check in with the team on how the sprint went',
          actionLabel: 'Reflect',
          actionType: 'dismiss'
        })
      }
    }
  }

  if (isFirstWeek) {
    items.push({
      id: `monthly-skip-level-${currentMonth}`,
      section: doneIds.has(`monthly-skip-level-${currentMonth}`) ? 'done' : 'this-week',
      title: 'Prep for your skip-level 1:1',
      subtitle: 'Schedule or prep your 1:1 with your own manager',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })
  }

  if (dayOfMonth >= 15 && dayOfMonth <= 21) {
    items.push({
      id: `monthly-peer-sync-${currentMonth}`,
      section: doneIds.has(`monthly-peer-sync-${currentMonth}`) ? 'done' : 'this-week',
      title: 'Connect with a peer EM',
      subtitle: 'Share notes, trade advice, stay connected with your management peers',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })
  }

  const isQuarterStart = [0, 3, 6, 9].includes(month) && dayOfMonth <= 14
  if (isQuarterStart) {
    items.push({
      id: `quarterly-okr-${currentMonth}`,
      section: doneIds.has(`quarterly-okr-${currentMonth}`) ? 'done' : 'this-week',
      title: 'Quarterly planning — review OKRs and initiatives',
      subtitle: 'Set or refresh goals for the quarter',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })

    items.push({
      id: `quarterly-health-${currentMonth}`,
      section: doneIds.has(`quarterly-health-${currentMonth}`) ? 'done' : 'this-week',
      title: 'Team health check',
      subtitle: 'Is anyone burning out? Bored? On the wrong work?',
      actionLabel: 'Reflect',
      actionType: 'dismiss'
    })

    items.push({
      id: `quarterly-hiring-${currentMonth}`,
      section: doneIds.has(`quarterly-hiring-${currentMonth}`) ? 'done' : 'this-week',
      title: 'Review your hiring plan',
      subtitle: 'If you lost someone tomorrow, what would hurt most?',
      actionLabel: 'Reflect',
      actionType: 'dismiss'
    })

    for (const r of reports) {
      items.push({
        id: `quarterly-calibration-${r.name}-${currentMonth}`,
        section: doneIds.has(`quarterly-calibration-${r.name}-${currentMonth}`) ? 'done' : 'this-week',
        title: `Calibration prep for ${r.displayName}`,
        subtitle: 'Review the quarter\'s feedback, 1:1s, and completed actions',
        reportName: r.name,
        route: `/report/${r.name}`,
        actionLabel: 'Review',
        actionType: 'navigate'
      })
    }
  }

  const isSemiAnnual = [0, 6].includes(month) && dayOfMonth <= 14
  if (isSemiAnnual) {
    for (const r of reports) {
      items.push({
        id: `semi-review-${r.name}-${currentMonth}`,
        section: doneIds.has(`semi-review-${r.name}-${currentMonth}`) ? 'done' : 'this-week',
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
      section: doneIds.has(`semi-1on1-format-${currentMonth}`) ? 'done' : 'this-week',
      title: '1:1 format check',
      subtitle: 'Ask each report: is our 1:1 working for you?',
      actionLabel: 'Dismiss',
      actionType: 'dismiss'
    })

    items.push({
      id: `semi-personal-retro-${currentMonth}`,
      section: doneIds.has(`semi-personal-retro-${currentMonth}`) ? 'done' : 'this-week',
      title: 'Personal management retro',
      subtitle: 'What kind of manager have you been the last 6 months?',
      actionLabel: 'Reflect',
      actionType: 'dismiss'
    })
  }

  // ── Custom practices: fire on Today based on cadence ──
  for (const cp of customPractices) {
    const cpId = cp.id
    const shouldFireToday = (() => {
      switch (cp.cadence) {
        case 'daily': return !isWeekend
        case 'weekly': return isMonday
        case 'sprint': {
          if (!cadence.sprintStartDate) return false
          const sprintStart = new Date(cadence.sprintStartDate)
          const sprintMs = cadence.sprintLengthWeeks * 7 * 24 * 60 * 60 * 1000
          const elapsed = now.getTime() - sprintStart.getTime()
          if (elapsed < 0) return false
          const currentSprintDay = Math.floor((elapsed % sprintMs) / (1000 * 60 * 60 * 24))
          return currentSprintDay <= 1
        }
        case 'monthly': return isFirstWeek && dayOfMonth <= 3
        case 'quarterly': return isQuarterStart && dayOfMonth <= 3
        case 'semi-annual': return isSemiAnnual && dayOfMonth <= 3
        default: return false
      }
    })()

    if (shouldFireToday) {
      if (cp.perReport) {
        for (const r of reports) {
          const id = `custom-${cpId}-${r.name}`
          items.push({
            id,
            section: doneIds.has(id) ? 'done' : 'this-week',
            title: `${cp.name}: ${r.displayName}`,
            subtitle: cp.description || cp.frequency,
            reportName: r.name,
            actionLabel: 'Dismiss',
            actionType: 'dismiss'
          })
        }
      } else {
        const id = `custom-${cpId}`
        items.push({
          id,
          section: doneIds.has(id) ? 'done' : 'this-week',
          title: cp.name,
          subtitle: cp.description || cp.frequency,
          actionLabel: 'Dismiss',
          actionType: 'dismiss'
        })
      }
    }
  }

  // ── Daily interaction nudge ──
  if (!isWeekend && now.getHours() >= 14) {
    const todayStr = format(now, 'yyyy-MM-dd')
    const hasTodayMeeting = meetings.some(m => m.date === todayStr)
    const hasTodayFeedback = reports.some(r => r.lastFeedback === todayStr)
    const hadAnyTouchpoint = hasTodayMeeting || hasTodayFeedback
    if (!hadAnyTouchpoint) {
      items.push({
        id: `daily-interaction-${todayStr}`,
        section: doneIds.has(`daily-interaction-${todayStr}`) ? 'done' : 'this-week',
        title: 'One small interaction',
        subtitle: 'Say something human to someone on your team — a quick message, a PR compliment, a check-in',
        actionLabel: 'Done',
        actionType: 'dismiss'
      })
    }
  }

  // ── Coming Up: preview of next 2-3 weeks of playbook items ──
  const LOOKAHEAD_DAYS = 21
  for (let dayOffset = 1; dayOffset <= LOOKAHEAD_DAYS; dayOffset++) {
    const futureDate = new Date(now)
    futureDate.setDate(futureDate.getDate() + dayOffset)
    const futureDayIndex = getDay(futureDate)
    const futureDayName = dayNames[futureDayIndex]
    const futureDayOfMonth = getDate(futureDate)
    const futureMonth = getMonth(futureDate)
    const futureMonthStr = format(futureDate, 'yyyy-MM')
    const futureIsFirstWeek = futureDayOfMonth <= 7
    const futureIsMonday = futureDayIndex === 1
    const futureIsEndOfWeek = futureDayName === cadence.endOfWeekDay
    const futureIsWeekend = futureDayIndex === 0 || futureDayIndex === 6
    const futureDateLabel = format(futureDate, 'EEE, MMM d')

    // Upcoming 1:1s
    if (!futureIsWeekend) {
      const futureMeetings = reports.filter(r =>
        r.meetingDay && matchesMeetingDay(r.meetingDay, futureDayName)
      )
      for (const r of futureMeetings) {
        const id = `coming-up-1on1-${r.name}-${format(futureDate, 'yyyy-MM-dd')}`
        if (!doneIds.has(id)) {
          items.push({
            id,
            section: 'coming-up',
            title: `1:1 with ${r.displayName}`,
            subtitle: futureDateLabel,
            reportName: r.name,
            practiceLink: '/playbook?practice=one-on-one-prep',
            actionType: 'info'
          })
        }
      }
    }

    // Monday priorities
    if (futureIsMonday) {
      const id = `coming-up-priorities-${format(futureDate, 'yyyy-MM-dd')}`
      if (!doneIds.has(id)) {
        items.push({
          id,
          section: 'coming-up',
          title: 'Set weekly priorities',
          subtitle: futureDateLabel,
          practiceLink: '/playbook?practice=weekly-priorities',
          actionType: 'info'
        })
      }
    }

    // End-of-week reflection
    if (futureIsEndOfWeek) {
      const id = `coming-up-reflection-${format(futureDate, 'yyyy-MM-dd')}`
      if (!doneIds.has(id)) {
        items.push({
          id,
          section: 'coming-up',
          title: 'Weekly reflection',
          subtitle: futureDateLabel,
          practiceLink: '/playbook?practice=weekly-reflection',
          actionType: 'info'
        })
      }
    }

    // Sprint boundaries
    if (cadence.sprintStartDate) {
      const sprintStart = new Date(cadence.sprintStartDate)
      const sprintMs = cadence.sprintLengthWeeks * 7 * 24 * 60 * 60 * 1000
      const elapsed = futureDate.getTime() - sprintStart.getTime()

      if (elapsed >= 0) {
        const currentSprintDay = Math.floor((elapsed % sprintMs) / (1000 * 60 * 60 * 24))
        const daysInSprint = cadence.sprintLengthWeeks * 7

        if (currentSprintDay === 0) {
          const id = `coming-up-sprint-start-${format(futureDate, 'yyyy-MM-dd')}`
          if (!doneIds.has(id)) {
            items.push({
              id,
              section: 'coming-up',
              title: 'New sprint starts',
              subtitle: futureDateLabel,
              practiceLink: '/playbook?practice=sprint-start',
              actionType: 'info'
            })
          }
        }
        if (currentSprintDay === daysInSprint - 1) {
          const id = `coming-up-sprint-end-${format(futureDate, 'yyyy-MM-dd')}`
          if (!doneIds.has(id)) {
            items.push({
              id,
              section: 'coming-up',
              title: 'Sprint ends',
              subtitle: futureDateLabel,
              practiceLink: '/playbook?practice=sprint-end',
              actionType: 'info'
            })
          }
        }
      }
    }

    // Check-in week
    if (futureIsFirstWeek) {
      const isCheckInMonth =
        cadence.checkInFrequency === 'monthly' ||
        (cadence.checkInFrequency === 'bimonthly' && futureMonth % 2 === 0) ||
        (cadence.checkInFrequency === 'quarterly' && [0, 3, 6, 9].includes(futureMonth))

      if (isCheckInMonth && futureDayOfMonth === 1) {
        const id = `coming-up-checkins-${futureMonthStr}`
        if (!doneIds.has(id)) {
          items.push({
            id,
            section: 'coming-up',
            title: `Check-ins due (${reports.length} reports)`,
            subtitle: `Week of ${futureDateLabel}`,
            practiceLink: '/playbook?practice=monthly-checkin',
            actionType: 'info'
          })
        }
      }
    }

    // Monthly skip-level (first week)
    if (futureIsFirstWeek && futureDayOfMonth === 1) {
      const id = `coming-up-skip-level-${futureMonthStr}`
      if (!doneIds.has(id)) {
        items.push({
          id,
          section: 'coming-up',
          title: 'Skip-level 1:1',
          subtitle: `Week of ${futureDateLabel}`,
          practiceLink: '/playbook?practice=skip-level',
          actionType: 'info'
        })
      }
    }

    // Quarterly planning (first two weeks of quarter)
    const isQuarterStart = [0, 3, 6, 9].includes(futureMonth) && futureDayOfMonth <= 14
    if (isQuarterStart && futureDayOfMonth === 1) {
      const id = `coming-up-quarterly-${futureMonthStr}`
      if (!doneIds.has(id)) {
        items.push({
          id,
          section: 'coming-up',
          title: 'Quarterly planning & calibration',
          subtitle: `Week of ${futureDateLabel}`,
          practiceLink: '/playbook?practice=quarterly-okr',
          actionType: 'info'
        })
      }
    }

    // Semi-annual reviews
    const isSemiAnnual = [0, 6].includes(futureMonth) && futureDayOfMonth <= 14
    if (isSemiAnnual && futureDayOfMonth === 1) {
      const id = `coming-up-reviews-${futureMonthStr}`
      if (!doneIds.has(id)) {
        items.push({
          id,
          section: 'coming-up',
          title: `Performance reviews due (${reports.length} reports)`,
          subtitle: `Week of ${futureDateLabel}`,
          practiceLink: '/playbook?practice=semi-review',
          actionType: 'info'
        })
      }
    }
  }

  return items
}

export function Today() {
  const { overview, loading, error, refresh } = useTeamOverview()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const toast = useToast()
  const [meetings, setMeetings] = useState<MeetingEntry[]>([])
  const [teamActions, setTeamActions] = useState<TeamActionItem[]>([])
  const [customPractices, setCustomPractices] = useState<CustomPractice[]>([])
  const [disabledPractices, setDisabledPractices] = useState<string[]>([])
  const [snoozedPractices, setSnoozedPractices] = useState<Record<string, string>>({})
  const [snoozedActionItems, setSnoozedActionItems] = useState<Record<string, string>>({})
  const [ptoReports, setPtoReports] = useState<Record<string, string>>({})
  const [cadence, setCadence] = useState<CadenceSettings>({
    checkInFrequency: 'monthly',
    feedbackReminderDays: 14,
    sprintLengthWeeks: 2,
    endOfWeekDay: 'friday',
    sprintStartDate: '',
    staleActionDays: 7
  })
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
    new Set(['reflection', 'overdue', 'this-week'])
  )
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [prepExistsMap, setPrepExistsMap] = useState<Record<string, boolean>>({})

  const [teamActivity, setTeamActivity] = useState<TeamMemberActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [hasGithubOrgToken, setHasGithubOrgToken] = useState(false)
  const [activityExpanded, setActivityExpanded] = useState(true)
  const [expandedMembers, setExpandedMembers] = useState<Record<string, boolean>>({})
  const [expandedActivityItems, setExpandedActivityItems] = useState<Record<string, boolean>>({})

  const [activitySummary, setActivitySummary] = useState<string>(() => {
    try {
      const todayKey = format(new Date(), 'yyyy-MM-dd')
      return localStorage.getItem(`activity-summary-${todayKey}`) || ''
    } catch { return '' }
  })
  const [showRawActivity, setShowRawActivity] = useState(false)
  const activityAI = useAI()

  useEffect(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    localStorage.setItem(`today-done-${todayKey}`, JSON.stringify([...doneIds]))
  }, [doneIds])

  useEffect(() => {
    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key) continue
      let dateStr: string | null = null
      if (key.startsWith('today-done-')) {
        dateStr = key.replace('today-done-', '')
      } else if (key.startsWith('activity-summary-')) {
        dateStr = key.replace('activity-summary-', '')
      }
      if (!dateStr) continue
      const keyDate = new Date(dateStr + 'T00:00:00').getTime()
      if (now - keyDate > sevenDaysMs) {
        localStorage.removeItem(key)
      }
    }
  }, [])

  useEffect(() => {
    window.api.getTodayBootstrap().then(({ meetings: m, teamActionItems: ta }) => {
      setMeetings(m)
      setTeamActions(ta)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!settings) return
    setCadence({
      checkInFrequency: settings.checkInFrequency || 'monthly',
      feedbackReminderDays: settings.feedbackReminderDays ?? 14,
      sprintLengthWeeks: settings.sprintLengthWeeks ?? 2,
      endOfWeekDay: settings.endOfWeekDay || 'friday',
      sprintStartDate: settings.sprintStartDate || '',
      staleActionDays: settings.staleActionDays ?? 5
    })
    setCustomPractices(settings.customPractices || [])
    setDisabledPractices(settings.disabledPractices || [])
    const snoozed = settings.snoozedPractices || {}
    const now = new Date()
    const valid: Record<string, string> = {}
    for (const [id, dateStr] of Object.entries(snoozed)) {
      if (new Date(dateStr) > now) valid[id] = dateStr
    }
    setSnoozedPractices(valid)
    const snoozedAI = settings.snoozedActionItems || {}
    const validAI: Record<string, string> = {}
    for (const [id, dateStr] of Object.entries(snoozedAI)) {
      if (new Date(dateStr) > now) validAI[id] = dateStr
    }
    setSnoozedActionItems(validAI)
    setPtoReports(settings.ptoReports || {})
    setHasGithubOrgToken(settings.hasGithubOrgToken || false)
  }, [settings])

  useEffect(() => {
    const reps = overview?.reports
    if (!reps || reps.length === 0) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const paths = reps.map(r => `reports/${r.name}/prep/${today}.md`)
    window.api.getFilesContentBulk(paths).then(result => {
      const map: Record<string, boolean> = {}
      for (const r of reps) {
        map[r.name] = !!result[`reports/${r.name}/prep/${today}.md`]
      }
      setPrepExistsMap(map)
    }).catch(() => {})
  }, [overview])
  const fetchTeamActivity = useCallback(async () => {
    if (!hasGithubOrgToken) return
    setActivityLoading(true)
    try {
      const data = await window.api.getTeamActivity()
      setTeamActivity(data)
    } catch (err) {
      console.error(err)
    } finally {
      setActivityLoading(false)
    }
  }, [hasGithubOrgToken])

  useEffect(() => {
    fetchTeamActivity()
  }, [fetchTeamActivity])

  const generateActivitySummary = useCallback(async (data: TeamMemberActivity[]) => {
    const hasActivity = data.some(m => m.items.length > 0)
    if (!hasActivity && data.every(m => !m.error)) return

    let recentContext: Record<string, { date: string; source: string; title: string; summary: string }[]> = {}
    try {
      recentContext = await window.api.getRecentTeamContext(7)
    } catch { /* context unavailable is non-fatal */ }

    const now = new Date()
    const activityText = data.map(member => {
      const ptoExpiry = ptoReports[member.reportName]
      const onPto = ptoExpiry && new Date(ptoExpiry) > now
      const ptoLabel = onPto ? ` [ON PTO until ${new Date(ptoExpiry + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}]` : ''
      if (member.error) return `${member.displayName} (@${member.githubUsername})${ptoLabel}: Error fetching activity`
      if (member.items.length === 0) return `${member.displayName} (@${member.githubUsername})${ptoLabel}: No recent activity`
      const items = member.items.map(item => {
        const age = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        const roleLabel = item.role === 'commenter' ? 'reviewed' : 'authored'
        return `  - [${item.type.toUpperCase()}] ${item.title} (${item.repo}, ${item.state}, ${roleLabel}, ${age}d old, ${item.comments} comments) ${item.url}`
      }).join('\n')
      return `${member.displayName} (@${member.githubUsername})${ptoLabel}:\n${items}`
    }).join('\n\n')

    let contextText = ''
    const contextEntries = Object.entries(recentContext)
    if (contextEntries.length > 0) {
      const sections = contextEntries.map(([slug, notes]) => {
        const noteLines = notes.map(n => `  - ${n.date} (${n.source}): ${n.title}${n.summary ? ` — ${n.summary}` : ''}`).join('\n')
        return `${slug}:\n${noteLines}`
      }).join('\n\n')
      contextText = sections
    }

    const dateLabel = format(new Date(), 'EEEE, MMM d')

    try {
      const result = await activityAI.generate('summarize-team-activity', {
        activityData: activityText,
        recentContext: contextText || undefined,
        dateLabel
      })
      setActivitySummary(result)
      // Cache by date
      const todayKey = format(new Date(), 'yyyy-MM-dd')
      localStorage.setItem(`activity-summary-${todayKey}`, result)
    } catch (err) {
      console.error('[Activity Summary] AI generation failed:', err)
    }
  }, [activityAI, ptoReports])

  useEffect(() => {
    if (teamActivity.length > 0 && !activitySummary && !activityAI.streaming) {
      generateActivitySummary(teamActivity)
    }
  }, [teamActivity, activitySummary, activityAI.streaming, generateActivitySummary])

  useEffect(() => {
    if (teamActivity.length === 0) return
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    const storageKey = `activity-snapshots-saved-${todayKey}`
    if (localStorage.getItem(storageKey)) return
    localStorage.setItem(storageKey, 'true')

    const membersWithActivity = teamActivity.filter(m => m.items.length > 0 && !m.error)
    for (const member of membersWithActivity) {
      window.api.saveActivitySnapshot(member.reportName, todayKey, todayKey).catch(() => {})
    }
  }, [teamActivity])

  const reports = overview?.reports ?? []
  const reportByName = useMemo(() => new Map(reports.map(r => [r.name, r])), [reports])

  const filteredTeamActions = useMemo(() => {
    const now = new Date()
    return teamActions.filter(a => {
      const key = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
      const expiry = snoozedActionItems[key]
      if (expiry && new Date(expiry) > now) return false
      return true
    })
  }, [teamActions, snoozedActionItems])

  const items = useMemo(() => {
    const raw = computeTimelineItems(reports, meetings, cadence, doneIds, filteredTeamActions, customPractices)
    const all = raw
    return all.filter(item => {
      const practiceId = getPracticeIdForItem(item.id)
      if (!practiceId) return true
      if (disabledPractices.includes(practiceId)) return false
      const snoozeExpiry = snoozedPractices[practiceId]
      if (snoozeExpiry && new Date(snoozeExpiry) > new Date()) return false
      return true
    }).filter(item => {
      if (!item.reportName) return true
      const expiry = ptoReports[item.reportName]
      if (expiry && new Date(expiry) > new Date()) return false
      return true
    }).map(item => {
      if (item.actionType === 'prep' && item.reportName && prepExistsMap[item.reportName]) {
        return {
          ...item,
          title: `Review 1:1 prep for ${reportByName.get(item.reportName)?.displayName ?? item.reportName}`,
          subtitle: `Prep saved · ${reportByName.get(item.reportName)?.openActionItems ?? 0} open action items`,
          actionLabel: 'Review'
        }
      }
      return item
    })
  }, [reports, meetings, cadence, doneIds, filteredTeamActions, customPractices, disabledPractices, snoozedPractices, ptoReports, prepExistsMap, teamActivity])

  const sections: TimelineSection[] = ['reflection', 'overdue', 'this-week', 'coming-up', 'done']

  const itemsBySection = useMemo(() => {
    const grouped: Record<TimelineSection, TimelineItem[]> = {
      reflection: [], overdue: [], 'this-week': [], 'coming-up': [], done: []
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
    toast.success('Done ✓', undefined, {
      label: 'Undo',
      onClick: () => {
        setDoneIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    })
  }, [toast])

  const handleActionToggle = useCallback(async (action: TeamActionItem) => {
    if (!action.sourceFile || action.sourceLineNumber == null) return
    try {
      await window.api.toggleActionItem(action.sourceFile, action.sourceLineNumber)
      setTeamActions(prev => prev.map(item => {
        if (item.sourceFile === action.sourceFile && item.sourceLineNumber === action.sourceLineNumber) {
          return { ...item, completed: !item.completed }
        }
        return item
      }))
    } catch {
      toast.error('Failed to toggle action item')
      throw new Error('Failed to toggle action item')
    }
  }, [toast])

  // ── Stable callbacks for TimelineRow ──

  const handleToggleExpandedItem = useCallback((itemId: string) => {
    setExpandedItem(prev => prev === itemId ? null : itemId)
  }, [])

  const handleCancelExpand = useCallback(() => {
    setExpandedItem(null)
  }, [])

  const handlePrepDone = useCallback((itemId: string, reportName: string) => {
    setDoneIds(prev => { const next = new Set(prev); next.add(itemId); return next })
    setExpandedItem(null)
    setPrepExistsMap(prev => ({ ...prev, [reportName]: true }))
  }, [])

  const handlePrepCancel = useCallback((_reportName: string) => {
    setExpandedItem(null)
  }, [])

  const handleSnoozeAction = useCallback((actionKey: string, untilDate: string) => {
    setSnoozedActionItems(prev => {
      const next = { ...prev, [actionKey]: untilDate }
      window.api.saveSettings({ snoozedActionItems: next }).catch(() => {})
      return next
    })
  }, [])

  const handleFeedbackDone = useCallback((itemId: string) => {
    setDoneIds(prev => { const next = new Set(prev); next.add(itemId); return next })
    setExpandedItem(null)
    refresh()
  }, [refresh])

  const handlePromptDone = useCallback((itemId: string) => {
    setDoneIds(prev => { const next = new Set(prev); next.add(itemId); return next })
    setExpandedItem(null)
  }, [])

  const toggleSection = useCallback((section: TimelineSection) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }, [])

  const totalActive = items.filter(i => i.section !== 'done' && i.section !== 'coming-up').length
  const doneCount = itemsBySection.done.length

  const headerSummary = useMemo(() => {
    if (totalActive === 0) return 'All clear'
    const parts: string[] = []
    const overdueCount = itemsBySection.overdue.length
    const reflectionCount = itemsBySection.reflection.length
    const thisWeekCount = itemsBySection['this-week'].length
    if (overdueCount > 0) parts.push(`${overdueCount} overdue`)
    if (thisWeekCount > 0) parts.push(`${thisWeekCount} this week`)
    if (reflectionCount > 0) parts.push(`${reflectionCount} reflection`)
    return parts.join(' · ') || 'All clear'
  }, [totalActive, itemsBySection])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="space-y-2">
          <div className="skeleton h-8 w-56 rounded" />
          <div className="skeleton h-4 w-72 rounded" />
        </div>
        {[1,2,3].map(i => (
          <div key={i} className="bg-surface rounded-xl border border-border p-5 space-y-3">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="space-y-2">
              <div className="skeleton h-12 w-full rounded-lg" />
              <div className="skeleton h-12 w-full rounded-lg" />
            </div>
          </div>
        ))}
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
      <div className="max-w-2xl mx-auto py-12 animate-fade-in">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-brand/15 flex items-center justify-center mx-auto mb-5">
            <Zap className="w-8 h-8 text-brand" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Welcome to Manager-inator</h1>
          <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto">
            Your AI-powered management dashboard. Let's get you set up — it only takes a few minutes.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/people')}
            className="w-full flex items-center gap-4 p-5 bg-surface rounded-xl border border-brand/20 hover:border-brand/40 hover:bg-surface-raised/70 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0 group-hover:bg-brand/20 transition-colors">
              <UserPlus className="w-5 h-5 text-brand-light" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zinc-200">Add your direct reports</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Add the people you manage — this is how the app organizes everything</p>
            </div>
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-light bg-brand/10 rounded-full shrink-0">
              Start here
            </div>
          </button>

          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-4 p-5 bg-surface rounded-xl border border-border hover:border-zinc-600 hover:bg-surface-raised/70 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-800/50 flex items-center justify-center shrink-0 group-hover:bg-zinc-700/50 transition-colors">
              <Settings className="w-5 h-5 text-zinc-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zinc-200">Configure settings</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Set your AI model, management cadence, and optionally connect GitHub for team activity</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/search')}
            className="w-full flex items-center gap-4 p-5 bg-surface rounded-xl border border-border hover:border-zinc-600 hover:bg-surface-raised/70 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-800/50 flex items-center justify-center shrink-0 group-hover:bg-zinc-700/50 transition-colors">
              <FileText className="w-5 h-5 text-zinc-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zinc-200">Process meeting transcripts</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Paste or drag meeting transcripts to extract summaries, action items, and feedback with AI</p>
            </div>
          </button>
        </div>

        <div className="mt-8 p-4 bg-surface rounded-xl border border-border">
          <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">How it works</h3>
          <div className="space-y-2.5 text-sm text-zinc-500">
            <p>1. <span className="text-zinc-300">Add your direct reports</span> — profiles, meeting days, and roles</p>
            <p>2. <span className="text-zinc-300">Process transcripts</span> — AI extracts summaries, action items, and feedback</p>
            <p>3. <span className="text-zinc-300">Stay on top of everything</span> — this page becomes your daily action plan</p>
          </div>
        </div>
      </div>
    )
  }

  const activeSections = sections.filter(s => itemsBySection[s].length > 0)

  return (
    <div
      className="max-w-3xl mx-auto space-y-6 animate-fade-in relative"
    >

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{getGreeting().text} {getGreeting().emoji}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {format(new Date(), 'EEEE, MMMM d')} · {headerSummary}
          </p>
          <p className="text-xs text-zinc-600 mt-1 italic">{getDailyMotivation()}</p>
        </div>
        <button
          onClick={() => {
            refresh()
    window.api.getTodayBootstrap().then(({ meetings: m, teamActionItems: ta }) => {
      setMeetings(m)
      setTeamActions(ta)
    }).catch(() => {})
            if (hasGithubOrgToken) fetchTeamActivity()
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {totalActive === 0 && doneCount === 0 && itemsBySection['coming-up'].length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/60" aria-hidden="true" />
          </div>
          <p className="text-lg font-medium text-zinc-200">Zero inbox. Zero overdue. Zero stress. 🧘</p>
          <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto leading-relaxed">
            You&apos;re fully caught up. Go grab a coffee, take a walk, or just enjoy the rare calm.
          </p>
        </div>
      )}

      {totalActive === 0 && doneCount > 0 && itemsBySection['coming-up'].length === 0 && (
        <div className="bg-gradient-to-b from-emerald-500/5 to-transparent rounded-xl border border-emerald-500/20 p-8 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-lg font-medium text-zinc-200">Crushed it 💪</p>
          <p className="text-sm text-zinc-500 mt-1.5">
            {doneCount} item{doneCount !== 1 ? 's' : ''} knocked out today. Your team is lucky to have you.
          </p>
        </div>
      )}

      {hasGithubOrgToken && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden border-l-[3px] border-l-purple-500/50 transition-all">
          <div
            onClick={() => setActivityExpanded(!activityExpanded)}
            className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-surface-raised/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-purple-500/10">
                <GitPullRequest className="w-4 h-4 text-purple-400" aria-hidden="true" />
              </div>
              <span className="text-sm font-semibold text-zinc-200">Team Activity</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-surface-raised rounded-lg p-0.5 text-xs">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowRawActivity(false) }}
                  className={`px-2 py-1 rounded-md transition-colors ${!showRawActivity ? 'bg-brand/15 text-brand-light' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Summary
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowRawActivity(true) }}
                  className={`px-2 py-1 rounded-md transition-colors ${showRawActivity ? 'bg-brand/15 text-brand-light' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Raw
                </button>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (showRawActivity) {
                    fetchTeamActivity()
                  } else {
                    generateActivitySummary(teamActivity)
                  }
                }}
                className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                title={showRawActivity ? 'Refresh activity' : 'Regenerate summary'}
              >
                <RefreshCw className={`w-4 h-4 ${(activityLoading || activityAI.streaming) ? 'animate-spin' : ''}`} />
              </button>
              {activityExpanded
                ? <ChevronDown className="w-4 h-4 text-zinc-600" aria-hidden="true" />
                : <ChevronRight className="w-4 h-4 text-zinc-600" aria-hidden="true" />
              }
            </div>
          </div>

          {activityExpanded && (
            <div className="border-t border-border animate-slide-down">
              {showRawActivity ? (
                activityLoading ? (
                <div className="p-5 space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-surface-raised shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-surface-raised rounded w-1/4" />
                        <div className="h-3 bg-surface-raised rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : teamActivity.length === 0 || teamActivity.every(m => m.items.length === 0 && !m.error) ? (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  No GitHub activity detected recently
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {teamActivity.map(member => {
                    const isMemberExpanded = expandedMembers[member.reportName]
                    const isEmpty = member.items.length === 0
                    
                    return (
                      <div key={member.reportName}>
                        <div 
                          className="flex items-center justify-between px-5 py-3.5 group cursor-pointer hover:bg-surface-raised/40 transition-all duration-150"
                          onClick={() => {
                            if (!isEmpty && !member.error) {
                              setExpandedMembers(prev => ({
                                ...prev,
                                [member.reportName]: !prev[member.reportName]
                              }))
                            }
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand/15 flex items-center justify-center text-sm font-medium text-brand-light shrink-0">
                              {member.displayName.charAt(0)}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-zinc-200">{member.displayName}</div>
                              {member.githubUsername && <div className="text-xs text-zinc-500">@{member.githubUsername}</div>}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {member.error ? (
                              <span className="text-xs font-medium text-warning px-2 py-1 bg-warning/10 rounded-md truncate max-w-[300px]">{member.error}</span>
                            ) : isEmpty ? (
                              <span className="text-xs text-zinc-500">No recent activity</span>
                            ) : (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
                                {formatActivityCounts(member.items)}
                              </span>
                            )}
                            
                            {!isEmpty && !member.error && (
                              isMemberExpanded 
                                ? <ChevronDown className="w-4 h-4 text-zinc-600" /> 
                                : <ChevronRight className="w-4 h-4 text-zinc-600" />
                            )}
                          </div>
                        </div>

                        {isMemberExpanded && !isEmpty && !member.error && (
                          <div className="bg-surface-raised/20 border-t border-border/30 animate-slide-down">
                            {member.items.map(item => {
                              const hasComments = (item.reviewComments && item.reviewComments.length > 0) || (item.issueComments && item.issueComments.length > 0)
                              const isExpanded = expandedActivityItems[`${member.reportName}-${item.id}`]

                              return (
                                <div key={item.id}>
                                  <div 
                                    className="flex items-start gap-3 px-5 py-3 border-b border-border/30 last:border-b-0 hover:bg-surface-raised/40 cursor-pointer"
                                    onClick={(e) => {
                                      if (hasComments) {
                                        e.stopPropagation()
                                        setExpandedActivityItems(prev => ({
                                          ...prev,
                                          [`${member.reportName}-${item.id}`]: !prev[`${member.reportName}-${item.id}`]
                                        }))
                                      } else {
                                        window.open(item.url, '_blank')
                                      }
                                    }}
                                  >
                                    <div className="mt-0.5 shrink-0">
                                      {item.type === 'pr' ? (
                                        <GitPullRequest className="w-4 h-4 text-purple-400" />
                                      ) : item.type === 'discussion' ? (
                                        <MessageSquare className="w-4 h-4 text-blue-400" />
                                      ) : (
                                        <CircleDot className="w-4 h-4 text-zinc-400" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-zinc-200 truncate group-hover:text-brand-light transition-colors">
                                        {item.title}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                                        <span className="truncate">{item.repo}</span>
                                        <span>·</span>
                                        <span>{formatRelativeDate(new Date(item.updatedAt)).toLowerCase()}</span>
                                        <span>·</span>
                                        <span className={
                                          item.state === 'open' ? 'text-emerald-400' :
                                          item.state === 'merged' ? 'text-purple-400' : 'text-zinc-400'
                                        }>
                                          {item.state.charAt(0).toUpperCase() + item.state.slice(1)}
                                        </span>
                                        <span>·</span>
                                        <span className={item.role === 'commenter' ? 'text-amber-400' : 'text-blue-400'}>
                                          {item.role === 'commenter' ? 'Reviewer' : 'Author'}
                                        </span>
                                        {hasComments && (
                                          <>
                                            <span>·</span>
                                            <span className="text-brand-light">{item.comments} comment{item.comments !== 1 ? 's' : ''}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                      {hasComments && (
                                        isExpanded
                                          ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
                                          : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                                      )}
                                      <button
                                        className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                                        title="Open on GitHub"
                                        onClick={(e) => { e.stopPropagation(); window.open(item.url, '_blank') }}
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {isExpanded && hasComments && (
                                    <div className="bg-zinc-900/40 border-b border-border/30 px-5 py-2.5 space-y-2 animate-slide-down">
                                      {item.reviewComments?.map((review, i) => (
                                        <div key={`review-${i}`} className="flex items-start gap-2 text-xs">
                                          <span className="font-medium text-zinc-400 shrink-0">@{review.author}</span>
                                          {review.reviewState && (
                                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                                              review.reviewState === 'APPROVED' ? 'bg-emerald-500/15 text-emerald-400' :
                                              review.reviewState === 'CHANGES_REQUESTED' ? 'bg-amber-500/15 text-amber-400' :
                                              'bg-zinc-500/15 text-zinc-400'
                                            }`}>
                                              {review.reviewState.replace('_', ' ')}
                                            </span>
                                          )}
                                          <span className="text-zinc-500 line-clamp-2">{review.body.split('\n')[0]}</span>
                                        </div>
                                      ))}
                                      {item.issueComments?.map((comment, i) => (
                                        <div key={`comment-${i}`} className="flex items-start gap-2 text-xs">
                                          <span className="font-medium text-zinc-400 shrink-0">@{comment.author}</span>
                                          <span className="text-zinc-500 line-clamp-2">{comment.body.split('\n')[0]}</span>
                                        </div>
                                      ))}
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
              ) : (
                <div className="px-5 py-4">
                  {activityAI.streaming ? (
                    <div className="prose-dark text-sm">
                      <div className="text-sm whitespace-pre-wrap text-zinc-300">{activityAI.streamedText || 'Generating team activity summary...'}</div>
                    </div>
                  ) : activitySummary ? (
                    <div className="prose-dark text-sm">
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{activitySummary}</ReactMarkdown>
                    </div>
                  ) : activityLoading ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-500 py-4">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Loading activity data...
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500 py-4">
                      No activity data available. Click refresh to load.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSections.filter(s => s !== 'coming-up' && s !== 'done').map(section => {
        const config = sectionConfig[section]
        const sectionItems = itemsBySection[section]
        const isExpanded = expandedSections.has(section)
        const Icon = config.icon

        return (
          <div key={section} className={`bg-surface rounded-xl border border-border overflow-visible border-l-[3px] ${config.border} transition-all`}>
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
                {sectionItems.map((item, idx) => (
                  <div key={item.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(idx * 40, 200)}ms`, animationFillMode: 'both' }}>
                    <TimelineRow
                      item={item}
                      isItemExpanded={expandedItem === item.id}
                      reportByName={reportByName}
                      navigate={navigate}
                      onToggleExpand={handleToggleExpandedItem}
                      onCancelExpand={handleCancelExpand}
                      markDone={markDone}
                      onPrepDone={handlePrepDone}
                      onPrepCancel={handlePrepCancel}
                      handleActionToggle={handleActionToggle}
                      onSnooze={handleSnoozeAction}
                      onFeedbackDone={handleFeedbackDone}
                      onPromptDone={handlePromptDone}
                      teamActivity={teamActivity}
                      reports={reports}
                      teamActions={filteredTeamActions}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {activeSections.filter(s => s === 'coming-up' || s === 'done').map(section => {
        const config = sectionConfig[section]
        const sectionItems = itemsBySection[section]
        const isExpanded = expandedSections.has(section)
        const Icon = config.icon

        return (
          <div key={section} className={`bg-surface rounded-xl border border-border overflow-visible border-l-[3px] ${config.border} transition-all`}>
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
                {sectionItems.map((item, idx) => (
                  <div key={item.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(idx * 40, 200)}ms`, animationFillMode: 'both' }}>
                    <TimelineRow
                      item={item}
                      isItemExpanded={expandedItem === item.id}
                      reportByName={reportByName}
                      navigate={navigate}
                      onToggleExpand={handleToggleExpandedItem}
                      onCancelExpand={handleCancelExpand}
                      markDone={markDone}
                      onPrepDone={handlePrepDone}
                      onPrepCancel={handlePrepCancel}
                      handleActionToggle={handleActionToggle}
                      onSnooze={handleSnoozeAction}
                      onFeedbackDone={handleFeedbackDone}
                      onPromptDone={handlePromptDone}
                      teamActivity={teamActivity}
                      reports={reports}
                      teamActions={filteredTeamActions}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Memoized TimelineRow ──

interface TimelineRowProps {
  item: TimelineItem
  isItemExpanded: boolean
  reportByName: Map<string, ReportStatus>
  navigate: (path: string) => void
  onToggleExpand: (itemId: string) => void
  onCancelExpand: () => void
  markDone: (id: string) => void
  onPrepDone: (itemId: string, reportName: string) => void
  onPrepCancel: (reportName: string) => void
  handleActionToggle: (action: TeamActionItem) => Promise<void>
  onSnooze: (actionKey: string, untilDate: string) => void
  onFeedbackDone: (itemId: string) => void
  onPromptDone: (itemId: string) => void
  teamActivity: TeamMemberActivity[]
  reports: ReportStatus[]
  teamActions: TeamActionItem[]
}

const TimelineRow = memo(function TimelineRow({
  item,
  isItemExpanded,
  reportByName,
  navigate,
  onToggleExpand,
  onCancelExpand,
  markDone,
  onPrepDone,
  onPrepCancel,
  handleActionToggle,
  onSnooze,
  onFeedbackDone,
  onPromptDone,
  teamActivity,
  reports,
  teamActions
}: TimelineRowProps) {
  const handleRowClick = useCallback(() => {
    if (item.actionType === 'navigate' && item.route) {
      navigate(item.route)
    } else {
      onToggleExpand(item.id)
    }
  }, [item.actionType, item.route, item.id, navigate, onToggleExpand])

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <div
        className="flex items-center gap-3 px-5 py-3.5 group cursor-pointer hover:bg-surface-raised/40 transition-all duration-150"
        onClick={handleRowClick}
      >
        {item.reportName ? (
          <div className="w-7 h-7 rounded-full bg-brand/15 flex items-center justify-center text-xs font-medium text-brand-light shrink-0">
            {reportByName.get(item.reportName)?.displayName.charAt(0) ?? '?'}
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

        {item.section !== 'done' && item.actionType !== 'info' && (
          <div className="flex items-center gap-2 shrink-0">
            {item.practiceLink && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(item.practiceLink!)
                }}
                className="p-1 text-zinc-600 hover:text-brand-light transition-colors opacity-0 group-hover:opacity-100"
                aria-label="View in Playbook"
                title="View in Playbook"
              >
                <BookOpen className="w-3.5 h-3.5" />
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
            {item.actionLabel && (item.actionType === 'prep' || item.actionType === 'inline-actions' || item.actionType === 'prompt' || item.actionType === 'feedback') && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand(item.id)
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
        {item.actionType === 'info' && item.practiceLink && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate(item.practiceLink!)
              }}
              className="p-1 text-zinc-600 hover:text-brand-light transition-colors opacity-0 group-hover:opacity-100"
              aria-label="View in Playbook"
              title="View in Playbook"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {isItemExpanded && item.actionType === 'prep' && item.reportName && (
        <div className="px-5 pb-4 border-t border-border/30 animate-slide-down">
          <InlinePrep
            reportName={item.reportName}
            onDone={() => onPrepDone(item.id, item.reportName!)}
            onCancel={() => onPrepCancel(item.reportName!)}
          />
        </div>
      )}

      {isItemExpanded && item.actionType === 'inline-actions' && item.staleActionItems && (
        <div className="px-5 pb-4 border-t border-border/30 animate-slide-down">
          <InlineActions
            reportName={item.reportName ?? ''}
            actions={item.staleActionItems}
            onDone={() => markDone(item.id)}
            onCancel={onCancelExpand}
            onToggleAction={handleActionToggle}
            onSnooze={onSnooze}
          />
        </div>
      )}

      {isItemExpanded && item.actionType === 'prompt' && item.promptType && (
        <div className="px-5 pb-4 border-t border-border/30 animate-slide-down">
          <InlinePrompt
            promptType={item.promptType}
            onDone={() => onPromptDone(item.id)}
            onCancel={onCancelExpand}
            teamActivity={teamActivity}
            reports={reports}
            teamActions={teamActions}
          />
        </div>
      )}

      {isItemExpanded && item.actionType === 'feedback' && item.reportName && (
        <div className="px-5 pb-4 border-t border-border/30 animate-slide-down">
          <InlineFeedback
            reportName={item.reportName}
            displayName={reportByName.get(item.reportName)?.displayName ?? item.reportName}
            onDone={() => onFeedbackDone(item.id)}
            onCancel={onCancelExpand}
          />
        </div>
      )}
    </div>
  )
})
