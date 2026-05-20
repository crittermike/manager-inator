// @vitest-environment happy-dom
import React, { act } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

const mockNavigate = vi.fn()
const mockLocation = { pathname: '/' }
const mockUseTeamOverview = vi.fn()
const mockUseSettings = vi.fn()
const mockToastWarning = vi.fn()

let trayCaptureCallback: ((content: string) => void) | null = null

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}))

vi.mock('../../src/renderer/hooks/useData', () => ({
  useTeamOverview: () => mockUseTeamOverview(),
  useSettings: () => mockUseSettings(),
}))

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => ({ warning: mockToastWarning }),
}))

vi.mock('../../src/renderer/components/common/CaptureSession', () => ({
  CaptureSession: ({ id, sourceHint, initialContent }: { id: string; sourceHint: string; initialContent: string }) => (
    <div data-testid={id} data-status={sourceHint}>{initialContent}</div>
  ),
}))

vi.mock('../../src/renderer/components/common/CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}))

vi.mock('../../src/renderer/components/common/AIFloatingPanel', () => ({
  AIFloatingPanel: () => <div data-testid="ai-floating-panel" />,
}))

vi.mock('../../src/renderer/components/layout/AddReportModal', () => ({
  AddReportModal: () => null,
}))

import { CapturePanel } from '../../src/renderer/components/common/CapturePanel'
import { AppShell } from '../../src/renderer/components/layout/AppShell'

type UUIDString = `${string}-${string}-${string}-${string}-${string}`

function setupWindowApiForAppShell() {
  const onPushStatus = vi.fn((_cb: (data: { success: boolean; error?: string }) => void) => vi.fn())
  const onNavigate = vi.fn((_cb: (route: string) => void) => vi.fn())
  const onOpenCapture = vi.fn((_cb: () => void) => vi.fn())
  const onTrayCapture = vi.fn((cb: (content: string) => void) => {
    trayCaptureCallback = cb
    return vi.fn()
  })
  const onWebhookCapture = vi.fn((_cb: (payload: unknown) => void) => vi.fn())

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      onPushStatus,
      onNavigate,
      onOpenCapture,
      onTrayCapture,
      onWebhookCapture,
    },
  })

  return { onPushStatus, onNavigate, onOpenCapture, onTrayCapture, onWebhookCapture }
}

async function renderIntoBody(node: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  await act(async () => {
    root.render(node)
  })
  return { container, root }
}

describe('CapturePanel tray-capture-content integration', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
    mockUseTeamOverview.mockReset()
    mockUseSettings.mockReset()
    mockNavigate.mockReset()
    mockToastWarning.mockReset()

    mockUseTeamOverview.mockReturnValue({
      overview: { reports: [] },
      refresh: vi.fn(),
      loading: false,
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a processing session when tray-capture-content includes content', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')

    const { container, root } = await renderIntoBody(<CapturePanel open onClose={vi.fn()} />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('tray-capture-content', { detail: 'captured from tray' }))
    })

    const session = container.querySelector('[data-testid="00000000-0000-4000-8000-000000000001"]')
    expect(session).not.toBeNull()
    expect(session?.textContent).toBe('captured from tray')
    expect(container.textContent).toContain('Processing')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not create a session when tray-capture-content is empty', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000009')

    const { container, root } = await renderIntoBody(<CapturePanel open onClose={vi.fn()} />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('tray-capture-content', { detail: '' }))
    })

    const sessions = container.querySelectorAll('[data-testid]')
    expect(sessions.length).toBe(0)
    expect(container.textContent).not.toContain('processing')

    await act(async () => {
      root.unmount()
    })
  })

  it('prepends sessions for multiple tray-capture-content events (most recent first)', async () => {
    const ids: UUIDString[] = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => ids.shift() ?? '00000000-0000-4000-8000-000000000099')

    const { container, root } = await renderIntoBody(<CapturePanel open onClose={vi.fn()} />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('tray-capture-content', { detail: 'first capture' }))
      window.dispatchEvent(new CustomEvent('tray-capture-content', { detail: 'second capture' }))
      window.dispatchEvent(new CustomEvent('tray-capture-content', { detail: 'third capture' }))
    })

    const idsInDomOrder = Array.from(container.querySelectorAll('[data-testid]'))
      .map(el => el.getAttribute('data-testid'))

    expect(idsInDomOrder).toEqual([
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ])
    expect(container.textContent).toContain('0/3 done')

    await act(async () => {
      root.unmount()
    })
  })
})

describe('AppShell tray capture IPC integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
    trayCaptureCallback = null

    Object.defineProperty(globalThis, '__APP_VERSION__', {
      configurable: true,
      value: '0.0.0-test',
    })

    mockUseTeamOverview.mockReset()
    mockUseSettings.mockReset()
    mockNavigate.mockReset()
    mockToastWarning.mockReset()

    mockUseTeamOverview.mockReturnValue({
      overview: { reports: [] },
      refresh: vi.fn(),
      loading: false,
    })
    mockUseSettings.mockReturnValue({
      settings: { ptoReports: {} },
      loading: false,
      refreshSettings: vi.fn(),
    })

    setupWindowApiForAppShell()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('dispatches tray-capture-content CustomEvent with correct detail when onTrayCapture fires', async () => {
    const listener = vi.fn((e: Event) => (e as CustomEvent<string>).detail)
    window.addEventListener('tray-capture-content', listener)

    const { root } = await renderIntoBody(<AppShell><div>test</div></AppShell>)

    expect(trayCaptureCallback).not.toBeNull()

    await act(async () => {
      trayCaptureCallback?.('from tray callback')
      vi.advanceTimersByTime(100)
      await Promise.resolve()
    })

    expect(listener).toHaveBeenCalledTimes(1)
    const dispatchedEvent = listener.mock.calls[0]?.[0] as CustomEvent<string>
    expect(dispatchedEvent.type).toBe('tray-capture-content')
    expect(dispatchedEvent.detail).toBe('from tray callback')

    window.removeEventListener('tray-capture-content', listener)
    await act(async () => {
      root.unmount()
    })
  })

  it('dispatches tray-capture-content only after the 100ms delay', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const { root } = await renderIntoBody(<AppShell><div>test</div></AppShell>)

    expect(trayCaptureCallback).not.toBeNull()

    await act(async () => {
      trayCaptureCallback?.('delayed content')
      vi.advanceTimersByTime(99)
      await Promise.resolve()
    })

    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'tray-capture-content' }))

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })

    expect(dispatchSpy).toHaveBeenCalled()
    const trayDispatchCall = dispatchSpy.mock.calls.find(([event]) => event.type === 'tray-capture-content')
    expect(trayDispatchCall).toBeDefined()
    const customEvent = trayDispatchCall?.[0] as CustomEvent<string>
    expect(customEvent.detail).toBe('delayed content')

    await act(async () => {
      root.unmount()
    })
  })
})
