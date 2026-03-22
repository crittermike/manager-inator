import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, User, Calendar, ArrowLeft, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { MeetingEntry, PersonEntry } from '../../shared/types'
import { cleanSummaryContent } from '../utils/cleanSummary'

interface SearchResult {
  type: 'meeting' | 'person'
  title: string
  subtitle: string
  route: string
  date?: string
  filename?: string
}

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [meetings, setMeetings] = useState<MeetingEntry[]>([])
  const [people, setPeople] = useState<PersonEntry[]>([])
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Meeting viewer state
  const [viewingMeeting, setViewingMeeting] = useState<string | null>(null)
  const [meetingContent, setMeetingContent] = useState<string | null>(null)
  const [meetingLoading, setMeetingLoading] = useState(false)
  const [meetingTitle, setMeetingTitle] = useState('')

  useEffect(() => {
    window.api.listMeetings().then(setMeetings).catch(() => {})
    window.api.listPeople().then(setPeople).catch(() => {})
  }, [])

  // Handle ?meeting= query param
  useEffect(() => {
    const meetingParam = searchParams.get('meeting')
    if (meetingParam && meetings.length > 0) {
      const meeting = meetings.find(m => m.filename === meetingParam)
      if (meeting) {
        openMeeting(meeting.filename, meeting.title)
      }
    }
  }, [searchParams, meetings])

  const openMeeting = useCallback(async (filename: string, title: string) => {
    setViewingMeeting(filename)
    setMeetingTitle(title)
    setMeetingLoading(true)
    setMeetingContent(null)

    try {
      const content = await window.api.getFileContent(`meetings/${filename}`)
      setMeetingContent(cleanSummaryContent(content))
    } catch {
      setMeetingContent('_Unable to load meeting content._')
    }
    setMeetingLoading(false)
  }, [])

  const closeMeeting = useCallback(() => {
    setViewingMeeting(null)
    setMeetingContent(null)
    setMeetingTitle('')
    // Clear the ?meeting= param without navigating
    if (searchParams.has('meeting')) {
      searchParams.delete('meeting')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const items: SearchResult[] = []

    for (const m of meetings) {
      if (m.title.toLowerCase().includes(q) || m.filename.toLowerCase().includes(q)) {
        items.push({
          type: 'meeting',
          title: m.title,
          subtitle: m.date,
          route: '',
          date: m.date,
          filename: m.filename
        })
      }
    }

    for (const p of people) {
      const searchable = [p.name, p.role, p.location, ...p.aliases].join(' ').toLowerCase()
      if (searchable.includes(q)) {
        items.push({
          type: 'person',
          title: p.name,
          subtitle: [p.role, p.location].filter(Boolean).join(' · '),
          route: `/report/${p.slug}`
        })
      }
    }

    items.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date)
      if (a.type === 'person' && b.type !== 'person') return -1
      if (b.type === 'person' && a.type !== 'person') return 1
      return 0
    })

    return items.slice(0, 50)
  }, [query, meetings, people])

  const typeIcon = (type: string) => {
    if (type === 'person') return <User className="w-4 h-4" aria-hidden="true" />
    return <Calendar className="w-4 h-4" aria-hidden="true" />
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Search</h1>
        <p className="text-sm text-zinc-500 mt-1">Find meetings, people, and notes</p>
      </div>

      {/* Meeting viewer */}
      {viewingMeeting && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={closeMeeting}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                aria-label="Close"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-zinc-200 truncate">{meetingTitle}</span>
            </div>
            <button
              onClick={closeMeeting}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
            {meetingLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            ) : meetingContent ? (
              <div className="prose-dark text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{meetingContent}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Unable to load content.</p>
            )}
          </div>
        </div>
      )}

      <div className="relative group/search">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within/search:text-brand-light transition-colors" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meetings, people, notes..."
          className="w-full pl-12 pr-4 py-3.5 bg-surface border border-border rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15 text-sm transition-all"
          autoFocus
        />
      </div>

      {query.trim() && results.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
            <SearchIcon className="w-6 h-6 text-zinc-600" aria-hidden="true" />
          </div>
          <p className="text-sm text-zinc-400 mb-1">No results for "{query}"</p>
          <p className="text-xs text-zinc-600">Try a different search term</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1 animate-fade-in">
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.route || r.filename}-${i}`}
              onClick={() => {
                if (r.type === 'meeting' && r.filename) {
                  openMeeting(r.filename, r.title)
                } else {
                  navigate(r.route)
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left hover:bg-surface-raised/70 hover:shadow-md hover:shadow-black/10 transition-all duration-150 group"
            >
              <div className="p-2 rounded-lg bg-surface-raised text-zinc-500 group-hover:text-brand-light group-hover:bg-brand/10 transition-all duration-150">
                {typeIcon(r.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate group-hover:text-zinc-100">{r.title}</div>
                <div className="text-xs text-zinc-500 truncate">{r.subtitle}</div>
              </div>
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider shrink-0 px-2 py-0.5 rounded-full bg-surface-raised/50">
                {r.type}
              </span>
            </button>
          ))}
        </div>
      )}

      {!query.trim() && (
        <div className="space-y-4">
          {meetings.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Recent meetings</h2>
              <div className="space-y-1">
                {meetings
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 15)
                  .map((m, i) => (
                    <button
                      key={`${m.filename}-${i}`}
                      onClick={() => openMeeting(m.filename, m.title)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-surface-raised/70 hover:shadow-md hover:shadow-black/10 transition-all duration-150 group"
                    >
                      <div className="p-2 rounded-lg bg-surface-raised text-zinc-500 group-hover:text-brand-light group-hover:bg-brand/10 transition-all duration-150">
                        <Calendar className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 truncate group-hover:text-zinc-100">{m.title}</div>
                        <div className="text-xs text-zinc-500 truncate">{m.date}</div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
          {meetings.length === 0 && (
            <div className="text-center py-20">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/30 flex items-center justify-center mx-auto mb-5">
                <SearchIcon className="w-7 h-7 text-zinc-700" aria-hidden="true" />
              </div>
              <p className="text-sm text-zinc-500 mb-1">No meetings or people yet</p>
              <p className="text-xs text-zinc-600">Process a transcript to get started</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
