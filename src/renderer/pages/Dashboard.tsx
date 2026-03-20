import { useTeamOverview } from '../hooks/useData'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  FileText,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  Clock
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function Dashboard() {
  const { overview, loading, error, refresh } = useTeamOverview()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading team data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" />
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            onClick={refresh}
            className="text-sm text-brand-light hover:text-brand transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!overview) return null

  const statusColors = {
    'on-track': 'bg-success',
    'needs-attention': 'bg-warning',
    'at-risk': 'bg-danger'
  }

  const statusLabels = {
    'on-track': 'On track',
    'needs-attention': 'Needs attention',
    'at-risk': 'At risk'
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Team dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {overview.reports.length} direct reports
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/transcript')}
          className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group"
        >
          <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors">
            <FileText className="w-5 h-5 text-brand" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-zinc-200">
              Process transcript
            </div>
            <div className="text-xs text-zinc-500">Summarize a 1:1</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/chat')}
          className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group"
        >
          <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors">
            <MessageSquare className="w-5 h-5 text-brand" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-zinc-200">
              AI assistant
            </div>
            <div className="text-xs text-zinc-500">Ask anything</div>
          </div>
        </button>

        <button
          onClick={() => navigate('/chat')}
          className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group"
        >
          <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors">
            <Calendar className="w-5 h-5 text-brand" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-zinc-200">
              Prep for 1:1
            </div>
            <div className="text-xs text-zinc-500">Generate prep notes</div>
          </div>
        </button>
      </div>

      {/* Team grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Your team
        </h2>

        <div className="grid gap-3">
          {overview.reports.map((r) => (
            <button
              key={r.name}
              onClick={() => navigate(`/report/${r.name}`)}
              className="flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group text-left"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                {r.displayName.split(' ').map(n => n[0]).join('')}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-200">
                    {r.displayName}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      r.status === 'on-track'
                        ? 'bg-success/10 text-success'
                        : r.status === 'needs-attention'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-danger/10 text-danger'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${statusColors[r.status]} ${
                        r.status !== 'on-track' ? 'animate-pulse-dot' : ''
                      }`}
                    />
                    {statusLabels[r.status]}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {r.lastOneOnOne
                      ? `Last 1:1 ${formatDistanceToNow(new Date(r.lastOneOnOne), { addSuffix: true })}`
                      : 'No 1:1 recorded'}
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {r.openActionItems} open items
                  </span>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
