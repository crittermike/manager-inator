import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/store', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  clearToken: vi.fn()
}))

import { shell } from 'electron'
import { startAuth, pollAuth } from '../../src/main/auth'
import { setToken } from '../../src/main/store'

const mockedSetToken = vi.mocked(setToken)
const mockedOpenExternal = vi.mocked(shell.openExternal)

describe('auth device flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('requests the device code with form-encoded parameters', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        device_code: 'device-code-123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5
      })
    } as Response)

    const result = await startAuth()

    expect(result).toEqual({
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device'
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://github.com/login/device/code',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        }),
        body: expect.any(URLSearchParams)
      })
    )
    const [, init] = vi.mocked(global.fetch).mock.calls[0]
    expect((init?.body as URLSearchParams).toString()).toBe('client_id=Ov23ctu9WlUlp4aqg2qi&scope=repo')
    expect(mockedOpenExternal).toHaveBeenCalledWith('https://github.com/login/device')
  })

  it('polls for an access token with form-encoded parameters and returns success', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          device_code: 'device-code-123',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'gho_test_token',
          token_type: 'bearer',
          scope: 'repo'
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ login: 'crittermike' })
      } as Response)

    await startAuth()
    const result = await pollAuth()

    expect(result).toEqual({ success: true, user: 'crittermike' })
    expect(mockedSetToken).toHaveBeenCalledWith('gho_test_token')
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        }),
        body: expect.any(URLSearchParams)
      })
    )
    const [, tokenInit] = vi.mocked(global.fetch).mock.calls[1]
    expect((tokenInit?.body as URLSearchParams).toString()).toBe(
      'client_id=Ov23ctu9WlUlp4aqg2qi&device_code=device-code-123&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code'
    )
  })
})
