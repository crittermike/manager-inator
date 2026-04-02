import { useState, useEffect, useCallback } from 'react'

interface PollResult {
  success: boolean
  error?: string
  retryAfter?: number
  user?: string
}

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [bridgeError, setBridgeError] = useState(false)

  const checkAuth = useCallback(async () => {
    if (!window.api) {
      setBridgeError(true)
      setLoading(false)
      return
    }
    try {
      const { authenticated, user } = await window.api.getAuthStatus()
      setAuthenticated(authenticated)
      setUser(user || null)
    } catch (e) {
      console.error('[useAuth] Failed to check auth:', e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

  const login = useCallback(async () => {
    const { userCode, verificationUri } = await window.api.startAuth()
    return { userCode, verificationUri }
  }, [])

  const poll = useCallback(async (): Promise<PollResult> => {
    const result: PollResult = await window.api.pollAuth()
    if (result.success) {
      setAuthenticated(true)
      if (result.user) setUser(result.user)
    }
    return result
  }, [])

  const forceAuthenticated = useCallback((userName?: string) => {
    setAuthenticated(true)
    if (userName) setUser(userName)
    setLoading(false)
  }, [])

  const logout = useCallback(async () => {
    await window.api.logout()
    setAuthenticated(false)
    setUser(null)
  }, [])

  return { authenticated, user, loading, bridgeError, login, poll, logout, refresh: checkAuth, forceAuthenticated }
}
