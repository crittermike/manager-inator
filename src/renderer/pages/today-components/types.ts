import type { TeamActionItem } from '../../../shared/types'

export type TimelineSection = 'overdue' | 'upcoming' | 'inbox' | 'done'

export type PromptType = 'weekly-priorities' | 'sprint-goal' | 'weekly-reflection'

export interface TimelineItem {
  id: string
  section: TimelineSection
  title: string
  subtitle?: string
  reportName?: string
  route?: string
  actionLabel?: string
  actionType?: 'navigate' | 'process' | 'dismiss' | 'prep' | 'inline-actions' | 'prompt'
  meetingFilename?: string
  promptType?: PromptType
  staleActionItems?: TeamActionItem[]
}
