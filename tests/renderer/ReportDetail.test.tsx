// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import type { Report } from '../../src/shared/types'

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

const mockSettings = { ptoReports: {} }

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

// Report with a context entry for expand button testing
const mockReportWithContext: Report = {
  ...mockReport,
  contextNotes: [{
    date: '2026-03-15',
    source: 'meeting',
    title: 'Weekly sync',
    summary: 'Discussed roadmap priorities.',
    tags: [],
    people: [],
    content: '',
    filename: '2026-03-15-weekly-sync.md'
  }],
  reviews: [{
    period: 'fy26-h1',
    content: '# Performance review\n\nGreat quarter.',
    title: 'FY26 H1 Review'
  }]
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

async function flushPromises(iterations = 6) {
  await act(async () => {
    for (let i = 0; i < iterations; i += 1) {
      await Promise.resolve()
    }
  })
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
    mockUseFileContent.mockReset()
    mockUseFileContent.mockReturnValue({ content: null, loading: false })
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
        resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined),
        getFileContent: vi.fn().mockResolvedValue('mock file content')
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
    expect(menu?.textContent).toContain('(Weekly) 1:1 prep')
    expect(menu?.textContent).toContain('(Monthly) Performance check-in')
    expect(menu?.textContent).toContain('(6 months) Performance review')
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

    const prepButton = getButtonByText(container, '(Weekly) 1:1 prep')
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

  it('uses check-in updatedAt for recent relative time instead of the month label', async () => {
    const originalCheckIns = mockReport.checkIns
    mockReport.checkIns = [
      {
        date: '2026-03',
        content: 'Freshly generated check-in content',
        accomplishments: ['Shipped the latest work'],
        concerns: [],
        githubActivity: {},
        updatedAt: new Date().toISOString()
      }
    ]

    try {
      const { container, root } = await renderReportDetail()

      expect(container.textContent).toContain('Monthly check-in — 2026-03')
      expect(container.textContent?.toLowerCase()).not.toContain('2 weeks ago')

      await act(async () => {
        root.unmount()
      })
    } finally {
      mockReport.checkIns = originalCheckIns
    }
  })

  it('shows full check-in content inline without a separate view-full link', async () => {
    const originalCheckIns = mockReport.checkIns
    mockReport.checkIns = [
      {
        date: '2026-03',
        content: 'Monthly check-in body',
        accomplishments: ['Shipped the latest work'],
        concerns: [],
        githubActivity: {},
        updatedAt: new Date().toISOString()
      }
    ]

    mockUseFileContent.mockImplementation((path: string | null) => (
      path === 'reports/chanakya-valluri/check-ins/monthly/2026-03.md'
        ? { content: '# Monthly check-in: 2026-03\n\nFresh inline body', loading: false }
        : { content: null, loading: false }
    ))

    try {
      const { container, root } = await renderReportDetail()

      const expandButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Monthly check-in — 2026-03')) as HTMLButtonElement | undefined
      expect(expandButton).toBeDefined()

      await act(async () => {
        expandButton?.click()
        await Promise.resolve()
      })

      expect(container.textContent).toContain('Fresh inline body')
      expect(container.textContent).not.toContain('View full check-in')

      await act(async () => {
        root.unmount()
      })
    } finally {
      mockReport.checkIns = originalCheckIns
    }
  })

  it('dispatches the canonical capture shortcut from the empty transcript state', async () => {
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent')
    const { container, root } = await renderReportDetail()

    const filterButton = getButtonByText(container, '1:1s')
    expect(filterButton).not.toBeNull()

    await act(async () => {
      filterButton?.click()
    })

    const captureButton = getButtonByText(container, 'Open capture panel to process a transcript')
    expect(captureButton).not.toBeNull()

    await act(async () => {
      captureButton?.click()
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
  })
})


describe('ReportDetail monthly check-in workflow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    ;(window as typeof window & { api: { commitFile: ReturnType<typeof vi.fn> } }).api.commitFile.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('targets previous month if generated on the 1st of the month', async () => {
    const mockDate = new Date(2026, 3, 1, 12, 0, 0)
    vi.setSystemTime(mockDate)

    const { container, root } = await renderReportDetail()
    const menuButton = container.querySelector('button[aria-label="Generate"]') as HTMLButtonElement | null

    await act(async () => {
      menuButton?.click()
    })

    const genButton = Array.from(container.querySelectorAll('button[role="menuitem"]'))
      .find(b => b.textContent?.includes('(Monthly) Performance check-in')) as HTMLButtonElement | undefined

    expect(genButton).toBeDefined()

    await act(async () => {
      genButton?.click()
    })

    await flushPromises()

    expect(mockGenerate).toHaveBeenCalledWith(
      'generate-checkin',
      expect.objectContaining({
        month: '2026-03',
        monthName: 'March 2026'
      })
    )

    expect((window as typeof window & { api: { commitFile: ReturnType<typeof vi.fn> } }).api.commitFile).toHaveBeenCalledWith(
      'reports/chanakya-valluri/check-ins/monthly/2026-03.md',
      'Generated content',
      'Save Chanakya Valluri check-in for 2026-03'
    )

    await act(async () => {
      root.unmount()
    })
  })

  it('allows inline editing and saving of check-in details', async () => {
    mockUseFileContent.mockImplementation((path: string | null) => {
      if (path === 'reports/chanakya-valluri/check-ins/monthly/2026-02.md') {
        return { content: 'Mock checkin content', loading: false }
      }
      return { content: null, loading: false }
    })

    const origCheckIns = [...mockReport.checkIns]
    mockReport.checkIns = [{
      date: '2026-02',
      content: 'Original check-in content',
      updatedAt: '2026-03-01T12:00:00Z',
      accomplishments: [],
      concerns: [],
      githubActivity: {}
    }]

    try {
      const { container, root } = await renderReportDetail()

      const filterBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Check-ins')) as HTMLButtonElement | undefined

      await act(async () => {
        filterBtn?.click()
      })

      const rowButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Monthly check-in — 2026-02')) as HTMLButtonElement | undefined

      await act(async () => {
        rowButton?.click()
      })

      const editButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.getAttribute('aria-label') === 'Edit') as HTMLButtonElement | undefined

      expect(editButton).toBeDefined()

      await act(async () => {
        editButton?.click()
      })

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null
      expect(textarea).not.toBeNull()

      await act(async () => {
        if (textarea) {
          const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          valueSetter?.call(textarea, 'Updated check-in content')
          textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
        }
      })

      expect((container.querySelector('textarea') as HTMLTextAreaElement | null)?.value).toBe('Updated check-in content')

      const saveButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Save') as HTMLButtonElement | undefined

      expect(saveButton).toBeDefined()

      await act(async () => {
        saveButton?.click()
        await Promise.resolve()
      })

      expect((window as typeof window & { api: { commitFile: ReturnType<typeof vi.fn> } }).api.commitFile).toHaveBeenCalledWith(
        'reports/chanakya-valluri/check-ins/monthly/2026-02.md',
        'Updated check-in content',
        'Update context note'
      )

      await act(async () => {
        root.unmount()
      })
    } finally {
      mockReport.checkIns = origCheckIns
    }
  })

  it('allows inline deleting of check-in details', async () => {
    mockUseFileContent.mockImplementation((path: string | null) => {
      if (path === 'reports/chanakya-valluri/check-ins/monthly/2026-02.md') {
        return { content: 'Mock checkin content', loading: false }
      }
      return { content: null, loading: false }
    })

    const origCheckIns = [...mockReport.checkIns]
    mockReport.checkIns = [{
      date: '2026-02',
      content: 'Original check-in content',
      updatedAt: '2026-03-01T12:00:00Z',
      accomplishments: [],
      concerns: [],
      githubActivity: {}
    }]

    try {
      const { container, root } = await renderReportDetail()

      const filterBtn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Check-ins')) as HTMLButtonElement | undefined

      await act(async () => {
        filterBtn?.click()
      })

      const rowButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Monthly check-in — 2026-02')) as HTMLButtonElement | undefined

      await act(async () => {
        rowButton?.click()
      })

      const deleteButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.getAttribute('aria-label') === 'Delete') as HTMLButtonElement | undefined

      expect(deleteButton).toBeDefined()

      await act(async () => {
        deleteButton?.click()
      })

      // Confirm delete step
      const confirmYes = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Yes') as HTMLButtonElement | undefined
      expect(confirmYes).toBeDefined()

      await act(async () => {
        root.unmount()
      })
    } finally {
      mockReport.checkIns = origCheckIns
    }
  })

  it('renders review content inline and supports creating a new review', async () => {
    mockUseFileContent.mockImplementation((path: string | null) => (
      path === 'reports/chanakya-valluri/reviews/2026-H1.md'
        ? { content: '# Performance review: Chanakya Valluri\n\nStrong half.', loading: false }
        : { content: null, loading: false }
    ))

    const originalReviews = mockReport.reviews
    mockReport.reviews = [{ period: '2026-H1', content: '# Performance review: Chanakya Valluri\n\nStrong half.' }]

    try {
      const { container, root } = await renderReportDetail()

      const reviewFilter = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Reviews')) as HTMLButtonElement | undefined

      await act(async () => {
        reviewFilter?.click()
      })

      const reviewRow = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Performance review — 2026-H1')) as HTMLButtonElement | undefined

      await act(async () => {
        reviewRow?.click()
      })

      expect(container.textContent).toContain('Strong half.')
      expect(container.textContent).not.toContain('View full review')

      // Open the "More actions" menu, then click "Add past review"
      const moreDropdown = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement | undefined

      await act(async () => {
        moreDropdown?.click()
      })

      const addReviewMenuItem = Array.from(container.querySelectorAll('[role="menuitem"]'))
        .find(b => b.textContent?.includes('Add past review')) as HTMLButtonElement | undefined

      await act(async () => {
        addReviewMenuItem?.click()
      })

      const inputs = container.querySelectorAll('input')
      const periodInput = Array.from(inputs).find(input => (input as HTMLInputElement).placeholder === '2026-H1') as HTMLInputElement | undefined
      const reviewTextarea = Array.from(container.querySelectorAll('textarea')).find(textarea => textarea.getAttribute('placeholder') === 'Write or paste the review here...') as HTMLTextAreaElement | undefined

      expect(periodInput).toBeDefined()
      expect(reviewTextarea).toBeDefined()

      await act(async () => {
        if (periodInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
          setter?.call(periodInput, '2026-H2')
          periodInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
        }
        if (reviewTextarea) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          setter?.call(reviewTextarea, 'New review body')
          reviewTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
        }
      })

      const saveReviewButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Save review')) as HTMLButtonElement | undefined

      await act(async () => {
        saveReviewButton?.click()
        await Promise.resolve()
      })

      expect((window as typeof window & { api: { commitFile: ReturnType<typeof vi.fn> } }).api.commitFile).toHaveBeenCalledWith(
        'reports/chanakya-valluri/reviews/2026-H2.md',
        'New review body\n',
        'Save performance review for Chanakya Valluri (2026-H2)'
      )

      await act(async () => {
        root.unmount()
      })
    } finally {
      mockReport.reviews = originalReviews
    }
  })

  it('allows inline editing and deleting of review details', async () => {
    mockUseFileContent.mockImplementation((path: string | null) => (
      path === 'reports/chanakya-valluri/reviews/2026-H1.md'
        ? { content: '# Performance review: Chanakya Valluri\n\nExisting review body', loading: false }
        : { content: null, loading: false }
    ))

    const originalReviews = mockReport.reviews
    mockReport.reviews = [{ period: '2026-H1', content: '# Performance review: Chanakya Valluri\n\nExisting review body' }]

    try {
      const { container, root } = await renderReportDetail()

      const reviewFilter = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Reviews')) as HTMLButtonElement | undefined

      await act(async () => {
        reviewFilter?.click()
      })

      const reviewRow = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Performance review — 2026-H1')) as HTMLButtonElement | undefined

      await act(async () => {
        reviewRow?.click()
      })

      const editButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.getAttribute('aria-label') === 'Edit') as HTMLButtonElement | undefined

      await act(async () => {
        editButton?.click()
      })

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null
      expect(textarea).not.toBeNull()

      await act(async () => {
        if (textarea) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          setter?.call(textarea, 'Updated review body')
          textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
        }
      })

      const saveButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Save') as HTMLButtonElement | undefined

      await act(async () => {
        saveButton?.click()
        await Promise.resolve()
      })

      expect((window as typeof window & { api: { commitFile: ReturnType<typeof vi.fn> } }).api.commitFile).toHaveBeenCalledWith(
        'reports/chanakya-valluri/reviews/2026-H1.md',
        'Updated review body',
        'Update context note'
      )

      const deleteButton = Array.from(container.querySelectorAll('button'))
        .find(b => b.getAttribute('aria-label') === 'Delete') as HTMLButtonElement | undefined

      expect(deleteButton).toBeDefined()

      await act(async () => {
        deleteButton?.click()
      })

      // Confirm delete step
      const confirmYes = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Yes') as HTMLButtonElement | undefined
      expect(confirmYes).toBeDefined()

      await act(async () => {
        root.unmount()
      })
    } finally {
      mockReport.reviews = originalReviews
    }
  })
})

describe('ReportDetail More actions menu', () => {
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

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        listContexts: vi.fn().mockResolvedValue([]),
        fetchActivityForPerson: vi.fn().mockResolvedValue(null),
        getMonthlyActivity: vi.fn().mockResolvedValue(null),
        commitFile: vi.fn().mockResolvedValue(undefined),
        getSettings: vi.fn().mockResolvedValue(mockSettings),
        resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined),
        getFileContent: vi.fn().mockResolvedValue('mock file content')
      }
    })
  })

  it('shows Add past review in the More actions menu', async () => {
    const { container, root } = await renderReportDetail()

    const moreTrigger = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement | null
    expect(moreTrigger).not.toBeNull()

    await act(async () => {
      moreTrigger?.click()
    })

    const menu = container.querySelector('[role="menu"][aria-label="More actions menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('Add past review')

    await act(async () => {
      root.unmount()
    })
  })

  it('opens review form from More actions menu', async () => {
    const { container, root } = await renderReportDetail()

    const moreTrigger = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    await act(async () => {
      moreTrigger.click()
    })

    const reviewItem = Array.from(container.querySelectorAll('[role="menuitem"]'))
      .find(b => b.textContent?.includes('Add past review')) as HTMLButtonElement

    await act(async () => {
      reviewItem?.click()
    })

    // Menu should close
    expect(container.querySelector('[role="menu"][aria-label="More actions menu"]')).toBeNull()
    // Review form should be visible (period input placeholder)
    const inputs = container.querySelectorAll('input')
    const periodInput = Array.from(inputs).find(input => (input as HTMLInputElement).placeholder === '2026-H1')
    expect(periodInput).toBeDefined()

    await act(async () => {
      root.unmount()
    })
  })
})

describe('ReportDetail More actions menu', () => {
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

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getFilesContentBulk: vi.fn().mockResolvedValue({}),
        listContexts: vi.fn().mockResolvedValue([]),
        fetchActivityForPerson: vi.fn().mockResolvedValue(null),
        getMonthlyActivity: vi.fn().mockResolvedValue(null),
        commitFile: vi.fn().mockResolvedValue(undefined),
        getSettings: vi.fn().mockResolvedValue(mockSettings),
        resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined),
        getFileContent: vi.fn().mockResolvedValue('mock file content'),
        saveSettings: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  it('shows a More actions menu with Refresh and PTO options', async () => {
    const { container, root } = await renderReportDetail()

    const moreTrigger = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement | null
    expect(moreTrigger).not.toBeNull()

    await act(async () => {
      moreTrigger?.click()
    })

    const menu = container.querySelector('[role="menu"][aria-label="More actions menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('Refresh data')
    expect(menu?.textContent).toContain('Mark PTO')

    await act(async () => {
      root.unmount()
    })
  })

  it('triggers refresh from More actions menu', async () => {
    const { container, root } = await renderReportDetail()

    const moreTrigger = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement
    await act(async () => {
      moreTrigger.click()
    })

    const refreshItem = Array.from(container.querySelectorAll('[role="menuitem"]'))
      .find(b => b.textContent?.includes('Refresh data')) as HTMLButtonElement

    await act(async () => {
      refreshItem?.click()
    })

    expect(mockRefresh).toHaveBeenCalled()
    expect(container.querySelector('[role="menu"][aria-label="More actions menu"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('closes More actions menu on outside click', async () => {
    const { container, root } = await renderReportDetail()

    const moreTrigger = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement

    await act(async () => {
      moreTrigger.click()
    })
    expect(container.querySelector('[role="menu"][aria-label="More actions menu"]')).not.toBeNull()

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(container.querySelector('[role="menu"][aria-label="More actions menu"]')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('sanitizes review period string when saving', async () => {
    const { container, root } = await renderReportDetail()

    // Open the "More actions" menu, then click "Add past review"
    const moreDropdown = container.querySelector('button[aria-label="More actions"]') as HTMLButtonElement | undefined

    await act(async () => {
      moreDropdown?.click()
    })

    const addReviewMenuItem = Array.from(container.querySelectorAll('[role="menuitem"]'))
      .find(b => b.textContent?.includes('Add past review')) as HTMLButtonElement | undefined

    await act(async () => {
      addReviewMenuItem?.click()
    })

    const inputs = container.querySelectorAll('input')
    const periodInput = Array.from(inputs).find(input => (input as HTMLInputElement).placeholder === '2026-H1') as HTMLInputElement | undefined
    const reviewTextarea = Array.from(container.querySelectorAll('textarea')).find(textarea => textarea.getAttribute('placeholder') === 'Write or paste the review here...') as HTMLTextAreaElement | undefined

    expect(periodInput).toBeDefined()
    expect(reviewTextarea).toBeDefined()

    // Enter a period with special characters that should be sanitized
    await act(async () => {
      if (periodInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        setter?.call(periodInput, '2026 H1!')
        periodInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      }
      if (reviewTextarea) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(reviewTextarea, 'Review body with sanitized period')
        reviewTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      }
    })

    const saveReviewButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save review')) as HTMLButtonElement | undefined

    await act(async () => {
      saveReviewButton?.click()
      await Promise.resolve()
    })

    // The period "2026 H1!" should be sanitized: spaces and ! replaced with hyphens
    expect((window as typeof window & { api: { commitFile: ReturnType<typeof vi.fn> } }).api.commitFile).toHaveBeenCalledWith(
      'reports/chanakya-valluri/reviews/2026-H1-.md',
      'Review body with sanitized period\n',
      'Save performance review for Chanakya Valluri (2026-H1-)'
    )

    await act(async () => {
      root.unmount()
    })
  })
})

describe('ReportDetail expand button', () => {
  it('navigates to full view for context entries', async () => {
    const origContextNotes = mockReport.contextNotes
    const origReviews = mockReport.reviews
    mockReport.contextNotes = [{
      date: '2026-03-15',
      source: 'meeting' as const,
      title: 'Weekly sync',
      summary: 'Discussed roadmap priorities.',
      tags: [],
      people: [],
      content: '',
      filename: '2026-03-15-weekly-sync.md'
    }]
    mockUseFileContent.mockReturnValue({ content: null, loading: false })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(<ReportDetail />)
    })

    // Click the context entry to expand it
    const contextEntry = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Weekly sync'))
    expect(contextEntry).toBeDefined()

    await act(async () => { contextEntry?.click() })

    // Find the expand button (Maximize2 icon, aria-label="Open full view")
    const expandBtn = container.querySelector('button[aria-label="Open full view"]') as HTMLButtonElement
    expect(expandBtn).not.toBeNull()

    await act(async () => { expandBtn.click() })

    expect(mockNavigate).toHaveBeenCalledWith(
      '/context/2026-03-15-weekly-sync.md?dir=contexts'
    )

    await act(async () => { root.unmount() })
    container.remove()
    mockReport.contextNotes = origContextNotes
    mockReport.reviews = origReviews
  })

  it('navigates to full view for review entries', async () => {
    const origReviews = mockReport.reviews
    mockReport.reviews = [{
      period: 'fy26-h1',
      content: '# Performance review\n\nGreat quarter.',
      title: 'FY26 H1 Review'
    }]
    mockUseFileContent.mockReturnValue({ content: '# Review content', loading: false })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(<ReportDetail />)
    })

    // Click the review entry to expand it
    const reviewEntry = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('FY26 H1 Review'))
    expect(reviewEntry).toBeDefined()

    await act(async () => { reviewEntry?.click() })

    const expandBtn = container.querySelector('button[aria-label="Open full view"]') as HTMLButtonElement
    expect(expandBtn).not.toBeNull()

    await act(async () => { expandBtn.click() })

    expect(mockNavigate).toHaveBeenCalledWith(
      '/context/fy26-h1.md?dir=reports/chanakya-valluri/reviews'
    )

    await act(async () => { root.unmount() })
    container.remove()
    mockReport.reviews = origReviews
  })
})

describe('ReportDetail filter switching preserves state', () => {
  it('preserves expanded entry state when switching filter tabs', async () => {
    const origFeedback = mockReport.feedback
    mockReport.feedback = [
      { date: '2026-03-20', type: 'positive', content: 'Great work on the deployment.', source: 'direct' },
      { date: '2026-03-18', type: 'constructive', content: 'Needs improvement on code reviews.', source: 'direct' }
    ]

    const origContextNotes = mockReport.contextNotes
    mockReport.contextNotes = [{
      date: '2026-03-15',
      source: 'meeting',
      title: 'Weekly sync',
      summary: 'Discussed roadmap priorities.',
      tags: [],
      people: [],
      content: '',
      filename: '2026-03-15-weekly-sync.md'
    }]

    try {
      const { container, root } = await renderReportDetail()

      const feedbackEntry = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Great work on the deployment')) as HTMLButtonElement | undefined
      expect(feedbackEntry).toBeDefined()

      await act(async () => { feedbackEntry?.click() })

      const expandedBtn = Array.from(container.querySelectorAll('button[aria-expanded="true"]'))
        .find(b => b.textContent?.includes('Great work on the deployment'))
      expect(expandedBtn).not.toBeNull()

      const feedbackFilter = getButtonByText(container, 'Feedback 2')
      expect(feedbackFilter).not.toBeNull()
      await act(async () => { feedbackFilter?.click() })

      const allFilter = getButtonByText(container, 'All')
      expect(allFilter).not.toBeNull()
      await act(async () => { allFilter?.click() })

      const stillExpanded = Array.from(container.querySelectorAll('button[aria-expanded="true"]'))
        .find(b => b.textContent?.includes('Great work on the deployment'))
      expect(stillExpanded).not.toBeNull()

      await act(async () => { root.unmount() })
    } finally {
      mockReport.feedback = origFeedback
      mockReport.contextNotes = origContextNotes
    }
  })

  it('preserves inline editing state and draft text across filter switch', async () => {
    const origFeedback = mockReport.feedback
    mockReport.feedback = [
      { date: '2026-03-20', type: 'positive', content: 'Great work on the deployment.', source: 'direct' }
    ]

    const origContextNotes = mockReport.contextNotes
    mockReport.contextNotes = [{
      date: '2026-03-15',
      source: 'meeting',
      title: 'Weekly sync',
      summary: 'Discussed roadmap priorities.',
      tags: [],
      people: [],
      content: '',
      filename: '2026-03-15-weekly-sync.md'
    }]

    try {
      const { container, root } = await renderReportDetail()

      const feedbackEntry = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Great work on the deployment')) as HTMLButtonElement | undefined
      expect(feedbackEntry).toBeDefined()
      await act(async () => { feedbackEntry?.click() })

      const editBtn = container.querySelector('button[aria-label="Edit"]') as HTMLButtonElement | null
      expect(editBtn).not.toBeNull()
      await act(async () => { editBtn?.click() })

      const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null
      expect(textarea).not.toBeNull()

      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(textarea, 'My unsaved draft')
        textarea?.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      })

      const feedbackFilter = getButtonByText(container, 'Feedback 1')
      expect(feedbackFilter).not.toBeNull()
      await act(async () => { feedbackFilter?.click() })

      const allFilter = getButtonByText(container, 'All')
      expect(allFilter).not.toBeNull()
      await act(async () => { allFilter?.click() })

      const textareaAfter = container.querySelector('textarea') as HTMLTextAreaElement | null
      expect(textareaAfter).not.toBeNull()
      expect(textareaAfter?.value).toBe('My unsaved draft')

      await act(async () => { root.unmount() })
    } finally {
      mockReport.feedback = origFeedback
      mockReport.contextNotes = origContextNotes
    }
  })
})
