import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2 } from 'lucide-react'
import { ComboInput } from '../common/ComboInput'
import { useToast } from '../common/Toast'
import { RELATIONSHIP_CATEGORIES } from '../../../shared/constants'
import type { CreatePersonFields } from '../../../shared/types'

interface AddPersonModalProps {
  open: boolean
  onClose: () => void
  onCreated: (slug: string) => void
  /** Optional pre-filled name (e.g. when triggered from CaptureSession reconciliation). */
  initialName?: string
  /** Optional pre-filled relationship. */
  initialRelationship?: string
}

const fieldClass = 'w-full px-3 py-2.5 bg-zinc-950/70 shadow-inner shadow-black/20 border border-border/80 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15 transition-all'

export function AddPersonModal({ open, onClose, onCreated, initialName = '', initialRelationship }: AddPersonModalProps) {
  const [name, setName] = useState(initialName)
  const [relationship, setRelationship] = useState(initialRelationship ?? RELATIONSHIP_CATEGORIES[0])
  const [role, setRole] = useState('')
  const [github, setGithub] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [relationshipOptions, setRelationshipOptions] = useState<string[]>([...RELATIONSHIP_CATEGORIES])
  const [roles, setRoles] = useState<string[]>([])
  const nameRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setName(initialName)
    if (initialRelationship) setRelationship(initialRelationship)
    window.api.getSettingsOptions()
      .then(opts => {
        setRoles(opts.roles)
        if (opts.relationships.length > 0) setRelationshipOptions(opts.relationships)
      })
      .catch(err => {
        console.error('Failed to load options', err)
        toast.error('Failed to load options')
      })
    setTimeout(() => nameRef.current?.focus(), 100)
  }, [open, initialName, initialRelationship])

  const reset = useCallback(() => {
    setName('')
    setRelationship(initialRelationship ?? RELATIONSHIP_CATEGORIES[0])
    setRole('')
    setGithub('')
    setLocation('')
    setError(null)
    setSaving(false)
  }, [initialRelationship])

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
      const fields: CreatePersonFields = {}
      if (relationship.trim()) fields.relationship = relationship.trim()
      if (role.trim()) fields.role = role.trim()
      if (github.trim()) fields.github = github.trim()
      if (location.trim()) fields.location = location.trim()

      const slug = await window.api.createPerson(trimmed, fields)
      reset()
      onClose()
      onCreated(slug)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }, [name, relationship, role, github, location, reset, onClose, onCreated])

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
      aria-labelledby="add-person-dialog-title"
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
            <h2 id="add-person-dialog-title" className="text-sm font-semibold text-zinc-100">Add person to network</h2>
            <p className="mt-1 text-xs text-zinc-500">Peer managers, partners, stakeholders, mentors — anyone who isn't a direct report.</p>
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
            <label htmlFor="person-name" className="block text-xs text-zinc-500 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameRef}
              id="person-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex Park"
              className={fieldClass}
              disabled={saving}
            />
          </div>

          <ComboInput
            value={relationship}
            onChange={setRelationship}
            options={relationshipOptions}
            placeholder="Pick or type a relationship"
            label="Relationship"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ComboInput
              value={role}
              onChange={setRole}
              options={roles}
              placeholder="e.g. Engineering Manager"
              label="Role"
            />
            <div>
              <label htmlFor="person-github" className="block text-xs text-zinc-500 mb-1">GitHub username</label>
              <input
                id="person-github"
                type="text"
                value={github}
                onChange={e => setGithub(e.target.value)}
                placeholder="e.g. alexpark"
                className={fieldClass}
                disabled={saving}
              />
            </div>
          </div>

          <div>
            <label htmlFor="person-location" className="block text-xs text-zinc-500 mb-1">Location</label>
            <input
              id="person-location"
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. London"
              className={fieldClass}
              disabled={saving}
            />
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
            {saving ? 'Adding...' : 'Add person'}
          </button>
        </div>

        <p className="text-[11px] text-zinc-600 px-6 pb-5 text-center">
          You can edit all details later from their profile page
        </p>
      </div>
    </div>
  )
}
