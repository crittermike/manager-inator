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

  it('shows "Sync from org" button in identity section', async () => {
    const { container, root } = await renderSettings()

    const syncButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Sync from org'))
    expect(syncButton).toBeDefined()

    await act(async () => {
      root.unmount()
    })
  })

  it('displays manager and skip-level when present in settings', async () => {
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
      githubOrgName: 'github',
      hasGithubOrgToken: true,
      userName: 'Mike Crittenden',
      userGithub: 'crittermike',
      userManager: 'Jane Smith (@janesmith)',
      userSkipLevel: 'VP Person (@vp)'
    })
    const { container, root } = await renderSettings()

    expect(container.textContent).toContain('Manager')
    expect(container.textContent).toContain('Jane Smith (@janesmith)')
    expect(container.textContent).toContain('Skip-level')
    expect(container.textContent).toContain('VP Person (@vp)')

    await act(async () => {
      root.unmount()
    })
  })

  it('hides manager/skip-level section when not set', async () => {
    const { container, root } = await renderSettings()

    // Default mock has no userManager/userSkipLevel
    expect(container.textContent).not.toContain('Skip-level')

    await act(async () => {
      root.unmount()
    })
  })

  it('sync button calls detectTeam and updates settings', async () => {
    const mockDetectTeam = vi.fn().mockResolvedValue({
      user: {
        name: 'Mike C',
        title: 'EM',
        github: 'crittermike',
        manager: { name: 'Boss Person', github: 'boss', title: 'Director' },
        skipLevel: { name: 'VP Val', github: 'vp', title: 'VP' }
      },
      directReports: [
        { name: 'New Dev', github: 'newdev', title: 'SWE', location: 'US' }
      ]
    })
    const mockCreateReport = vi.fn().mockResolvedValue('new-dev')
    const mockGetReports = vi.fn().mockResolvedValue([])

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
      githubOrgName: 'github',
      hasGithubOrgToken: true,
      userName: 'Mike',
      userGithub: 'crittermike'
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getSettings: mockGetSettings,
        saveSettings: mockSaveSettings,
        clearCaches: mockClearCaches,
        getReports: mockGetReports,
        showOpenDialog: vi.fn().mockResolvedValue(null),
        detectTeam: mockDetectTeam,
        createReport: mockCreateReport
      }
    })

    const { container, root } = await renderSettings()

    const syncButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Sync from org')) as HTMLButtonElement
    expect(syncButton).toBeDefined()

    await act(async () => {
      syncButton?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockDetectTeam).toHaveBeenCalledWith('crittermike', '')
    expect(mockSaveSettings).toHaveBeenCalledWith(expect.objectContaining({
      userName: 'Mike C',
      userManager: 'Boss Person (@boss)',
      userSkipLevel: 'VP Val (@vp)'
    }))
    expect(mockCreateReport).toHaveBeenCalledWith('New Dev', expect.objectContaining({
      github: 'newdev',
      role: 'SWE'
    }))
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Added 1 new report'))

    await act(async () => {
      root.unmount()
    })
  })

  it('sync button shows "up to date" when no new reports', async () => {
    const mockDetectTeam = vi.fn().mockResolvedValue({
      user: {
        name: 'Mike',
        title: 'EM',
        github: 'crittermike'
      },
      directReports: [
        { name: 'Existing Dev', github: 'existing', title: 'SWE', location: '' }
      ]
    })
    const mockGetReports = vi.fn().mockResolvedValue(['existing-dev'])

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
      githubOrgName: 'github',
      hasGithubOrgToken: true,
      userName: 'Mike',
      userGithub: 'crittermike'
    })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getSettings: mockGetSettings,
        saveSettings: mockSaveSettings,
        clearCaches: mockClearCaches,
        getReports: mockGetReports,
        showOpenDialog: vi.fn().mockResolvedValue(null),
        detectTeam: mockDetectTeam,
        createReport: vi.fn()
      }
    })

    const { container, root } = await renderSettings()

    const syncButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Sync from org')) as HTMLButtonElement

    await act(async () => {
      syncButton?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('up to date'))

    await act(async () => {
      root.unmount()
    })
  })

  it('sync button shows error when detection fails', async () => {
    const mockDetectTeam = vi.fn().mockResolvedValue(null)

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
      githubOrgName: 'github',
      hasGithubOrgToken: true,
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
        showOpenDialog: vi.fn().mockResolvedValue(null),
        detectTeam: mockDetectTeam
      }
    })

    const { container, root } = await renderSettings()

    const syncButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Sync from org')) as HTMLButtonElement

    await act(async () => {
      syncButton?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockToast.error).toHaveBeenCalledWith(expect.stringContaining('Could not detect team'))

    await act(async () => {
      root.unmount()
    })
  })
})
