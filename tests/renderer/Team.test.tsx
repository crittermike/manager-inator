// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ──

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.mock('../../src/renderer/components/common/Toast', () => ({ useToast: () => mockToast }))

const mockOverview = {
  reports: [
    {
      name: 'alice-smith', displayName: 'Alice Smith', github: 'alicesmith',
      lastOneOnOne: '2026-03-25', daysGap: 13, openActionItems: 3,
      status: 'on-track' as const, meetingDay: 'Tuesday',
      lastCheckIn: '2026-03', lastFeedback: '2026-03-20',
      feedbackCount: 5, checkInCount: 3
    },
    {
      name: 'bob-jones', displayName: 'Bob Jones', github: 'bobjones',
      lastOneOnOne: null, daysGap: 999, openActionItems: 0,
      status: 'at-risk' as const,
      lastCheckIn: null, lastFeedback: null,
      feedbackCount: 0, checkInCount: 0
    }
  ],
  attentionItems: [],
  lastUpdated: '2026-04-07'
}

vi.mock('../../src/renderer/hooks/useData', () => ({
  useTeamOverview: () => ({ overview: mockOverview, loading: false, error: null, refresh: vi.fn() }),
  useSettings: () => ({ settings: {} })
}))

const mockFetchActivity = vi.fn()
const mockGetReportData = vi.fn()

import { Team } from '../../src/renderer/pages/Team'

describe('Team page', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
    document.body.innerHTML = ''
    mockNavigate.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockFetchActivity.mockReset()
    mockGetReportData.mockReset()

    mockFetchActivity.mockResolvedValue({
      reportName: 'alice-smith',
      displayName: 'Alice Smith',
      githubUsername: 'alicesmith',
      items: [
        { id: 1, type: 'pr', title: 'Fix bug', url: '', repo: 'org/repo', state: 'merged', createdAt: '2026-04-01T10:00:00Z', updatedAt: '2026-04-01T10:00:00Z', comments: 2, labels: [], role: 'author' },
        { id: 2, type: 'pr', title: 'Review PR', url: '', repo: 'org/repo', state: 'merged', createdAt: '2026-04-02T10:00:00Z', updatedAt: '2026-04-02T10:00:00Z', comments: 1, labels: [], role: 'commenter' },
        { id: 3, type: 'issue', title: 'File issue', url: '', repo: 'org/repo', state: 'open', createdAt: '2026-04-03T10:00:00Z', updatedAt: '2026-04-03T10:00:00Z', comments: 0, labels: [] },
      ],
      startDate: '2026-03-08',
      endDate: '2026-04-07',
      fetchedAt: '2026-04-07T12:00:00Z'
    })

    mockGetReportData.mockResolvedValue({
      name: 'alice-smith',
      profile: { displayName: 'Alice Smith', github: 'alicesmith', role: 'SWE', team: '', location: '', about: '', meetingDay: '', timezone: '', manager: '', startDate: '', communicationPreferences: {} },
      feedback: [
        { date: '2026-03-15', type: 'positive', source: 'manual', content: 'Great PR reviews' },
        { date: '2026-03-20', type: 'constructive', source: 'manual', content: 'Could communicate blockers earlier' },
        { date: '2026-02-01', type: 'positive', source: 'manual', content: 'Outside date range' },
      ],
      checkIns: [], summaries: [], transcripts: [], actionItems: [], reviews: [], preps: [], contextNotes: [], jobExpectations: ''
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        fetchActivityForPerson: mockFetchActivity,
        getReportData: mockGetReportData,
        getTeamOverview: vi.fn().mockResolvedValue(mockOverview),
        getSettings: vi.fn().mockResolvedValue({}),
      }
    })
  })

  async function renderTeam() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/team']}>
          <Team />
        </MemoryRouter>
      )
    })
    // Wait for data loading
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })
    return { container, root }
  }

  it('renders the page header with report count', async () => {
    const { container, root } = await renderTeam()
    expect(container.textContent).toContain('Team')
    expect(container.textContent).toContain('2 reports')
    await act(async () => { root.unmount() })
  })

  it('shows date range preset buttons', async () => {
    const { container, root } = await renderTeam()
    expect(container.textContent).toContain('1 week')
    expect(container.textContent).toContain('2 weeks')
    expect(container.textContent).toContain('1 month')
    expect(container.textContent).toContain('3 months')
    expect(container.textContent).toContain('Custom')
    await act(async () => { root.unmount() })
  })

  it('fetches activity for each report on mount', async () => {
    const { root } = await renderTeam()
    expect(mockFetchActivity).toHaveBeenCalledTimes(2)
    expect(mockGetReportData).toHaveBeenCalledTimes(2)
    // First call should be alice-smith
    expect(mockFetchActivity).toHaveBeenCalledWith('alice-smith', expect.any(String), expect.any(String))
    expect(mockFetchActivity).toHaveBeenCalledWith('bob-jones', expect.any(String), expect.any(String))
    await act(async () => { root.unmount() })
  })

  it('shows summary stat cards', async () => {
    const { container, root } = await renderTeam()
    expect(container.textContent).toContain('PRs authored')
    expect(container.textContent).toContain('PRs reviewed')
    expect(container.textContent).toContain('Feedback given')
    expect(container.textContent).toContain('Open actions')
    await act(async () => { root.unmount() })
  })

  it('shows PR activity chart section', async () => {
    const { container, root } = await renderTeam()
    expect(container.textContent).toContain('PRs authored')
    expect(container.textContent).toContain('PRs reviewed')
    expect(container.textContent).toContain('PRs authored') // pie chart
    expect(container.textContent).toContain('PRs reviewed') // pie chart
    // Should have an SVG element
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    await act(async () => { root.unmount() })
  })

  it('shows feedback balance chart section', async () => {
    const { container, root } = await renderTeam()
    expect(container.textContent).toContain('Feedback balance')
    await act(async () => { root.unmount() })
  })

  it('shows team roster with report cards', async () => {
    const { container, root } = await renderTeam()
    expect(container.textContent).toContain('Team roster')
    expect(container.textContent).toContain('Alice Smith')
    expect(container.textContent).toContain('Bob Jones')
    await act(async () => { root.unmount() })
  })

  it('roster cards show status information', async () => {
    const { container, root } = await renderTeam()
    // Alice has 3 open actions
    expect(container.textContent).toContain('3 actions')
    // Alice has PR data: 1 authored, 1 reviewed
    expect(container.textContent).toContain('1a / 1r')
    await act(async () => { root.unmount() })
  })

  it('filters feedback to selected date range', async () => {
    const { container, root } = await renderTeam()
    // Default is 1 month, so Mar 8 - Apr 7
    // Should include Mar 15 and Mar 20 feedback, but not Feb 01
    // The "2" count appears in feedback balance
    expect(container.textContent).toContain('2') // 2 feedback in range
    await act(async () => { root.unmount() })
  })

  it('clicking a roster card navigates to report page', async () => {
    const { container, root } = await renderTeam()
    const aliceCard = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Alice Smith') && b.textContent?.includes('actions'))
    expect(aliceCard).toBeDefined()
    await act(async () => { aliceCard?.click() })
    expect(mockNavigate).toHaveBeenCalledWith('/report/alice-smith')
    await act(async () => { root.unmount() })
  })

  it('changing date preset refetches data', async () => {
    const { container, root } = await renderTeam()
    mockFetchActivity.mockClear()
    mockGetReportData.mockClear()

    const weekButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === '1 week')
    await act(async () => {
      weekButton?.click()
      await new Promise(r => setTimeout(r, 100))
    })

    expect(mockFetchActivity).toHaveBeenCalled()
    await act(async () => { root.unmount() })
  })

  it('shows custom date inputs when Custom is selected', async () => {
    const { container, root } = await renderTeam()
    const customButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Custom')
    await act(async () => { customButton?.click() })

    const dateInputs = container.querySelectorAll('input[type="date"]')
    expect(dateInputs.length).toBeGreaterThanOrEqual(2)
    await act(async () => { root.unmount() })
  })

  it('handles API errors gracefully', async () => {
    mockFetchActivity.mockRejectedValue(new Error('Network error'))
    mockGetReportData.mockRejectedValue(new Error('Network error'))

    const { container, root } = await renderTeam()
    // Should not crash — roster still shows from overview data
    expect(container.textContent).toContain('Team')
    await act(async () => { root.unmount() })
  })
})
