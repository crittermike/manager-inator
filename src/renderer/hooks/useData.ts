import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, createElement, type ReactNode } from 'react'
import type { Report, TeamOverview, AppSettings } from '../../shared/types'

// ── Settings Context (single fetch, shared across all consumers) ──

interface SettingsContextValue {
  settings: AppSettings | null
  loading: boolean
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const s = await window.api.getSettings()
      setSettings(s)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  const refreshSettings = useCallback(async () => {
    await load()
  }, [load])

  useEffect(() => { load() }, [load])

  const value = useMemo(() => ({ settings, loading, refreshSettings }), [settings, loading, refreshSettings])
  return createElement(SettingsContext.Provider, { value }, children)
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}

// ── Team Overview Context ──

interface TeamOverviewContextValue {
  overview: TeamOverview | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const TeamOverviewContext = createContext<TeamOverviewContextValue | null>(null)

export function TeamOverviewProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const data = await window.api.getTeamOverview()
      setOverview(data)
    } catch (e) {
      if (!silent) setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    await load()
  }, [load])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!window.api.onAiFilesChanged) return
    const unsub = window.api.onAiFilesChanged(() => { load(true) })
    return unsub
  }, [load])

  useEffect(() => {
    if (!window.api.onDataFilesChanged) return
    const unsub = window.api.onDataFilesChanged(() => { load(true) })
    return unsub
  }, [load])

  const value = useMemo(() => ({ overview, loading, error, refresh }), [overview, loading, error, refresh])
  return createElement(TeamOverviewContext.Provider, { value }, children)
}

export function useTeamOverview(): TeamOverviewContextValue {
  const ctx = useContext(TeamOverviewContext)
  if (!ctx) throw new Error('useTeamOverview must be used within TeamOverviewProvider')
  return ctx
}

export function useReportData(name: string | undefined) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const load = useCallback(async (silent = false) => {
    if (!name) return
    const reqId = ++reqRef.current
    if (!silent) { setLoading(true); setError(null) }
    try {
      const data = await window.api.getReportData(name)
      if (reqRef.current === reqId) setReport(data)
    } catch (e) {
      if (reqRef.current === reqId && !silent) setError((e as Error).message)
    } finally {
      if (reqRef.current === reqId) setLoading(false)
    }
  }, [name])

  const refresh = useCallback(async () => {
    await load()
  }, [load])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!window.api.onAiFilesChanged) return
    const unsub = window.api.onAiFilesChanged(() => { load(true) })
    return unsub
  }, [load])

  useEffect(() => {
    if (!window.api.onDataFilesChanged) return
    const unsub = window.api.onDataFilesChanged(() => { load(true) })
    return unsub
  }, [load])

  return { report, setReport, loading, error, load, refresh }
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
