import { describe, expect, it } from 'vitest'
import { groupTimelineItems, isItemGroup } from '../../src/renderer/pages/today-components/grouping'
import { aggregateWeeklyActivity } from '../../src/renderer/pages/today-components/TeamActivityChart'
import type { TimelineItem } from '../../src/renderer/pages/today-components/types'
import type { TeamMemberActivity } from '../../src/shared/types'

// ── Smart Grouping Tests ──

function makeItem(id: string, reportName?: string): TimelineItem {
  return {
    id,
    section: 'overdue',
    title: `Item ${id}`,
    reportName,
    actionType: 'dismiss'
  }
}

describe('groupTimelineItems', () => {
  it('groups overdue-feedback items by type', () => {
    const items: TimelineItem[] = [
      makeItem('overdue-feedback-alice', 'alice'),
      makeItem('overdue-feedback-bob', 'bob'),
      makeItem('overdue-feedback-charlie', 'charlie'),
    ]
    const result = groupTimelineItems(items)
    expect(result).toHaveLength(1)
    expect(isItemGroup(result[0])).toBe(true)
    if (isItemGroup(result[0])) {
      expect(result[0].items).toHaveLength(3)
      expect(result[0].title).toContain('3 reports')
      expect(result[0].title).toContain('Feedback')
    }
  })

  it('groups overdue-checkin items by type', () => {
    const items: TimelineItem[] = [
      makeItem('overdue-checkin-alice', 'alice'),
      makeItem('overdue-checkin-bob', 'bob'),
    ]
    const result = groupTimelineItems(items)
    expect(result).toHaveLength(1)
    expect(isItemGroup(result[0])).toBe(true)
    if (isItemGroup(result[0])) {
      expect(result[0].title).toContain('Check-ins due for 2 reports')
    }
  })

  it('groups overdue-1on1 items by type', () => {
    const items: TimelineItem[] = [
      makeItem('overdue-1on1-alice', 'alice'),
      makeItem('overdue-1on1-bob', 'bob'),
      makeItem('overdue-1on1-charlie', 'charlie'),
    ]
    const result = groupTimelineItems(items)
    expect(result).toHaveLength(1)
    if (isItemGroup(result[0])) {
      expect(result[0].title).toContain('1:1s overdue for 3 reports')
    }
  })

  it('does not group single items', () => {
    const items: TimelineItem[] = [
      makeItem('overdue-feedback-alice', 'alice'),
    ]
    const result = groupTimelineItems(items)
    expect(result).toHaveLength(1)
    expect(isItemGroup(result[0])).toBe(false)
  })

  it('keeps ungroupable items as-is', () => {
    const items: TimelineItem[] = [
      makeItem('weekly-priorities', undefined),
      makeItem('sprint-start-2026-04-07', undefined),
    ]
    const result = groupTimelineItems(items)
    expect(result).toHaveLength(2)
    expect(result.every(r => !isItemGroup(r))).toBe(true)
  })

  it('handles mixed grouped and ungrouped items', () => {
    const items: TimelineItem[] = [
      makeItem('overdue-feedback-alice', 'alice'),
      makeItem('overdue-feedback-bob', 'bob'),
      makeItem('weekly-priorities', undefined),
      makeItem('overdue-1on1-charlie', 'charlie'),
    ]
    const result = groupTimelineItems(items)
    // 1 feedback group + 1 ungrouped priorities + 1 ungrouped 1on1 (only 1 item)
    expect(result).toHaveLength(3)
    const groups = result.filter(isItemGroup)
    const singles = result.filter(r => !isItemGroup(r))
    expect(groups).toHaveLength(1)
    expect(singles).toHaveLength(2)
  })

  it('handles different group types separately', () => {
    const items: TimelineItem[] = [
      makeItem('overdue-feedback-alice', 'alice'),
      makeItem('overdue-feedback-bob', 'bob'),
      makeItem('overdue-checkin-alice', 'alice'),
      makeItem('overdue-checkin-bob', 'bob'),
    ]
    const result = groupTimelineItems(items)
    const groups = result.filter(isItemGroup)
    expect(groups).toHaveLength(2)
    expect(groups[0].key).not.toBe(groups[1].key)
  })

  it('groups weekly-feedback-gap items', () => {
    const items: TimelineItem[] = [
      makeItem('weekly-feedback-gap-alice', 'alice'),
      makeItem('weekly-feedback-gap-bob', 'bob'),
      makeItem('weekly-feedback-gap-charlie', 'charlie'),
    ]
    const result = groupTimelineItems(items)
    expect(result).toHaveLength(1)
    if (isItemGroup(result[0])) {
      expect(result[0].title).toContain('No feedback this week for 3 reports')
    }
  })

  it('groups quarterly-calibration items', () => {
    const items: TimelineItem[] = [
      makeItem('quarterly-calibration-alice-2026-04', 'alice'),
      makeItem('quarterly-calibration-bob-2026-04', 'bob'),
    ]
    const result = groupTimelineItems(items)
    expect(result).toHaveLength(1)
    if (isItemGroup(result[0])) {
      expect(result[0].title).toContain('Calibration prep for 2 reports')
    }
  })

  it('returns empty array for empty input', () => {
    expect(groupTimelineItems([])).toHaveLength(0)
  })

  it('provides correct action labels', () => {
    const items: TimelineItem[] = [
      makeItem('overdue-feedback-alice', 'alice'),
      makeItem('overdue-feedback-bob', 'bob'),
    ]
    const result = groupTimelineItems(items)
    if (isItemGroup(result[0])) {
      expect(result[0].actionLabel).toBe('Add feedback')
    }
  })
})

// ── Sparkline Chart Aggregation Tests ──

function makeMember(name: string, items: { role: string; createdAt: string }[]): TeamMemberActivity {
  return {
    reportName: name.toLowerCase().replace(/\s+/g, '-'),
    displayName: name,
    githubUsername: name.toLowerCase(),
    items: items.map((item, i) => ({
      id: i,
      type: 'pr' as const,
      title: `PR ${i}`,
      url: '',
      repo: 'org/repo',
      state: 'merged' as const,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
      comments: 0,
      labels: [],
      role: item.role as 'author' | 'commenter'
    })),
    error: null
  }
}

describe('aggregateWeeklyActivity', () => {
  it('creates correct number of week buckets', () => {
    const { buckets } = aggregateWeeklyActivity([], 8)
    expect(buckets).toHaveLength(8)
  })

  it('creates correct number of buckets for custom weeks', () => {
    const { buckets } = aggregateWeeklyActivity([], 4)
    expect(buckets).toHaveLength(4)
  })

  it('aggregates authored PRs into correct week', () => {
    const now = new Date()
    const thisWeek = now.toISOString()
    const { buckets, people } = aggregateWeeklyActivity([
      makeMember('Alice', [
        { role: 'author', createdAt: thisWeek },
        { role: 'author', createdAt: thisWeek },
      ])
    ], 8)

    expect(people).toEqual(['Alice'])
    const lastBucket = buckets[buckets.length - 1]
    expect(lastBucket.byPerson['Alice']?.authored).toBe(2)
  })

  it('separates authored from reviewed', () => {
    const now = new Date().toISOString()
    const { buckets } = aggregateWeeklyActivity([
      makeMember('Alice', [
        { role: 'author', createdAt: now },
        { role: 'commenter', createdAt: now },
        { role: 'commenter', createdAt: now },
      ])
    ], 8)

    const lastBucket = buckets[buckets.length - 1]
    expect(lastBucket.byPerson['Alice']?.authored).toBe(1)
    expect(lastBucket.byPerson['Alice']?.reviewed).toBe(2)
  })

  it('handles multiple people', () => {
    const now = new Date().toISOString()
    const { people } = aggregateWeeklyActivity([
      makeMember('Alice', [{ role: 'author', createdAt: now }]),
      makeMember('Bob', [{ role: 'author', createdAt: now }]),
    ], 8)

    expect(people).toEqual(['Alice', 'Bob'])
  })

  it('ignores non-PR items', () => {
    const now = new Date().toISOString()
    const member: TeamMemberActivity = {
      reportName: 'alice',
      displayName: 'Alice',
      githubUsername: 'alice',
      items: [{
        id: 1,
        type: 'issue',
        title: 'Issue',
        url: '',
        repo: 'org/repo',
        state: 'open',
        createdAt: now,
        updatedAt: now,
        comments: 0,
        labels: [],
        role: 'author'
      }],
      error: null
    }
    const { buckets, people } = aggregateWeeklyActivity([member], 8)
    expect(people).toHaveLength(0)
    expect(buckets.every(b => Object.keys(b.byPerson).length === 0)).toBe(true)
  })

  it('ignores items outside the date range', () => {
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 100)
    const { buckets } = aggregateWeeklyActivity([
      makeMember('Alice', [{ role: 'author', createdAt: oldDate.toISOString() }])
    ], 8)

    const total = buckets.reduce((sum, b) => {
      const a = b.byPerson['Alice']
      return sum + (a ? a.authored + a.reviewed : 0)
    }, 0)
    expect(total).toBe(0)
  })

  it('returns empty people for empty activity', () => {
    const { people } = aggregateWeeklyActivity([], 8)
    expect(people).toHaveLength(0)
  })

  it('returns empty people when all members have no items', () => {
    const { people } = aggregateWeeklyActivity([
      { reportName: 'alice', displayName: 'Alice', githubUsername: 'alice', items: [], error: null }
    ], 8)
    expect(people).toHaveLength(0)
  })

  it('week labels are formatted as "Mon DD"', () => {
    const { buckets } = aggregateWeeklyActivity([], 4)
    for (const bucket of buckets) {
      expect(bucket.label).toMatch(/^[A-Z][a-z]{2}\s\d{1,2}$/)
    }
  })
})
