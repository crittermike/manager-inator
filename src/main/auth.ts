import { shell } from 'electron'
import { getToken, setToken, clearToken } from './store'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

const GITHUB_CLIENT_ID = 'Ov23ctu9WlUlp4aqg2qi'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const ALLOWED_SCHEMES = ['https:']

function isSafeUrl(url: string): boolean {
  try {
    return ALLOWED_SCHEMES.includes(new URL(url).protocol)
  } catch {
    return false
  }
}

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

let pendingDeviceCode: DeviceCodeResponse | null = null
let deviceCodeExpiresAt: number = 0

export async function getAuthStatus(): Promise<{
  authenticated: boolean
  user?: string
}> {
  const token = getToken()
  if (!token) return { authenticated: false }

  if (process.env['ELECTRON_USER_DATA']) {
    return { authenticated: true, user: 'test-user' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (res.ok) {
      const user = await res.json()
      return { authenticated: true, user: user.login }
    }
    // Only clear token on definitive auth failure (401/403), not on server errors
    if (res.status === 401 || res.status === 403) {
      clearToken()
      return { authenticated: false }
    }
    // Server error or rate limit — assume token is still valid
    console.warn(`[Auth] GitHub API returned ${res.status}, assuming token still valid`)
    return { authenticated: true }
  } catch (err) {
    // Network error (offline, DNS failure, timeout, etc.) — don't clear token
    console.warn('[Auth] Network error checking auth status:', (err as Error).message)
    return { authenticated: true }
  }
}

export async function startAuth(): Promise<{
  userCode: string
  verificationUri: string
}> {
  const body = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: 'repo'
  })
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[Auth] Device code request failed:', res.status, text)
    throw new Error(`GitHub device code request failed: ${res.status} ${text}`)
  }

  const data: DeviceCodeResponse = await res.json()
  pendingDeviceCode = data
  deviceCodeExpiresAt = Date.now() + data.expires_in * 1000

  if (isSafeUrl(data.verification_uri)) {
    shell.openExternal(data.verification_uri).catch(() => {})
  } else {
    console.warn('[Auth] Blocked unsafe verification URI:', data.verification_uri)
  }

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri
  }
}

export interface PollResult {
  success: boolean
  error?: string
  retryAfter?: number
  user?: string
}

export async function pollAuth(): Promise<PollResult> {
  if (!pendingDeviceCode) {
    console.warn('[Auth] pollAuth called but no pending device code')
    return { success: false, error: 'no_pending_code' }
  }

  if (Date.now() > deviceCodeExpiresAt) {
    console.warn('[Auth] Device code expired')
    pendingDeviceCode = null
    return { success: false, error: 'expired' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const body = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      device_code: pendingDeviceCode.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })

    const res = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body,
      signal: controller.signal
    })

    clearTimeout(timeout)

    const data = await res.json()

    if (data.access_token) {
      setToken(data.access_token)
      pendingDeviceCode = null

      // Fetch the username so the renderer can set state directly
      // without making another getAuthStatus() round-trip
      let user: string | undefined
      try {
        const userController = new AbortController()
        const userTimeout = setTimeout(() => userController.abort(), 10000)
        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${data.access_token}` },
          signal: userController.signal
        })
        clearTimeout(userTimeout)
        if (userRes.ok) {
          const userJson = await userRes.json()
          user = userJson.login
        } else {
          console.warn('[Auth] Could not fetch username (HTTP', userRes.status, '), proceeding anyway')
        }
      } catch (err) {
        console.warn('[Auth] Username fetch failed:', (err as Error).message, '— proceeding anyway')
      }

      return { success: true, user }
    }

    if (data.error === 'slow_down') {
      const retryAfter = (data.interval || 10) + 5
      return { success: false, retryAfter }
    }

    if (data.error === 'expired_token') {
      console.warn('[Auth] Device code expired (server-side)')
      pendingDeviceCode = null
      return { success: false, error: 'expired' }
    }

    if (data.error === 'access_denied') {
      console.warn('[Auth] User denied access')
      pendingDeviceCode = null
      return { success: false, error: 'denied' }
    }

    // authorization_pending is normal — user hasn't entered code yet
    return { success: false }
  } catch (err) {
    const message = (err as Error).message
    console.error('[Auth] poll error:', message)
    if (message.includes('abort')) {
      return { success: false, error: 'Request timed out' }
    }
    return { success: false, error: message }
  }
}

export async function logout(): Promise<void> {
  clearToken()
  
}
