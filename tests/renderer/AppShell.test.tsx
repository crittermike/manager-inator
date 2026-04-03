// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('../../src/renderer/components/layout/AddReportModal', () => ({
  AddReportModal: () => null
}))

import { AppShell } from '../../src/renderer/components/layout/AppShell'

async function renderShell() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<AppShell><div>content</div></AppShell>)
  })

  return { container, root }
}

describe('AppShell navigation', () => {
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
        onTrayCapture: vi.fn(() => vi.fn())
      }
    })
  })

  it('does not include People in the sidebar navigation', async () => {
    const { container, root } = await renderShell()

    const peopleButton = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('People')) as HTMLButtonElement | undefined
    expect(peopleButton).toBeUndefined()

    await act(async () => {
      root.unmount()
    })
  })
})
