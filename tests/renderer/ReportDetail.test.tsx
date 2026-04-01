// @vitest-environment happy-dom
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

const mockNavigate = vi.fn()
const mockGenerate = vi.fn()
const mockCancel = vi.fn()
const mockReset = vi.fn()
const mockLoad = vi.fn()
const mockRefresh = vi.fn()
const mockRefreshSettings = vi.fn()
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}

const mockSettings = { ptoReports: {} }

const mockReport = {
  name: 'chanakya-valluri',
  profile: {
    name: 'chanakya-valluri',
    displayName: 'Chanakya Valluri',
    role: 'Software Engineer',
    team: 'Big Orca',
    github: 'chanakyav',
    startDate: '2022-01-31',
    meetingDay: 'Wednesday',
    location: 'North Carolina',
    timezone: 'EST',
    manager: 'Manager',
    about: 'About text',
    communicationPreferences: {}
  },
  checkIns: [],
  summaries: [],
  transcripts: [],
  actionItems: [],
  feedback: [],
  reviews: [],
  preps: [],
  contextNotes: [],
  dashboard: '',
  jobExpectations: ''
}

vi.mock('react-router-dom', () => ({
  useParams: () => ({ name: 'chanakya-valluri' }),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()]
}))

vi.mock('../../src/renderer/hooks/useData', () => ({
  useReportData: () => ({
    report: mockReport,
    setReport: vi.fn(),
    loading: false,
    error: null,
    load: mockLoad,
    refresh: mockRefresh
  }),
  useFileContent: () => ({ content: null, loading: false }),
  useSettings: () => ({ settings: mockSettings, loading: false, refreshSettings: mockRefreshSettings })
}))

vi.mock('../../src/renderer/hooks/useAI', () => ({
  useAI: () => ({
    streaming: false,
    streamedText: '',
    generate: mockGenerate,
    cancel: mockCancel,
    reset: mockReset,
    fullTextRef: { current: '' }
  })
}))

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => mockToast
}))

vi.mock('../../src/renderer/hooks/useKeyboardShortcut', () => ({
  useKeyboardShortcut: () => {}
}))

vi.mock('../../src/renderer/components/common/ConfirmDialog', () => ({
  ConfirmDialog: () => null
}))

import { ReportDetail } from '../../src/renderer/pages/ReportDetail'

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll('button')).find(button => button.textContent?.replace(/\s+/g, ' ').trim() === text) as HTMLButtonElement | null
}

async function renderReportDetail() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<ReportDetail />)
  })

  return { container, root }
}

describe('ReportDetail AI actions menu', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    mockNavigate.mockReset()
    mockGenerate.mockReset()
    mockGenerate.mockResolvedValue('Generated content')
    mockCancel.mockReset()
    mockReset.mockReset()
    mockLoad.mockReset()
    mockRefresh.mockReset()
    mockRefreshSettings.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        listContexts: vi.fn().mockResolvedValue([]),
        fetchActivityForPerson: vi.fn().mockResolvedValue(null),
        getMonthlyActivity: vi.fn().mockResolvedValue(null),
        commitFile: vi.fn().mockResolvedValue(undefined),
        getSettings: vi.fn().mockResolvedValue(mockSettings),
        resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  it('shows a single AI actions trigger with menu items for all AI tasks', async () => {
    const { container, root } = await renderReportDetail()

    const trigger = container.querySelector('button[aria-label="Generate"]') as HTMLButtonElement | null
    expect(trigger).not.toBeNull()
    expect(trigger?.textContent).toContain('Generate')

    await act(async () => {
      trigger?.click()
    })

    const menu = container.querySelector('[role="menu"][aria-label="Generate menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('1:1 prep')
    expect(menu?.textContent).toContain('Monthly performance check-in')
    expect(menu?.textContent).toContain('Bi-annual performance review')
    expect(menu?.textContent).toContain('GitHub activity summary')

    await act(async () => {
      root.unmount()
    })
  })

  it('opens the GitHub Activity panel from the AI actions menu', async () => {
    const { container, root } = await renderReportDetail()

    const trigger = container.querySelector('button[aria-label="Generate"]') as HTMLButtonElement
    await act(async () => {
      trigger.click()
    })

    const githubActivity = getButtonByText(container, 'GitHub activity summary')
    expect(githubActivity).not.toBeNull()

    await act(async () => {
      githubActivity?.click()
    })

    expect(container.querySelector('[role="menu"][aria-label="Generate menu"]')).toBeNull()
    expect(container.textContent).toContain('GitHub Activity')
    expect(container.querySelector('button[aria-label="Close activity panel"]')).not.toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('starts prep generation from the AI actions menu and closes the menu', async () => {
    const { container, root } = await renderReportDetail()

    const trigger = container.querySelector('button[aria-label="Generate"]') as HTMLButtonElement
    await act(async () => {
      trigger.click()
    })

    const prepButton = getButtonByText(container, '1:1 prep')
    expect(prepButton).not.toBeNull()

    await act(async () => {
      prepButton?.click()
      await Promise.resolve()
    })

    expect(mockReset).toHaveBeenCalledTimes(1)
    expect(mockGenerate).toHaveBeenCalledWith('prep-one-on-one', expect.objectContaining({
      reportName: 'Chanakya Valluri'
    }))
    expect(container.querySelector('[role="menu"][aria-label="Generate menu"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('closes the AI actions menu on outside click and Escape', async () => {
    const { container, root } = await renderReportDetail()

    const trigger = container.querySelector('button[aria-label="Generate"]') as HTMLButtonElement

    await act(async () => {
      trigger.click()
    })
    expect(container.querySelector('[role="menu"][aria-label="Generate menu"]')).not.toBeNull()

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(container.querySelector('[role="menu"][aria-label="Generate menu"]')).toBeNull()

    await act(async () => {
      trigger.click()
    })
    expect(container.querySelector('[role="menu"][aria-label="Generate menu"]')).not.toBeNull()

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[role="menu"][aria-label="Generate menu"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('updates aria-expanded with menu state', async () => {
    const { container, root } = await renderReportDetail()

    const trigger = container.querySelector('button[aria-label="Generate"]') as HTMLButtonElement
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      trigger.click()
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      root.unmount()
    })
  })
})
