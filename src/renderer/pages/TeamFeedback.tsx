import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeamOverview } from '../hooks/useData'
import type { CadenceSettings } from '../../shared/types'
import {
  ArrowLeft,
  Star,
  AlertTriangle,
  ChevronRight,
  Clock
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function TeamFeedback() {
  const navigate = useNavigate()
  const { overview, loading, error } = useTeamOverview()
  const [cadence, setCadence] = useState<CadenceSettings>({ checkInFrequency: 'monthly', feedbackReminderDays: 14 })

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setCadence({
        checkInFrequency: s.checkInFrequency || 'monthly',
        feedbackReminderDays: s.feedbackReminderDays ?? 14
      })
    }).catch(() => {})
  }, [])

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

  const now = new Date()
  const staleReports = overview.reports.filter(r => {
    if (!r.lastFeedback) return true
    const daysSince = Math.floor(
      (now.getTime() - new Date(r.lastFeedback).getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysSince > cadence.feedbackReminderDays
  })

  const freshReports = overview.reports.filter(r => !staleReports.includes(r))

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
        <h1 className="text-2xl font-bold text-zinc-100">Log feedback</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {staleReports.length > 0
            ? `${staleReports.length} report${staleReports.length !== 1 ? 's' : ''} overdue for feedback (${cadence.feedbackReminderDays}+ days)`
            : 'Everyone is up to date on feedback'}
        </p>
      </div>

      {staleReports.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Needs feedback</h2>
          {staleReports.map(r => (
            <button
              key={r.name}
              onClick={() => navigate(`/report/${r.name}?tab=feedback`)}
              className="w-full flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 transition-all group text-left"
            >
              <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                {r.displayName.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-200">{r.displayName}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <Clock className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                  <span className="text-xs text-zinc-500">
                    {r.lastFeedback
                      ? `Last feedback ${formatDistanceToNow(new Date(r.lastFeedback), { addSuffix: true })}`
                      : 'No feedback logged yet'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                  Overdue
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" aria-hidden="true" />
              </div>
            </button>
          ))}
        </div>
      )}

      {freshReports.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Up to date</h2>
          {freshReports.map(r => (
            <button
              key={r.name}
              onClick={() => navigate(`/report/${r.name}?tab=feedback`)}
              className="w-full flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 transition-all group text-left"
            >
              <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                {r.displayName.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-200">{r.displayName}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <Star className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                  <span className="text-xs text-zinc-500">
                    {r.feedbackCount} entries · last {r.lastFeedback ? formatDistanceToNow(new Date(r.lastFeedback), { addSuffix: true }) : 'never'}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
