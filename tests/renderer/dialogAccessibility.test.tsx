// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockOnClose = vi.fn()
const mockOnCreated = vi.fn()

import { AddReportModal } from '../../src/renderer/components/layout/AddReportModal'

async function renderAddReportModal() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<AddReportModal open={true} onClose={mockOnClose} onCreated={mockOnCreated} />)
  })

  await act(async () => {
    await Promise.resolve()
  })

  return { container, root }
}

const mockNavigate = vi.fn()
const mockLocation = { pathname: '/' }

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation
}))

vi.mock('../../src/renderer/hooks/useData', () => ({
  useTeamOverview: () => ({ overview: { reports: [] }, refresh: vi.fn(), loading: false }),
  useSettings: () => ({ settings: { ptoReports: {} }, loading: false, refreshSettings: vi.fn() })
}))

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => ({ warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() })
}))

vi.mock('../../src/renderer/components/common/CommandPalette', () => ({
  CommandPalette: () => null
}))

vi.mock('../../src/renderer/components/common/AIFloatingPanel', () => ({
  AIFloatingPanel: () => null
}))

vi.mock('../../src/renderer/components/common/CapturePanel', () => ({
  CapturePanel: () => null
}))

vi.mock('../../src/renderer/components/layout/AddReportModal', async () => {
  const actual = await vi.importActual('../../src/renderer/components/layout/AddReportModal')
  return actual
})

import { AppShell } from '../../src/renderer/components/layout/AppShell'

async function renderAppShell() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<AppShell><div>content</div></AppShell>)
  })

  return { container, root }
}

describe('Dialog accessibility attributes', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    Object.defineProperty(globalThis, '__APP_VERSION__', {
      configurable: true,
      value: 'test-version',
      writable: true
    })
    document.body.innerHTML = ''
    mockOnClose.mockReset()
    mockOnCreated.mockReset()
    mockNavigate.mockReset()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getSettingsOptions: vi.fn().mockResolvedValue({ roles: ['Senior Engineer'] }),
        createReport: vi.fn().mockResolvedValue('jane-smith'),
        onPushStatus: vi.fn(() => vi.fn()),
        onNavigate: vi.fn(() => vi.fn()),
        onOpenCapture: vi.fn(() => vi.fn()),
        onTrayCapture: vi.fn(() => vi.fn()),
        onWebhookCapture: vi.fn(() => vi.fn())
      }
    })
  })

  describe('AddReportModal', () => {
    it('has role="dialog" and aria-modal="true"', async () => {
      const { root } = await renderAddReportModal()

      const dialog = document.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog?.getAttribute('aria-modal')).toBe('true')

      await act(async () => { root.unmount() })
    })

    it('has aria-labelledby pointing to the title element', async () => {
      const { root } = await renderAddReportModal()

      const dialog = document.querySelector('[role="dialog"]')
      const labelledBy = dialog?.getAttribute('aria-labelledby')
      expect(labelledBy).toBe('add-report-dialog-title')

      const title = document.getElementById('add-report-dialog-title')
      expect(title).not.toBeNull()
      expect(title?.textContent).toBe('Add direct report')

      await act(async () => { root.unmount() })
    })
  })

  describe('AppShell shortcuts modal', () => {
    it('has role="dialog" and aria-modal="true" when opened', async () => {
      const { container, root } = await renderAppShell()

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
      })

      const dialog = container.querySelector('[role="dialog"]')
      expect(dialog).not.toBeNull()
      expect(dialog?.getAttribute('aria-modal')).toBe('true')

      await act(async () => { root.unmount() })
    })

    it('has aria-labelledby pointing to the title element', async () => {
      const { container, root } = await renderAppShell()

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
      })

      const dialog = container.querySelector('[role="dialog"]')
      const labelledBy = dialog?.getAttribute('aria-labelledby')
      expect(labelledBy).toBe('shortcuts-dialog-title')

      const title = document.getElementById('shortcuts-dialog-title')
      expect(title).not.toBeNull()
      expect(title?.textContent).toBe('Keyboard shortcuts')

      await act(async () => { root.unmount() })
    })
  })
})

// ReportDetail is too complex to mount in isolation — verify source attributes directly
import { readFileSync } from 'fs'
import { join } from 'path'

describe('ReportDetail dialog attributes (static analysis)', () => {
  const source = readFileSync(
    join(__dirname, '../../src/renderer/pages/ReportDetail.tsx'),
    'utf-8'
  )

  it('PTO modal has role="dialog" and aria-modal="true"', () => {
    const ptoSection = source.slice(
      source.indexOf('PTO Modal'),
      source.indexOf('Deactivate Confirmation')
    )
    expect(ptoSection).toContain('role="dialog"')
    expect(ptoSection).toContain('aria-modal="true"')
  })

  it('PTO modal has aria-labelledby linked to its title', () => {
    const ptoSection = source.slice(
      source.indexOf('PTO Modal'),
      source.indexOf('Deactivate Confirmation')
    )
    expect(ptoSection).toContain('aria-labelledby="pto-dialog-title"')
    expect(ptoSection).toContain('id="pto-dialog-title"')
  })

  it('Deactivate modal has role="dialog" and aria-modal="true"', () => {
    const deactivateSection = source.slice(
      source.indexOf('Deactivate Confirmation')
    )
    expect(deactivateSection).toContain('role="dialog"')
    expect(deactivateSection).toContain('aria-modal="true"')
  })

  it('Deactivate modal has aria-labelledby linked to its title', () => {
    const deactivateSection = source.slice(
      source.indexOf('Deactivate Confirmation')
    )
    expect(deactivateSection).toContain('aria-labelledby="deactivate-dialog-title"')
    expect(deactivateSection).toContain('id="deactivate-dialog-title"')
  })
})
