import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AppShell } from './components/layout/AppShell'
import { AuthScreen } from './pages/AuthScreen'
import { SetupScreen } from './pages/SetupScreen'
import { Dashboard } from './pages/Dashboard'
import { ReportDetail } from './pages/ReportDetail'
import { TranscriptProcessor } from './pages/TranscriptProcessor'
import { AIChat } from './pages/AIChat'
import { Settings } from './pages/Settings'
import { useState, useEffect } from 'react'

export default function App() {
  const { authenticated, loading } = useAuth()
  const [hasRepo, setHasRepo] = useState<boolean | null>(null)

  useEffect(() => {
    if (authenticated) {
      window.api.getSettings().then((s) => {
        setHasRepo(!!s.repoOwner && !!s.repoName)
      })
    }
  }, [authenticated])

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return <AuthScreen />
  }

  if (hasRepo === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!hasRepo) {
    return <SetupScreen onComplete={() => setHasRepo(true)} />
  }

  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/report/:name" element={<ReportDetail />} />
          <Route path="/transcript" element={<TranscriptProcessor />} />
          <Route path="/chat" element={<AIChat />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </HashRouter>
  )
}
