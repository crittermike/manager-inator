import { useState, useEffect, useCallback } from 'react'

interface PollResult {
  success: boolean
  error?: string
  retryAfter?: number
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
      console.log('[useAuth] checkAuth calling getAuthStatus...')
      const { authenticated, user } = await window.api.getAuthStatus()
      console.log('[useAuth] getAuthStatus returned:', { authenticated, user })
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
    console.log('[useAuth] poll() calling pollAuth...')
    const result: PollResult = await window.api.pollAuth()
    console.log('[useAuth] pollAuth returned:', result)
    if (result.success) {
      console.log('[useAuth] Poll succeeded! Calling checkAuth...')
      await checkAuth()
      console.log('[useAuth] checkAuth completed after successful poll')
    }
    return result
  }, [checkAuth])

  const logout = useCallback(async () => {
    await window.api.logout()
    setAuthenticated(false)
    setUser(null)
  }, [])

  return { authenticated, user, loading, bridgeError, login, poll, logout, refresh: checkAuth }
}
