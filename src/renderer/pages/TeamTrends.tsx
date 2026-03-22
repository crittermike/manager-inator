import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Report } from '../../shared/types'
import {
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Clock,
  Star,
  CheckSquare,
  FileText,
  ChevronRight
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface ReportTrend {
  name: string
  displayName: string
  totalMeetings: number
  recentMeetings: number
  feedbackCount: number
  recentFeedback: number
  checkInCount: number
  openActionItems: number
  completedActionItems: number
  lastOneOnOne: string | null
  lastFeedback: string | null
  lastCheckIn: string | null
  meetingDates: string[]
}

export function TeamTrends() {
  const navigate = useNavigate()
  const [trends, setTrends] = useState<ReportTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const reportNames = await window.api.getReports()
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const cutoff = thirtyDaysAgo.toISOString().split('T')[0]

      const reportTrends: ReportTrend[] = []
      for (const name of reportNames) {
        const data: Report = await window.api.getReportData(name)
        const recentMeetings = data.transcripts.filter(t => t.date >= cutoff).length
        const recentFeedback = data.feedback.filter(f => f.date >= cutoff).length
        const sortedFeedback = [...data.feedback].sort((a, b) => b.date.localeCompare(a.date))

        reportTrends.push({
          name,
          displayName: data.profile.displayName,
          totalMeetings: data.transcripts.length,
          recentMeetings,
          feedbackCount: data.feedback.length,
          recentFeedback,
          checkInCount: data.checkIns.length,
          openActionItems: data.actionItems.filter(a => !a.completed).length,
          completedActionItems: data.actionItems.filter(a => a.completed).length,
          lastOneOnOne: data.transcripts.length > 0 ? data.transcripts[data.transcripts.length - 1].date : null,
          lastFeedback: sortedFeedback[0]?.date ?? null,
          lastCheckIn: data.checkIns.length > 0 ? data.checkIns[data.checkIns.length - 1].date : null,
          meetingDates: data.transcripts.map(t => t.date).sort()
        })
      }

      setTrends(reportTrends)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" aria-hidden="true" />
          <p className="text-sm text-zinc-400">{error}</p>
          <button onClick={load} className="text-sm text-brand-light hover:text-brand transition-colors">
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to dashboard
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Team health trends</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Management activity over the last 30 days
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {trends.map(t => {
          const daysSince1on1 = t.lastOneOnOne
            ? Math.floor((Date.now() - new Date(t.lastOneOnOne).getTime()) / (1000 * 60 * 60 * 24))
            : null
          const meetingHealth = daysSince1on1 === null ? 'none' : daysSince1on1 <= 7 ? 'good' : daysSince1on1 <= 14 ? 'ok' : 'bad'

          return (
            <div key={t.name} className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                  {t.displayName.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => navigate(`/report/${t.name}`)}
                    className="text-sm font-medium text-zinc-200 hover:text-brand-light transition-colors"
                  >
                    {t.displayName}
                  </button>
                </div>
                <button
                  onClick={() => navigate(`/report/${t.name}`)}
                  className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border-t border-border">
                <div className="bg-surface p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className={`w-3.5 h-3.5 ${
                      meetingHealth === 'good' ? 'text-success' : meetingHealth === 'ok' ? 'text-warning' : 'text-danger'
                    }`} aria-hidden="true" />
                    <span className="text-xs text-zinc-500">1:1 cadence</span>
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">{t.recentMeetings}</p>
                  <p className="text-xs text-zinc-600">last 30 days · {t.totalMeetings} total</p>
                  {t.lastOneOnOne && (
                    <p className={`text-xs mt-1 ${meetingHealth === 'bad' ? 'text-danger' : 'text-zinc-500'}`}>
                      Last: {formatDistanceToNow(new Date(t.lastOneOnOne), { addSuffix: true })}
                    </p>
                  )}
                </div>

                <div className="bg-surface p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <span className="text-xs text-zinc-500">Feedback</span>
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">{t.recentFeedback}</p>
                  <p className="text-xs text-zinc-600">last 30 days · {t.feedbackCount} total</p>
                  {t.lastFeedback && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Last: {formatDistanceToNow(new Date(t.lastFeedback), { addSuffix: true })}
                    </p>
                  )}
                </div>

                <div className="bg-surface p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                    <span className="text-xs text-zinc-500">Check-ins</span>
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">{t.checkInCount}</p>
                  <p className="text-xs text-zinc-600">on file</p>
                  {t.lastCheckIn && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Last: {t.lastCheckIn}
                    </p>
                  )}
                </div>

                <div className="bg-surface p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span className="text-xs text-zinc-500">Action items</span>
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">{t.openActionItems} open</p>
                  <p className="text-xs text-zinc-600">{t.completedActionItems} completed</p>
                </div>
              </div>

              {t.meetingDates.length > 0 && (
                <div className="px-5 py-3 border-t border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                    <span className="text-[11px] text-zinc-600 uppercase tracking-wider">1:1 timeline</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {t.meetingDates.slice(-20).map((date, i) => {
                      const d = new Date(date)
                      const isRecent = (Date.now() - d.getTime()) < 30 * 24 * 60 * 60 * 1000
                      return (
                        <div
                          key={i}
                          title={date}
                          className={`w-3 h-3 rounded-sm ${isRecent ? 'bg-brand' : 'bg-surface-raised'}`}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
