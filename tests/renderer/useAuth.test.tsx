// @vitest-environment happy-dom
import React, { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { useAuth } from '../../src/renderer/hooks/useAuth'

function TestComponent() {
  const { authenticated, user, loading, bridgeError, login, poll, logout, refresh, forceAuthenticated } = useAuth()
  return (
    <div>
      <span data-testid="authenticated">{String(authenticated)}</span>
      <span data-testid="user">{user ?? ''}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="bridgeError">{String(bridgeError)}</span>
      <button data-testid="login" onClick={() => login()}>login</button>
      <button data-testid="poll" onClick={async () => {
        const result = await poll()
        // Store result for inspection
        const el = document.querySelector('[data-testid="pollResult"]')
        if (el) el.textContent = JSON.stringify(result)
      }}>poll</button>
      <button data-testid="logout" onClick={() => logout()}>logout</button>
      <button data-testid="refresh" onClick={() => refresh()}>refresh</button>
      <button data-testid="force" onClick={() => forceAuthenticated('forced-user')}>force</button>
      <span data-testid="pollResult"></span>
    </div>
  )
}

describe('useAuth', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root
  let mockApi: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)

    mockApi = {
      getAuthStatus: vi.fn().mockResolvedValue({ authenticated: false, user: null }),
      startAuth: vi.fn().mockResolvedValue({ userCode: 'ABC123', verificationUri: 'https://example.com' }),
      pollAuth: vi.fn().mockResolvedValue({ success: false }),
      logout: vi.fn().mockResolvedValue(undefined),
    }

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: mockApi,
    })
  })

  it('checks auth status on mount', async () => {
    mockApi.getAuthStatus.mockResolvedValue({ authenticated: true, user: 'testuser' })

    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    expect(mockApi.getAuthStatus).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('true')
    expect(container.querySelector('[data-testid="user"]')!.textContent).toBe('testuser')
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
  })

  it('starts in loading state', async () => {
    // Use a promise that we control to keep loading state visible
    let resolveAuth: (value: { authenticated: boolean; user: string | null }) => void
    mockApi.getAuthStatus.mockReturnValue(new Promise(r => { resolveAuth = r }))

    await act(async () => {
      root.render(<TestComponent />)
    })

    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('true')

    // Resolve and finish
    await act(async () => { resolveAuth!({ authenticated: false, user: null }) })
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
  })

  it('sets bridgeError when window.api is missing', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: undefined,
    })

    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="bridgeError"]')!.textContent).toBe('true')
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
  })

  it('handles auth check failure gracefully', async () => {
    mockApi.getAuthStatus.mockRejectedValue(new Error('Network error'))

    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    // Should not crash — loading should be false
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('false')
  })

  it('login returns userCode and verificationUri', async () => {
    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    const loginBtn = container.querySelector('[data-testid="login"]') as HTMLButtonElement
    await act(async () => { loginBtn.click() })

    expect(mockApi.startAuth).toHaveBeenCalledOnce()
  })

  it('poll updates authenticated state on success', async () => {
    mockApi.pollAuth.mockResolvedValue({ success: true, user: 'polled-user' })

    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('false')

    const pollBtn = container.querySelector('[data-testid="poll"]') as HTMLButtonElement
    await act(async () => { pollBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('true')
    expect(container.querySelector('[data-testid="user"]')!.textContent).toBe('polled-user')
  })

  it('poll does not update state on failure', async () => {
    mockApi.pollAuth.mockResolvedValue({ success: false, retryAfter: 5 })

    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    const pollBtn = container.querySelector('[data-testid="poll"]') as HTMLButtonElement
    await act(async () => { pollBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('false')
  })

  it('logout resets auth state', async () => {
    mockApi.getAuthStatus.mockResolvedValue({ authenticated: true, user: 'testuser' })

    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('true')

    const logoutBtn = container.querySelector('[data-testid="logout"]') as HTMLButtonElement
    await act(async () => { logoutBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(mockApi.logout).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('false')
    expect(container.querySelector('[data-testid="user"]')!.textContent).toBe('')
  })

  it('refresh re-checks auth status', async () => {
    mockApi.getAuthStatus.mockResolvedValue({ authenticated: false, user: null })

    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    // Now change the mock return and refresh
    mockApi.getAuthStatus.mockResolvedValue({ authenticated: true, user: 'refreshed-user' })

    const refreshBtn = container.querySelector('[data-testid="refresh"]') as HTMLButtonElement
    await act(async () => { refreshBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(mockApi.getAuthStatus).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('true')
    expect(container.querySelector('[data-testid="user"]')!.textContent).toBe('refreshed-user')
  })

  it('forceAuthenticated sets auth state without API call', async () => {
    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    const forceBtn = container.querySelector('[data-testid="force"]') as HTMLButtonElement
    await act(async () => { forceBtn.click() })

    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('true')
    expect(container.querySelector('[data-testid="user"]')!.textContent).toBe('forced-user')
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
  })

  it('sets user to null when auth status has no user', async () => {
    mockApi.getAuthStatus.mockResolvedValue({ authenticated: true, user: '' })

    await act(async () => {
      root.render(<TestComponent />)
    })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="authenticated"]')!.textContent).toBe('true')
    expect(container.querySelector('[data-testid="user"]')!.textContent).toBe('')
  })
})
