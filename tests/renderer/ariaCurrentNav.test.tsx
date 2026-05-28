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
  useTeamOverview: () => ({
    overview: {
      reports: [
        { name: 'alice', displayName: 'Alice Smith', github: 'alicegh' },
        { name: 'bob', displayName: 'Bob Jones', github: '' }
      ]
    },
    refresh: vi.fn(),
    loading: false
  }),
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

async function renderShell(pathname: string) {
  mockPathname = pathname
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<AppShell><div>content</div></AppShell>)
  })

  return { container, root }
}

describe('aria-current="page" on navigation elements', () => {
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

  it('marks the Today nav item as current on the root path', async () => {
    const { container, root } = await renderShell('/')

    const todayBtn = Array.from(container.querySelectorAll('nav button')).find(
      b => b.textContent?.includes('Today')
    )
    expect(todayBtn?.getAttribute('aria-current')).toBe('page')

    await act(async () => { root.unmount() })
  })

  it('does not mark nav items as current when on a different route', async () => {
    const { container, root } = await renderShell('/report/alice')

    const todayBtn = Array.from(container.querySelectorAll('nav button')).find(
      b => b.textContent?.includes('Today')
    )
    expect(todayBtn?.getAttribute('aria-current')).toBeNull()

    await act(async () => { root.unmount() })
  })

  it('marks the active report button as current', async () => {
    const { container, root } = await renderShell('/report/alice')

    const aliceBtn = Array.from(container.querySelectorAll('nav button')).find(
      b => b.textContent?.includes('Alice Smith')
    )
    expect(aliceBtn?.getAttribute('aria-current')).toBe('page')

    await act(async () => { root.unmount() })
  })

  it('does not mark inactive report buttons as current', async () => {
    const { container, root } = await renderShell('/report/alice')

    const bobBtn = Array.from(container.querySelectorAll('nav button')).find(
      b => b.textContent?.includes('Bob Jones')
    )
    expect(bobBtn?.getAttribute('aria-current')).toBeNull()

    await act(async () => { root.unmount() })
  })

  it('marks My Profile button as current on /my-profile', async () => {
    const { container, root } = await renderShell('/my-profile')

    const profileBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'My Profile'
    )
    expect(profileBtn?.getAttribute('aria-current')).toBe('page')

    await act(async () => { root.unmount() })
  })

  it('does not mark My Profile button as current on other routes', async () => {
    const { container, root } = await renderShell('/')

    const profileBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'My Profile'
    )
    expect(profileBtn?.getAttribute('aria-current')).toBeNull()

    await act(async () => { root.unmount() })
  })

  it('marks Settings button as current on /settings', async () => {
    const { container, root } = await renderShell('/settings')

    const settingsBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'Settings'
    )
    expect(settingsBtn?.getAttribute('aria-current')).toBe('page')

    await act(async () => { root.unmount() })
  })

  it('does not mark Settings button as current on other routes', async () => {
    const { container, root } = await renderShell('/')

    const settingsBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'Settings'
    )
    expect(settingsBtn?.getAttribute('aria-current')).toBeNull()

    await act(async () => { root.unmount() })
  })
})
