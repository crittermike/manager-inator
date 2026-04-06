// @vitest-environment happy-dom
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

const mockOnComplete = vi.fn()
const mockSaveSettings = vi.fn()
const mockIsGitRepo = vi.fn()
const mockGetReports = vi.fn()
const mockInitializeRepo = vi.fn()
const mockShowOpenDialog = vi.fn()
const mockDetectTeam = vi.fn()
const mockCreateReport = vi.fn()

import { SetupScreen } from '../../src/renderer/pages/SetupScreen'

describe('SetupScreen github-org step', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    mockOnComplete.mockReset()
    mockSaveSettings.mockReset()
    mockSaveSettings.mockResolvedValue(undefined)
    mockIsGitRepo.mockReset()
    mockIsGitRepo.mockResolvedValue(true)
    mockGetReports.mockReset()
    mockGetReports.mockResolvedValue(['alice'])
    mockInitializeRepo.mockReset()
    mockInitializeRepo.mockResolvedValue(undefined)
    mockShowOpenDialog.mockReset()
    mockDetectTeam.mockReset()
    mockDetectTeam.mockResolvedValue(null)
    mockCreateReport.mockReset()
    mockCreateReport.mockResolvedValue('test-slug')

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        saveSettings: mockSaveSettings,
        isGitRepo: mockIsGitRepo,
        getReports: mockGetReports,
        initializeRepo: mockInitializeRepo,
        showOpenDialog: mockShowOpenDialog,
        validateGithubToken: vi.fn().mockResolvedValue(true),
        detectTeam: mockDetectTeam,
        createReport: mockCreateReport
      }
    })
  })

  async function renderSetupScreen(userLogin?: string) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(<SetupScreen onComplete={mockOnComplete} userLogin={userLogin} />)
    })

    return { container, root }
  }

  async function navigateToGithubOrgStep(container: HTMLElement) {
    // Step 1: Choose "Connect existing repo"
    const connectButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Connect existing repo')) as HTMLButtonElement
    await act(async () => {
      connectButton?.click()
    })

    // Step 2: Enter repo path
    const pathInput = container.querySelector('input[type="text"]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(pathInput, '/tmp/test-repo')
      pathInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Submit repo form — goes directly to github-org (identity step removed)
    const connectSubmit = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Connect repo')) as HTMLButtonElement
    await act(async () => {
      connectSubmit?.click()
      await Promise.resolve()
    })
  }

  it('shows github-org step after repo step (identity step removed)', async () => {
    const { container, root } = await renderSetupScreen()

    await navigateToGithubOrgStep(container)

    expect(container.textContent).toContain('GitHub Organization')
    expect(container.textContent).toContain('Organization name')
    expect(container.textContent).toContain('Personal Access Token')

    await act(async () => {
      root.unmount()
    })
  })

  it('explains PAT purpose and required scopes', async () => {
    const { container, root } = await renderSetupScreen()

    await navigateToGithubOrgStep(container)

    expect(container.textContent).toContain('read your team\'s activity')
    expect(container.textContent).toContain('stored locally')
    expect(container.textContent).toContain('fine-grained PAT under your organization')
    expect(container.textContent).toContain('Contents')
    expect(container.textContent).toContain('Pull requests')

    await act(async () => {
      root.unmount()
    })
  })

  it('provides a link to create a PAT on GitHub', async () => {
    const { container, root } = await renderSetupScreen()

    await navigateToGithubOrgStep(container)

    const link = container.querySelector('a[href*="github.com"]') as HTMLAnchorElement | null
    expect(link).not.toBeNull()
    expect(link?.textContent).toContain('Create a fine-grained token')
    expect(link?.getAttribute('href')).toContain('personal-access-tokens')

    await act(async () => {
      root.unmount()
    })
  })

  it('allows skipping the github-org step', async () => {
    const { container, root } = await renderSetupScreen()

    await navigateToGithubOrgStep(container)

    // Clear the default org name so the skip button appears
    const orgNameInput = container.querySelectorAll('input')[0] as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(orgNameInput, '')
      orgNameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const skipButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Skip for now')) as HTMLButtonElement | undefined
    expect(skipButton).toBeDefined()

    await act(async () => {
      skipButton?.click()
    })

    expect(mockOnComplete).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('saves org settings and completes when no team detected', async () => {
    mockDetectTeam.mockResolvedValue(null)
    const { container, root } = await renderSetupScreen('testuser')

    await navigateToGithubOrgStep(container)

    const inputs = container.querySelectorAll('input')
    const orgNameInput = inputs[0] as HTMLInputElement
    const tokenInput = inputs[1] as HTMLInputElement

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(orgNameInput, 'my-org')
      orgNameInput.dispatchEvent(new Event('input', { bubbles: true }))
      setter?.call(tokenInput, 'ghp_test123')
      tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save & detect team')) as HTMLButtonElement

    await act(async () => {
      saveButton?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockSaveSettings).toHaveBeenCalledWith(expect.objectContaining({
      githubOrgName: 'my-org',
      githubOrgToken: 'ghp_test123',
      userGithub: 'testuser'
    }))
    expect(mockOnComplete).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('shows team confirmation when team is detected', async () => {
    mockDetectTeam.mockResolvedValue({
      user: {
        name: 'Test Manager',
        title: 'Engineering Manager',
        github: 'testuser',
        manager: { name: 'Big Boss', github: 'bigboss', title: 'Director' },
        skipLevel: { name: 'VP Person', github: 'vp', title: 'VP Engineering' }
      },
      directReports: [
        { name: 'Alice Dev', github: 'alice', title: 'Software Engineer', location: 'US' },
        { name: 'Bob Dev', github: 'bob', title: 'Senior Engineer', location: 'UK' }
      ]
    })
    const { container, root } = await renderSetupScreen('testuser')

    await navigateToGithubOrgStep(container)

    const inputs = container.querySelectorAll('input')
    const tokenInput = inputs[1] as HTMLInputElement

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(tokenInput, 'ghp_test123')
      tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save & detect team')) as HTMLButtonElement

    await act(async () => {
      saveButton?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Should show team confirm screen
    expect(container.textContent).toContain('Welcome, Test')
    expect(container.textContent).toContain('Alice Dev')
    expect(container.textContent).toContain('Bob Dev')
    expect(container.textContent).toContain('Big Boss')
    expect(container.textContent).toContain('VP Person')

    await act(async () => {
      root.unmount()
    })
  })

  it('creates reports for selected team members on confirm', async () => {
    mockDetectTeam.mockResolvedValue({
      user: {
        name: 'Test Manager',
        title: 'Engineering Manager',
        github: 'testuser'
      },
      directReports: [
        { name: 'Alice Dev', github: 'alice', title: 'Software Engineer', location: 'US' }
      ]
    })
    // getReports returns ['alice'] (default) for connect step, slug 'alice-dev' won't collide
    const { container, root } = await renderSetupScreen('testuser')

    await navigateToGithubOrgStep(container)

    const tokenInput = container.querySelectorAll('input')[1] as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(tokenInput, 'ghp_test123')
      tokenInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Click save to trigger detection
    const saveButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Save & detect team')) as HTMLButtonElement
    await act(async () => {
      saveButton?.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Confirm team
    const confirmButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Set up')) as HTMLButtonElement
    await act(async () => {
      confirmButton?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockCreateReport).toHaveBeenCalledWith('Alice Dev', expect.objectContaining({
      github: 'alice',
      role: 'Software Engineer'
    }))
    expect(mockOnComplete).toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('hides skip button when org name or token is entered', async () => {
    const { container, root } = await renderSetupScreen()

    await navigateToGithubOrgStep(container)

    // Clear the default org name so the skip button appears
    const orgNameInput = container.querySelectorAll('input')[0] as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(orgNameInput, '')
      orgNameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Skip button should be visible when both fields empty
    let skipButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Skip for now'))
    expect(skipButton).toBeDefined()

    // Enter org name
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(orgNameInput, 'my-org')
      orgNameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Skip button should be hidden when content is entered
    skipButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Skip for now'))
    expect(skipButton).toBeUndefined()

    await act(async () => {
      root.unmount()
    })
  })

  it('has a toggle to show/hide PAT token', async () => {
    const { container, root } = await renderSetupScreen()

    await navigateToGithubOrgStep(container)

    const tokenInput = container.querySelectorAll('input')[1] as HTMLInputElement
    expect(tokenInput.type).toBe('password')

    const toggleButton = container.querySelector('button[aria-label="Show token"]') as HTMLButtonElement
    expect(toggleButton).not.toBeNull()

    await act(async () => {
      toggleButton?.click()
    })

    expect(tokenInput.type).toBe('text')

    await act(async () => {
      root.unmount()
    })
  })
})
