import { ReactNode } from 'react'
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
import { useReportProfiles } from '../../hooks/useData'

interface AppShellProps {
  children: ReactNode
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/meetings', icon: Calendar, label: 'Meetings' },
  { path: '/people', icon: Users, label: 'People' },
  { path: '/transcript', icon: FileText, label: 'Process transcript' },
  { path: '/impact', icon: Trophy, label: 'My impact' },
  { path: '/chat', icon: MessageSquare, label: 'AI assistant' },
  { path: '/settings', icon: Settings, label: 'Settings' }
]

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profiles } = useReportProfiles()

  return (
    <div className="h-screen w-screen flex bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col shrink-0">
        {/* Title bar drag region — sits below traffic lights */}
        <div className="drag-region pt-10 pb-3 px-3">
          <div className="no-drag flex items-center gap-2 px-3">
            <Zap className="w-5 h-5 text-brand" />
            <span className="font-semibold text-sm tracking-tight">Manager-inator</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path
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
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            )
          })}

          {/* Report list */}
          {profiles.length > 0 && (
            <>
              <div className="pt-4 pb-2 px-3">
                <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Direct reports
                </span>
              </div>
              {profiles.map((p) => {
                const path = `/report/${p.name}`
                const active = location.pathname === path
                return (
                  <button
                    key={p.name}
                    onClick={() => navigate(path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors no-drag ${
                      active
                        ? 'bg-brand/15 text-brand-light font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-raised'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-xs font-medium text-brand-light shrink-0">
                      {p.displayName.charAt(0)}
                    </div>
                    <span className="truncate">{p.displayName}</span>
                  </button>
                )
              })}
            </>
          )}
        </nav>

        {/* Version */}
        <div className="px-4 py-3 border-t border-border">
          <span className="text-[10px] text-zinc-600">v1.0.0</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {/* Drag region for the rest of the title bar */}
        <div className="drag-region h-14 shrink-0" />
        <div className="h-[calc(100vh-3.5rem)] overflow-y-auto px-8 pb-8">
          {children}
        </div>
      </main>
    </div>
  )
}
