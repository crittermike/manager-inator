import type { TeamActionItem } from '../../../shared/types'

export type TimelineSection = 'reflection' | 'overdue' | 'this-week' | 'upcoming' | 'inbox' | 'coming-up' | 'done'

export type PromptType = 'weekly-priorities' | 'sprint-goal' | 'weekly-reflection'

export interface TimelineItem {
  id: string
  section: TimelineSection
  title: string
  subtitle?: string
  reportName?: string
  route?: string
  actionLabel?: string
  actionType?: 'navigate' | 'process' | 'dismiss' | 'prep' | 'inline-actions' | 'prompt' | 'feedback' | 'info'
  meetingFilename?: string
  promptType?: PromptType
  staleActionItems?: TeamActionItem[]
  /** Links Coming Up items to the relevant Playbook practice */
  practiceLink?: string
}
