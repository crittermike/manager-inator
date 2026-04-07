import type { TimelineItem } from './types'

/**
 * Grouping key patterns: extract a "type" from a timeline item ID
 * that identifies items of the same kind across different reports.
 * Returns null for items that shouldn't be grouped.
 */
function getGroupKey(item: TimelineItem): string | null {
  if (!item.reportName) return null

  const id = item.id
  // Match patterns: prefix-reportName
  const patterns = [
    'overdue-feedback-',
    'overdue-checkin-',
    'overdue-1on1-',
    'overdue-no-activity-',
    'weekly-feedback-gap-',
  ]

  for (const prefix of patterns) {
    if (id.startsWith(prefix)) return prefix.replace(/-$/, '')
  }

  // Quarterly calibration: quarterly-calibration-{name}-{date}
  if (id.startsWith('quarterly-calibration-')) return 'quarterly-calibration'
  // Semi-annual review: semi-review-{name}-{date}
  if (id.startsWith('semi-review-')) return 'semi-review'

  return null
}

export interface ItemGroup {
  key: string
  title: string
  actionLabel: string
  items: TimelineItem[]
}

/**
 * Group timeline items by type pattern. Items that appear for multiple
 * reports with the same pattern get collapsed into a single group.
 * Items that are unique or have only 1 instance remain ungrouped.
 *
 * Returns a mixed array of individual TimelineItems and ItemGroups.
 */
export function groupTimelineItems(
  items: TimelineItem[]
): (TimelineItem | ItemGroup)[] {
  const groups = new Map<string, TimelineItem[]>()
  const ungrouped: TimelineItem[] = []

  for (const item of items) {
    const key = getGroupKey(item)
    if (key) {
      const existing = groups.get(key) || []
      existing.push(item)
      groups.set(key, existing)
    } else {
      ungrouped.push(item)
    }
  }

  const result: (TimelineItem | ItemGroup)[] = []

  // Add groups first (they represent the most repetitive items)
  for (const [key, groupItems] of groups) {
    if (groupItems.length <= 1) {
      // Only 1 item — don't group, show normally
      result.push(groupItems[0])
    } else {
      result.push({
        key,
        title: getGroupTitle(key, groupItems.length),
        actionLabel: getGroupActionLabel(key),
        items: groupItems
      })
    }
  }

  // Add ungrouped items after
  result.push(...ungrouped)

  return result
}

function getGroupTitle(key: string, count: number): string {
  switch (key) {
    case 'overdue-feedback': return `Feedback missing for ${count} reports`
    case 'overdue-checkin': return `Check-ins due for ${count} reports`
    case 'overdue-1on1': return `1:1s overdue for ${count} reports`
    case 'overdue-no-activity': return `No activity logged for ${count} reports`
    case 'weekly-feedback-gap': return `No feedback this week for ${count} reports`
    case 'quarterly-calibration': return `Calibration prep for ${count} reports`
    case 'semi-review': return `Performance reviews due for ${count} reports`
    default: return `${count} items`
  }
}

function getGroupActionLabel(key: string): string {
  switch (key) {
    case 'overdue-feedback':
    case 'weekly-feedback-gap':
      return 'Add feedback'
    case 'overdue-checkin': return 'Write check-in'
    case 'overdue-1on1': return 'View'
    case 'overdue-no-activity': return 'View'
    case 'quarterly-calibration': return 'Review'
    case 'semi-review': return 'Write review'
    default: return 'View'
  }
}

export function isItemGroup(item: TimelineItem | ItemGroup): item is ItemGroup {
  return 'key' in item && 'items' in item
}
