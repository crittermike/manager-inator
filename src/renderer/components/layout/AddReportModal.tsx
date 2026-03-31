import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2 } from 'lucide-react'
import { ComboInput } from '../common/ComboInput'
import type { CreateReportFields } from '../../../shared/types'

interface AddReportModalProps {
  open: boolean
  onClose: () => void
  onCreated: (slug: string) => void
}

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

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

  useEffect(() => {
    if (open) {
      window.api.getSettingsOptions().then(opts => setRoles(opts.roles)).catch(() => {})
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
      onClick={handleClose}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/50 animate-backdrop-fade" />
      <div
        className="relative bg-zinc-900 border border-border rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md p-6 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-zinc-200">Add direct report</h2>
          <button
            onClick={handleClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-surface-raised transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
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
              className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="report-github" className="block text-xs text-zinc-500 mb-1">GitHub username</label>
              <input
                id="report-github"
                type="text"
                value={github}
                onChange={e => setGithub(e.target.value)}
                placeholder="e.g. janesmith"
                className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
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
                className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
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
              className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors appearance-none"
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

        <div className="flex items-center justify-end gap-2 mt-6">
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
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Adding...' : 'Add report'}
          </button>
        </div>

        <p className="text-[11px] text-zinc-600 mt-3 text-center">
          You can edit all details later from their profile page
        </p>
      </div>
    </div>
  )
}
