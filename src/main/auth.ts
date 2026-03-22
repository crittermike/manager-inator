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

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` }
    })
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
    // Network error (offline, DNS failure, etc.) — don't clear token
    console.warn('[Auth] Network error checking auth status:', (err as Error).message)
    return { authenticated: true }
  }
}

export async function startAuth(): Promise<{
  userCode: string
  verificationUri: string
}> {
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

export async function pollAuth(): Promise<boolean> {
  if (isDev) console.log('[Auth] pollAuth called, pendingDeviceCode:', !!pendingDeviceCode)
  if (!pendingDeviceCode) return false

  if (Date.now() > deviceCodeExpiresAt) {
    console.warn('[Auth] Device code expired')
    pendingDeviceCode = null
    throw new Error('Device code expired. Please start authentication again.')
  }

  try {
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
      })
    })

    const data = await res.json()
    if (isDev) console.log('[Auth] poll response:', data.error || 'token_received')

    if (data.access_token) {
      setToken(data.access_token)
      
      pendingDeviceCode = null
      return true
    }

    return false
  } catch (err) {
    console.error('[Auth] poll error:', err)
    return false
  }
}

export async function logout(): Promise<void> {
  clearToken()
  
}
