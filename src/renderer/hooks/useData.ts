import { useState, useEffect, useCallback, useRef } from 'react'
import type { Report, TeamOverview } from '../../shared/types'

export function useTeamOverview() {
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await window.api.clearCaches()
      const data = await window.api.getTeamOverview()
      setOverview(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { overview, loading, error, refresh }
}

export function useReportData(name: string | undefined) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!name) return
    const reqId = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      await window.api.clearCaches()
      const data = await window.api.getReportData(name)
      if (reqRef.current === reqId) setReport(data)
    } catch (e) {
      if (reqRef.current === reqId) setError((e as Error).message)
    } finally {
      if (reqRef.current === reqId) setLoading(false)
    }
  }, [name])

  useEffect(() => { refresh() }, [refresh])

  return { report, loading, error, refresh }
}

export function useFileContent(path: string | null) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!path) { setContent(null); setLoading(false); return }
    let stale = false
    setLoading(true)
    window.api.getFileContent(path)
      .then(data => { if (!stale) setContent(data) })
      .catch(() => { if (!stale) setContent(null) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [path])

  return { content, loading }
}
