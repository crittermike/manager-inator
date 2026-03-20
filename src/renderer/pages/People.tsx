import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Users,
  User,
  Calendar,
  Edit3,
  Save,
  ArrowLeft,
  RefreshCw,
  Search,
  FileText,
  MapPin,
  Github,
  Briefcase,
  X
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

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
  const [saving, setSaving] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const navigate = useNavigate()
  const { slug: routeSlug } = useParams<{ slug: string }>()

  const loadPeople = async () => {
    setLoading(true)
    try {
      const data = await window.api.listPeople()
      setPeople(data)
      // If route has a slug, auto-open that person
      if (routeSlug) {
        const person = data.find(p => p.slug === routeSlug)
        if (person) openPerson(person)
      }
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadPeople() }, [])

  const openPerson = async (person: PersonEntry) => {
    setSelected(person)
    setDetailLoading(true)
    setEditing(false)
    try {
      const [content, mtgs] = await Promise.all([
        window.api.getFileContent(`people/${person.slug}.md`),
        window.api.getPersonMeetings(person.slug)
      ])
      setProfileContent(content)
      setMeetings(mtgs)
    } catch {
      setProfileContent('_Failed to load profile._')
      setMeetings([])
    } finally {
      setDetailLoading(false)
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
    setEditFields({
      name: fm.name || selected?.name || '',
      role: fm.role || '',
      github: fm.github || '',
      location: fm.location || '',
      relationship: fm.relationship || '',
      aliases: fm.aliases || ''
    })
    // Body is everything after frontmatter, stripping the "# Name" heading
    const body = (fmMatch?.[2] || profileContent).replace(/^#\s+.+\n*/, '').trim()
    setEditNotes(body)
    setEditing(true)
  }

  const handleSave = async () => {
    if (!selected) return
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
    } catch (e) {
      console.error('Failed to save:', e)
    } finally {
      setSaving(false)
    }
  }

  const filtered = search
    ? people.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : people

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {selected ? (
        <>
          <button
            onClick={() => { setSelected(null); setMeetings([]) }}
            className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
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
                <div className="w-14 h-14 rounded-2xl bg-brand/20 flex items-center justify-center text-lg font-bold text-brand-light shrink-0">
                  {selected.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-zinc-100">{selected.name}</h1>
                  <div className="flex items-center gap-4 mt-1.5 text-sm text-zinc-500 flex-wrap">
                    {selected.role && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5" /> {selected.role}
                      </span>
                    )}
                    {selected.github && (
                      <span className="flex items-center gap-1">
                        <Github className="w-3.5 h-3.5" /> @{selected.github}
                      </span>
                    )}
                    {selected.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> {selected.location}
                      </span>
                    )}
                    {selected.relationship && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" /> {selected.relationship}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-zinc-600">
                    <span>{selected.meetingCount} meetings</span>
                    {selected.lastSeen && (
                      <span>Last seen {formatDistanceToNow(new Date(selected.lastSeen), { addSuffix: true })}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => editing ? setEditing(false) : startEditing()}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors shrink-0"
                >
                  <Edit3 className="w-4 h-4" />
                  {editing ? 'Cancel' : 'Edit profile'}
                </button>
              </div>

              {/* Edit mode */}
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: 'name', label: 'Name', placeholder: 'Full name' },
                      { key: 'aliases', label: 'Aliases', placeholder: 'Other names, comma separated (e.g. Vlad, V. Lastname)' },
                      { key: 'role', label: 'Role', placeholder: 'e.g. Staff Product Manager' },
                      { key: 'github', label: 'GitHub', placeholder: 'username' },
                      { key: 'location', label: 'Location', placeholder: 'e.g. Seattle, WA' },
                      { key: 'relationship', label: 'Relationship', placeholder: 'e.g. Manager, Skip-level, Peer' }
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
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Notes</label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={10}
                      placeholder="Any notes about this person..."
                      className="w-full px-4 py-3 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
                    >
                      {saving ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
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
                  <div className="bg-surface rounded-xl border border-border p-5 prose-dark">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
                            onClick={() => navigate(`/meetings/${m.filename}`)}
                            className="w-full flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-brand/30 transition-all text-left"
                          >
                            <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
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
                <Users className="w-6 h-6 text-brand" />
                People
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                {people.length} people
              </p>
            </div>
            <button
              onClick={loadPeople}
              className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
            />
          </div>

          {/* People grid */}
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => (
              <button
                key={p.slug}
                onClick={() => openPerson(p)}
                className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                  {p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200">{p.name}</div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                    {p.role && <span>{p.role}</span>}
                    <span>{p.meetingCount} meetings</span>
                    {p.lastSeen && (
                      <span>Last {formatDistanceToNow(new Date(p.lastSeen), { addSuffix: true })}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
