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
  console.log('[Auth] getAuthStatus called, hasToken:', !!token)
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
      console.log('[Auth] Token valid, user:', user.login)
      return { authenticated: true, user: user.login }
    }
    // Only clear token on definitive auth failure (401/403), not on server errors
    if (res.status === 401 || res.status === 403) {
      console.log('[Auth] Token invalid (HTTP', res.status, '), clearing')
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
  console.log('[Auth] Starting device code flow...')
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'repo'
    })
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[Auth] Device code request failed:', res.status, text)
    throw new Error(`GitHub device code request failed: ${res.status} ${text}`)
  }

  const data: DeviceCodeResponse = await res.json()
  pendingDeviceCode = data
  deviceCodeExpiresAt = Date.now() + data.expires_in * 1000
  console.log('[Auth] Got device code, expires in', data.expires_in, 'seconds, interval:', data.interval, 'seconds')

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
}

export async function pollAuth(): Promise<PollResult> {
  console.log('[Auth] pollAuth called, pendingDeviceCode:', !!pendingDeviceCode)
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

    const res = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: pendingDeviceCode.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    const data = await res.json()
    console.log('[Auth] poll response status:', res.status, 'error:', data.error || 'none', 'has_token:', !!data.access_token)

    if (data.access_token) {
      console.log('[Auth] Got access token, storing...')
      setToken(data.access_token)
      pendingDeviceCode = null
      console.log('[Auth] Token stored, returning success')
      return { success: true }
    }

    if (data.error === 'slow_down') {
      // GitHub wants us to increase the polling interval
      const retryAfter = (data.interval || 10) + 5
      console.log('[Auth] GitHub says slow_down, retry after', retryAfter, 'seconds')
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
