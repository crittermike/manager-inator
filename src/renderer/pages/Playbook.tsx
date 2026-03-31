import { useState, useEffect, useMemo, useRef } from 'react'
import { useTeamOverview, useSettings } from '../hooks/useData'
import { useSearchParams } from 'react-router-dom'
import { format, addDays, getDay, getDate, getMonth, differenceInDays } from 'date-fns'
import type { CadenceSettings, ReportStatus, CadenceType, CustomPractice, DayOfWeek, CheckInFrequency, PracticeSchedule } from '../../shared/types'
import { matchesMeetingDay } from '../utils/meetingDay'
import { useToast } from '../components/common/Toast'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  BellOff,
  Bell,
  Pencil,
  Trash2,
  Plus
} from 'lucide-react'

type Practice = CustomPractice

interface TimelineEvent {
  date: Date
  practiceId: string
  label: string
  cadence: CadenceType
  reportName?: string
}

const cadenceColors: Record<CadenceType, { dot: string; bg: string; text: string; border: string }> = {
  daily: { dot: 'bg-zinc-400', bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' },
  weekly: { dot: 'bg-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  sprint: { dot: 'bg-blue-400', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  monthly: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  quarterly: { dot: 'bg-purple-400', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  'semi-annual': { dot: 'bg-rose-400', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
}

const cadenceLabels: Record<CadenceType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  sprint: 'Every Sprint',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Twice a Year',
}

const practices: Practice[] = [
  {
    id: 'daily-prs',
    name: 'Read team PRs',
    description: 'Skim open pull requests for context. You don\'t need to review every one — just know what\'s moving.',
    cadence: 'daily',
    frequency: 'Every workday',
    trigger: 'Workday starts',
    perReport: false,
  },
  {
    id: 'daily-blockers',
    name: 'Check for blockers',
    description: 'Scan Slack, standup notes, or your task board for anyone stuck. Five minutes of unblocking saves hours.',
    cadence: 'daily',
    frequency: 'Every workday',
    trigger: 'Workday starts',
    perReport: false,
  },
  {
    id: 'daily-interaction',
    name: 'One small interaction',
    description: 'Say something human to someone on your team. A quick message, a compliment on a PR, a check-in. Presence compounds.',
    cadence: 'daily',
    frequency: 'Every workday',
    trigger: 'Workday starts',
    perReport: false,
  },
  {
    id: 'weekly-priorities',
    name: 'Set weekly priorities',
    description: 'Start the week by writing down your most important goals. Keeps you focused and gives you something to measure against on Friday.',
    cadence: 'weekly',
    frequency: 'Every Monday',
    trigger: 'Monday arrives',
    perReport: false,
  },
  {
    id: 'one-on-one-prep',
    name: '1:1 prep',
    description: 'Review open action items, recent feedback, and last meeting notes before each 1:1. Shows up the day before or morning of.',
    cadence: 'weekly',
    frequency: 'Before each 1:1',
    trigger: '1:1 is tomorrow or today',
    perReport: true,
  },
  {
    id: 'weekly-reflection',
    name: 'Weekly reflection',
    description: 'Review the week: what shipped, what is at risk, what you learned. Check if every report got feedback this week.',
    cadence: 'weekly',
    frequency: 'End-of-week day',
    trigger: 'End-of-week day arrives',
    perReport: false,
  },
  {
    id: 'feedback-gap',
    name: 'Feedback gap check',
    description: 'Flag reports who have not received feedback recently. Catch blind spots before they compound.',
    cadence: 'weekly',
    frequency: 'End-of-week day',
    trigger: 'No feedback logged in configured threshold',
    perReport: true,
  },
  {
    id: 'sprint-start',
    name: 'Sprint kickoff',
    description: 'Set the sprint goal and flag capacity concerns. Align the team on what success looks like for this cycle.',
    cadence: 'sprint',
    frequency: 'First day of sprint',
    trigger: 'Sprint boundary reached',
    perReport: false,
  },
  {
    id: 'sprint-end',
    name: 'Sprint retro',
    description: 'Run a retro or check in with the team on how the sprint went. Continuous improvement requires regular reflection.',
    cadence: 'sprint',
    frequency: 'Last day of sprint',
    trigger: 'Sprint boundary reached',
    perReport: false,
  },
  {
    id: 'monthly-checkin',
    name: 'Career/growth check-in',
    description: 'Separate from weekly 1:1s. Dedicated conversation about growth, career trajectory, and longer-term concerns.',
    cadence: 'monthly',
    frequency: 'First week of each month',
    trigger: 'No check-in logged in 30+ days',
    perReport: true,
  },
  {
    id: 'skip-level',
    name: 'Skip-level 1:1',
    description: 'Schedule or prep for your 1:1 with your own manager. Stay aligned on priorities and get support.',
    cadence: 'monthly',
    frequency: 'First week of each month',
    trigger: 'First week of month arrives',
    perReport: false,
  },
  {
    id: 'peer-sync',
    name: 'Peer EM sync',
    description: 'Connect with a peer engineering manager. Trade advice, share notes, stay connected to the broader org.',
    cadence: 'monthly',
    frequency: 'Mid-month',
    trigger: 'Mid-month arrives',
    perReport: false,
  },
  {
    id: 'quarterly-okr',
    name: 'OKR/initiative review',
    description: 'Review and refresh goals for the quarter. Make sure the team is working on the right things.',
    cadence: 'quarterly',
    frequency: 'First two weeks of quarter',
    trigger: 'Quarter start arrives',
    perReport: false,
  },
  {
    id: 'quarterly-calibration',
    name: 'Performance calibration prep',
    description: 'Aggregate feedback, 1:1 notes, and action items for each report into a calibration packet. Prepare for fair evaluation.',
    cadence: 'quarterly',
    frequency: 'First two weeks of quarter',
    trigger: 'Quarter start arrives',
    perReport: true,
  },
  {
    id: 'quarterly-health',
    name: 'Team health check',
    description: 'Is anyone burning out? Bored? On the wrong work? Step back and assess the human side of your team.',
    cadence: 'quarterly',
    frequency: 'First two weeks of quarter',
    trigger: 'Quarter start arrives',
    perReport: false,
  },
  {
    id: 'quarterly-hiring',
    name: 'Hiring plan review',
    description: 'If you lost someone tomorrow, what would hurt most? Keep your hiring plan current and your contingencies sharp.',
    cadence: 'quarterly',
    frequency: 'First two weeks of quarter',
    trigger: 'Quarter start arrives',
    perReport: false,
  },
  {
    id: 'semi-review',
    name: 'Written performance review',
    description: 'Generate a review draft from the past 6 months of artifacts. Start the formal review process with substance.',
    cadence: 'semi-annual',
    frequency: 'January & July',
    trigger: 'Semi-annual period starts',
    perReport: true,
  },
  {
    id: 'semi-1on1-format',
    name: '1:1 format check',
    description: 'Ask each report: is our 1:1 working for you? Formats go stale. Refresh them before they become useless.',
    cadence: 'semi-annual',
    frequency: 'January & July',
    trigger: 'Semi-annual period starts',
    perReport: false,
  },
  {
    id: 'semi-personal-retro',
    name: 'Personal management retro',
    description: 'What kind of manager have you been the last 6 months? Honest self-assessment keeps you improving.',
    cadence: 'semi-annual',
    frequency: 'January & July',
    trigger: 'Semi-annual period starts',
    perReport: false,
  },
]

function computeTimelineEvents(
  reports: ReportStatus[],
  cadence: CadenceSettings,
  daysAhead: number,
  customPractices: CustomPractice[] = [],
  practiceSchedules: Record<string, PracticeSchedule> = {}
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const now = new Date()
  const endDate = addDays(now, daysAhead)
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

  const schedulablePractices: Record<string, { label: string; cadence: CadenceType; perReport: boolean }> = {
    'skip-level': { label: 'Skip-level 1:1', cadence: 'monthly', perReport: false },
    'monthly-checkin': { label: `Check-ins due (${reports.length})`, cadence: 'monthly', perReport: false },
    'peer-sync': { label: 'Peer EM sync', cadence: 'monthly', perReport: false },
    'quarterly-okr': { label: 'Quarterly planning', cadence: 'quarterly', perReport: false },
    'quarterly-health': { label: 'Team health check', cadence: 'quarterly', perReport: false },
    'quarterly-hiring': { label: 'Hiring plan review', cadence: 'quarterly', perReport: false },
    'quarterly-calibration': { label: 'Calibration', cadence: 'quarterly', perReport: true },
    'semi-review': { label: 'Performance reviews', cadence: 'semi-annual', perReport: true },
    'semi-1on1-format': { label: '1:1 format check', cadence: 'semi-annual', perReport: false },
    'semi-personal-retro': { label: 'Personal retro', cadence: 'semi-annual', perReport: false },
  }

  const scheduledPracticeIds = new Set<string>()

  for (const [practiceId, schedule] of Object.entries(practiceSchedules)) {
    const info = schedulablePractices[practiceId]
    if (!info || !schedule.anchorDate || !schedule.intervalDays) continue
    scheduledPracticeIds.add(practiceId)

    const anchor = new Date(schedule.anchorDate + 'T00:00:00')
    const interval = schedule.intervalDays

    const msSinceAnchor = now.getTime() - anchor.getTime()
    const daysSinceAnchor = Math.floor(msSinceAnchor / (1000 * 60 * 60 * 24))
    const periodsElapsed = daysSinceAnchor >= 0 ? Math.floor(daysSinceAnchor / interval) : Math.ceil(daysSinceAnchor / interval) - 1
    const firstOccurrence = addDays(anchor, periodsElapsed * interval)

    for (let i = 0; i <= Math.ceil(daysAhead / interval) + 1; i++) {
      const d = addDays(firstOccurrence, i * interval)
      if (d < addDays(now, -1)) continue
      if (d > endDate) break

      if (info.perReport) {
        for (const r of reports) {
          events.push({ date: d, practiceId, label: `${info.label}: ${r.displayName}`, cadence: info.cadence, reportName: r.name })
        }
      } else {
        events.push({ date: d, practiceId, label: info.label, cadence: info.cadence })
      }
    }
  }

  for (let offset = 0; offset <= daysAhead; offset++) {
    const d = addDays(now, offset)
    const dayIndex = getDay(d)
    const dayName = dayNames[dayIndex]
    const dayOfMonth = getDate(d)
    const month = getMonth(d)
    const isFirstWeek = dayOfMonth <= 7
    const isMonday = dayIndex === 1
    const isEndOfWeek = dayName === cadence.endOfWeekDay
    const isWeekend = dayIndex === 0 || dayIndex === 6
    const isQuarterStart = [0, 3, 6, 9].includes(month) && dayOfMonth <= 14
    const isSemiAnnual = [0, 6].includes(month) && dayOfMonth <= 14

    if (!isWeekend) {
      events.push({ date: d, practiceId: 'daily-prs', label: 'Read team PRs', cadence: 'daily' })
      events.push({ date: d, practiceId: 'daily-blockers', label: 'Check for blockers', cadence: 'daily' })
      events.push({ date: d, practiceId: 'daily-interaction', label: 'One small interaction', cadence: 'daily' })

      for (const r of reports) {
        if (r.meetingDay && matchesMeetingDay(r.meetingDay, dayName)) {
          events.push({ date: d, practiceId: 'one-on-one-prep', label: `1:1 with ${r.displayName}`, cadence: 'weekly', reportName: r.name })
        }
      }
    }

    if (isMonday) {
      events.push({ date: d, practiceId: 'weekly-priorities', label: 'Set weekly priorities', cadence: 'weekly' })
    }

    if (isEndOfWeek) {
      events.push({ date: d, practiceId: 'weekly-reflection', label: 'Weekly reflection', cadence: 'weekly' })
    }

    if (cadence.sprintStartDate) {
      const sprintStart = new Date(cadence.sprintStartDate)
      const sprintMs = cadence.sprintLengthWeeks * 7 * 24 * 60 * 60 * 1000
      const elapsed = d.getTime() - sprintStart.getTime()
      const currentSprintDay = Math.floor((elapsed % sprintMs) / (1000 * 60 * 60 * 24))
      const daysInSprint = cadence.sprintLengthWeeks * 7

      if (currentSprintDay === 0) {
        events.push({ date: d, practiceId: 'sprint-start', label: 'Sprint kickoff', cadence: 'sprint' })
      }
      if (currentSprintDay === daysInSprint - 1) {
        events.push({ date: d, practiceId: 'sprint-end', label: 'Sprint retro', cadence: 'sprint' })
      }
    }

    if (!scheduledPracticeIds.has('skip-level') && isFirstWeek && dayOfMonth === 1) {
      events.push({ date: d, practiceId: 'skip-level', label: 'Skip-level 1:1', cadence: 'monthly' })
    }

    if (!scheduledPracticeIds.has('monthly-checkin') && isFirstWeek && dayOfMonth === 1) {
      const isCheckInMonth =
        cadence.checkInFrequency === 'monthly' ||
        (cadence.checkInFrequency === 'bimonthly' && month % 2 === 0) ||
        (cadence.checkInFrequency === 'quarterly' && [0, 3, 6, 9].includes(month))
      if (isCheckInMonth) {
        events.push({ date: d, practiceId: 'monthly-checkin', label: `Check-ins due (${reports.length})`, cadence: 'monthly' })
      }
    }

    if (!scheduledPracticeIds.has('peer-sync') && dayOfMonth === 15) {
      events.push({ date: d, practiceId: 'peer-sync', label: 'Peer EM sync', cadence: 'monthly' })
    }

    if (isQuarterStart && dayOfMonth === 1) {
      if (!scheduledPracticeIds.has('quarterly-okr')) {
        events.push({ date: d, practiceId: 'quarterly-okr', label: 'Quarterly planning', cadence: 'quarterly' })
      }
      if (!scheduledPracticeIds.has('quarterly-health')) {
        events.push({ date: d, practiceId: 'quarterly-health', label: 'Team health check', cadence: 'quarterly' })
      }
      if (!scheduledPracticeIds.has('quarterly-hiring')) {
        events.push({ date: d, practiceId: 'quarterly-hiring', label: 'Hiring plan review', cadence: 'quarterly' })
      }
      if (!scheduledPracticeIds.has('quarterly-calibration')) {
        for (const r of reports) {
          events.push({ date: d, practiceId: 'quarterly-calibration', label: `Calibration: ${r.displayName}`, cadence: 'quarterly', reportName: r.name })
        }
      }
    }

    if (isSemiAnnual && dayOfMonth === 1) {
      if (!scheduledPracticeIds.has('semi-review')) {
        events.push({ date: d, practiceId: 'semi-review', label: 'Performance reviews', cadence: 'semi-annual' })
      }
      if (!scheduledPracticeIds.has('semi-1on1-format')) {
        events.push({ date: d, practiceId: 'semi-1on1-format', label: '1:1 format check', cadence: 'semi-annual' })
      }
      if (!scheduledPracticeIds.has('semi-personal-retro')) {
        events.push({ date: d, practiceId: 'semi-personal-retro', label: 'Personal retro', cadence: 'semi-annual' })
      }
    }
  }

  for (const cp of customPractices) {
    const cadenceIntervals: Record<CadenceType, number> = {
      'daily': 1,
      'weekly': 7,
      'sprint': cadence.sprintLengthWeeks * 7,
      'monthly': 30,
      'quarterly': 91,
      'semi-annual': 182
    }
    const interval = cadenceIntervals[cp.cadence] || 7
    for (let offset = 0; offset <= daysAhead; offset += interval) {
      const d = addDays(now, offset)
      const dayIndex = getDay(d)
      if (cp.cadence === 'daily' && (dayIndex === 0 || dayIndex === 6)) continue
      if (cp.perReport) {
        for (const r of reports) {
          events.push({ date: d, practiceId: cp.id, label: `${cp.name}: ${r.displayName}`, cadence: cp.cadence, reportName: r.name })
        }
      } else {
        events.push({ date: d, practiceId: cp.id, label: cp.name, cadence: cp.cadence })
      }
    }
  }

  return events
}

function getNextOccurrence(practice: Practice, events: TimelineEvent[]): TimelineEvent | null {
  return events.find(e => e.practiceId === practice.id) ?? null
}

function getPracticeStatus(practice: Practice, events: TimelineEvent[]): 'on-track' | 'coming-up' | 'overdue' {
  const next = getNextOccurrence(practice, events)
  if (!next) return 'on-track'
  const daysUntil = differenceInDays(next.date, new Date())
  if (daysUntil < 0) return 'overdue'
  if (daysUntil <= 7) return 'coming-up'
  return 'on-track'
}

function getNextQuarterStart(): Date {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const quarterStarts = [0, 3, 6, 9]
  for (const m of quarterStarts) {
    if (m > currentMonth) return new Date(currentYear, m, 1)
  }
  return new Date(currentYear + 1, 0, 1)
}

const inputClasses = "w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-brand/50 focus:ring-1 focus:ring-brand/20 outline-none transition-colors"

function EditBuiltInPracticeForm({ 
  practice, 
  cadenceSettings, 
  practiceSchedules,
  onSave, 
  onSaveSchedule,
  onCancel 
}: { 
  practice: Practice, 
  cadenceSettings: CadenceSettings, 
  practiceSchedules: Record<string, PracticeSchedule>,
  onSave: (s: Partial<CadenceSettings>) => void, 
  onSaveSchedule: (practiceId: string, schedule: PracticeSchedule | null) => void,
  onCancel: () => void 
}) {
  const [local, setLocal] = useState<CadenceSettings>(cadenceSettings)
  const existingSchedule = practiceSchedules[practice.id]
  const [anchorDate, setAnchorDate] = useState(existingSchedule?.anchorDate || '')
  const [intervalDays, setIntervalDays] = useState(existingSchedule?.intervalDays || 0)
  
  const isWeeklyRef = practice.id === 'weekly-reflection'
  const isFeedbackGap = practice.id === 'feedback-gap'
  const isSprintStart = practice.id === 'sprint-start'
  const isSprintEnd = practice.id === 'sprint-end'
  const isMonthly = practice.id === 'monthly-checkin'

  const hasCadenceSettings = isWeeklyRef || isFeedbackGap || isSprintStart || isSprintEnd || isMonthly

  const schedulableIds = new Set([
    'skip-level', 'monthly-checkin', 'peer-sync',
    'quarterly-okr', 'quarterly-health', 'quarterly-hiring', 'quarterly-calibration',
    'semi-review', 'semi-1on1-format', 'semi-personal-retro',
  ])
  const isSchedulable = schedulableIds.has(practice.id)

  const intervalPresets: { label: string; days: number }[] = [
    { label: '2 weeks', days: 14 },
    { label: '3 weeks', days: 21 },
    { label: '4 weeks', days: 28 },
    { label: '6 weeks', days: 42 },
    { label: '8 weeks', days: 56 },
    { label: 'Monthly', days: 30 },
    { label: 'Quarterly', days: 91 },
    { label: '6 months', days: 182 },
  ]

  const scheduleDetails: Record<string, { when: string }> = {
    'daily-prs': { when: 'Every workday' },
    'daily-blockers': { when: 'Every workday' },
    'daily-interaction': { when: 'Every workday' },
    'one-on-one-prep': { when: 'Before each 1:1' },
    'weekly-priorities': { when: 'Every Monday' },
  }

  const isReadOnly = !hasCadenceSettings && !isSchedulable

  if (isReadOnly) {
    const info = scheduleDetails[practice.id]
    return (
      <div className="p-4 bg-surface-raised rounded-xl border border-border animate-slide-down space-y-3">
         <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">Schedule</span>
              <span className="text-xs text-zinc-200">{info?.when || practice.frequency}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-400">Trigger</span>
              <span className="text-xs text-zinc-200">{practice.trigger}</span>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-zinc-200 bg-surface hover:bg-surface-overlay rounded-lg border border-border transition-colors">Close</button>
          </div>
      </div>
    )
  }

  const handleSave = () => {
    if (hasCadenceSettings) {
      onSave(local)
    }
    if (isSchedulable) {
      if (anchorDate && intervalDays > 0) {
        onSaveSchedule(practice.id, { anchorDate, intervalDays })
      } else {
        onSaveSchedule(practice.id, null)
      }
    }
    if (!hasCadenceSettings && !isSchedulable) {
      onCancel()
    }
  }

  return (
     <div className="p-4 bg-surface-raised rounded-xl border border-border animate-slide-down space-y-4">
        {(isWeeklyRef || isFeedbackGap) && (
           <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">End of week day</label>
              <select value={local.endOfWeekDay} onChange={e => setLocal({...local, endOfWeekDay: e.target.value as DayOfWeek})} className={inputClasses}>
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
              </select>
           </div>
        )}
        
        {isFeedbackGap && (
           <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Feedback reminder threshold (days)</label>
              <input type="number" min="1" value={local.feedbackReminderDays} onChange={e => setLocal({...local, feedbackReminderDays: parseInt(e.target.value) || 14})} className={inputClasses} />
           </div>
        )}

        {(isSprintStart || isSprintEnd) && (
          <>
            <div>
               <label className="block text-xs font-medium text-zinc-400 mb-1.5">Sprint length (weeks)</label>
               <select value={local.sprintLengthWeeks} onChange={e => setLocal({...local, sprintLengthWeeks: parseInt(e.target.value)})} className={inputClasses}>
                 <option value={1}>1 week</option>
                 <option value={2}>2 weeks</option>
                 <option value={3}>3 weeks</option>
                 <option value={4}>4 weeks</option>
               </select>
            </div>
            <div>
               <label className="block text-xs font-medium text-zinc-400 mb-1.5">Reference sprint start date</label>
               <input type="date" value={local.sprintStartDate || ''} onChange={e => setLocal({...local, sprintStartDate: e.target.value})} className={inputClasses} />
            </div>
          </>
        )}

        {isMonthly && !isSchedulable && (
           <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Check-in frequency</label>
              <select value={local.checkInFrequency} onChange={e => setLocal({...local, checkInFrequency: e.target.value as CheckInFrequency})} className={inputClasses}>
                <option value="monthly">Monthly</option>
                <option value="bimonthly">Every 2 months</option>
                <option value="quarterly">Quarterly</option>
              </select>
           </div>
        )}

        {isSchedulable && (
          <>
            {isMonthly && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Check-in frequency</label>
                <select value={local.checkInFrequency} onChange={e => setLocal({...local, checkInFrequency: e.target.value as CheckInFrequency})} className={inputClasses}>
                  <option value="monthly">Monthly</option>
                  <option value="bimonthly">Every 2 months</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Next occurrence</label>
              <input 
                type="date" 
                value={anchorDate} 
                onChange={e => setAnchorDate(e.target.value)} 
                className={inputClasses} 
              />
              <p className="text-[11px] text-zinc-500 mt-1">When is the next one? Leave blank to use the default schedule.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Repeats every</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {intervalPresets.map(p => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setIntervalDays(p.days)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                      intervalDays === p.days 
                        ? 'bg-brand/20 text-brand-light border-brand/40' 
                        : 'bg-surface text-zinc-400 border-border hover:border-zinc-500'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="1" 
                  value={intervalDays || ''} 
                  onChange={e => setIntervalDays(parseInt(e.target.value) || 0)} 
                  placeholder="Custom"
                  className={`${inputClasses} w-24`} 
                />
                <span className="text-xs text-zinc-500">days</span>
              </div>
            </div>
            {existingSchedule && (
              <button
                type="button"
                onClick={() => { setAnchorDate(''); setIntervalDays(0) }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Reset to default schedule
              </button>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-zinc-200 bg-surface hover:bg-surface-overlay rounded-lg border border-border transition-all active:scale-[0.97]">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 text-xs font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97]">Save settings</button>
        </div>
     </div>
  )
}

function CustomPracticeForm({
  initialData,
  onSave,
  onCancel
}: {
  initialData?: Practice
  onSave: (p: Practice) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<Practice>(initialData || {
    id: `custom-${Date.now()}`,
    name: '',
    description: '',
    cadence: 'weekly',
    frequency: '',
    trigger: '',
    perReport: false
  })

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Name</label>
        <input 
          autoFocus
          placeholder="e.g. Code review sync" 
          required 
          value={formData.name} 
          onChange={e => setFormData({...formData, name: e.target.value})} 
          className={inputClasses} 
        />
      </div>
      
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Description (optional)</label>
        <textarea 
          placeholder="What is this practice for?" 
          value={formData.description} 
          onChange={e => setFormData({...formData, description: e.target.value})} 
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && formData.name) { e.preventDefault(); onSave(formData) } }}
          className={`${inputClasses} min-h-[80px]`} 
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
         <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Cadence</label>
            <select 
              value={formData.cadence} 
              onChange={e => setFormData({...formData, cadence: e.target.value as CadenceType})} 
              className={inputClasses}
            >
               <option value="daily">Daily</option>
               <option value="weekly">Weekly</option>
               <option value="sprint">Every Sprint</option>
               <option value="monthly">Monthly</option>
               <option value="quarterly">Quarterly</option>
               <option value="semi-annual">Twice a Year</option>
            </select>
         </div>
         <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Frequency</label>
            <input 
              placeholder="e.g. Every Monday" 
              value={formData.frequency} 
              onChange={e => setFormData({...formData, frequency: e.target.value})} 
              className={inputClasses} 
            />
         </div>
         <div className="col-span-2">
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Trigger</label>
            <input 
              placeholder="e.g. Monday arrives" 
              value={formData.trigger} 
              onChange={e => setFormData({...formData, trigger: e.target.value})} 
              className={inputClasses} 
            />
         </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer w-max">
         <input 
           type="checkbox" 
           checked={formData.perReport} 
           onChange={e => setFormData({...formData, perReport: e.target.checked})} 
           className="rounded border-border bg-surface-raised text-brand focus:ring-brand/20 transition-colors" 
         />
         <span className="text-sm text-zinc-200">Per report</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
         <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-zinc-200 bg-surface hover:bg-surface-raised rounded-lg border border-border transition-all active:scale-[0.97]">
           Cancel
         </button>
         <button 
           onClick={() => onSave(formData)} 
           disabled={!formData.name} 
           className="px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
         >
           Save practice
         </button>
      </div>
    </div>
  )
}

export function Playbook() {
  const { overview, loading, refresh } = useTeamOverview()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [cadence, setCadence] = useState<CadenceSettings>({
    checkInFrequency: 'monthly',
    feedbackReminderDays: 14,
    sprintLengthWeeks: 2,
    endOfWeekDay: 'friday',
    sprintStartDate: '',
    staleActionDays: 7
  })
  
  const [disabledPractices, setDisabledPractices] = useState<string[]>([])
  const [snoozedPractices, setSnoozedPractices] = useState<Record<string, string>>({})
  const [customPractices, setCustomPractices] = useState<Practice[]>([])
  const [editingPracticeId, setEditingPracticeId] = useState<string | null>(null)
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null)
  const [snoozePos, setSnoozePos] = useState<{ top: number; right: number } | null>(null)
  const [isAddingPractice, setIsAddingPractice] = useState(false)
  const [practiceCompletions, setPracticeCompletions] = useState<Record<string, string>>({})
  const [practiceSchedules, setPracticeSchedules] = useState<Record<string, PracticeSchedule>>({})
  
  const [expandedGroups, setExpandedGroups] = useState<Set<CadenceType>>(
    new Set(['weekly', 'sprint', 'monthly', 'quarterly', 'semi-annual'])
  )
  const [expandedWeeklyRhythm, setExpandedWeeklyRhythm] = useState<Set<number>>(new Set())
  const practiceRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const { settings: _playbookSettings } = useSettings()
  
  useEffect(() => {
    if (!_playbookSettings) return
    const s = _playbookSettings
    setCadence({
      checkInFrequency: s.checkInFrequency || 'monthly',
      feedbackReminderDays: s.feedbackReminderDays ?? 14,
      sprintLengthWeeks: s.sprintLengthWeeks ?? 2,
      endOfWeekDay: s.endOfWeekDay || 'friday',
      sprintStartDate: s.sprintStartDate || '',
      staleActionDays: s.staleActionDays ?? 5
    })
    
    setDisabledPractices(s.disabledPractices || [])
    setCustomPractices(s.customPractices || [])
    setPracticeCompletions(s.practiceCompletions || {})
    setPracticeSchedules(s.practiceSchedules || {})
    
    const snoozed = s.snoozedPractices || {}
    const now = new Date()
    let needsSave = false
    const validSnoozes: Record<string, string> = {}
    for (const [id, dateStr] of Object.entries(snoozed)) {
      if (new Date(dateStr) > now) {
        validSnoozes[id] = dateStr
      } else {
        needsSave = true
      }
    }
    if (needsSave) {
      window.api.saveSettings({ snoozedPractices: validSnoozes })
    }
    setSnoozedPractices(validSnoozes)
  }, [_playbookSettings])

  const reports = overview?.reports ?? []

  const rawEvents = useMemo(() => {
    return computeTimelineEvents(reports, cadence, 90, customPractices, practiceSchedules)
  }, [reports, cadence, customPractices, practiceSchedules])

  const events = useMemo(() => {
    return rawEvents.filter(e => {
      // Exclude daily cadence from timeline — they belong in the practice list below
      if (e.cadence === 'daily') return false
      if (disabledPractices.includes(e.practiceId)) return false
      const snoozeDate = snoozedPractices[e.practiceId]
      if (snoozeDate && new Date(snoozeDate) > new Date()) return false
      return true
    })
  }, [rawEvents, disabledPractices, snoozedPractices])

  const weeks = useMemo(() => {
    const now = new Date()
    const weekBuckets: { weekStart: Date; weekLabel: string; events: TimelineEvent[] }[] = []

    for (let w = 0; w < 13; w++) {
      const weekStart = addDays(now, w * 7)
      const weekEnd = addDays(weekStart, 6)
      const weekLabel = w === 0
        ? 'This week'
        : w === 1
          ? 'Next week'
          : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`

      const weekEvents = events.filter(e => {
        const daysDiff = differenceInDays(e.date, weekStart)
        return daysDiff >= 0 && daysDiff < 7
      })

      weekBuckets.push({ weekStart, weekLabel, events: weekEvents })
    }

    return weekBuckets
  }, [events])

  const cadenceGroups: CadenceType[] = ['daily', 'weekly', 'sprint', 'monthly', 'quarterly', 'semi-annual']
  const timelineCadenceGroups: CadenceType[] = ['weekly', 'sprint', 'monthly', 'quarterly', 'semi-annual']
  const allPractices = useMemo(() => [...practices, ...customPractices], [customPractices])

  const scrollToPractice = (practiceId: string) => {
    const el = practiceRefs.current[practiceId]
    if (el) {
      const practice = allPractices.find(p => p.id === practiceId)
      if (practice) {
        setExpandedGroups(prev => {
          const next = new Set(prev)
          next.add(practice.cadence)
          return next
        })
      }
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
      setTimeout(() => {
        el.classList.add('highlight-flash')
        setTimeout(() => el.classList.remove('highlight-flash'), 1500)
      }, 200)
    }
  }

  useEffect(() => {
    const practiceParam = searchParams.get('practice')
    if (practiceParam && allPractices.length > 0) {
      setTimeout(() => scrollToPractice(practiceParam), 200)
    }
  }, [searchParams, allPractices])

  const toggleGroup = (cadence: CadenceType) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cadence)) next.delete(cadence)
      else next.add(cadence)
      return next
    })
  }

  const handleToggleDisabled = (id: string) => {
    setDisabledPractices(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
      window.api.saveSettings({ disabledPractices: next })
      return next
    })
  }

  const handleSnooze = (id: string, days?: number, specificDate?: Date) => {
    const expire = specificDate || addDays(new Date(), days!)
    const updated = { ...snoozedPractices, [id]: expire.toISOString() }
    setSnoozedPractices(updated)
    window.api.saveSettings({ snoozedPractices: updated })
    setSnoozeOpenId(null)
    setSnoozePos(null)
    const practiceName = allPractices.find(p => p.id === id)?.name || 'Practice'
    toast.success(`${practiceName} snoozed`, 'Snoozed', { label: 'Undo', onClick: () => handleUnsnooze(id) })
  }

  const handleUnsnooze = (id: string) => {
    const updated = { ...snoozedPractices }
    delete updated[id]
    setSnoozedPractices(updated)
    window.api.saveSettings({ snoozedPractices: updated })
  }

  const handleSaveBuiltIn = (newSettings: Partial<CadenceSettings>) => {
    const updated = { ...cadence, ...newSettings }
    setCadence(updated)
    window.api.saveSettings(newSettings)
    setEditingPracticeId(null)
  }

  const handleSaveSchedule = (practiceId: string, schedule: PracticeSchedule | null) => {
    const updated = { ...practiceSchedules }
    if (schedule) {
      updated[practiceId] = schedule
    } else {
      delete updated[practiceId]
    }
    setPracticeSchedules(updated)
    window.api.saveSettings({ practiceSchedules: updated })
    setEditingPracticeId(null)
  }

  const handleSaveCustom = (updatedPractice: Practice) => {
    const newList = customPractices.map(p => p.id === updatedPractice.id ? updatedPractice : p)
    setCustomPractices(newList)
    window.api.saveSettings({ customPractices: newList })
    setEditingPracticeId(null)
  }

  const handleAddCustom = (newPractice: Practice) => {
    const newList = [...customPractices, newPractice]
    setCustomPractices(newList)
    window.api.saveSettings({ customPractices: newList })
    setIsAddingPractice(false)
  }

  const handleDeleteCustom = (id: string) => {
    setShowDeleteConfirm(id)
  }

  const confirmDeleteCustom = (id: string) => {
    const newList = customPractices.filter(p => p.id !== id)
    setCustomPractices(newList)
    window.api.saveSettings({ customPractices: newList })
    setShowDeleteConfirm(null)
  }

  const handleMarkComplete = (id: string) => {
    const updated = { ...practiceCompletions, [id]: new Date().toISOString() }
    setPracticeCompletions(updated)
    window.api.saveSettings({ practiceCompletions: updated })
    toast.success('Practice completed! 🎯', 'Nice work')
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="space-y-2">
          <div className="skeleton h-8 w-40 rounded" />
          <div className="skeleton h-4 w-80 rounded" />
        </div>
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex gap-3">
              <div className="skeleton w-2 h-16 rounded-full" />
              <div className="flex-1 bg-surface rounded-xl border border-border p-4 space-y-2">
                <div className="skeleton h-4 w-48 rounded" />
                <div className="skeleton h-3 w-32 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-brand" aria-hidden="true" />
            Playbook
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Your management system. Every practice, when it fires, and what's ahead.</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-12 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-surface-raised flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-zinc-600" />
          </div>
          <h2 className="text-lg font-medium text-zinc-200">Your playbook is waiting</h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Add your direct reports first, then come back here to see your personalized management cadence with timeline, practices, and reminders.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <a href="#/" className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-all active:scale-[0.97]">
              Add people
            </a>
            <a href="#/settings" className="px-4 py-2 text-sm font-medium text-zinc-300 bg-surface-raised hover:bg-surface-overlay rounded-lg border border-border transition-colors">
              Settings
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-brand" aria-hidden="true" />
            Playbook
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Your management system. Every practice, when it fires, and what's ahead.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Timeline */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
          Next 3 months
        </h2>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Legend */}
              <div className="flex items-center gap-4 px-5 py-3 border-b border-border">
                {timelineCadenceGroups.map(c => (
                  <div key={c} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${cadenceColors[c].dot}`} />
                    <span className="text-[11px] text-zinc-500">{cadenceLabels[c]}</span>
                  </div>
                ))}
              </div>

              {/* Week rows */}
              <div className="divide-y divide-border/50">
                {weeks.map((week, wi) => {
                  const weeklyBaseline = week.events.filter(e => e.cadence === 'weekly')
                  const exceptional = week.events.filter(e => e.cadence !== 'weekly')
                  const isRhythmExpanded = expandedWeeklyRhythm.has(wi)

                  const toggleRhythm = () => {
                    setExpandedWeeklyRhythm(prev => {
                      const next = new Set(prev)
                      if (next.has(wi)) next.delete(wi)
                      else next.add(wi)
                      return next
                    })
                  }

                  return (
                    <div key={wi} className={`flex items-start gap-4 px-5 py-3 ${week.events.length === 0 ? 'opacity-50' : ''}`}>
                      <div className="w-28 shrink-0 pt-0.5">
                        <span className={`text-xs font-medium ${wi === 0 ? 'text-brand-light' : 'text-zinc-500'}`}>
                          {week.weekLabel}
                        </span>
                      </div>
                      <div className="flex-1 flex flex-wrap gap-1.5">
                        {week.events.length === 0 ? (
                          <span className="text-xs text-zinc-600 italic">No items</span>
                        ) : (
                          <>
                            {weeklyBaseline.length > 0 && (
                              <>
                                <button
                                  onClick={toggleRhythm}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all hover:brightness-110 bg-zinc-500/5 text-zinc-500 border-zinc-500/20"
                                >
                                  {isRhythmExpanded ? (
                                    <ChevronDown className="w-3 h-3 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 shrink-0" />
                                  )}
                                  <span>Weekly rhythm</span>
                                  <span className="opacity-60">({weeklyBaseline.length})</span>
                                </button>

                                {/* Expanded weekly baseline items */}
                                {isRhythmExpanded && weeklyBaseline.map((ev, ei) => {
                                  const colors = cadenceColors[ev.cadence]
                                  return (
                                    <button
                                      key={`weekly-${ev.practiceId}-${ei}`}
                                      onClick={() => scrollToPractice(ev.practiceId)}
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all hover:scale-[1.02] hover:brightness-110 ${colors.bg} ${colors.text} ${colors.border} opacity-70`}
                                    >
                                      <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} />
                                      <span className="truncate max-w-[180px]">{ev.label}</span>
                                    </button>
                                  )
                                })}
                              </>
                            )}

                            {exceptional.map((ev, ei) => {
                              const colors = cadenceColors[ev.cadence]
                              return (
                                <button
                                  key={`${ev.practiceId}-${ei}`}
                                  onClick={() => scrollToPractice(ev.practiceId)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all hover:scale-[1.02] hover:brightness-110 ${colors.bg} ${colors.text} ${colors.border}`}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} />
                                  <span className="truncate max-w-[180px]">{ev.label}</span>
                                </button>
                              )
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Practice List */}
      <section>
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">
          All practices
        </h2>
        <div className="space-y-3">
          {cadenceGroups.map(cadenceType => {
            const groupPractices = allPractices.filter(p => p.cadence === cadenceType)
            if (groupPractices.length === 0) return null
            const colors = cadenceColors[cadenceType]
            const isExpanded = expandedGroups.has(cadenceType)
            
            const enabledGroupPractices = groupPractices.filter(p => !disabledPractices.includes(p.id))
            const countLabel = enabledGroupPractices.length === groupPractices.length 
              ? groupPractices.length 
              : `${enabledGroupPractices.length}/${groupPractices.length}`

            return (
              <div key={cadenceType} className="bg-surface rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => toggleGroup(cadenceType)}
                  className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-surface-raised/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                    <span className="text-sm font-semibold text-zinc-200">{cadenceLabels[cadenceType]}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                      {countLabel}
                    </span>
                  </div>
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-zinc-600" aria-hidden="true" />
                    : <ChevronRight className="w-4 h-4 text-zinc-600" aria-hidden="true" />
                  }
                </button>

                {isExpanded && (
                  <div className="border-t border-border divide-y divide-border/30 animate-slide-down">
                    {groupPractices.map((practice, pIdx) => {
                      const next = getNextOccurrence(practice, events)
                      const status = getPracticeStatus(practice, events)
                      const nextLabel = next
                        ? differenceInDays(next.date, new Date()) === 0
                          ? 'Today'
                          : differenceInDays(next.date, new Date()) === 1
                            ? 'Tomorrow'
                            : `${format(next.date, 'MMM d')} (in ${differenceInDays(next.date, new Date())} days)`
                        : 'Not scheduled'

                      const isDisabled = disabledPractices.includes(practice.id)
                      const snoozedDate = snoozedPractices[practice.id]
                      const isSnoozed = snoozedDate && new Date(snoozedDate) > new Date()
                      const isCustom = practice.id.startsWith('custom-')

                      return (
                        <div
                          key={practice.id}
                          ref={el => { practiceRefs.current[practice.id] = el }}
                          style={{ animationDelay: `${Math.min(pIdx * 50, 300)}ms`, animationFillMode: 'both' }}
                          className={`px-5 py-4 transition-colors group relative animate-fade-up ${
                            isDisabled ? 'opacity-50' : ''
                          } ${
                            isSnoozed ? 'border-l-2 border-amber-500/30 bg-amber-500/[0.02]' : ''
                          } ${!isSnoozed && !isDisabled ? 'hover:bg-surface-raised/20' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2.5">
                                <h3 className={`text-sm font-medium ${isDisabled ? 'line-through text-zinc-500' : isSnoozed ? 'text-zinc-400' : 'text-zinc-200'}`}>
                                  {practice.name}
                                </h3>
                                {practice.perReport && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-raised text-zinc-500">
                                    per report
                                  </span>
                                )}
                                {isCustom && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-raised text-zinc-500">
                                    Custom
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{practice.description}</p>
                              
                              {isSnoozed && (
                                <div className="mt-2.5 inline-flex items-center gap-2 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20">
                                  <span className="text-xs text-amber-500/90 font-medium">Snoozed until {format(new Date(snoozedDate!), 'MMM d')}</span>
                                  <button 
                                    onClick={() => handleUnsnooze(practice.id)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-amber-500/20 text-amber-400 transition-colors"
                                  >
                                    <Bell className="w-3 h-3" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Unsnooze</span>
                                  </button>
                                </div>
                              )}

                              <div className={`flex items-center gap-4 mt-2.5 ${isSnoozed ? 'opacity-50' : ''}`}>
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                                    <span className="text-[11px] text-zinc-500">{practice.frequency}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Eye className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                                    <span className="text-[11px] text-zinc-500">{practice.trigger}</span>
                                  </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 shrink-0">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
                                <button onClick={() => setEditingPracticeId(practice.id)} className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-md transition-colors" title="Edit practice">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <div className="relative inline-block">
                                  <button onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setSnoozePos({ top: rect.bottom + 6, right: window.innerWidth - rect.right }); setSnoozeOpenId(practice.id); }} className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-md transition-colors" title="Snooze practice">
                                    <BellOff className="w-3.5 h-3.5" />
                                  </button>
                                  {snoozeOpenId === practice.id && snoozePos && (
                                    <>
                                      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setSnoozeOpenId(null); setSnoozePos(null); }} />
                                      <div style={{ top: snoozePos.top, right: snoozePos.right }} className="fixed z-50 w-48 bg-surface-overlay border border-border rounded-lg shadow-xl py-1 animate-slide-down">
<button onClick={(e) => { e.stopPropagation(); handleSnooze(practice.id, 7); }} className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-surface-overlay transition-colors">1 week</button>
                            <button onClick={(e) => { e.stopPropagation(); handleSnooze(practice.id, 14); }} className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-surface-overlay transition-colors">2 weeks</button>
                            <button onClick={(e) => { e.stopPropagation(); handleSnooze(practice.id, 30); }} className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-surface-overlay transition-colors">1 month</button>
                            <button onClick={(e) => { e.stopPropagation(); handleSnooze(practice.id, undefined, getNextQuarterStart()); }} className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-surface-overlay transition-colors">Until next quarter</button>
                                      </div>
                                    </>
                                  )}
                                </div>
                                {isCustom && (
                                  <button onClick={() => handleDeleteCustom(practice.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors" title="Delete practice">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              <div className={`text-right shrink-0 min-w-[80px] ${isDisabled || isSnoozed ? 'opacity-50' : ''}`}>
                                  <div className="flex items-center gap-1.5 justify-end">
                                    {status === 'on-track' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />}
                                    {status === 'coming-up' && <Clock className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />}
                                    {status === 'overdue' && <AlertCircle className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />}
                                    <span className={`text-xs font-medium ${
                                      status === 'on-track' ? 'text-emerald-500' :
                                      status === 'coming-up' ? 'text-amber-400' :
                                      'text-red-400'
                                    }`}>
                                      {status === 'on-track' ? 'On track' : status === 'coming-up' ? 'Coming up' : 'Overdue'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-zinc-600 mt-1">{nextLabel}</p>
                                  <p className="text-[10px] text-zinc-600 mt-0.5">
                                    {practiceCompletions[practice.id]
                                      ? `Done ${format(new Date(practiceCompletions[practice.id]), 'MMM d')}`
                                      : 'Never completed'}
                                  </p>
                                  {!isDisabled && !isSnoozed && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleMarkComplete(practice.id) }}
                                    className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-emerald-400/80 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Done
                                  </button>
                                  )}
                                </div>

                              <button
                                onClick={() => handleToggleDisabled(practice.id)}
                                className={`relative w-9 h-5 rounded-full transition-colors duration-200 ease-in-out focus:outline-none shrink-0 mt-0.5 ${!isDisabled ? 'bg-brand' : 'bg-zinc-700'}`}
                                title={isDisabled ? "Enable practice" : "Disable practice"}
                              >
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 ease-in-out ${!isDisabled ? 'translate-x-4 bg-white' : 'translate-x-0 bg-zinc-500'}`} />
                              </button>
                            </div>
                          </div>

                          {editingPracticeId === practice.id && (
                            <div className="mt-4 pt-4 border-t border-border/50">
                              {isCustom ? (
                                <CustomPracticeForm 
                                  initialData={practice} 
                                  onSave={handleSaveCustom} 
                                  onCancel={() => setEditingPracticeId(null)} 
                                />
                              ) : (
                                <EditBuiltInPracticeForm 
                                  practice={practice} 
                                  cadenceSettings={cadence} 
                                  practiceSchedules={practiceSchedules}
                                  onSave={handleSaveBuiltIn} 
                                  onSaveSchedule={handleSaveSchedule}
                                  onCancel={() => setEditingPracticeId(null)} 
                                />
                              )}
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
          
          <div className="pt-4">
            {!isAddingPractice ? (
              <button
                onClick={() => setIsAddingPractice(true)}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-4 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Add a practice</span>
              </button>
            ) : (
              <div className="border border-border rounded-xl p-5 bg-surface animate-slide-down">
                <h3 className="text-sm font-medium text-zinc-200 mb-4">Create custom practice</h3>
                <CustomPracticeForm
                  onSave={handleAddCustom}
                  onCancel={() => setIsAddingPractice(false)}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={showDeleteConfirm !== null}
        title="Delete practice"
        message="This custom practice will be permanently removed. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (showDeleteConfirm) confirmDeleteCustom(showDeleteConfirm); }}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  )
}
