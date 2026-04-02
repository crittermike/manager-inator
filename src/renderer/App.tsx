import { createHashRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AppShell } from './components/layout/AppShell'
import { AuthScreen } from './pages/AuthScreen'
import { SetupScreen } from './pages/SetupScreen'
import { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react'
import { ToastProvider } from './components/common/Toast'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { TeamOverviewProvider, SettingsProvider } from './hooks/useData'
import { ActiveFileProvider } from './hooks/useActiveFile'
import { ChatProvider } from './hooks/useChatSessions'

const ReportDetail = lazy(() => import('./pages/ReportDetail').then(m => ({ default: m.ReportDetail })))
const Playbook = lazy(() => import('./pages/Playbook').then(m => ({ default: m.Playbook })))

const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const People = lazy(() => import('./pages/People').then(m => ({ default: m.People })))
const ContextDetail = lazy(() => import('./pages/ContextDetail').then(m => ({ default: m.ContextDetail })))
const MyProfile = lazy(() => import('./pages/MyProfile').then(m => ({ default: m.MyProfile })))
const Today = lazy(() => import('./pages/Today').then(m => ({ default: m.Today })))
const SearchPage = lazy(() => import('./pages/Search').then(m => ({ default: m.SearchPage })))
const Chat = lazy(() => import('./pages/Chat').then(m => ({ default: m.Chat })))

function Layout() {
  return (
    <SettingsProvider>
      <TeamOverviewProvider>
        <ActiveFileProvider>
          <ChatProvider>
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
          </ChatProvider>
        </ActiveFileProvider>
      </TeamOverviewProvider>
    </SettingsProvider>
  )
}

const LOADING_STEPS = [
  'Scanning context files...',
  'Building team overview...',
  'Ready!'
]

function LoadingScreen({ message }: { message: string }) {
  const stepIndex = LOADING_STEPS.indexOf(message)
  const progress = stepIndex >= 0 ? ((stepIndex + 1) / LOADING_STEPS.length) * 100 : 5

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0c]">
      <div className="flex flex-col items-center gap-8 max-w-xs w-full animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shadow-lg shadow-brand/20">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span className="text-2xl font-bold text-zinc-100 tracking-tight">Manager-inator</span>
        </div>
        <div className="w-full space-y-3">
          <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand to-brand-light rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center">
            <span className="text-zinc-600 text-xs">{message}</span>
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
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
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
        { path: '/impact', element: <Navigate to="/my-profile" replace /> },
        { path: '/settings', element: <Settings /> },
        { path: '/people', element: <People /> },
        { path: '/people/:slug', element: <People /> },
        { path: '/context/:filename', element: <ContextDetail /> },
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
    if (authenticated && hasRepo) {
      // Trigger prewarm now that the renderer is ready to receive progress events
      window.api.startPrewarm?.().catch(() => {})
    }
  }, [authenticated, hasRepo])

  useEffect(() => {
    const unsub = window.api.onLoadingProgress?.((data) => {
      setLoadingMessage(data.message)
      if (data.message === 'Ready!') {
        setCachesReady(true)
      }
    })

    const pollInterval = setInterval(() => {
      window.api.getPrewarmProgress?.().then(({ ready, message }) => {
        if (ready) {
          setCachesReady(true)
          clearInterval(pollInterval)
        } else {
          setLoadingMessage(message)
        }
      }).catch(() => {})
    }, 1000)

    cacheTimerRef.current = setTimeout(() => {
      setCachesReady(true)
      clearInterval(pollInterval)
    }, 60_000)

    return () => {
      unsub?.()
      clearInterval(pollInterval)
      if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const unsub = window.api.onUpdateReady?.((version) => {
      setUpdateVersion(version)
    })
    return () => { unsub?.() }
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
      {updateVersion && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-brand/95 backdrop-blur-sm text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-3 animate-slide-down">
          <span>Version {updateVersion} is ready —</span>
          <button
            onClick={() => window.api.installUpdate()}
            className="font-semibold underline underline-offset-2 hover:text-white/80 transition-colors"
          >
            Restart to update
          </button>
          <button
            onClick={() => setUpdateVersion(null)}
            className="ml-2 text-white/60 hover:text-white transition-colors text-xs"
          >
            Later
          </button>
        </div>
      )}
      <RouterProvider router={router} />
    </ToastProvider>
  )
}
