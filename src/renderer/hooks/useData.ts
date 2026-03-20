import { useState, useEffect, useCallback } from 'react'
import type { Report, TeamOverview, ReportProfile } from '../../shared/types'

export function useTeamOverview() {
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
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

  const refresh = useCallback(async () => {
    if (!name) return
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.getReportData(name)
      setReport(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [name])

  useEffect(() => { refresh() }, [refresh])

  return { report, loading, error, refresh }
}

export function useReportProfiles() {
  const [profiles, setProfiles] = useState<ReportProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const names = await window.api.getReports()
        const profiles = await Promise.all(
          names.map((n) => window.api.getReportProfile(n))
        )
        setProfiles(profiles)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { profiles, loading }
}

export function useFileContent(path: string | null) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!path) { setContent(null); return }
    setLoading(true)
    window.api.getFileContent(path)
      .then(setContent)
      .catch(() => setContent(null))
      .finally(() => setLoading(false))
  }, [path])

  return { content, loading }
}
