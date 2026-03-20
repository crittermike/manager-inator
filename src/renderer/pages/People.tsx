import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Users,
  User,
  Calendar,
  Edit3,
  Save,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Search,
  FileText,
  Hash
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'

interface Person {
  name: string
  meetingCount: number
  lastSeen: string
}

interface PersonDetail {
  name: string
  profile: string
  meetings: { date: string; title: string; filename: string }[]
}

export function People() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [personDetail, setPersonDetail] = useState<PersonDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [profileDraft, setProfileDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchPeople = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.listPeople()
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name))
      setPeople(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load people')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPeople()
  }, [fetchPeople])

  const handleSelectPerson = async (person: Person) => {
    setSelectedPerson(person)
    setDetailLoading(true)
    setPersonDetail(null)
    setEditing(false)
    try {
      const detail = await window.api.getPersonDetail(person.name)
      setPersonDetail(detail)
      setProfileDraft(detail.profile)
    } catch (err) {
      setPersonDetail({
        name: person.name,
        profile: '',
        meetings: []
      })
      setProfileDraft('')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!selectedPerson || !personDetail) return
    setSaving(true)
    try {
      await window.api.commitFile(
        `people/${selectedPerson.name}/profile.md`,
        profileDraft,
        `Update profile for ${selectedPerson.name}`
      )
      setPersonDetail({ ...personDetail, profile: profileDraft })
      setEditing(false)
    } catch (err) {
      // Allow retry on failure
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    setSelectedPerson(null)
    setPersonDetail(null)
    setEditing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading people...</span>
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
            onClick={fetchPeople}
            className="text-sm text-brand-light hover:text-brand transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  const filteredPeople = searchQuery
    ? people.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : people

  // Detail view for a selected person
  if (selectedPerson) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to people
        </button>

        {detailLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Person header */}
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center text-xl font-bold text-brand-light shrink-0">
                {selectedPerson.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-zinc-100">
                  {selectedPerson.name}
                </h1>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-zinc-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" />
                    {selectedPerson.meetingCount} meeting
                    {selectedPerson.meetingCount !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Last seen{' '}
                    {formatLastSeen(selectedPerson.lastSeen)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  if (editing) {
                    handleSaveProfile()
                  } else {
                    setEditing(true)
                  }
                }}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-2 bg-brand/10 text-brand-light rounded-lg text-sm hover:bg-brand/20 transition-colors shrink-0 disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-brand-light border-t-transparent rounded-full animate-spin" />
                ) : editing ? (
                  <Save className="w-4 h-4" />
                ) : (
                  <Edit3 className="w-4 h-4" />
                )}
                {saving ? 'Saving...' : editing ? 'Save profile' : 'Edit profile'}
              </button>
            </div>

            {/* Profile section */}
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Profile notes
              </h2>
              <div className="bg-surface rounded-xl border border-border p-5">
                {editing ? (
                  <textarea
                    value={profileDraft}
                    onChange={(e) => setProfileDraft(e.target.value)}
                    placeholder="Add notes about this person (supports Markdown)..."
                    className="w-full min-h-[200px] bg-transparent text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none resize-y leading-relaxed font-mono"
                  />
                ) : personDetail?.profile ? (
                  <div className="prose-dark">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {personDetail.profile}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600 italic">
                    No profile notes yet. Click "Edit profile" to add some.
                  </p>
                )}
              </div>
              {editing && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setEditing(false)
                      setProfileDraft(personDetail?.profile || '')
                    }}
                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <span className="text-xs text-zinc-600">
                    Markdown supported
                  </span>
                </div>
              )}
            </div>

            {/* Meeting history */}
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Meeting history
              </h2>
              {personDetail?.meetings && personDetail.meetings.length > 0 ? (
                <div className="grid gap-2">
                  {personDetail.meetings.map((meeting) => (
                    <div
                      key={meeting.filename}
                      className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border"
                    >
                      <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-300 truncate">
                          {meeting.title}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {formatDate(meeting.date)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Calendar className="w-8 h-8 text-zinc-700 mb-3" />
                  <p className="text-sm text-zinc-500">
                    No meeting history available
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  // List view: people card grid
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">People</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {people.length} {people.length === 1 ? 'person' : 'people'} across
            all meetings
          </p>
        </div>
        <button
          onClick={fetchPeople}
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
          placeholder="Search people by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-lg border border-border text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand/50 transition-colors"
        />
      </div>

      {/* People grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          {searchQuery
            ? `${filteredPeople.length} result${filteredPeople.length !== 1 ? 's' : ''}`
            : 'All people'}
        </h2>

        {filteredPeople.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              {searchQuery
                ? 'No people match your search'
                : 'No people found'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPeople.map((person) => (
              <button
                key={person.name}
                onClick={() => handleSelectPerson(person)}
                className="flex flex-col items-start p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group text-left"
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-semibold text-brand-light shrink-0">
                    {person.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200 truncate">
                      {person.name}
                    </div>
                  </div>
                  <User className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500 w-full">
                  <span className="flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    {person.meetingCount} meeting
                    {person.meetingCount !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatLastSeen(person.lastSeen)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMMM d, yyyy')
  } catch {
    return dateStr
  }
}

function formatLastSeen(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}
