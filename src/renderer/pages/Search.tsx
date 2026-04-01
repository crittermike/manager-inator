import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search as SearchIcon, User, Calendar, FileText } from 'lucide-react'
import type { ContentSearchResult, ContextEntry, ContextSource, PersonEntry } from '../../shared/types'

interface SearchResult {
  type: ContextSource | 'person'
  title: string
  subtitle: string
  route: string
  date?: string
  filename?: string
  directory?: 'contexts' | 'reports' | 'people' | 'notes'
}

const SOURCE_LABELS: Record<ContextSource, string> = {
  slack: 'Slack',
  github: 'GitHub',
  email: 'Email',
  meeting: 'Meeting',
  other: 'Note'
}

const FILTERS = ['all', 'slack', 'github', 'email', 'meeting', 'other', 'person'] as const
type SearchFilter = typeof FILTERS[number]

function getResultLabel(type: SearchResult['type']): string {
  return type === 'person' ? 'People' : SOURCE_LABELS[type]
}

function getSearchResultKey(result: SearchResult): string {
  if (result.type === 'person') return `person:${result.filename || result.title}`
  if (result.directory && result.filename) return `${result.directory}:${result.filename}`
  if (result.filename) return `${result.type}:${result.filename}`
  return `${result.type}:${result.route || result.title}`
}

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [contexts, setContexts] = useState<ContextEntry[]>([])
  const [people, setPeople] = useState<PersonEntry[]>([])
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [typeFilter, setTypeFilter] = useState<SearchFilter>('all')
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    window.api.listContexts().then(setContexts).catch(() => {})
    window.api.listPeople().then(setPeople).catch(() => {})
  }, [])

  useEffect(() => {
    setSelectedIndex(-1)
    setTypeFilter('all')

    if (!query.trim()) {
      setContentResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timer = window.setTimeout(() => {
      window.api.searchContent(query)
        .then(res => {
          setContentResults(res)
          setIsSearching(false)
        })
        .catch(() => {
          setContentResults([])
          setIsSearching(false)
        })
    }, 300)

    return () => window.clearTimeout(timer)
  }, [query])

  // Handle ?meeting= query param (opens inline viewer)
  useEffect(() => {
    const meetingParam = searchParams.get('meeting')
    if (meetingParam) {
      navigate(`/context/${encodeURIComponent(meetingParam)}?dir=contexts`, { replace: true })
    }
  }, [searchParams, navigate])

  // Handle ?q= query param (pre-fills search)
  useEffect(() => {
    const qParam = searchParams.get('q')
    if (qParam && qParam !== query) {
      setQuery(qParam)
    }
  }, [searchParams])

  const recentItems = useMemo(() => {
    if (query.trim()) return []
    return [...contexts]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30)
      .map(m => ({
        type: m.source,
        title: m.title,
        subtitle: m.date,
        route: '',
        date: m.date,
        filename: m.filename,
        directory: 'contexts' as const
      }))
  }, [query, contexts])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const titleItems: SearchResult[] = []
    const contentItems: SearchResult[] = []

    for (const m of contexts) {
      if (m.title.toLowerCase().includes(q) || m.filename.toLowerCase().includes(q)) {
        titleItems.push({
          type: m.source,
          title: m.title,
          subtitle: m.date,
          route: '',
          date: m.date,
          filename: m.filename,
          directory: 'contexts'
        })
      }
    }

    for (const p of people) {
      const searchable = [p.name, p.role, p.location, ...p.aliases].join(' ').toLowerCase()
      if (searchable.includes(q)) {
        const isReport = p.relationship?.toLowerCase() === 'direct report'
        titleItems.push({
          type: 'person',
          title: p.name,
          subtitle: [p.role, p.location].filter(Boolean).join(' · '),
          route: isReport ? `/report/${p.slug}` : `/people/${p.slug}`,
          filename: `${p.slug}.md`,
          directory: 'people'
        })
      }
    }

    for (const c of contentResults) {
      if (c.directory === 'contexts') {
        contentItems.push({
          type: c.source || 'other',
          title: c.title,
          subtitle: c.snippet,
          route: '',
          date: c.date,
          filename: c.filename,
          directory: 'contexts'
        })
      } else if (c.directory === 'reports') {
        const reportName = c.filename.split('/')[0]
        contentItems.push({
          type: 'other',
          title: c.title,
          subtitle: c.snippet,
          route: `/report/${reportName}`,
          date: c.date,
          filename: c.filename,
          directory: 'reports'
        })
      } else if (c.directory === 'notes') {
        contentItems.push({
          type: 'other',
          title: c.title,
          subtitle: c.snippet,
          route: '',
          date: c.date,
          filename: c.filename,
          directory: 'notes'
        })
      } else {
        const slug = c.filename.replace(/\.(md|txt)$/i, '')
        contentItems.push({
          type: 'person',
          title: c.title,
          subtitle: c.snippet,
          route: `/people/${slug}`,
          filename: c.filename,
          directory: 'people'
        })
      }
    }

    titleItems.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date)
      if (a.type === 'person' && b.type !== 'person') return -1
      if (b.type === 'person' && a.type !== 'person') return 1
      return 0
    })

    contentItems.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date)
      return 0
    })

    const merged = [...titleItems, ...contentItems]
    const deduped: SearchResult[] = []
    const seen = new Set<string>()

    for (const result of merged) {
      const key = getSearchResultKey(result)
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(result)
    }

    return deduped.slice(0, 50)
  }, [query, contexts, people, contentResults])

  const filteredResults = useMemo(() => {
    if (typeFilter === 'all') return results
    return results.filter(r => r.type === typeFilter)
  }, [results, typeFilter])

  useEffect(() => {
    setSelectedIndex(-1)
  }, [typeFilter, results.length])

  useEffect(() => {
    if (selectedIndex >= 0 && resultsContainerRef.current) {
      const selectedEl = resultsContainerRef.current.querySelector(`[data-search-result="${selectedIndex}"]`)
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  const handleResultClick = (r: SearchResult) => {
    if (r.directory === 'contexts' && r.filename) {
      navigate(`/context/${encodeURIComponent(r.filename)}?dir=contexts`)
    } else if (r.directory === 'notes' && r.filename) {
      navigate(`/context/${encodeURIComponent(r.filename)}?dir=weekly-log`)
    } else if (r.route.startsWith('/search?q=')) {
      const name = new URL(r.route, 'http://x').searchParams.get('q') || r.title
      setQuery(name)
    } else {
      navigate(r.route)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const activeItems = query.trim() ? filteredResults : recentItems
    if (activeItems.length === 0) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setQuery('')
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev < activeItems.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : activeItems.length - 1))
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < activeItems.length) {
        e.preventDefault()
        handleResultClick(activeItems[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
    }
  }

  const typeIcon = (type: string) => {
    if (type === 'person') return <User className="w-4 h-4 text-emerald-400" aria-hidden="true" />
    if (type === 'meeting') return <Calendar className="w-4 h-4 text-brand-light" aria-hidden="true" />
    if (type === 'slack') return <FileText className="w-4 h-4 text-cyan-400" aria-hidden="true" />
    if (type === 'github') return <FileText className="w-4 h-4 text-zinc-200" aria-hidden="true" />
    if (type === 'email') return <FileText className="w-4 h-4 text-amber-300" aria-hidden="true" />
    return <FileText className="w-4 h-4 text-zinc-500" aria-hidden="true" />
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <SearchIcon className="w-6 h-6 text-brand" aria-hidden="true" />
          Search
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Find Slack, GitHub, email, meetings, notes, and people</p>
      </div>

      <div className="space-y-3">
        <div className="relative group/search">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within/search:text-brand-light transition-colors" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search Slack, GitHub, email, meetings, notes, people..."
            className="w-full pl-12 pr-4 py-3.5 bg-surface border border-border rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15 text-sm transition-all"
            autoFocus
          />
        </div>

        {isSearching && query.trim() && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 px-1">
            <div className="w-3 h-3 border-2 border-brand/40 border-t-brand rounded-full animate-spin" />
            Searching...
          </div>
        )}

        {query.trim() && results.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-border/60 bg-zinc-900/40 p-1.5">
            {FILTERS.map(filter => (
              <button
                key={filter}
                onClick={() => setTypeFilter(filter)}
                className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                  typeFilter === filter
                    ? 'bg-brand/15 text-brand-light font-medium'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised/70'
                }`}
              >
                {filter === 'all' ? 'All' : getResultLabel(filter)}
                {filter !== 'all' && (
                  <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-md bg-zinc-800/70 px-1 py-0.5 text-[10px] text-zinc-600">
                    {results.filter(r => r.type === filter).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {query.trim() && filteredResults.length === 0 && !isSearching && (
        <div className="text-center py-16 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4">
            <SearchIcon className="w-6 h-6 text-zinc-600" aria-hidden="true" />
          </div>
          <p className="text-sm text-zinc-400 mb-1">No results for "{query}"</p>
          <p className="text-xs text-zinc-600">Try a different search term</p>
        </div>
      )}

      {filteredResults.length > 0 && (
        <div className="space-y-1.5 animate-fade-in" ref={resultsContainerRef}>
          {filteredResults.map((r, i) => (
            <button
              key={`${r.type}-${r.route || r.filename}-${i}`}
              data-search-result={i}
              onClick={() => handleResultClick(r)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-surface-raised/70 hover:shadow-md hover:shadow-black/10 transition-all duration-150 group border ${
                selectedIndex === i
                  ? 'bg-brand/10 border-brand/20 shadow-md shadow-black/10'
                  : 'border-transparent'
              }`}
            >
              <div className="transition-all duration-150">
                {typeIcon(r.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm leading-tight text-zinc-200 truncate group-hover:text-zinc-100">{r.title}</div>
                <div className="text-xs leading-snug text-zinc-500 truncate">{r.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!query.trim() && recentItems.length > 0 && (
        <div className="animate-fade-in">
          <div className="px-1 mb-3">
             <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Recent context</h2>
          </div>
          <div ref={resultsContainerRef} className="space-y-1.5">
            {recentItems.map((r, i) => (
              <button
                key={r.filename || i}
                data-search-result={i}
                onClick={() => handleResultClick(r)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-surface-raised/70 hover:shadow-md hover:shadow-black/10 transition-all duration-150 group border border-transparent"
              >
                <div className="transition-all duration-150">
                  {typeIcon(r.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm leading-tight text-zinc-200 truncate group-hover:text-zinc-100">{r.title}</div>
                  <div className="text-xs leading-snug text-zinc-500 truncate">{r.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!query.trim() && recentItems.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800/30 flex items-center justify-center mx-auto mb-5">
            <SearchIcon className="w-7 h-7 text-zinc-700" aria-hidden="true" />
          </div>
          <h2 className="text-base font-medium text-zinc-200 mb-1">Nothing to search yet</h2>
          <p className="text-sm text-zinc-500 mb-2">As you add people and save management context, everything becomes searchable here.</p>
          <p className="text-xs text-zinc-600">Slack, GitHub, email, meetings, notes, people, feedback, action items, and check-ins — all in one place.</p>
        </div>
      )}
    </div>
  )
}
