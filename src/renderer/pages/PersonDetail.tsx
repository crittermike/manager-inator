import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { FormattedDate } from '../components/common/FormattedDate'
import { ArrowLeft, Briefcase, MapPin, Users, Calendar, Pencil, Check, X, Loader2, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import type { PersonEntry, MeetingRef } from '../../shared/types'
import { GitHubMark } from '../components/common/GitHubMark'
import { ComboInput } from '../components/common/ComboInput'
import { useToast } from '../components/common/Toast'
import { useActiveFile } from '../hooks/useActiveFile'
import { RefineWithAI } from '../components/common/RefineWithAI'
import { OpenInExternal } from '../components/common/OpenInExternal'

export function PersonDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  const { setActiveFile } = useActiveFile()

  const [person, setPerson] = useState<PersonEntry | null>(null)
  useDocumentTitle(person?.name ?? slug)
  const [bodyContent, setBodyContent] = useState('')
  const [rawFileContent, setRawFileContent] = useState('')
  const [meetings, setMeetings] = useState<MeetingRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editFields, setEditFields] = useState({ name: '', role: '', github: '', location: '', relationship: '' })
  const [roleOptions, setRoleOptions] = useState<string[]>([])
  const [relationshipOptions, setRelationshipOptions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  // Load autocomplete options
  useEffect(() => {
    window.api.getSettingsOptions().then(opts => {
      setRoleOptions(opts.roles)
      setRelationshipOptions(opts.relationships)
    }).catch(err => { console.error('Failed to load settings options', err); showError('Failed to load settings options') })
  }, [])

  // Load person data and file content
  useEffect(() => {
    if (!slug) return
    let isMounted = true

    setLoading(true)
    setError(null)

    Promise.all([
      window.api.listPeople(),
      window.api.getFileContent(`people/${slug}.md`),
      window.api.getPersonContexts(slug)
    ])
      .then(([people, fileContent, meetingRefs]) => {
        if (!isMounted) return

        const found = people.find(p => p.slug === slug) || null
        setPerson(found)
        setRawFileContent(fileContent)

        // Extract body: everything after the frontmatter block
        const fmMatch = fileContent.match(/^---\n[\s\S]*?\n---\n*/)
        const body = fmMatch ? fileContent.slice(fmMatch[0].length) : fileContent
        setBodyContent(body)

        // If we didn't find them in listPeople, parse name from frontmatter
        if (!found) {
          const nameMatch = fileContent.match(/^name:\s*(.+)$/m)
          if (nameMatch) {
            setPerson({
              name: nameMatch[1].trim(),
              slug: slug!,
              aliases: [],
              meetingCount: 0,
              lastSeen: '',
              role: '',
              github: '',
              location: '',
              relationship: ''
            })
          }
        }

        setMeetings(meetingRefs.slice(0, 20))
        setLoading(false)
      })
      .catch(err => {
        if (!isMounted) return
        console.error('Failed to load person:', err)
        setError('Unable to load person. The file may have been moved or deleted.')
        setLoading(false)
      })

    return () => { isMounted = false }
  }, [slug])

  // Sync to AI context
  useEffect(() => {
    if (person && bodyContent && slug) {
      setActiveFile({
        path: `people/${slug}.md`,
        title: person.name,
        content: bodyContent
      })
    }
    return () => setActiveFile(null)
  }, [person, bodyContent, slug, setActiveFile])

  // Save with Cmd+S
  useEffect(() => {
    if (!isEditing) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isEditing, editValue])

  const handleSave = useCallback(async () => {
    if (!slug) return
    setSaving(true)
    try {
      const fmMatch = rawFileContent.match(/^---\n[\s\S]*?\n---\n*/)
      const frontmatter = fmMatch ? fmMatch[0] : ''
      const newContent = frontmatter + editValue
      await window.api.commitFile(`people/${slug}.md`, newContent, `Update person: ${slug}`)
      setRawFileContent(newContent)
      setBodyContent(editValue)
      setIsEditing(false)
      success('Saved')
    } catch (err) {
      console.error('Failed to save:', err)
      showError('Failed to save')
    } finally {
      setSaving(false)
    }
  }, [slug, rawFileContent, editValue, success, showError])

  const handleSaveProfile = useCallback(async () => {
    if (!slug || !person) return
    setSaving(true)
    try {
      const fmMatch = rawFileContent.match(/^---\n([\s\S]*?)\n---\n*([\s\S]*)/)
      const body = fmMatch?.[2] || bodyContent
      const newContent = `---
name: ${editFields.name}
slug: ${slug}
aliases: ${person.aliases.join(', ')}
role: ${editFields.role}
github: ${editFields.github}
location: ${editFields.location}
relationship: ${editFields.relationship}
---

# ${editFields.name}

${body.replace(/^#\s+.+\n*/, '').trim()}
`
      await window.api.commitFile(`people/${slug}.md`, newContent, `Update profile for ${editFields.name}`)
      setRawFileContent(newContent)
      setPerson({ ...person, name: editFields.name, role: editFields.role, github: editFields.github, location: editFields.location, relationship: editFields.relationship })
      setIsEditingProfile(false)
      success('Profile saved')
    } catch (e) {
      console.error('Failed to save profile:', e)
      showError('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }, [slug, person, rawFileContent, bodyContent, editFields, success, showError])

  const initials = person
    ? person.name.split(' ').map(n => n[0]).join('').toUpperCase()
    : '?'

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="skeleton h-4 w-16 rounded" />
        <div className="bg-surface rounded-2xl border border-border/60 p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="skeleton w-16 h-16 rounded-2xl" />
            <div className="space-y-2">
              <div className="skeleton h-6 w-48 rounded" />
              <div className="skeleton h-4 w-32 rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !person) {
    return (
      <div className="max-w-5xl mx-auto py-12 animate-fade-in">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>
        <div className="bg-surface rounded-xl border border-border p-8 text-center">
          <Users className="w-12 h-12 text-zinc-600 mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-lg font-medium text-zinc-200 mb-2">Person not found</h2>
          <p className="text-sm text-zinc-500">This person's file may have been moved or deleted.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back
      </button>

      {/* Profile header */}
      <div className="rounded-2xl border border-border/60 bg-surface">
        <div className="bg-gradient-to-r from-brand/[0.06] via-transparent to-transparent px-6 py-5">
          {isEditingProfile ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Name</label>
                  <input value={editFields.name} onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))} className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-brand/40" />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Role</label>
                  <ComboInput value={editFields.role} onChange={v => setEditFields(f => ({ ...f, role: v }))} options={roleOptions} placeholder="e.g. Senior Engineer" />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wider mb-1">GitHub</label>
                  <input value={editFields.github} onChange={e => setEditFields(f => ({ ...f, github: e.target.value }))} placeholder="username" className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-brand/40" />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Location</label>
                  <input value={editFields.location} onChange={e => setEditFields(f => ({ ...f, location: e.target.value }))} className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-brand/40" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Relationship</label>
                <ComboInput value={editFields.relationship} onChange={v => setEditFields(f => ({ ...f, relationship: v }))} options={relationshipOptions} placeholder="e.g. Peer, Direct Report" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsEditingProfile(false)} className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                <button onClick={handleSaveProfile} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand hover:bg-brand-dark text-white rounded-lg transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
          <div className="flex items-start gap-5">
            {person.github ? (
              <img
                src={`https://github.com/${person.github}.png?size=128`}
                alt={person.name}
                className="w-16 h-16 rounded-2xl shrink-0 object-cover ring-1 ring-brand/20"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand/30 to-brand/10 ring-1 ring-brand/20 flex items-center justify-center text-lg font-bold text-brand-light shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 group">
                <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">
                  {person.name}
                </h1>
                <button
                  onClick={() => {
                    setEditFields({ name: person.name, role: person.role, github: person.github, location: person.location, relationship: person.relationship })
                    setIsEditingProfile(true)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-all"
                  title="Edit profile"
                  aria-label="Edit profile"
                >
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-500 flex-wrap">
                {person.role && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                    {person.role}
                  </span>
                )}
                {person.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                    {person.location}
                  </span>
                )}
                {person.relationship && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                    {person.relationship}
                  </span>
                )}
                {person.relationship === 'Direct Report' && (
                  <button
                    type="button"
                    onClick={() => navigate(`/report/${person.slug}`)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand/10 text-brand-light border border-brand/20 text-[10px] hover:bg-brand/15 transition-colors"
                  >
                    Open in Team
                    <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                )}
                {person.github && (
                  <a
                    href={`https://github.com/${person.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                  >
                    <GitHubMark className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                    @{person.github}
                  </a>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Notes section */}
      <div className="rounded-2xl border border-border/60 bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/60">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Notes</h2>
          {!isEditing ? (
            <div className="flex items-center gap-1">
              <RefineWithAI
                filePath={`people/${slug}.md`}
                currentContent={rawFileContent}
                documentType="people profile notes"
                onSaved={(updated) => {
                  setRawFileContent(updated)
                  const fmMatch = updated.match(/^---\n[\s\S]*?\n---\n*([\s\S]*)$/)
                  setBodyContent(fmMatch?.[1] ?? updated)
                }}
              />
              <button
                onClick={() => {
                  setEditValue(bodyContent)
                  setIsEditing(true)
                }}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-colors"
                title="Edit notes"
                aria-label="Edit notes"
              >
                <Pencil className="w-4 h-4" aria-hidden="true" />
              </button>
              <OpenInExternal filePath={`people/${slug}.md`} />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
                title="Save (cmd+s)"
                aria-label="Save notes"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-colors"
                title="Cancel"
                aria-label="Cancel editing"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <div className="px-6 py-5">
          {isEditing ? (
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full min-h-[200px] bg-surface border border-border rounded-lg p-4 text-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/20 resize-y"
              autoFocus
            />
          ) : bodyContent.trim() ? (
            <div className="prose-dark max-w-none">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{bodyContent}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-zinc-600 italic">No notes yet. Click the edit button to add some.</p>
          )}
        </div>
      </div>

      {/* Meeting history */}
      {meetings.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-surface overflow-hidden">
          <div className="px-6 py-3 border-b border-border/60">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
              Meeting History
              <span className="ml-2 text-zinc-600">({meetings.length})</span>
            </h2>
          </div>
          <div className="divide-y divide-border/40">
            {meetings.map(m => (
              <button
                key={m.filename}
                onClick={() => navigate(`/context/${encodeURIComponent(m.filename)}?dir=contexts`)}
                className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-surface-raised/50 transition-colors group"
              >
                <Calendar className="w-4 h-4 text-zinc-600 shrink-0" aria-hidden="true" />
                <FormattedDate date={m.date} className="text-sm text-zinc-500 shrink-0 w-24" />
                <span className="text-sm text-zinc-300 truncate group-hover:text-zinc-100 transition-colors">
                  {m.title || m.filename.replace(/\.md$/, '')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
