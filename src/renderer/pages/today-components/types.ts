import type { TeamActionItem } from '../../../shared/types'

export type TimelineSection = 'reflection' | 'overdue' | 'this-week' | 'coming-up' | 'done'

export type PromptType = 'weekly-priorities' | 'sprint-goal' | 'weekly-reflection' | 'weekly-snippet' | 'skip-level-prep' | 'quarterly-okr' | 'team-health-check' | 'sprint-retro' | 'personal-retro' | 'hiring-review' | 'one-on-one-format-check'

export interface TimelineItem {
  id: string
  section: TimelineSection
  title: string
  subtitle?: string
  reportName?: string
  route?: string
  actionLabel?: string
  actionType?: 'navigate' | 'dismiss' | 'prep' | 'inline-actions' | 'prompt' | 'feedback' | 'info'
  promptType?: PromptType
  staleActionItems?: TeamActionItem[]
  /** Links Coming Up items to the relevant Playbook practice */
  practiceLink?: string
}
