import { createHashRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AppShell } from './components/layout/AppShell'
import { AuthScreen } from './pages/AuthScreen'
import { SetupScreen } from './pages/SetupScreen'
import { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react'
import { ToastProvider } from './components/common/Toast'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { TeamOverviewProvider, SettingsProvider } from './hooks/useData'

const ReportDetail = lazy(() => import('./pages/ReportDetail').then(m => ({ default: m.ReportDetail })))
const Playbook = lazy(() => import('./pages/Playbook').then(m => ({ default: m.Playbook })))
const ImpactLog = lazy(() => import('./pages/ImpactLog').then(m => ({ default: m.ImpactLog })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const People = lazy(() => import('./pages/People').then(m => ({ default: m.People })))
const MeetingDetail = lazy(() => import('./pages/MeetingDetail').then(m => ({ default: m.MeetingDetail })))
const MyProfile = lazy(() => import('./pages/MyProfile').then(m => ({ default: m.MyProfile })))
const Today = lazy(() => import('./pages/Today').then(m => ({ default: m.Today })))
const SearchPage = lazy(() => import('./pages/Search').then(m => ({ default: m.SearchPage })))
const Chat = lazy(() => import('./pages/Chat').then(m => ({ default: m.Chat })))

function Layout() {
  return (
    <SettingsProvider>
      <TeamOverviewProvider>
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
      </TeamOverviewProvider>
    </SettingsProvider>
  )
}

const LOADING_STEPS = [
  'Scanning context files...',
  'Loading reports...',
  'Building team overview...',
  'Building people index...',
  'Ready!'
]

function LoadingScreen({ message }: { message: string }) {
  const reportMatch = message.match(/^Loading report (\d+)\/(\d+)/)
  let progress: number
  if (reportMatch) {
    const [, current, total] = reportMatch
    const reportsBase = (3 / LOADING_STEPS.length) * 100
    const reportsEnd = (4 / LOADING_STEPS.length) * 100
    progress = reportsBase + (Number(current) / Number(total)) * (reportsEnd - reportsBase)
  } else {
    const stepIndex = LOADING_STEPS.indexOf(message)
    progress = stepIndex >= 0 ? ((stepIndex + 1) / LOADING_STEPS.length) * 100 : 10
  }

  const displayMessage = reportMatch ? `Loading reports... (${reportMatch[1]}/${reportMatch[2]})` : message

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-6 max-w-xs w-full">
        <div className="text-3xl font-bold text-zinc-100 tracking-tight">Manager-inator</div>
        <div className="w-full space-y-3">
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center">
            <span className="text-zinc-500 text-sm">{displayMessage}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { authenticated, loading, bridgeError, forceAuthenticated } = useAuth()
  const [hasRepo, setHasRepo] = useState<boolean | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Starting up...')
  const [cachesReady, setCachesReady] = useState(false)
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const router = useMemo(() => createHashRouter([
    {
      element: <Layout />,
      children: [
        { path: '/', element: <Today /> },
        { path: '/playbook', element: <Playbook /> },
        { path: '/chat', element: <Chat /> },
        { path: '/report/:name', element: <ReportDetail /> },
        { path: '/search', element: <SearchPage /> },
        { path: '/impact', element: <ImpactLog /> },
        { path: '/settings', element: <Settings /> },
        { path: '/people', element: <People /> },
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
          setHasRepo(false)
        })
    }
  }, [authenticated])

  useEffect(() => {
    const unsub = window.api.onLoadingProgress?.((data) => {
      setLoadingMessage(data.message)
      if (data.message === 'Ready!') {
        setCachesReady(true)
      }
    })

    window.api.getPrewarmStatus?.().then((ready) => {
      if (ready) setCachesReady(true)
    }).catch(() => {})

    cacheTimerRef.current = setTimeout(() => {
      setCachesReady(true)
    }, 60_000)

    return () => {
      unsub?.()
      if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current)
    }
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
            className="px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-all active:scale-[0.97]"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return <LoadingScreen message={loadingMessage} />
  }

  if (!authenticated) {
    return <AuthScreen onAuthenticated={forceAuthenticated} />
  }

  if (hasRepo === null) {
    return <LoadingScreen message={loadingMessage} />
  }

  if (!hasRepo) {
    return <SetupScreen onComplete={() => setHasRepo(true)} />
  }

  if (!cachesReady) {
    return <LoadingScreen message={loadingMessage} />
  }

  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  )
}
