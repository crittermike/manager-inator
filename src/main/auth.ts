import { shell } from 'electron'
import { getToken, setToken, clearToken } from './store'
import { resetOctokit } from './github'

const GITHUB_CLIENT_ID = 'Iv1.manager_inator_app'
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

  const data: DeviceCodeResponse = await res.json()
  pendingDeviceCode = data

  // Open the verification URL in the browser
  shell.openExternal(data.verification_uri)

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri
  }
}

export async function pollAuth(): Promise<boolean> {
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

    if (data.access_token) {
      setToken(data.access_token)
      resetOctokit()
      pendingDeviceCode = null
      return true
    }

    // Still waiting for user to authorize
    return false
  } catch {
    return false
  }
}

export async function logout(): Promise<void> {
  clearToken()
  resetOctokit()
}
