import { ReactNode, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Sun,
  MessageSquare,
  Settings,
  Zap,
  Users,
  Search
} from 'lucide-react'
import { useTeamOverview } from '../../hooks/useData'
import { CommandPalette } from '../common/CommandPalette'
import { AIFloatingPanel } from '../common/AIFloatingPanel'
import { useToast } from '../common/Toast'

interface AppShellProps {
  children: ReactNode
}

const navItems = [
  { path: '/', icon: Sun, label: 'Today' },
  { path: '/team', icon: Users, label: 'Team' },
  { path: '/search', icon: Search, label: 'Search' }
]

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { overview } = useTeamOverview()
  const toast = useToast()
  const reports = overview?.reports ?? []
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

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
          <div className="no-drag flex items-center gap-2.5 px-3">
            <div className="w-7 h-7 rounded-lg bg-brand/15 flex items-center justify-center">
              <Zap className="w-4 h-4 text-brand" aria-hidden="true" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-zinc-200">Manager-inator</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = path === '/'
              ? location.pathname === '/'
              : path === '/team'
              ? location.pathname === '/team' || location.pathname.startsWith('/report/')
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
                return (
                  <button
                    key={r.name}
                    onClick={() => navigate(path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors no-drag group ${
                      active
                        ? 'bg-brand/15 text-brand-light font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-raised'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-colors ${
                      active ? 'bg-brand/25 text-brand-light' : 'bg-zinc-800 text-zinc-500 group-hover:bg-brand/15 group-hover:text-brand-light'
                    }`}>
                      {r.displayName.charAt(0)}
                    </div>
                    <span className="truncate">{r.displayName}</span>
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
        {/* Drag region for the rest of the title bar */}
        <div className="drag-region h-14 shrink-0" />
        <div className="h-[calc(100vh-3.5rem)] overflow-y-auto px-8 pb-8">
          {children}
        </div>

        {/* AI floating panel */}
        <AIFloatingPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />

        {/* AI chat floating button */}
        <button
          onClick={() => setAiPanelOpen(prev => !prev)}
          className={`absolute bottom-6 right-6 w-12 h-12 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 z-10 ${
            aiPanelOpen
              ? 'bg-zinc-700 hover:bg-zinc-600 shadow-zinc-900/25 rotate-0'
              : 'bg-brand hover:bg-brand-dark shadow-brand/25'
          }`}
          aria-label={aiPanelOpen ? 'Close AI assistant' : 'Open AI assistant'}
          title={aiPanelOpen ? 'Close AI assistant' : 'Ask AI anything'}
        >
          <MessageSquare className={`w-5 h-5 transition-transform duration-200 ${aiPanelOpen ? 'rotate-0' : ''}`} aria-hidden="true" />
        </button>
      </main>
    </div>
  )
}
