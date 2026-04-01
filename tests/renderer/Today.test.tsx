// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, TeamOverview, TeamMemberActivity } from '../../src/shared/types'

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
  ptoReports: {},
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

vi.mock('../../src/renderer/pages/today-components', () => ({
  InlinePrep: () => <div>Inline prep</div>,
  InlineActions: () => <div>Inline actions</div>,
  InlinePrompt: () => <div>Inline prompt</div>,
  InlineFeedback: () => <div>Inline feedback</div>
}))

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
        toggleActionItem: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  it('renders strengthened Today sections and visible row actions', async () => {
    const { container, root } = await renderToday()

    const overdueHeader = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Overdue')) as HTMLButtonElement | undefined
    expect(overdueHeader).toBeDefined()
    expect(overdueHeader?.className).toContain('py-4')
    expect(overdueHeader?.closest('div')?.className).toContain('rounded-2xl')

    expect(container.textContent).toContain('1:1 with Alice Smith is overdue')
    expect(container.textContent).toContain('No feedback logged for Alice Smith')

    const visibleAction = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'View') as HTMLButtonElement | undefined
    expect(visibleAction).toBeDefined()
    expect(visibleAction?.className).toContain('uppercase')

    await act(async () => {
      root.unmount()
    })
  })

  it('collapses and re-expands a Today section without losing items', async () => {
    const { container, root } = await renderToday()

    const overdueHeader = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Overdue')) as HTMLButtonElement
    expect(container.textContent).toContain('1:1 with Alice Smith is overdue')

    await act(async () => {
      overdueHeader.click()
    })

    expect(container.textContent).not.toContain('1:1 with Alice Smith is overdue')

    await act(async () => {
      overdueHeader.click()
    })

    expect(container.textContent).toContain('1:1 with Alice Smith is overdue')

    await act(async () => {
      root.unmount()
    })
  })

  it('renders the team activity card with the refined header rhythm', async () => {
    const { container, root } = await renderToday()

    const activityHeader = Array.from(container.querySelectorAll('div')).find(node => node.textContent?.includes('Team Activity')) as HTMLDivElement | undefined
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

      const transcriptButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Process a meeting transcript')) as HTMLButtonElement | undefined
      expect(transcriptButton).toBeDefined()

      await act(async () => {
        transcriptButton?.click()
      })

      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'keydown',
        key: 'n',
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
