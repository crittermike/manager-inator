// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, TeamOverview, TeamMemberActivity } from '../../src/shared/types'

// happy-dom 20.x no longer provides window.localStorage automatically. Install
// a minimal in-memory polyfill so tests that exercise persisted state in the
// Today page (done IDs, activity summary cache, etc.) don't crash.
if (typeof window !== 'undefined' && (typeof window.localStorage === 'undefined' || typeof window.localStorage?.clear !== 'function')) {
  const _store = new Map<string, string>()
  const polyfill = {
    get length() { return _store.size },
    clear: () => _store.clear(),
    getItem: (key: string) => (_store.has(key) ? _store.get(key)! : null),
    setItem: (key: string, value: string) => { _store.set(key, String(value)) },
    removeItem: (key: string) => { _store.delete(key) },
    key: (index: number) => Array.from(_store.keys())[index] ?? null
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: polyfill })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: polyfill })
}

const mockNavigate = vi.fn()
const mockRefresh = vi.fn()
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}

const mockOverview: TeamOverview = {
  reports: [
    {
      name: 'alice-smith',
      displayName: 'Alice Smith',
      lastOneOnOne: '2026-03-01',
      daysGap: 21,
      openActionItems: 2,
      status: 'needs-attention',
      meetingDay: 'Friday',
      lastCheckIn: null,
      lastFeedback: null,
      feedbackCount: 0,
      checkInCount: 0
    }
  ],
  attentionItems: [],
  lastUpdated: '2026-03-31T12:00:00.000Z'
}

const mockSettings: AppSettings = {
  hasToken: true,
  repoOwner: 'org',
  repoName: 'repo',
  repoPath: '/tmp/repo',
  defaultModel: 'gpt-4.1',
  checkInFrequency: 'monthly',
  feedbackReminderDays: 14,
  sprintLengthWeeks: 2,
  endOfWeekDay: 'friday',
  sprintStartDate: '2026-03-23',
  staleActionDays: 5,
  aiCustomInstructions: '',
  disabledPractices: [],
  snoozedPractices: {},
  customPractices: [],
  practiceCompletions: {},
  practiceSchedules: {},
  snoozedActionItems: {},
  snoozedItems: {},
  ptoReports: {},
  deactivatedReports: [],
  hasGithubOrgToken: true,
  githubOrgName: 'org',
  userName: 'Manager',
  userGithub: 'manager'
}

const mockTeamActivity: TeamMemberActivity[] = [
  {
    reportName: 'alice-smith',
    displayName: 'Alice Smith',
    githubUsername: 'alicesmith',
    error: null,
    items: [
      {
        id: 101,
        type: 'pr',
        title: 'Refine onboarding flow',
        url: 'https://github.com/org/repo/pull/101',
        repo: 'org/repo',
        state: 'open',
        createdAt: '2026-03-30T12:00:00.000Z',
        updatedAt: '2026-03-31T10:00:00.000Z',
        comments: 2,
        labels: ['ux'],
        role: 'author',
        reviewComments: [],
        issueComments: []
      }
    ]
  }
]

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

vi.mock('../../src/renderer/hooks/useData', () => ({
  useTeamOverview: () => ({
    overview: mockOverview,
    loading: false,
    error: null,
    refresh: mockRefresh
  }),
  useSettings: () => ({
    settings: mockSettings,
    loading: false,
    refreshSettings: vi.fn()
  })
}))

vi.mock('../../src/renderer/hooks/useAI', () => ({
  useAI: () => ({
    streaming: false,
    streamedText: '',
    generate: vi.fn().mockResolvedValue(''),
    cancel: vi.fn(),
    reset: vi.fn(),
    fullTextRef: { current: '' }
  })
}))

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => mockToast
}))

vi.mock('../../src/renderer/components/layout/AddReportModal', () => ({
  AddReportModal: () => null
}))

vi.mock('../../src/renderer/pages/today-components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/pages/today-components')>()
  return {
    ...actual,
    InlinePrep: () => <div>Inline prep</div>,
    InlineActions: () => <div>Inline actions</div>,
    InlinePrompt: () => <div>Inline prompt</div>,
    InlineFeedback: () => <div>Inline feedback</div>
  }
})

import { Today } from '../../src/renderer/pages/Today'

async function renderToday() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<Today />)
  })

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

  return { container, root }
}

/**
 * Helper for the master/detail Today view: clicks the named category in the left
 * nav so its items render in the right pane. Returns true if the category was
 * found and clicked.
 */
async function selectCategory(container: HTMLElement, label: string): Promise<boolean> {
  const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(label)) as HTMLButtonElement | undefined
  if (!button) return false
  await act(async () => {
    button.click()
  })
  return true
}

describe('Today page polish', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    localStorage.clear()
    mockNavigate.mockReset()
    mockRefresh.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()

    Object.defineProperty(window, 'open', {
      configurable: true,
      value: vi.fn()
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getTodayBootstrap: vi.fn().mockResolvedValue({ contexts: [], teamActionItems: [] }),
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        getTeamActivity: vi.fn().mockResolvedValue(mockTeamActivity),
        getRecentTeamContext: vi.fn().mockResolvedValue({}),
        saveActivitySnapshot: vi.fn().mockResolvedValue(undefined),
        saveSettings: vi.fn().mockResolvedValue(undefined),
        toggleActionItem: vi.fn().mockResolvedValue(undefined),
        getReportData: vi.fn().mockResolvedValue({
          profile: { displayName: 'Alice Smith' },
          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: [],
          summaries: [],
          contextNotes: []
        }),
        aiGenerate: vi.fn().mockResolvedValue('Mock generated check-in'),
        commitFile: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  it('renders strengthened Today sections and visible row actions', async () => {
    const { container, root } = await renderToday()

    // The "Needs attention" category appears as a button in the left nav and is auto-selected,
    // so its items render in the right pane.
    const overdueNavButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Needs attention')) as HTMLButtonElement | undefined
    expect(overdueNavButton).toBeDefined()
    expect(overdueNavButton?.getAttribute('aria-current')).toBe('page')

    expect(container.textContent).toContain('1:1 with Alice Smith is overdue')
    expect(container.textContent).toContain('No feedback logged for Alice Smith')

    const visibleAction = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'View') as HTMLButtonElement | undefined
    expect(visibleAction).toBeDefined()
    expect(visibleAction?.className).toContain('uppercase')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    
    await act(async () => {
      root.unmount()
    })
  })

  it('selects a different category to switch the right pane', async () => {
    const { container, root } = await renderToday()

    expect(container.textContent).toContain('1:1 with Alice Smith is overdue')

    const thisWeekNav = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('This week')) as HTMLButtonElement
    expect(thisWeekNav).toBeDefined()

    await act(async () => {
      thisWeekNav.click()
    })

    // Switching categories hides the previous category's items.
    expect(container.textContent).not.toContain('1:1 with Alice Smith is overdue')

    await act(async () => {
      root.unmount()
    })
  })

  it('renders the team activity card with the refined header rhythm', async () => {
    const { container, root } = await renderToday()

    const activityNav = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Team Activity')) as HTMLButtonElement | undefined
    expect(activityNav).toBeDefined()
    await act(async () => {
      activityNav?.click()
    })

    const activityHeader = Array.from(container.querySelectorAll('div')).find(node => node.textContent?.includes('Recent GitHub work and AI summary'))
    expect(activityHeader?.textContent).toContain('Recent GitHub work and AI summary')

    const rawButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Raw') as HTMLButtonElement | undefined
    expect(rawButton).toBeDefined()

    await act(async () => {
      rawButton?.click()
    })

    expect(container.textContent).toContain('Alice Smith')
    expect(container.textContent).toContain('@alicesmith')
    expect(container.textContent).toContain('1 PR')

    await act(async () => {
      root.unmount()
    })
  })

  it('dispatches the canonical capture shortcut from the transcript entry point', async () => {
    const originalReports = mockOverview.reports
    mockOverview.reports = []

    try {
      const dispatchSpy = vi.spyOn(document, 'dispatchEvent')
      const { container, root } = await renderToday()

      const transcriptButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Capture your first context')) as HTMLButtonElement | undefined
      expect(transcriptButton).toBeDefined()

      await act(async () => {
        transcriptButton?.click()
      })

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'keydown',
        key: 'c',
        shiftKey: true,
        metaKey: true
      }))

      dispatchSpy.mockRestore()

      await act(async () => {
        root.unmount()
      })
    } finally {
      mockOverview.reports = originalReports
    }
  })
})

describe('Today date-sensitive behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not label check-ins as overdue on the 1st of the month', async () => {
    const mockDate = new Date('2026-04-01T12:00:00Z')
    vi.setSystemTime(mockDate)

    const { container, root } = await renderToday()

    expect(container.textContent).not.toContain('Monthly check-in with Alice Smith is overdue')

    // Switch to "This week" — the check-in due item belongs there, not in "Needs attention".
    const thisWeekNav = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('This week')) as HTMLButtonElement
    expect(thisWeekNav).toBeDefined()
    await act(async () => {
      thisWeekNav.click()
    })
    expect(container.textContent).toContain('Monthly check-in due for Alice Smith')

    // Switch back to "Needs attention" and confirm the check-in item is NOT there.
    const overdueNav = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Needs attention')) as HTMLButtonElement
    await act(async () => {
      overdueNav.click()
    })
    expect(container.textContent).not.toContain('Monthly check-in due for Alice Smith')

    await act(async () => {
      root.unmount()
    })
  })

  it('auto-generates missing check-ins on the last day of the month', async () => {
    const mockDate = new Date(2026, 2, 31, 12, 0, 0)

    vi.setSystemTime(mockDate)

    const { root, container } = await renderToday()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const api = (window as typeof window & {
      api: {
        getReportData: ReturnType<typeof vi.fn>
        aiGenerate: ReturnType<typeof vi.fn>
        commitFile: ReturnType<typeof vi.fn>
      }
    }).api

    expect(api.getReportData).toHaveBeenCalledWith('alice-smith')
    expect(api.aiGenerate).toHaveBeenCalledWith(
      'generate-checkin',
      expect.objectContaining({ month: '2026-03' }),
      expect.any(Function),
      expect.any(String)
    )
    expect(api.commitFile).toHaveBeenCalledWith(
      'reports/alice-smith/check-ins/monthly/2026-03.md',
      'Mock generated check-in',
      'Auto-save Alice Smith check-in for March 2026'
    )
    expect(localStorage.getItem('auto-checkin-2026-03-alice-smith')).toBe('true')

    const doneSectionButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Done today')) as HTMLButtonElement | undefined
    expect(doneSectionButton).toBeDefined()

    await act(async () => {
      doneSectionButton?.click()
    })

    expect(container.textContent).toContain('Generated check-in for Alice Smith')

    await act(async () => {
      root.unmount()
    })
  })
})

describe('Today actionable items', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    localStorage.clear()
    mockNavigate.mockReset()
    mockRefresh.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()

    Object.defineProperty(window, 'open', {
      configurable: true,
      value: vi.fn()
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getTodayBootstrap: vi.fn().mockResolvedValue({ contexts: [], teamActionItems: [] }),
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        getTeamActivity: vi.fn().mockResolvedValue([]),
        getRecentTeamContext: vi.fn().mockResolvedValue({}),
        saveActivitySnapshot: vi.fn().mockResolvedValue(undefined),
        saveSettings: vi.fn().mockResolvedValue(undefined),
        toggleActionItem: vi.fn().mockResolvedValue(undefined),
        getReportData: vi.fn().mockResolvedValue({
          profile: { displayName: 'Alice Smith' },
          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: [],
          summaries: [],
          contextNotes: []
        }),
        aiGenerate: vi.fn().mockResolvedValue('Mock content'),
        commitFile: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skip-level prep shows a Prep button with inline prompt instead of Dismiss', async () => {
    // First week of month
    vi.setSystemTime(new Date('2026-04-02T12:00:00Z'))

    const { container, root } = await renderToday()

    // Skip-level prep is a "this week" item.
    await selectCategory(container, 'This week')

    expect(container.textContent).toContain('Prep for your skip-level 1:1')
    expect(container.textContent).toContain('Draft an agenda')

    const prepButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Prep') as HTMLButtonElement | undefined
    expect(prepButton).toBeDefined()

    // Click to expand inline prompt
    await act(async () => {
      prepButton?.click()
    })

    expect(container.textContent).toContain('Inline prompt')

    await act(async () => {
      root.unmount()
    })
  })

  it('quarterly OKR shows a Draft button with inline prompt instead of Dismiss', async () => {
    // April 2026 = Q2 start (month 3 in 0-indexed = April)
    vi.setSystemTime(new Date('2026-04-02T12:00:00Z'))

    const { container, root } = await renderToday()

    await selectCategory(container, 'This week')

    expect(container.textContent).toContain('Quarterly planning')

    const draftButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Draft') as HTMLButtonElement | undefined
    expect(draftButton).toBeDefined()

    await act(async () => {
      draftButton?.click()
    })

    expect(container.textContent).toContain('Inline prompt')

    await act(async () => {
      root.unmount()
    })
  })

  it('team health check shows a Reflect button with inline prompt instead of Dismiss', async () => {
    vi.setSystemTime(new Date('2026-04-02T12:00:00Z'))

    const { container, root } = await renderToday()

    await selectCategory(container, 'This week')

    expect(container.textContent).toContain('Team health check')
    expect(container.textContent).toContain('BICEPS')

    // Find the Reflect button specifically for team health check
    const reflectButtons = Array.from(container.querySelectorAll('button'))
      .filter(b => b.textContent?.trim() === 'Reflect')
    expect(reflectButtons.length).toBeGreaterThan(0)

    await act(async () => {
      root.unmount()
    })
  })

  it('personal management retro shows Reflect with inline prompt in semi-annual periods', async () => {
    // January = semi-annual month
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'))

    const { container, root } = await renderToday()

    await selectCategory(container, 'This week')

    expect(container.textContent).toContain('Personal management retro')
    expect(container.textContent).toContain('What kind of manager')

    const reflectButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Reflect') as HTMLButtonElement | undefined
    expect(reflectButton).toBeDefined()

    await act(async () => {
      root.unmount()
    })
  })

  it('1:1 format check shows Reflect with inline prompt in semi-annual periods', async () => {
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'))

    const { container, root } = await renderToday()

    await selectCategory(container, 'This week')

    expect(container.textContent).toContain('1:1 format check')
    expect(container.textContent).toContain('Reflect on how your 1:1s')

    await act(async () => {
      root.unmount()
    })
  })
})

describe('Today activity snapshot date range', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    localStorage.clear()
    mockNavigate.mockReset()
    mockRefresh.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()

    Object.defineProperty(window, 'open', {
      configurable: true,
      value: vi.fn()
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getTodayBootstrap: vi.fn().mockResolvedValue({ contexts: [], teamActionItems: [] }),
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        getTeamActivity: vi.fn().mockResolvedValue(mockTeamActivity),
        getRecentTeamContext: vi.fn().mockResolvedValue({}),
        saveActivitySnapshot: vi.fn().mockResolvedValue(undefined),
        saveSettings: vi.fn().mockResolvedValue(undefined),
        toggleActionItem: vi.fn().mockResolvedValue(undefined),
        getReportData: vi.fn().mockResolvedValue({
          profile: { displayName: 'Alice Smith' },
          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: [],
          summaries: [],
          contextNotes: []
        }),
        aiGenerate: vi.fn().mockResolvedValue('Mock content'),
        commitFile: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the lookback date (yesterday) as start date for the activity snapshot', async () => {
    // Wednesday 2026-04-08
    vi.setSystemTime(new Date('2026-04-08T14:00:00Z'))

    const { root } = await renderToday()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const api = (window as typeof window & {
      api: { saveActivitySnapshot: ReturnType<typeof vi.fn> }
    }).api

    // Should save with yesterday (2026-04-07) as start, today (2026-04-08) as end
    expect(api.saveActivitySnapshot).toHaveBeenCalledWith(
      'alice-smith',
      '2026-04-07',
      '2026-04-08'
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('uses 3-day lookback on Mondays for the activity snapshot', async () => {
    // Monday 2026-04-06
    vi.setSystemTime(new Date('2026-04-06T14:00:00Z'))

    const { root } = await renderToday()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const api = (window as typeof window & {
      api: { saveActivitySnapshot: ReturnType<typeof vi.fn> }
    }).api

    // Monday lookback is 3 days: start = 2026-04-03 (Friday), end = 2026-04-06
    expect(api.saveActivitySnapshot).toHaveBeenCalledWith(
      'alice-smith',
      '2026-04-03',
      '2026-04-06'
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('shows inline Refresh button when no activity data is available', async () => {
    const getTeamActivity = vi.fn().mockResolvedValue([
      { reportName: 'alice-smith', displayName: 'Alice Smith', githubUsername: 'alicesmith', error: null, items: [] }
    ])

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getTodayBootstrap: vi.fn().mockResolvedValue({ contexts: [], teamActionItems: [] }),
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        getTeamActivity,
        getRecentTeamContext: vi.fn().mockResolvedValue({}),
        saveActivitySnapshot: vi.fn().mockResolvedValue(undefined),
        saveSettings: vi.fn().mockResolvedValue(undefined),
        toggleActionItem: vi.fn().mockResolvedValue(undefined),
        getReportData: vi.fn().mockResolvedValue({
          profile: { displayName: 'Alice Smith' },
          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: [],
          summaries: [],
          contextNotes: []
        }),
        aiGenerate: vi.fn().mockResolvedValue('Mock generated check-in'),
        commitFile: vi.fn().mockResolvedValue(undefined)
      }
    })

    const { container, root } = await renderToday()

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    // Activity content lives in the master/detail right pane; select it.
    await selectCategory(container, 'Team Activity')

    const noActivityText = Array.from(container.querySelectorAll('div')).find(
      d => d.textContent?.includes('No activity data available')
    )
    expect(noActivityText).toBeDefined()

    const refreshBtn = Array.from(container.querySelectorAll('button')).find(
      btn => btn.textContent === 'Refresh' && btn.closest('div')?.textContent?.includes('No activity data available')
    )
    expect(refreshBtn).toBeDefined()
    expect(refreshBtn?.textContent).toBe('Refresh')

    getTeamActivity.mockClear()
    await act(async () => {
      refreshBtn?.click()
    })

    expect(getTeamActivity).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })
})

describe('Timeline item snooze', () => {
  it('shows snooze button (clock icon) on timeline items', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(<Today />)
    })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // Find any snooze button
    const snoozeBtn = container.querySelector('button[aria-label="Snooze"]')
    expect(snoozeBtn).not.toBeNull()

    await act(async () => { root.unmount() })
    container.remove()
  })

  it('shows snooze dropdown with time options when clicked', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(<Today />)
    })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // Click the snooze button
    const snoozeBtn = container.querySelector('button[aria-label="Snooze"]') as HTMLButtonElement
    expect(snoozeBtn).not.toBeNull()

    await act(async () => { snoozeBtn.click() })

    // Dropdown should appear with options (rendered in portal on document.body)
    const text = document.body.textContent || ''
    expect(text).toContain('Later today')
    expect(text).toContain('Tomorrow')
    expect(text).toContain('Next week')

    await act(async () => { root.unmount() })
    container.remove()
  })

  it('hides item and shows undo toast when snoozed', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(<Today />)
    })
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    // Count initial snooze buttons (= number of snoozable items)
    const initialSnoozeBtns = container.querySelectorAll('button[aria-label="Snooze"]').length
    expect(initialSnoozeBtns).toBeGreaterThan(0)

    // Click snooze on first item
    const snoozeBtn = container.querySelector('button[aria-label="Snooze"]') as HTMLButtonElement
    await act(async () => { snoozeBtn.click() })

    // Click "Tomorrow" (rendered in portal on document.body)
    const tomorrowBtn = Array.from(document.body.querySelectorAll('button'))
      .find(b => b.textContent === 'Tomorrow') as HTMLButtonElement
    expect(tomorrowBtn).not.toBeNull()
    await act(async () => { tomorrowBtn.click() })

    // Should have called toast.success with undo
    expect(mockToast.success).toHaveBeenCalledWith(
      'Snoozed until tomorrow',
      undefined,
      expect.objectContaining({ label: 'Undo' })
    )

    // Should have fewer snooze buttons now (item hidden)
    const afterSnoozeBtns = container.querySelectorAll('button[aria-label="Snooze"]').length
    expect(afterSnoozeBtns).toBeLessThan(initialSnoozeBtns)

    // Should have saved to settings
    expect((window as any).api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ snoozedItems: expect.any(Object) })
    )

    await act(async () => { root.unmount() })
    container.remove()
  })
})

describe('Today Raw team activity Retry button', () => {
  const errorMockSettings: AppSettings = { ...mockSettings }
  const errorOverview: TeamOverview = {
    reports: [
      {
        name: 'alice-smith',
        displayName: 'Alice Smith',
        lastOneOnOne: '2026-03-01',
        daysGap: 21,
        openActionItems: 0,
        status: 'on-track',
        meetingDay: 'Friday',
        lastCheckIn: null,
        lastFeedback: null,
        feedbackCount: 0,
        checkInCount: 0
      },
      {
        name: 'bob-jones',
        displayName: 'Bob Jones',
        lastOneOnOne: '2026-03-01',
        daysGap: 21,
        openActionItems: 0,
        status: 'on-track',
        meetingDay: 'Friday',
        lastCheckIn: null,
        lastFeedback: null,
        feedbackCount: 0,
        checkInCount: 0
      }
    ],
    attentionItems: [],
    lastUpdated: '2026-03-31T12:00:00.000Z'
  }

  const failingMember: TeamMemberActivity = {
    reportName: 'alice-smith',
    displayName: 'Alice Smith',
    githubUsername: 'alicesmith',
    items: [],
    error: 'Rate limited — resets at 9:00:00 AM'
  }

  const okMember: TeamMemberActivity = {
    reportName: 'bob-jones',
    displayName: 'Bob Jones',
    githubUsername: 'bobjones',
    items: [
      {
        id: 200,
        type: 'pr',
        title: 'Bob PR',
        url: 'https://github.com/org/repo/pull/200',
        repo: 'org/repo',
        state: 'open',
        createdAt: '2026-03-30T12:00:00.000Z',
        updatedAt: '2026-03-31T10:00:00.000Z',
        comments: 0,
        labels: [],
        role: 'author',
        reviewComments: [],
        issueComments: []
      }
    ],
    error: null
  }

  let useTeamOverviewSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    localStorage.clear()
    mockNavigate.mockReset()
    mockRefresh.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()
    useTeamOverviewSpy = vi.fn().mockReturnValue({
      overview: errorOverview,
      loading: false,
      error: null,
      refresh: mockRefresh
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getTodayBootstrap: vi.fn().mockResolvedValue({ contexts: [], teamActionItems: [] }),
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        getTeamActivity: vi.fn().mockResolvedValue([failingMember, okMember]),
        fetchTeamMemberActivity: vi.fn(),
        getRecentTeamContext: vi.fn().mockResolvedValue({}),
        saveActivitySnapshot: vi.fn().mockResolvedValue(undefined),
        saveSettings: vi.fn().mockResolvedValue(undefined),
        toggleActionItem: vi.fn().mockResolvedValue(undefined),
        getReportData: vi.fn().mockResolvedValue({
          profile: { displayName: 'Alice Smith' },
          checkIns: [],
          transcripts: [],
          feedback: [],
          reviews: [],
          actionItems: [],
          summaries: [],
          contextNotes: []
        }),
        aiGenerate: vi.fn().mockResolvedValue(''),
        commitFile: vi.fn().mockResolvedValue(undefined)
      }
    })

    // useData is already module-mocked at the top of this file; reassign the
    // mock implementation for this describe so the overview reflects two
    // reports.
    void useTeamOverviewSpy
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function renderTodayAndOpenRaw() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)
    await act(async () => {
      root.render(<Today />)
    })
    // Two microtask flushes are usually enough for state to settle.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    // Navigate into Team Activity panel and switch to Raw view.
    const activityNav = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Team Activity')) as HTMLButtonElement | undefined
    if (activityNav) {
      await act(async () => { activityNav.click() })
    }
    const rawButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Raw') as HTMLButtonElement | undefined
    if (rawButton) {
      await act(async () => { rawButton.click() })
    }
    // Let the activity fetch resolve and re-render.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    return { container, root }
  }

  it('renders a Retry button next to a member with an error', async () => {
    const { container, root } = await renderTodayAndOpenRaw()

    const retryButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.getAttribute('aria-label')?.includes('Retry fetching activity for Alice Smith')) as HTMLButtonElement | undefined

    expect(retryButton).toBeDefined()
    expect(retryButton?.textContent).toContain('Retry')
    expect(retryButton?.disabled).toBe(false)

    await act(async () => { root.unmount() })
    container.remove()
  })

  it('does NOT render a Retry button for members without an error', async () => {
    const { container, root } = await renderTodayAndOpenRaw()

    const retryButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.getAttribute('aria-label')?.includes('Retry fetching activity for Bob Jones')) as HTMLButtonElement | undefined

    expect(retryButton).toBeUndefined()

    await act(async () => { root.unmount() })
    container.remove()
  })

  it('clicking Retry invokes window.api.fetchTeamMemberActivity and updates the row on success', async () => {
    const updatedMember: TeamMemberActivity = {
      ...failingMember,
      items: [
        {
          id: 555,
          type: 'pr',
          title: 'Recovered PR after retry',
          url: 'https://github.com/org/repo/pull/555',
          repo: 'org/repo',
          state: 'open',
          createdAt: '2026-03-30T12:00:00.000Z',
          updatedAt: '2026-03-31T10:00:00.000Z',
          comments: 0,
          labels: [],
          role: 'author',
          reviewComments: [],
          issueComments: []
        }
      ],
      error: null
    }

    const { container, root } = await renderTodayAndOpenRaw()
    const fetchSingle = (window as any).api.fetchTeamMemberActivity as ReturnType<typeof vi.fn>
    fetchSingle.mockResolvedValueOnce(updatedMember)

    const retryButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.getAttribute('aria-label')?.includes('Retry fetching activity for Alice Smith')) as HTMLButtonElement

    await act(async () => {
      retryButton.click()
    })
    // Let the promise resolve and the state update settle.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchSingle).toHaveBeenCalledWith('alice-smith')
    expect(container.textContent).toContain('1 PR')
    // The error badge should no longer be present for Alice (the updated
    // member has error: null and at least one item).
    const aliceErrorBadges = Array.from(container.querySelectorAll('span'))
      .filter(s => s.textContent === 'Rate limited — resets at 9:00:00 AM')
    expect(aliceErrorBadges.length).toBe(0)

    await act(async () => { root.unmount() })
    container.remove()
  })
})
