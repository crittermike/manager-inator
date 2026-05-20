// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let mockPathname = '/'
const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname })
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

vi.mock('../../src/renderer/components/layout/AddReportModal', () => ({
  AddReportModal: () => null
}))

import { AppShell } from '../../src/renderer/components/layout/AppShell'

describe('AppShell scroll-to-top on route change', () => {
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
    mockPathname = '/'
    mockNavigate.mockReset()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        onPushStatus: vi.fn(() => vi.fn()),
        onNavigate: vi.fn(() => vi.fn()),
        onOpenCapture: vi.fn(() => vi.fn()),
        onTrayCapture: vi.fn(() => vi.fn()),
        onWebhookCapture: vi.fn(() => vi.fn())
      }
    })
  })

  it('calls scrollTo(0, 0) on the content container when pathname changes', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(
        <AppShell>
          <div style={{ height: '3000px' }}>tall content</div>
        </AppShell>
      )
    })

    const scrollContainer = container.querySelector('#main-content > div') as HTMLDivElement
    expect(scrollContainer).toBeTruthy()

    const scrollToSpy = vi.fn()
    scrollContainer.scrollTo = scrollToSpy

    scrollToSpy.mockClear()

    mockPathname = '/playbook'
    await act(async () => {
      root.render(
        <AppShell>
          <div style={{ height: '3000px' }}>tall content</div>
        </AppShell>
      )
    })

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)

    await act(async () => {
      root.unmount()
    })
  })

  it('does not scroll when the pathname stays the same on re-render', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(
        <AppShell>
          <div>content</div>
        </AppShell>
      )
    })

    const scrollContainer = container.querySelector('#main-content > div') as HTMLDivElement
    const scrollToSpy = vi.fn()
    scrollContainer.scrollTo = scrollToSpy
    scrollToSpy.mockClear()

    await act(async () => {
      root.render(
        <AppShell>
          <div>updated content same route</div>
        </AppShell>
      )
    })

    expect(scrollToSpy).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('scrolls to top on multiple consecutive route changes', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(<AppShell><div>content</div></AppShell>)
    })

    const scrollContainer = container.querySelector('#main-content > div') as HTMLDivElement
    const scrollToSpy = vi.fn()
    scrollContainer.scrollTo = scrollToSpy

    const routes = ['/playbook', '/chat', '/report/alice', '/settings']
    for (const route of routes) {
      scrollToSpy.mockClear()
      mockPathname = route
      await act(async () => {
        root.render(<AppShell><div>content</div></AppShell>)
      })
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
    }

    await act(async () => {
      root.unmount()
    })
  })
})
