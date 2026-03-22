import { createHashRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AppShell } from './components/layout/AppShell'
import { AuthScreen } from './pages/AuthScreen'
import { SetupScreen } from './pages/SetupScreen'
import { Dashboard } from './pages/Dashboard'
import { ReportDetail } from './pages/ReportDetail'
import { TranscriptProcessor } from './pages/TranscriptProcessor'
import { AIChat } from './pages/AIChat'
import { Settings } from './pages/Settings'
import { Meetings } from './pages/Meetings'
import { People } from './pages/People'
import { ImpactLog } from './pages/ImpactLog'
import { TeamActions } from './pages/TeamActions'
import { TeamPriorities } from './pages/TeamPriorities'
import { TeamFeedback } from './pages/TeamFeedback'
import { PrepOverview } from './pages/PrepOverview'
import { TeamTrends } from './pages/TeamTrends'
import { useState, useEffect, useMemo } from 'react'
import { ToastProvider } from './components/common/Toast'
import { ErrorBoundary } from './components/common/ErrorBoundary'

function Layout() {
  return (
    <AppShell>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </AppShell>
  )
}

export default function App() {
  const { authenticated, loading, bridgeError, refresh: refreshAuth } = useAuth()
  const [hasRepo, setHasRepo] = useState<boolean | null>(null)

  const router = useMemo(() => createHashRouter([
    {
      element: <Layout />,
      children: [
        { path: '/', element: <Dashboard /> },
        { path: '/report/:name', element: <ReportDetail /> },
        { path: '/transcript', element: <TranscriptProcessor /> },
        { path: '/meetings', element: <Meetings /> },
        { path: '/meetings/:filename', element: <Meetings /> },
        { path: '/people', element: <People /> },
        { path: '/people/:slug', element: <People /> },
        { path: '/impact', element: <ImpactLog /> },
        { path: '/actions', element: <TeamActions /> },
        { path: '/priorities', element: <TeamPriorities /> },
        { path: '/feedback', element: <TeamFeedback /> },
        { path: '/prep-overview', element: <PrepOverview /> },
        { path: '/trends', element: <TeamTrends /> },
        { path: '/chat', element: <AIChat /> },
        { path: '/settings', element: <Settings /> },
        { path: '*', element: <Navigate to="/" replace /> }
      ]
    }
  ]), [])

  useEffect(() => {
    if (authenticated) {
      window.api.getSettings()
        .then((s: { repoPath?: string }) => {
          setHasRepo(!!s.repoPath)
        })
        .catch(() => {
          // Settings fetch failed — fall through to setup screen
          setHasRepo(false)
        })
    }
  }, [authenticated])

  if (bridgeError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold text-zinc-100">Failed to initialize</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            The app's internal bridge failed to load. This usually means the preload script
            could not be executed. Try restarting the app, or reinstalling if the problem persists.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-light text-white rounded-lg transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }

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
    return <AuthScreen onAuthenticated={refreshAuth} />
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
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  )
}
