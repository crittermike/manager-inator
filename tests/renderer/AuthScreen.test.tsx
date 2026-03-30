// @vitest-environment happy-dom
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { act } from 'react-dom/test-utils'

const mockLogin = vi.fn()
const mockPoll = vi.fn()

vi.mock('../../src/renderer/hooks/useAuth', () => ({
  useAuth: () => ({
    login: mockLogin,
    poll: mockPoll
  })
}))

import { AuthScreen } from '../../src/renderer/pages/AuthScreen'

describe('AuthScreen polling flow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockLogin.mockReset()
    mockPoll.mockReset()
    document.body.innerHTML = ''
  })

  it('continues polling after login when mounted in StrictMode', async () => {
    mockLogin.mockResolvedValue({ userCode: 'ABCD-EFGH', verificationUri: 'https://github.com/login/device' })
    mockPoll.mockResolvedValue({ success: false })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    await act(async () => {
      root.render(
        <React.StrictMode>
          <AuthScreen onAuthenticated={vi.fn()} />
        </React.StrictMode>
      )
    })

    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.textContent).toContain('Connect with GitHub')

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(mockLogin).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(6000)
      await Promise.resolve()
    })

    expect(mockPoll).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.unmount()
    })
  })
})
