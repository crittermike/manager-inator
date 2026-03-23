import { createHashRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AppShell } from './components/layout/AppShell'
import { AuthScreen } from './pages/AuthScreen'
import { SetupScreen } from './pages/SetupScreen'
import { Today } from './pages/Today'
import { SearchPage } from './pages/Search'
import { useState, useEffect, useMemo, Suspense, lazy } from 'react'
import { ToastProvider } from './components/common/Toast'
import { ErrorBoundary } from './components/common/ErrorBoundary'

const ReportDetail = lazy(() => import('./pages/ReportDetail').then(m => ({ default: m.ReportDetail })))
const TranscriptProcessor = lazy(() => import('./pages/TranscriptProcessor').then(m => ({ default: m.TranscriptProcessor })))
const Playbook = lazy(() => import('./pages/Playbook').then(m => ({ default: m.Playbook })))
const ImpactLog = lazy(() => import('./pages/ImpactLog').then(m => ({ default: m.ImpactLog })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const People = lazy(() => import('./pages/People').then(m => ({ default: m.People })))
const MeetingDetail = lazy(() => import('./pages/MeetingDetail').then(m => ({ default: m.MeetingDetail })))
const MyProfile = lazy(() => import('./pages/MyProfile').then(m => ({ default: m.MyProfile })))

function Layout() {
  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
}

export default function App() {
  const { authenticated, loading, bridgeError, refresh: refreshAuth } = useAuth()
  const [hasRepo, setHasRepo] = useState<boolean | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Loading...')

  const router = useMemo(() => createHashRouter([
    {
      element: <Layout />,
      children: [
        { path: '/', element: <Today /> },
        { path: '/playbook', element: <Playbook /> },
        { path: '/report/:name', element: <ReportDetail /> },
        { path: '/transcript', element: <TranscriptProcessor /> },
        { path: '/search', element: <SearchPage /> },
        { path: '/impact', element: <ImpactLog /> },
        { path: '/settings', element: <Settings /> },
        { path: '/people/:slug', element: <People /> },
        { path: '/meeting/:filename', element: <MeetingDetail /> },
        { path: '/my-profile', element: <MyProfile /> },
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

  useEffect(() => {
    const unsub = window.api.onLoadingProgress?.((data) => {
      setLoadingMessage(data.message)
    })
    return () => unsub?.()
  }, [])

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
          <span className="text-zinc-400 text-sm animate-pulse">{loadingMessage}</span>
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
