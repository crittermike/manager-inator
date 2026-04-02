// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import type { Report, AppSettings, TeamOverview } from '../../src/shared/types'

// ── ReportDetail mocks ──

const mockNavigate = vi.fn()
const mockGenerate = vi.fn()
const mockCancel = vi.fn()
const mockReset = vi.fn()
const mockLoad = vi.fn()
const mockRefresh = vi.fn()
const mockRefreshSettings = vi.fn()
const mockUseFileContent = vi.fn()
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}

const mockSettings: { ptoReports: Record<string, string>; deactivatedReports: string[] } = { ptoReports: {}, deactivatedReports: [] }

const mockReport: Report = {
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
  useFileContent: (...args: unknown[]) => mockUseFileContent(...args),
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
  return Array.from(container.querySelectorAll('button')).find(
    button => button.textContent?.replace(/\s+/g, ' ').trim() === text
  ) as HTMLButtonElement | null
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

describe('Deactivate report from ReportDetail', () => {
  let mockSaveSettings: ReturnType<typeof vi.fn>
  let mockGetSettings: ReturnType<typeof vi.fn>

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
    mockUseFileContent.mockReset()
    mockUseFileContent.mockReturnValue({ content: null, loading: false })
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()

    mockSaveSettings = vi.fn().mockResolvedValue(undefined)
    mockGetSettings = vi.fn().mockResolvedValue({ deactivatedReports: [], ptoReports: {} })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        listContexts: vi.fn().mockResolvedValue([]),
        fetchActivityForPerson: vi.fn().mockResolvedValue(null),
        getMonthlyActivity: vi.fn().mockResolvedValue(null),
        commitFile: vi.fn().mockResolvedValue(undefined),
        getSettings: mockGetSettings,
        saveSettings: mockSaveSettings,
        resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined),
        getFileContent: vi.fn().mockResolvedValue('mock file content')
      }
    })
  })

  it('shows Deactivate button in the More actions menu', async () => {
    const { container, root } = await renderReportDetail()

    const moreBtn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    expect(moreBtn).not.toBeNull()

    await act(async () => {
      moreBtn.click()
    })

    const menu = container.querySelector('[role="menu"][aria-label="More actions menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('Deactivate')

    await act(async () => { root.unmount() })
  })

  it('shows confirmation dialog when Deactivate is clicked', async () => {
    const { container, root } = await renderReportDetail()

    const moreBtn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    await act(async () => { moreBtn.click() })

    const deactivateBtn = getButtonByText(container, 'Deactivate')
    expect(deactivateBtn).not.toBeNull()

    await act(async () => { deactivateBtn?.click() })

    // Confirmation dialog should be visible
    expect(container.textContent).toContain('Deactivate Chanakya Valluri?')
    expect(container.textContent).toContain('hidden from the sidebar')
    expect(container.textContent).toContain('reactivate them anytime from Settings')

    // More actions menu should be closed
    expect(container.querySelector('[role="menu"][aria-label="More actions menu"]')).toBeNull()

    await act(async () => { root.unmount() })
  })

  it('cancels deactivation when Cancel is clicked in the dialog', async () => {
    const { container, root } = await renderReportDetail()

    const moreBtn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    await act(async () => { moreBtn.click() })

    const deactivateBtn = getButtonByText(container, 'Deactivate')
    await act(async () => { deactivateBtn?.click() })

    const cancelBtn = getButtonByText(container, 'Cancel')
    expect(cancelBtn).not.toBeNull()
    await act(async () => { cancelBtn?.click() })

    // Dialog should be dismissed
    expect(container.textContent).not.toContain('Deactivate Chanakya Valluri?')
    expect(mockSaveSettings).not.toHaveBeenCalled()

    await act(async () => { root.unmount() })
  })

  it('deactivates the report, saves settings, and navigates to Today', async () => {
    const { container, root } = await renderReportDetail()

    const moreBtn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    await act(async () => { moreBtn.click() })

    const deactivateBtn = getButtonByText(container, 'Deactivate')
    await act(async () => { deactivateBtn?.click() })

    // Click the confirm Deactivate button in the dialog
    // There are two elements with text "Deactivate" now (the title and the button),
    // so we find the button specifically
    const confirmBtns = Array.from(container.querySelectorAll('button')).filter(
      b => b.textContent?.trim() === 'Deactivate'
    )
    const confirmBtn = confirmBtns[confirmBtns.length - 1] as HTMLButtonElement
    expect(confirmBtn).not.toBeNull()

    await act(async () => { confirmBtn.click() })

    // Should have fetched current settings and saved with report name added
    expect(mockGetSettings).toHaveBeenCalled()
    expect(mockSaveSettings).toHaveBeenCalledWith({
      deactivatedReports: ['chanakya-valluri']
    })
    expect(mockRefreshSettings).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalledWith('Chanakya Valluri deactivated')
    expect(mockNavigate).toHaveBeenCalledWith('/')

    await act(async () => { root.unmount() })
  })

  it('does not duplicate report name if already deactivated', async () => {
    mockGetSettings.mockResolvedValue({ deactivatedReports: ['chanakya-valluri'], ptoReports: {} })

    const { container, root } = await renderReportDetail()

    const moreBtn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    await act(async () => { moreBtn.click() })

    const deactivateBtn = getButtonByText(container, 'Deactivate')
    await act(async () => { deactivateBtn?.click() })

    const confirmBtns = Array.from(container.querySelectorAll('button')).filter(
      b => b.textContent?.trim() === 'Deactivate'
    )
    const confirmBtn = confirmBtns[confirmBtns.length - 1] as HTMLButtonElement
    await act(async () => { confirmBtn.click() })

    // Should not duplicate the name
    expect(mockSaveSettings).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/')

    await act(async () => { root.unmount() })
  })

  it('shows error toast if deactivation fails', async () => {
    mockSaveSettings.mockRejectedValue(new Error('Save failed'))

    const { container, root } = await renderReportDetail()

    const moreBtn = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    await act(async () => { moreBtn.click() })

    const deactivateBtn = getButtonByText(container, 'Deactivate')
    await act(async () => { deactivateBtn?.click() })

    const confirmBtns = Array.from(container.querySelectorAll('button')).filter(
      b => b.textContent?.trim() === 'Deactivate'
    )
    const confirmBtn = confirmBtns[confirmBtns.length - 1] as HTMLButtonElement
    await act(async () => { confirmBtn.click() })

    expect(mockToast.error).toHaveBeenCalledWith('Failed to deactivate report')
    expect(mockNavigate).not.toHaveBeenCalled()

    await act(async () => { root.unmount() })
  })
})
