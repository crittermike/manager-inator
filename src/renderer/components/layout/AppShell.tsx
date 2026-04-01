import { ReactNode, useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Sun,
  MessageSquare,
  Settings,
  Zap,
  BookOpen,
  Search,
  Users,
  UserCircle,
  ClipboardPaste,
  Keyboard,
  X,
  Plus,
  Mic
} from 'lucide-react'
import { useTeamOverview, useSettings } from '../../hooks/useData'
import { useToast } from '../common/Toast'
import { AddReportModal } from './AddReportModal'

const CommandPalette = lazy(() => import('../common/CommandPalette').then(m => ({ default: m.CommandPalette })))
const AIFloatingPanel = lazy(() => import('../common/AIFloatingPanel').then(m => ({ default: m.AIFloatingPanel })))
const CapturePanel = lazy(() => import('../common/CapturePanel').then(m => ({ default: m.CapturePanel })))

interface AppShellProps {
  children: ReactNode
}

const navItems = [
  { path: '/', icon: Sun, label: 'Today', shortcut: null },
  { path: '/playbook', icon: BookOpen, label: 'Playbook', shortcut: null },
  { path: '/chat', icon: MessageSquare, label: 'Chat', shortcut: null },
  { path: '/search', icon: Search, label: 'Search', shortcut: 'Cmd+K' },
  { path: '/people', icon: Users, label: 'People', shortcut: null }
]

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { overview, refresh: refreshTeam } = useTeamOverview()
  const { settings } = useSettings()
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const reports = overview?.reports ?? []
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [capturePanelOpen, setCapturePanelOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [addReportOpen, setAddReportOpen] = useState(false)
  const ptoReports = settings?.ptoReports ?? {}
  const isChatRoute = location.pathname === '/chat'

  const toggleCapture = useCallback(() => {
    setCapturePanelOpen(prev => !prev)
  }, [])

  const handleReportCreated = useCallback(async (slug: string) => {
    await refreshTeam()
    navigate(`/report/${slug}`)
  }, [refreshTeam, navigate])

  useEffect(() => {
    const cleanup = window.api.onPushStatus((data) => {
      if (!data.success) {
        toastRef.current.warning(`Git push failed: ${data.error || 'Unknown error'}. Changes saved locally.`, 'Sync Issue')
      }
    })
    return cleanup
  }, [])

  useEffect(() => {
    const cleanupNav = window.api.onNavigate((route) => {
      if (route === '?shortcuts') {
        setShortcutsOpen(true)
      } else {
        navigate(route)
      }
    })
    const cleanupCapture = window.api.onOpenCapture(() => {
      setCapturePanelOpen(true)
    })
    const cleanupTrayCapture = window.api.onTrayCapture((content: string) => {
      setCapturePanelOpen(true)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('tray-capture-content', { detail: content }))
      }, 100)
    })
    return () => {
      cleanupNav()
      cleanupCapture()
      cleanupTrayCapture()
    }
  }, [navigate])

  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'n' || e.key === 'N') && !isInput) {
        e.preventDefault()
        toggleCapture()
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isInput) {
        e.preventDefault()
        setShortcutsOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [toggleCapture])

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-zinc-950 text-zinc-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-brand focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <Suspense fallback={null}>
        <CommandPalette onOpenCapture={() => setCapturePanelOpen(true)} onOpenAI={() => setAiPanelOpen(true)} />
      </Suspense>
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-zinc-900 to-surface border-r border-border flex flex-col shrink-0 overflow-hidden">
        {/* Title bar drag region — sits below traffic lights */}
        <div className="drag-region pt-14 pb-3 px-3">
          <div className="no-drag flex items-center gap-2.5 px-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shadow-lg shadow-brand/20">
              <Zap className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-zinc-100">Manager-inator</span>
          </div>
        </div>

        {/* Capture button */}
        <div className="px-3 pb-3">
          <button
            onClick={toggleCapture}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-brand/10 text-brand-light hover:bg-brand/20 border border-brand/20 transition-all active:scale-[0.98] no-drag"
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
            <span className="flex-1 text-left">Process transcript</span>
            <kbd className="text-[10px] text-brand-light/50 bg-brand/10 px-1.5 py-0.5 rounded font-mono">⌘⇧N</kbd>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label, shortcut }) => {
            const active = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all no-drag ${
                  active
                    ? 'bg-white/[0.08] text-zinc-100 font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-brand-light' : ''}`} aria-hidden="true" />
                <span className="flex-1 text-left">{label}</span>
                {shortcut && (
                  <kbd className="text-[10px] text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded font-mono">{shortcut}</kbd>
                )}
              </button>
            )
          })}

          {reports.length > 0 ? (
            <>
              <div className="pt-5 pb-2 px-3 flex items-center justify-between group">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Direct reports
                </span>
                <button
                  onClick={() => setAddReportOpen(true)}
                  className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-600 hover:text-brand-light hover:bg-brand/10 transition-all no-drag opacity-0 group-hover:opacity-100"
                  aria-label="Add direct report"
                  title="Add direct report"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
              {reports.map((r) => {
                const path = `/report/${r.name}`
                const active = location.pathname === path
                const expiry = ptoReports[r.name]
                const onPto = !!expiry && new Date(expiry) > new Date()
                return (
                  <button
                    key={r.name}
                    onClick={() => navigate(path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all no-drag group ${
                      active
                        ? 'bg-white/[0.08] text-zinc-100 font-medium shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 transition-colors ${
                      active ? 'bg-brand/25 text-brand-light ring-1 ring-brand/30' : 'bg-zinc-800 text-zinc-500 group-hover:bg-brand/15 group-hover:text-brand-light'
                    }`}>
                      {r.displayName.charAt(0)}
                    </div>
                    <span className="truncate">{r.displayName}</span>
                    {onPto && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        PTO
                      </span>
                    )}
                  </button>
                )
              })}
            </>
          ) : (
            <>
              <div className="pt-4 pb-2 px-3">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Direct reports
                </span>
              </div>
              <button
                onClick={() => setAddReportOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-brand-light hover:bg-brand/10 transition-colors no-drag group"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-zinc-800 group-hover:bg-brand/15 transition-colors">
                  <Plus className="w-3.5 h-3.5 text-zinc-600 group-hover:text-brand-light transition-colors" />
                </div>
                <span>Add your first report</span>
              </button>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-700 font-mono">v{__APP_VERSION__}</span>
            <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.03] p-0.5">
              <button
                onClick={() => setShortcutsOpen(true)}
                className="p-1.5 rounded-md transition-colors no-drag text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts (?)"
              >
                <Keyboard className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => navigate('/my-profile')}
                className={`p-1.5 rounded-md transition-colors no-drag ${
                  location.pathname === '/my-profile'
                    ? 'text-brand-light bg-brand/15'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]'
                }`}
                aria-label="My Profile"
              >
                <UserCircle className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => navigate('/settings')}
                className={`p-1.5 rounded-md transition-colors no-drag ${
                  location.pathname === '/settings'
                    ? 'text-brand-light bg-brand/15'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]'
                }`}
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-hidden relative bg-zinc-950">
        {/* Drag region for the rest of the title bar */}
        <div className={`${isChatRoute ? 'h-full' : 'h-full pt-14'} overflow-y-auto ${isChatRoute ? '' : 'px-8 pb-8'}`}>
          {children}
        </div>

        {/* AI panel backdrop scrim */}
        {aiPanelOpen && (
          <div
            className="absolute inset-0 bg-black/20 z-10 animate-backdrop-fade"
            onClick={() => setAiPanelOpen(false)}
          />
        )}

        <Suspense fallback={null}>
          <AIFloatingPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
        </Suspense>

        <Suspense fallback={null}>
          <CapturePanel open={capturePanelOpen} onClose={() => setCapturePanelOpen(false)} />
        </Suspense>

        <div className="absolute bottom-6 right-6 flex items-center gap-3 z-20">
          <button
            onClick={toggleCapture}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.97] ${
              capturePanelOpen
                ? 'bg-brand text-white shadow-brand/25'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 shadow-zinc-900/25'
            }`}
            aria-label="Capture content"
            title="Capture content (Cmd+Shift+N)"
          >
            <ClipboardPaste className="w-5 h-5" aria-hidden="true" />
          </button>
          {!isChatRoute && (
            <button
              onClick={() => setAiPanelOpen(prev => !prev)}
              className={`w-12 h-12 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.97] ${
                aiPanelOpen
                  ? 'bg-zinc-700 hover:bg-zinc-600 shadow-zinc-900/25 rotate-0'
                  : 'bg-brand hover:bg-brand-dark shadow-brand/25'
              }`}
              aria-label={aiPanelOpen ? 'Close AI assistant' : 'Open AI assistant'}
              title={aiPanelOpen ? 'Close AI assistant (Esc)' : 'Ask AI anything'}
            >
              <MessageSquare className={`w-5 h-5 transition-transform duration-200 ${aiPanelOpen ? 'rotate-0' : ''}`} aria-hidden="true" />
            </button>
          )}
        </div>
      </main>

      <AddReportModal
        open={addReportOpen}
        onClose={() => setAddReportOpen(false)}
        onCreated={handleReportCreated}
      />

      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShortcutsOpen(false)}>
          <div className="absolute inset-0 bg-black/50 animate-backdrop-fade" />
          <div
            className="relative bg-zinc-900 border border-border rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm p-6 animate-fade-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-zinc-200">Keyboard shortcuts</h2>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-surface-raised transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">General</h3>
                <div className="space-y-1.5">
                  {[
                    ['Cmd K', 'Search'],
                    ['Cmd Shift N', 'Capture'],
                    ['Cmd ,', 'Settings'],
                    ['Cmd 1-4', 'Switch views'],
                    ['Cmd Shift M', 'Show / hide app (global)'],
                    ['Cmd Enter', 'Submit / save'],
                    ['?', 'Show shortcuts'],
                  ].map(([keys, label]) => (
                    <div key={label} className="flex items-center justify-between py-1">
                      <span className="text-sm text-zinc-400">{label}</span>
                      <div className="flex items-center gap-1">
                        {keys!.split(' ').map((k, i) => (
                          <kbd key={i} className="text-[11px] font-mono bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded min-w-[24px] text-center">{k}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Chat</h3>
                <div className="space-y-1.5">
                  {[
                    ['Cmd N', 'New chat'],
                    ['Cmd Shift E', 'Export chat'],
                  ].map(([keys, label]) => (
                    <div key={label} className="flex items-center justify-between py-1">
                      <span className="text-sm text-zinc-400">{label}</span>
                      <div className="flex items-center gap-1">
                        {keys!.split(' ').map((k, i) => (
                          <kbd key={i} className="text-[11px] font-mono bg-zinc-800 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded min-w-[24px] text-center">{k}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
