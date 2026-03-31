import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../components/common/Toast'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import {
  Users,
  User,
  Edit3,
  Save,
  ArrowLeft,
  RefreshCw,
  Search,
  FileText,
  MapPin,
  GithubIcon,
  Briefcase,
  X,
  UserPlus
} from 'lucide-react'
import { formatRelativeDate } from '../utils/formatDate'
import { ComboInput } from '../components/common/ComboInput'

interface PersonEntry {
  name: string
  slug: string
  meetingCount: number
  lastSeen: string
  role: string
  github: string
  location: string
  relationship: string
}

interface MeetingRef {
  date: string
  title: string
  filename: string
}

function formatMeetingTitle(str: string): string {
  const fixed = str.replace(/\b1\s+1\b/g, '1-1')
  return fixed.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

export function People() {
  const [people, setPeople] = useState<PersonEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PersonEntry | null>(null)
  const [meetings, setMeetings] = useState<MeetingRef[]>([])
  const [profileContent, setProfileContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editFields, setEditFields] = useState({ name: '', role: '', github: '', location: '', relationship: '', aliases: '' })
  const [editNotes, setEditNotes] = useState('')
  const [initialEditFields, setInitialEditFields] = useState({ name: '', role: '', github: '', location: '', relationship: '', aliases: '' })
  const [initialEditNotes, setInitialEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [roleOptions, setRoleOptions] = useState<string[]>([])
  const [relOptions, setRelOptions] = useState<string[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [addingSaving, setAddingSaving] = useState(false)
  const [showAddReportForm, setShowAddReportForm] = useState(false)
  const [newReportName, setNewReportName] = useState('')
  const [addingReportSaving, setAddingReportSaving] = useState(false)
  const navigate = useNavigate()
  const { slug: routeSlug } = useParams<{ slug: string }>()
  const toast = useToast()
  const isDirty = editing && (
    JSON.stringify(editFields) !== JSON.stringify(initialEditFields) ||
    editNotes !== initialEditNotes
  )
  const { blockerState, proceed, reset: resetBlocker } = useUnsavedChanges(isDirty)
  const saveRef = useRef<() => void>(() => {})
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useKeyboardShortcut({ key: 's', handler: useCallback(() => saveRef.current(), []), enabled: editing })

  const loadPeople = async (): Promise<PersonEntry[]> => {
    setLoading(true)
    try {
      const [data, opts] = await Promise.all([
        window.api.listPeople(),
        window.api.getSettingsOptions()
      ])
      if (!mountedRef.current) return []
      setPeople(data)
      setRoleOptions(opts.roles || [])
      setRelOptions(opts.relationships || [])
      if (routeSlug) {
        const person = data.find((p: PersonEntry) => p.slug === routeSlug)
        if (person && person.relationship?.toLowerCase() === 'direct report') {
          navigate(`/report/${person.slug}`, { replace: true })
        } else if (person) {
          openPerson(person)
        }
      }
      return data
    } catch (e) {
      console.error('Failed to load people:', e)
      if (mountedRef.current) toast.error('Failed to load people')
      return []
    }
    finally { if (mountedRef.current) setLoading(false) }
  }

  // Reload when navigating back (routeSlug changes) or on mount
  useEffect(() => { loadPeople() }, [routeSlug])

  const handleCreatePerson = async () => {
    const trimmed = newPersonName.trim()
    if (!trimmed) return
    setAddingSaving(true)
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    const existingSlug = await window.api.findPersonByName(trimmed)
    if (existingSlug) {
      toast.error(`A profile for "${trimmed}" already exists`)
      setAddingSaving(false)
      return
    }

    if (people.some(p => p.slug === slug)) {
      toast.error(`A profile with slug "${slug}" already exists`)
      setAddingSaving(false)
      return
    }

    let fileAlreadyExists = false
    try {
      await window.api.getFileContent(`people/${slug}.md`)
      fileAlreadyExists = true
    } catch {
      // File doesn't exist — safe to create
    }
    if (fileAlreadyExists) {
      toast.error(`A profile file for "${slug}" already exists`)
      setAddingSaving(false)
      return
    }

    const content = `---
name: ${trimmed}
slug: ${slug}
aliases: 
role: 
github: 
location: 
relationship: 
---

# ${trimmed}
`
    try {
      await window.api.commitFile(
        `people/${slug}.md`,
        content,
        `Add person: ${trimmed}`
      )
      setNewPersonName('')
      setShowAddForm(false)
      toast.success(`Added ${trimmed}`)
      const freshPeople = await loadPeople()
      const person = freshPeople.find(p => p.slug === slug) || { name: trimmed, slug, meetingCount: 0, lastSeen: '', role: '', github: '', location: '', relationship: '' }
      openPerson(person)
    } catch (e) {
      console.error('Failed to create person:', e)
      toast.error('Failed to create person')
    } finally {
      setAddingSaving(false)
    }
  }

  const handleCreateReport = async () => {
    const trimmed = newReportName.trim()
    if (!trimmed) return
    setAddingReportSaving(true)
    try {
      const slug = await window.api.createReport(trimmed)
      setNewReportName('')
      setShowAddReportForm(false)
      toast.success(`Added ${trimmed} as a direct report`)
      await loadPeople()
      navigate(`/report/${slug}`)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to add report')
    } finally {
      setAddingReportSaving(false)
    }
  }

  const openPerson = async (person: PersonEntry) => {
    setSelected(person)
    setDetailLoading(true)
    setEditing(false)
    try {
      const [content, mtgs] = await Promise.all([
        window.api.getFileContent(`people/${person.slug}.md`),
        window.api.getPersonMeetings(person.slug)
      ])
      if (!mountedRef.current) return
      setProfileContent(content)
      setMeetings(mtgs)
    } catch {
      if (!mountedRef.current) return
      setProfileContent('_Failed to load profile._')
      setMeetings([])
    } finally {
      if (mountedRef.current) setDetailLoading(false)
    }
  }

  const startEditing = () => {
    // Parse frontmatter fields and body from profileContent
    const fmMatch = profileContent.match(/^---\n([\s\S]*?)\n---\n*([\s\S]*)/)
    const fm: Record<string, string> = {}
    if (fmMatch) {
      for (const line of fmMatch[1].split('\n')) {
        const m = line.match(/^(\w+):\s*(.*)/)
        if (m) fm[m[1]] = m[2].trim()
      }
    }
    const fields = {
      name: fm.name || selected?.name || '',
      role: fm.role || '',
      github: fm.github || '',
      location: fm.location || '',
      relationship: fm.relationship || '',
      aliases: fm.aliases || ''
    }
    setEditFields(fields)
    setInitialEditFields(fields)
    // Body is everything after frontmatter, stripping the "# Name" heading
    const body = (fmMatch?.[2] || profileContent).replace(/^#\s+.+\n*/, '').trim()
    setEditNotes(body)
    setInitialEditNotes(body)
    setEditing(true)
  }

  const handleSave = async () => {
    if (!selected) return
    if (!editFields.name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      // Rebuild the file with frontmatter + body
      const content = `---
name: ${editFields.name}
slug: ${selected.slug}
aliases: ${editFields.aliases}
role: ${editFields.role}
github: ${editFields.github}
location: ${editFields.location}
relationship: ${editFields.relationship}
---

# ${editFields.name}

${editNotes}`

      await window.api.commitFile(
        `people/${selected.slug}.md`,
        content,
        `Update profile for ${editFields.name}`
      )
      setProfileContent(content)
      // Update the selected person's display info
      setSelected({ ...selected, name: editFields.name, role: editFields.role, github: editFields.github, location: editFields.location, relationship: editFields.relationship })
      setEditing(false)
      toast.success('Profile saved')
    } catch (e) {
      console.error('Failed to save:', e)
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }
  saveRef.current = handleSave

  const debouncedSearch = useDebouncedValue(search, 300)

  const filtered = debouncedSearch
    ? people.filter(p => p.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : people

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="space-y-2">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-4 w-64 rounded" />
        </div>
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="space-y-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <div className="skeleton w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-48 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {selected ? (
        <>
          <button
            onClick={() => { setSelected(null); setMeetings([]) }}
            className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to people
          </button>

          {detailLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Profile header */}
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 rounded-2xl bg-brand/15 flex items-center justify-center text-lg font-bold text-brand-light shrink-0 ring-1 ring-brand/10">
                  {selected.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-zinc-100">{selected.name}</h1>
                  <div className="flex items-center gap-4 mt-1.5 text-sm text-zinc-500 flex-wrap">
                    {selected.role && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5" aria-hidden="true" /> {selected.role}
                      </span>
                    )}
                    {selected.github && (
                      <span className="flex items-center gap-1">
                        <GithubIcon className="w-3.5 h-3.5" aria-hidden="true" /> @{selected.github}
                      </span>
                    )}
                    {selected.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> {selected.location}
                      </span>
                    )}
                    {selected.relationship && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" aria-hidden="true" /> {selected.relationship}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-zinc-600">
                    <span>{meetings.length > 0 ? meetings.length : selected.meetingCount} meetings</span>
                    {selected.lastSeen && (
                      <span>Last seen {formatRelativeDate(new Date(selected.lastSeen)).toLowerCase()}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => editing ? setEditing(false) : startEditing()}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors shrink-0"
                >
                  <Edit3 className="w-4 h-4" aria-hidden="true" />
                  {editing ? 'Cancel' : 'Edit profile'}
                </button>
              </div>

              {/* Edit mode */}
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: 'name', label: 'Name', placeholder: 'Full name' },
                      { key: 'aliases', label: 'Aliases', placeholder: 'Other names, comma separated' },
                      { key: 'github', label: 'GitHub', placeholder: 'username' },
                      { key: 'location', label: 'Location', placeholder: 'e.g. Seattle, WA' },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                        <input
                          type="text"
                          value={editFields[key as keyof typeof editFields]}
                          onChange={(e) => setEditFields({ ...editFields, [key]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    ))}
                    <ComboInput
                      label="Role"
                      value={editFields.role}
                      onChange={(v) => setEditFields({ ...editFields, role: v })}
                      options={roleOptions}
                      placeholder="Start typing..."
                    />
                    <ComboInput
                      label="Relationship"
                      value={editFields.relationship}
                      onChange={(v) => setEditFields({ ...editFields, relationship: v })}
                      options={relOptions}
                      placeholder="Start typing..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Notes</label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() } }}
                      rows={10}
                      placeholder="Any notes about this person..."
                      className="w-full px-4 py-3 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-50 transition-all active:scale-[0.97]"
                    >
                      {saving ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" aria-hidden="true" />
                       )}
                      Save profile
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Profile content (strip frontmatter for display) */}
                  <div className="bg-surface rounded-xl border border-border p-6 prose-dark">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                      {profileContent.replace(/^---\n[\s\S]*?\n---\n*/m, '').trim()}
                    </ReactMarkdown>
                  </div>

                  {/* Meeting history */}
                  <div>
                    <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
                      Meeting history ({meetings.length})
                    </h2>
                    {meetings.length === 0 ? (
                      <p className="text-sm text-zinc-600">No meetings found.</p>
                    ) : (
                      <div className="space-y-2">
                        {meetings.map((m) => (
                          <button
                            key={m.filename}
                            onClick={() => navigate(`/search?meeting=${encodeURIComponent(m.filename)}`)}
                            className="w-full flex items-center gap-3 p-3.5 bg-surface rounded-xl border border-border hover:border-brand/30 hover:shadow-md hover:shadow-black/10 transition-all duration-150 text-left group/meeting"
                          >
                            <FileText className="w-4 h-4 text-zinc-500 shrink-0 group-hover/meeting:text-brand-light transition-colors" aria-hidden="true" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-zinc-300">{formatMeetingTitle(m.title)}</span>
                              <span className="ml-2 text-xs text-zinc-600">{m.date}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                <Users className="w-6 h-6 text-brand" aria-hidden="true" />
                 People
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                {people.length} people
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowAddReportForm(!showAddReportForm); setShowAddForm(false) }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97]"
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                Add direct report
              </button>
              <button
                onClick={() => { setShowAddForm(!showAddForm); setShowAddReportForm(false) }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-brand-light hover:text-brand bg-brand/10 hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97]"
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                Add person
              </button>
              <button
                onClick={loadPeople}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>

          {showAddReportForm && (
            <div className="p-4 bg-surface rounded-xl border border-brand/30 animate-fade-in space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-brand-light" aria-hidden="true" />
                <span className="text-sm font-medium text-zinc-200">Add a direct report</span>
              </div>
              <p className="text-xs text-zinc-500">This creates a full report profile that appears in your sidebar, plus a people profile for meeting matching.</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newReportName}
                  onChange={(e) => setNewReportName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateReport(); if (e.key === 'Escape') { setShowAddReportForm(false); setNewReportName('') } }}
                  placeholder="Full name (e.g. Jane Smith)"
                  aria-label="Direct report full name"
                  autoFocus
                  className="flex-1 px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
                />
                <button
                  onClick={handleCreateReport}
                  disabled={!newReportName.trim() || addingReportSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-50 transition-all active:scale-[0.97]"
                >
                  {addingReportSaving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" aria-hidden="true" />
                  )}
                  Create
                </button>
                <button
                  onClick={() => { setShowAddReportForm(false); setNewReportName('') }}
                  className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {showAddForm && (
            <div className="flex items-center gap-2 p-4 bg-surface rounded-xl border border-brand/20 animate-fade-in">
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePerson(); if (e.key === 'Escape') setShowAddForm(false) }}
                placeholder="Full name (e.g. Jane Smith)"
                aria-label="Full name"
                autoFocus
                className="flex-1 px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
              />
              <button
                onClick={handleCreatePerson}
                disabled={!newPersonName.trim() || addingSaving}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-50 transition-all active:scale-[0.97]"
              >
                {addingSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" aria-hidden="true" />
                 )}
                Create
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewPersonName('') }}
                className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative group/search">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within/search:text-brand-light transition-colors" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people..."
              aria-label="Search people"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15 transition-all"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/30 flex items-center justify-center mb-5">
                <Users className="w-7 h-7 text-zinc-700" aria-hidden="true" />
              </div>
              {people.length === 0 ? (
                <>
                  <p className="text-lg font-medium text-zinc-300 mb-2">Your network starts here</p>
                  <p className="text-sm text-zinc-500 mb-5 max-w-md">Start by adding your direct reports — they'll appear in your sidebar for quick access to 1:1 prep, feedback, and performance tracking.</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowAddReportForm(true)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97]"
                    >
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                      Add your first direct report
                    </button>
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      or add a person
                    </button>
                  </div>
                  <p className="text-xs text-zinc-600 mt-4 max-w-md">
                    <strong className="text-zinc-500">Direct reports</strong> get full tracking (1:1s, feedback, reviews). <strong className="text-zinc-500">People</strong> are lighter — just profiles and meeting history.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-zinc-500 mb-2">Hmm, nobody by that name 🔍</p>
                  <button
                    onClick={() => setSearch('')}
                    className="text-sm text-brand-light hover:text-brand transition-colors"
                  >
                    Clear search
                  </button>
                </>
              )}
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((p, idx) => (
              <div
                key={p.slug}
                style={{ animationDelay: `${Math.min(idx * 50, 300)}ms`, animationFillMode: 'both' }}
                className="animate-fade-up"
              >
              <button
                onClick={() => {
                  if (p.relationship?.toLowerCase() === 'direct report') {
                    navigate(`/report/${p.slug}`)
                  } else {
                    openPerson(p)
                  }
                }}
                className="w-full flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised/70 hover:shadow-md hover:shadow-black/10 transition-all duration-150 text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-brand/15 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0 group-hover:bg-brand/25 transition-colors">
                  {p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{p.name}</span>
                    {p.relationship?.toLowerCase() === 'direct report' && (
                      <span className="text-[10px] font-medium text-brand-light bg-brand/10 px-1.5 py-0.5 rounded">Report</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                    {p.role && <span>{p.role}</span>}
                    <span>{p.meetingCount} meetings</span>
                    {p.lastSeen && (
                      <span>Last seen {formatRelativeDate(new Date(p.lastSeen)).toLowerCase()}</span>
                    )}
                  </div>
                </div>
              </button>
              </div>
            ))}
          </div>
          )}
        </>
      )}
    </div>
      <ConfirmDialog
        open={blockerState === 'blocked'}
        title="Unsaved changes"
        message="You have unsaved changes. Leave without saving?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={proceed}
        onCancel={resetBlocker}
      />
    </>
  )
}
