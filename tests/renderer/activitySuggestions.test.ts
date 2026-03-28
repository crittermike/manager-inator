import { describe, it, expect } from 'vitest'
import { computeActivitySuggestions, formatActivityCounts } from '../../src/renderer/utils/activitySuggestions'
import type { TeamMemberActivity, GitHubActivityItem } from '../../src/shared/types'

function makeMember(overrides: Partial<TeamMemberActivity> & { reportName: string; displayName: string }): TeamMemberActivity {
  return {
    githubUsername: overrides.reportName + '-gh',
    items: [],
    error: null,
    ...overrides
  }
}

function makeItem(overrides: Partial<GitHubActivityItem> = {}): GitHubActivityItem {
  return {
    id: Math.floor(Math.random() * 1000000),
    type: 'pr',
    title: 'Some PR',
    url: 'https://github.com/org/repo/pull/1',
    state: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repo: 'org/repo',
    comments: 0,
    labels: [],
    ...overrides
  } as GitHubActivityItem
}

const noDone = new Set<string>()
const noPto: Record<string, string> = {}

describe('formatActivityCounts', () => {
  it('returns "No activity" for empty array', () => {
    expect(formatActivityCounts([])).toBe('No activity')
  })

  it('formats single PR', () => {
    expect(formatActivityCounts([makeItem({ type: 'pr' })])).toBe('1 PR')
  })

  it('pluralizes correctly', () => {
    expect(formatActivityCounts([
      makeItem({ type: 'pr' }),
      makeItem({ type: 'pr' }),
    ])).toBe('2 PRs')
  })

  it('formats mixed types', () => {
    expect(formatActivityCounts([
      makeItem({ type: 'pr' }),
      makeItem({ type: 'issue' }),
      makeItem({ type: 'issue' }),
      makeItem({ type: 'discussion' }),
    ])).toBe('1 PR · 2 issues · 1 disc')
  })

  it('omits zero-count types', () => {
    expect(formatActivityCounts([
      makeItem({ type: 'issue' }),
    ])).toBe('1 issue')
  })
})

describe('computeActivitySuggestions', () => {
  describe('silence detection', () => {
    it('flags members with no activity who are not on PTO', () => {
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items: [] })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('activity-quiet-alice')
      expect(result[0].title).toContain('quiet')
      expect(result[0].actionLabel).toBe('Check in')
    })

    it('does NOT flag members on PTO with no activity', () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const pto = { alice: tomorrow.toISOString().split('T')[0] }
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items: [] })]
      const result = computeActivitySuggestions(activity, noDone, pto)
      expect(result).toHaveLength(0)
    })

    it('does NOT flag members with errors', () => {
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items: [], error: 'API error' })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result).toHaveLength(0)
    })

    it('marks silence suggestion as done when in doneIds', () => {
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items: [] })]
      const done = new Set(['activity-quiet-alice'])
      const result = computeActivitySuggestions(activity, done, noPto)
      expect(result[0].section).toBe('done')
    })
  })

  describe('heavy reviewer detection', () => {
    it('flags members with 5+ review comments', () => {
      const items = [makeItem({
        type: 'pr',
        reviewComments: [
          { author: 'alice', body: 'Looks good but consider...', createdAt: new Date().toISOString() },
          { author: 'alice', body: 'This needs a test', createdAt: new Date().toISOString() },
          { author: 'alice', body: 'Nice pattern here', createdAt: new Date().toISOString() },
          { author: 'alice', body: 'What about edge cases?', createdAt: new Date().toISOString() },
          { author: 'alice', body: 'LGTM after fixes', createdAt: new Date().toISOString() },
        ]
      })]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      const reviewer = result.find(r => r.id === 'activity-feedback-reviewer-alice')
      expect(reviewer).toBeDefined()
      expect(reviewer!.title).toContain('5 review comments')
      expect(reviewer!.actionType).toBe('feedback')
    })

    it('does NOT flag with fewer than 5 review comments', () => {
      const items = [makeItem({
        type: 'pr',
        reviewComments: [
          { author: 'alice', body: 'Comment 1', createdAt: new Date().toISOString() },
          { author: 'alice', body: 'Comment 2', createdAt: new Date().toISOString() },
        ]
      })]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-feedback-reviewer-alice')).toBeUndefined()
    })
  })

  describe('rubber-stamp review detection', () => {
    it('flags when 70%+ of 3+ approvals have minimal feedback', () => {
      const items = [
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: 'LGTM', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: '', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: '👍', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      const quality = result.find(r => r.id === 'activity-review-quality-alice')
      expect(quality).toBeDefined()
      expect(quality!.title).toContain('more depth')
      expect(quality!.subtitle).toContain('3 of 3')
    })

    it('does NOT flag when approvals have substantive feedback', () => {
      const items = [
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: 'This looks great. I especially like the error handling pattern you used here.', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: 'Nice work! One suggestion: consider extracting the validation logic.', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: 'Clean implementation. Good test coverage too.', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-review-quality-alice')).toBeUndefined()
    })

    it('does NOT flag with fewer than 3 approvals', () => {
      const items = [
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: 'ok', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: '', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-review-quality-alice')).toBeUndefined()
    })

    it('ignores non-APPROVED review states', () => {
      const items = [
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: '', createdAt: new Date().toISOString(), reviewState: 'COMMENTED' },
        ]}),
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: '', createdAt: new Date().toISOString(), reviewState: 'CHANGES_REQUESTED' },
        ]}),
        makeItem({ type: 'pr', reviewComments: [
          { author: 'alice', body: '', createdAt: new Date().toISOString(), reviewState: 'APPROVED' },
        ]}),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-review-quality-alice')).toBeUndefined()
    })
  })

  describe('stale PR detection', () => {
    it('flags open PRs older than 5 days with no comments', () => {
      const sixDaysAgo = new Date()
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
      const items = [makeItem({
        type: 'pr',
        state: 'open',
        title: 'Old PR',
        createdAt: sixDaysAgo.toISOString(),
        comments: 0
      })]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      const stale = result.find(r => r.id === 'activity-stale-pr-alice')
      expect(stale).toBeDefined()
      expect(stale!.title).toContain('waiting for review')
      expect(stale!.subtitle).toContain('Old PR')
    })

    it('does NOT flag PRs with comments', () => {
      const sixDaysAgo = new Date()
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
      const items = [makeItem({
        type: 'pr',
        state: 'open',
        createdAt: sixDaysAgo.toISOString(),
        comments: 3
      })]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-stale-pr-alice')).toBeUndefined()
    })

    it('does NOT flag recent open PRs', () => {
      const items = [makeItem({
        type: 'pr',
        state: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
        comments: 0
      })]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-stale-pr-alice')).toBeUndefined()
    })

    it('does NOT flag merged or closed PRs', () => {
      const sixDaysAgo = new Date()
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
      const items = [
        makeItem({ type: 'pr', state: 'merged', createdAt: sixDaysAgo.toISOString(), comments: 0 }),
        makeItem({ type: 'pr', state: 'closed', createdAt: sixDaysAgo.toISOString(), comments: 0 }),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-stale-pr-alice')).toBeUndefined()
    })
  })

  describe('shipping machine detection', () => {
    it('flags members with 3+ merged PRs', () => {
      const items = [
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'merged' }),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      const shipping = result.find(r => r.id === 'activity-feedback-shipping-alice')
      expect(shipping).toBeDefined()
      expect(shipping!.title).toContain('merged 3 PRs')
      expect(shipping!.actionType).toBe('feedback')
    })

    it('does NOT flag with fewer than 3 merged PRs', () => {
      const items = [
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'open' }),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-feedback-shipping-alice')).toBeUndefined()
    })
  })

  describe('cross-team collaboration detection', () => {
    it('flags members with 2+ high-comment issues', () => {
      const items = [
        makeItem({ type: 'issue', comments: 7 }),
        makeItem({ type: 'issue', comments: 5 }),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      const collab = result.find(r => r.id === 'activity-feedback-collab-alice')
      expect(collab).toBeDefined()
      expect(collab!.title).toContain('2 active discussions')
    })

    it('does NOT flag with only 1 high-comment issue', () => {
      const items = [
        makeItem({ type: 'issue', comments: 10 }),
        makeItem({ type: 'issue', comments: 2 }),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-feedback-collab-alice')).toBeUndefined()
    })
  })

  describe('multiple members', () => {
    it('generates suggestions for multiple members independently', () => {
      const activity = [
        makeMember({ reportName: 'alice', displayName: 'Alice', items: [
          makeItem({ type: 'pr', state: 'merged' }),
          makeItem({ type: 'pr', state: 'merged' }),
          makeItem({ type: 'pr', state: 'merged' }),
        ]}),
        makeMember({ reportName: 'bob', displayName: 'Bob', items: [] }),
      ]
      const result = computeActivitySuggestions(activity, noDone, noPto)
      expect(result.find(r => r.id === 'activity-feedback-shipping-alice')).toBeDefined()
      expect(result.find(r => r.id === 'activity-quiet-bob')).toBeDefined()
    })

    it('skips members on PTO entirely', () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const pto = { alice: tomorrow.toISOString().split('T')[0] }
      const items = [
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'merged' }),
      ]
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, noDone, pto)
      expect(result).toHaveLength(0)
    })
  })

  describe('done state tracking', () => {
    it('marks multiple suggestion types as done when in doneIds', () => {
      const sixDaysAgo = new Date()
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
      const items = [
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'merged' }),
        makeItem({ type: 'pr', state: 'open', createdAt: sixDaysAgo.toISOString(), comments: 0 }),
      ]
      const done = new Set(['activity-feedback-shipping-alice', 'activity-stale-pr-alice'])
      const activity = [makeMember({ reportName: 'alice', displayName: 'Alice', items })]
      const result = computeActivitySuggestions(activity, done, noPto)
      const shipping = result.find(r => r.id === 'activity-feedback-shipping-alice')
      const stale = result.find(r => r.id === 'activity-stale-pr-alice')
      expect(shipping!.section).toBe('done')
      expect(stale!.section).toBe('done')
    })
  })
})
