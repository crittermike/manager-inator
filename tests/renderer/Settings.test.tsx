// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLogout = vi.fn()
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}
const mockClearCaches = vi.fn()
const mockGetSettings = vi.fn()
const mockSaveSettings = vi.fn()

vi.mock('../../src/renderer/hooks/useAuth', () => ({
  useAuth: () => ({ user: 'crittermike', logout: mockLogout })
}))

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => mockToast
}))

vi.mock('../../src/renderer/hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({ blockerState: 'idle', proceed: vi.fn(), reset: vi.fn() })
}))

vi.mock('../../src/renderer/hooks/useKeyboardShortcut', () => ({
  useKeyboardShortcut: () => {}
}))

vi.mock('../../src/renderer/components/common/ConfirmDialog', () => ({
  ConfirmDialog: () => null
}))

import { Settings } from '../../src/renderer/pages/Settings'

async function renderSettings() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<Settings />)
  })

  await act(async () => {
    await Promise.resolve()
  })

  return { container, root }
}

describe('Settings clear caches action', () => {
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
    mockLogout.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()
    mockClearCaches.mockReset()
    mockGetSettings.mockReset()
    mockSaveSettings.mockReset()

    mockGetSettings.mockResolvedValue({
      repoPath: '/tmp/repo',
      defaultModel: 'gpt-4.1',
      checkInFrequency: 'monthly',
      feedbackReminderDays: 14,
      staleActionDays: 5,
      sprintLengthWeeks: 2,
      endOfWeekDay: 'friday',
      sprintStartDate: '',
      aiCustomInstructions: '',
      githubOrgName: '',
      hasGithubOrgToken: false,
      userName: 'Mike',
      userGithub: 'crittermike'
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getSettings: mockGetSettings,
        saveSettings: mockSaveSettings,
        clearCaches: mockClearCaches,
        getReports: vi.fn().mockResolvedValue([]),
        showOpenDialog: vi.fn().mockResolvedValue(null)
      }
    })
  })

  it('clears caches and shows success feedback', async () => {
    mockClearCaches.mockResolvedValue(undefined)
    const { container, root } = await renderSettings()

    const button = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('Clear all caches')) as HTMLButtonElement | undefined
    expect(button).toBeDefined()

    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(mockClearCaches).toHaveBeenCalledTimes(1)
    expect(mockToast.success).toHaveBeenCalledWith('All caches cleared')

    await act(async () => {
      root.unmount()
    })
  })

  it('shows error feedback when cache clearing fails', async () => {
    mockClearCaches.mockRejectedValue(new Error('boom'))
    const { container, root } = await renderSettings()

    const button = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes('Clear all caches')) as HTMLButtonElement | undefined
    expect(button).toBeDefined()

    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(mockClearCaches).toHaveBeenCalledTimes(1)
    expect(mockToast.error).toHaveBeenCalledWith('Failed to clear caches')

    await act(async () => {
      root.unmount()
    })
  })

  it('renders refined settings cards and inset field chrome', async () => {
    const { container, root } = await renderSettings()

    const repoInput = container.querySelector('input[aria-label="Local repo path"]') as HTMLInputElement | null
    expect(repoInput?.className).toContain('shadow-inner')
    expect(repoInput?.className).toContain('focus:ring-brand/15')

    const accountCard = Array.from(container.querySelectorAll('div')).find(node => node.className.includes('rounded-2xl') && node.textContent?.includes('Connected via GitHub')) as HTMLDivElement | undefined
    expect(accountCard?.className).toContain('shadow-[0_12px_32px_rgba(0,0,0,0.18)]')

    await act(async () => {
      root.unmount()
    })
  })
})
