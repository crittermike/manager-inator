import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2 } from 'lucide-react'
import { ComboInput } from '../common/ComboInput'
import { useToast } from '../common/Toast'
import type { CreateReportFields } from '../../../shared/types'

interface AddReportModalProps {
  open: boolean
  onClose: () => void
  onCreated: (slug: string) => void
}

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const fieldClass = 'w-full px-3 py-2.5 bg-zinc-950/70 shadow-inner shadow-black/20 border border-border/80 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15 transition-all'

export function AddReportModal({ open, onClose, onCreated }: AddReportModalProps) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [team, setTeam] = useState('')
  const [github, setGithub] = useState('')
  const [meetingDay, setMeetingDay] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const nameRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  useEffect(() => {
    if (open) {
      window.api.getSettingsOptions().then(opts => setRoles(opts.roles)).catch(err => { console.error('Failed to load role options', err); toast.error('Failed to load role options') })
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [open])

  const reset = useCallback(() => {
    setName('')
    setRole('')
    setTeam('')
    setGithub('')
    setMeetingDay('')
    setLocation('')
    setError(null)
    setSaving(false)
  }, [])

  const handleClose = useCallback(() => {
    if (saving) return
    reset()
    onClose()
  }, [saving, reset, onClose])

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const fields: CreateReportFields = {}
      if (role.trim()) fields.role = role.trim()
      if (team.trim()) fields.team = team.trim()
      if (github.trim()) fields.github = github.trim()
      if (meetingDay) fields.meetingDay = meetingDay
      if (location.trim()) fields.location = location.trim()

      const slug = await window.api.createReport(trimmed, fields)
      reset()
      onClose()
      onCreated(slug)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }, [name, role, team, github, meetingDay, location, reset, onClose, onCreated])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      handleClose()
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleClose, handleSubmit])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-report-dialog-title"
      onClick={handleClose}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-backdrop-fade" />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border/80 bg-zinc-950/95 shadow-2xl shadow-black/50 ring-1 ring-white/5 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/70 bg-gradient-to-r from-white/[0.03] to-transparent">
          <div>
            <h2 id="add-report-dialog-title" className="text-sm font-semibold text-zinc-100">Add direct report</h2>
            <p className="mt-1 text-xs text-zinc-500">Create the profile now, fill in anything else later.</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-surface-raised transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="report-name" className="block text-xs text-zinc-500 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameRef}
              id="report-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className={fieldClass}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ComboInput
              value={role}
              onChange={setRole}
              options={roles}
              placeholder="e.g. Senior Engineer"
              label="Role"
            />
            <div>
              <label htmlFor="report-team" className="block text-xs text-zinc-500 mb-1">Team</label>
              <input
                id="report-team"
                type="text"
                value={team}
                onChange={e => setTeam(e.target.value)}
                placeholder="e.g. Platform"
                className={fieldClass}
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="report-github" className="block text-xs text-zinc-500 mb-1">GitHub username</label>
              <input
                id="report-github"
                type="text"
                value={github}
                onChange={e => setGithub(e.target.value)}
                placeholder="e.g. janesmith"
                className={fieldClass}
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="report-location" className="block text-xs text-zinc-500 mb-1">Location</label>
              <input
                id="report-location"
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. San Francisco"
                className={fieldClass}
                disabled={saving}
              />
            </div>
          </div>

          <div>
            <label htmlFor="report-meeting-day" className="block text-xs text-zinc-500 mb-1">1:1 meeting day</label>
            <select
              id="report-meeting-day"
              value={meetingDay}
              onChange={e => setMeetingDay(e.target.value)}
              className={`${fieldClass} appearance-none`}
              disabled={saving}
            >
              <option value="" className="text-zinc-600">Not set</option>
              {MEETING_DAYS.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/70 bg-surface/60">
          <button
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-surface-raised transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {saving ? 'Adding...' : 'Add report'}
          </button>
        </div>

        <p className="text-[11px] text-zinc-600 px-6 pb-5 text-center">
          You can edit all details later from their profile page
        </p>
      </div>
    </div>
  )
}
