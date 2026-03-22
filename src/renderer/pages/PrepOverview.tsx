import { useNavigate } from 'react-router-dom'
import { useTeamOverview } from '../hooks/useData'
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  Sparkles,
  ChevronRight,
  Clock
} from 'lucide-react'
import { getDay, format } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'

export function PrepOverview() {
  const navigate = useNavigate()
  const { overview, loading, error } = useTeamOverview()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" aria-hidden="true" />
          <p className="text-sm text-zinc-400">{error || 'No data'}</p>
        </div>
      </div>
    )
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const todayIndex = getDay(new Date())
  const today = format(new Date(), 'EEEE')

  const reportsWithDays = overview.reports
    .filter(r => r.meetingDay)
    .map(r => {
      const dayIndex = dayNames.indexOf(r.meetingDay!.toLowerCase())
      let daysUntil = (dayIndex - todayIndex + 7) % 7
      if (daysUntil === 0) daysUntil = 0
      return { ...r, dayIndex, daysUntil }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)

  const reportsNoDays = overview.reports.filter(r => !r.meetingDay)

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to dashboard
      </button>

      <div>
        <h1 className="text-2xl font-bold text-zinc-100">1:1 prep overview</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Today is {today}. Prep for upcoming 1:1s or generate notes.
        </p>
      </div>

      <div className="space-y-3">
        {reportsWithDays.map(r => {
          const isToday = r.daysUntil === 0
          const isTomorrow = r.daysUntil === 1

          return (
            <div
              key={r.name}
              className={`bg-surface rounded-xl border overflow-hidden ${
                isToday ? 'border-brand/40' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                  {r.displayName.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{r.displayName}</span>
                    {isToday && (
                      <span className="text-[11px] bg-brand/10 text-brand-light px-2 py-0.5 rounded-full font-medium">
                        Today
                      </span>
                    )}
                    {isTomorrow && (
                      <span className="text-[11px] bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">
                        Tomorrow
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" aria-hidden="true" />
                      {r.meetingDay}s
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {r.lastOneOnOne
                        ? `Last 1:1 ${formatDistanceToNow(new Date(r.lastOneOnOne), { addSuffix: true })}`
                        : 'No 1:1 recorded'}
                    </span>
                    <span>{r.openActionItems} open items</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/report/${r.name}?tab=prep`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    Prep 1:1
                  </button>
                  <button
                    onClick={() => navigate(`/report/${r.name}?tab=actions`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                  >
                    Actions
                  </button>
                  <button
                    onClick={() => navigate(`/report/${r.name}`)}
                    className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {reportsNoDays.length > 0 && (
          <>
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider pt-2">No meeting day set</h2>
            {reportsNoDays.map(r => (
              <div key={r.name} className="bg-surface rounded-xl border border-border">
                <div className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                    {r.displayName.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-zinc-200">{r.displayName}</span>
                    <p className="text-xs text-zinc-600">Set a meeting day in their profile to see them in order</p>
                  </div>
                  <button
                    onClick={() => navigate(`/report/${r.name}?tab=prep`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    Prep 1:1
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
