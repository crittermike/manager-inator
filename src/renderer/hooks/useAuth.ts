import { useState, useEffect, useCallback } from 'react'

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getAuthStatus().then(({ authenticated, user }) => {
      setAuthenticated(authenticated)
      setUser(user || null)
      setLoading(false)
    })
  }, [])

  const login = useCallback(async () => {
    const { userCode, verificationUri } = await window.api.startAuth()
    return { userCode, verificationUri }
  }, [])

  const poll = useCallback(async () => {
    const success = await window.api.pollAuth()
    if (success) {
      const { authenticated, user } = await window.api.getAuthStatus()
      setAuthenticated(authenticated)
      setUser(user || null)
    }
    return success
  }, [])

  const logout = useCallback(async () => {
    await window.api.logout()
    setAuthenticated(false)
    setUser(null)
  }, [])

  return { authenticated, user, loading, login, poll, logout }
}
