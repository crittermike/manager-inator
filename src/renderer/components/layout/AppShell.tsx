import { ReactNode, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Settings,
  Zap,
  Calendar,
  Users,
  Trophy
} from 'lucide-react'
import { useTeamOverview } from '../../hooks/useData'
import { CommandPalette } from '../common/CommandPalette'
import { useToast } from '../common/Toast'

interface AppShellProps {
  children: ReactNode
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/meetings', icon: Calendar, label: 'Meetings' },
  { path: '/people', icon: Users, label: 'People' },
  { path: '/impact', icon: Trophy, label: 'My impact' },
  { path: '/chat', icon: MessageSquare, label: 'AI assistant' }
]

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { overview } = useTeamOverview()
  const toast = useToast()
  const reports = overview?.reports ?? []

  useEffect(() => {
    const cleanup = window.api.onPushStatus((data) => {
      if (!data.success) {
        toast.warning(`Git push failed: ${data.error || 'Unknown error'}. Changes saved locally.`, 'Sync Issue')
      }
    })
    return cleanup
  }, [toast])

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-zinc-950 text-zinc-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-brand focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <CommandPalette />
      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0 overflow-hidden">
        {/* Title bar drag region — sits below traffic lights */}
        <div className="drag-region pt-14 pb-4 px-3">
          <div className="no-drag flex items-center gap-2 px-3">
            <Zap className="w-5 h-5 text-brand" aria-hidden="true" />
            <span className="font-semibold text-sm tracking-tight">Manager-inator</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path)
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors no-drag ${
                  active
                    ? 'bg-brand/15 text-brand-light font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-raised'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            )
          })}

          {reports.length > 0 && (
            <>
              <div className="pt-4 pb-2 px-3">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Direct reports
                </span>
              </div>
              {reports.map((r) => {
                const path = `/report/${r.name}`
                const active = location.pathname === path
                const statusColor = r.status === 'on-track'
                  ? 'bg-success'
                  : r.status === 'needs-attention'
                  ? 'bg-warning'
                  : 'bg-danger'
                const statusLabel = r.status === 'on-track'
                  ? 'On track'
                  : r.status === 'needs-attention'
                  ? 'Needs attention'
                  : 'At risk'
                return (
                  <button
                    key={r.name}
                    onClick={() => navigate(path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors no-drag ${
                      active
                        ? 'bg-brand/15 text-brand-light font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-raised'
                    }`}
                  >
                    <div className="relative w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-xs font-medium text-brand-light shrink-0">
                      {r.displayName.charAt(0)}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${statusColor} ${r.status !== 'on-track' ? 'animate-pulse-dot' : ''}`} aria-hidden="true" />
                    </div>
                    <span className="truncate">{r.displayName}</span>
                    <span className="sr-only">({statusLabel})</span>
                  </button>
                )
              })}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">v{__APP_VERSION__}</span>
          <button
            onClick={() => navigate('/settings')}
            className={`p-1.5 rounded-lg transition-colors no-drag ${
              location.pathname === '/settings'
                ? 'text-brand-light bg-brand/15'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised'
            }`}
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-hidden relative">
        {location.pathname === '/chat' ? (
          children
        ) : (
          <>
            {/* Drag region for the rest of the title bar */}
            <div className="drag-region h-14 shrink-0" />
            <div className="h-[calc(100vh-3.5rem)] overflow-y-auto px-8 pb-8">
              {children}
            </div>
          </>
        )}

        {location.pathname !== '/transcript' && (
          <button
            onClick={() => navigate('/transcript')}
            className="absolute bottom-6 right-6 w-12 h-12 bg-brand hover:bg-brand-dark text-white rounded-full shadow-lg shadow-brand/25 flex items-center justify-center transition-all hover:scale-105 z-10"
            aria-label="Process transcript"
            title="Process transcript"
          >
            <FileText className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </main>
    </div>
  )
}
