import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search as SearchIcon, User, Calendar } from 'lucide-react'
import type { MeetingEntry, PersonEntry } from '../../shared/types'

interface SearchResult {
  type: 'meeting' | 'person'
  title: string
  subtitle: string
  route: string
  date?: string
}

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [meetings, setMeetings] = useState<MeetingEntry[]>([])
  const [people, setPeople] = useState<PersonEntry[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    window.api.listMeetings().then(setMeetings).catch(() => {})
    window.api.listPeople().then(setPeople).catch(() => {})
  }, [])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const items: SearchResult[] = []

    for (const m of meetings) {
      if (m.title.toLowerCase().includes(q) || m.filename.toLowerCase().includes(q)) {
        items.push({
          type: 'meeting',
          title: m.title,
          subtitle: m.date + (m.hasSummary ? '' : ' · unprocessed'),
          route: `/search?meeting=${encodeURIComponent(m.filename)}`,
          date: m.date
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

      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meetings, people, notes..."
          className="w-full pl-12 pr-4 py-3 bg-surface border border-border rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/25 text-sm"
          autoFocus
        />
      </div>

      {query.trim() && results.length === 0 && (
        <div className="text-center py-12">
          <SearchIcon className="w-8 h-8 text-zinc-700 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-zinc-500">No results for "{query}"</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.route}-${i}`}
              onClick={() => navigate(r.route)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left hover:bg-surface-raised transition-colors group"
            >
              <div className="p-1.5 rounded-md bg-surface-raised text-zinc-500 group-hover:text-zinc-300 transition-colors">
                {typeIcon(r.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-200 truncate">{r.title}</div>
                <div className="text-xs text-zinc-500 truncate">{r.subtitle}</div>
              </div>
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider shrink-0">
                {r.type}
              </span>
            </button>
          ))}
        </div>
      )}

      {!query.trim() && (
        <div className="text-center py-16">
          <SearchIcon className="w-10 h-10 text-zinc-800 mx-auto mb-4" aria-hidden="true" />
          <p className="text-sm text-zinc-600">
            Search across {meetings.length} meetings and {people.length} people
          </p>
        </div>
      )}
    </div>
  )
}
