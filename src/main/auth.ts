import { shell } from 'electron'
import { getToken, setToken, clearToken } from './store'


const GITHUB_CLIENT_ID = 'Ov23ctu9WlUlp4aqg2qi'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

let pendingDeviceCode: DeviceCodeResponse | null = null

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
  } catch {
    // Token invalid
  }

  clearToken()
  return { authenticated: false }
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

  shell.openExternal(data.verification_uri)

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri
  }
}

export async function pollAuth(): Promise<boolean> {
  console.log('[Auth] pollAuth called, pendingDeviceCode:', !!pendingDeviceCode)
  if (!pendingDeviceCode) return false

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
    console.log('[Auth] poll response:', JSON.stringify(data))

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
