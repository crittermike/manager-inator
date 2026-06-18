import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Network as NetworkIcon, Users, Search as SearchIcon, ArrowRight } from 'lucide-react'
import { AddPersonModal } from '../components/layout/AddPersonModal'
import { RELATIONSHIP_CATEGORIES, DIRECT_REPORT_RELATIONSHIP } from '../../shared/constants'
import type { PersonEntry } from '../../shared/types'

interface CategoryGroup {
  key: string
  label: string
  people: PersonEntry[]
}

/** Pluralize a category label when used as a section heading. */
function pluralize(label: string): string {
  if (label.endsWith('y')) return label.slice(0, -1) + 'ies'
  if (label.endsWith('s')) return label
  return label + 's'
}

function groupPeople(people: PersonEntry[]): { groups: CategoryGroup[]; directReports: PersonEntry[] } {
  const directReports: PersonEntry[] = []
  const buckets = new Map<string, PersonEntry[]>()

  // Seed the typed buckets so they appear in fixed order even when empty.
  for (const cat of RELATIONSHIP_CATEGORIES) buckets.set(cat, [])

  for (const p of people) {
    if (p.relationship === DIRECT_REPORT_RELATIONSHIP) {
      directReports.push(p)
      continue
    }
    const key = p.relationship && p.relationship.trim() ? p.relationship.trim() : 'Other'
    const bucket = buckets.get(key) ?? []
    bucket.push(p)
    buckets.set(key, bucket)
  }

  const groups: CategoryGroup[] = []
  for (const cat of RELATIONSHIP_CATEGORIES) {
    const list = buckets.get(cat) ?? []
    groups.push({ key: cat, label: cat, people: list })
    buckets.delete(cat)
  }
  // Anything left over (custom relationship strings) goes under "Other".
  const otherPeople: PersonEntry[] = []
  for (const list of buckets.values()) otherPeople.push(...list)
  if (otherPeople.length > 0) {
    groups.push({ key: 'Other', label: 'Other', people: otherPeople })
  }
  return { groups, directReports }
}

function formatLastSeen(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const now = Date.now()
  const diffDays = Math.floor((now - d.getTime()) / 86400000)
  if (diffDays < 1) return 'today'
  if (diffDays < 2) return 'yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

function PersonRow({ person, onClick, isSelected }: { person: PersonEntry; onClick: () => void; isSelected: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        isSelected
          ? 'border-brand/40 bg-brand/5'
          : 'border-border/60 bg-surface hover:bg-surface-raised hover:border-border'
      }`}
    >
      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-300 shrink-0 overflow-hidden">
        {person.github ? (
          <img
            src={`https://github.com/${person.github}.png?size=64`}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          person.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-zinc-100 truncate">{person.name}</div>
        <div className="text-[11px] text-zinc-500 truncate">
          {person.role || '—'}
          {person.location && <span className="ml-2">· {person.location}</span>}
          {person.meetingCount > 0 && <span className="ml-2">· {person.meetingCount} meeting{person.meetingCount === 1 ? '' : 's'}</span>}
        </div>
      </div>
      <div className="text-[10px] text-zinc-500 shrink-0">{formatLastSeen(person.lastSeen)}</div>
    </button>
  )
}

export function Network() {
  const navigate = useNavigate()
  const [people, setPeople] = useState<PersonEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    window.api.listPeople()
      .then(p => { setPeople(p); setError(null) })
      .catch(e => setError((e as Error).message || 'Failed to load people'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter(p => {
      if (p.name.toLowerCase().includes(q)) return true
      if (p.role && p.role.toLowerCase().includes(q)) return true
      if (p.aliases.some(a => a.toLowerCase().includes(q))) return true
      return false
    })
  }, [people, query])

  const { groups, directReports } = useMemo(() => groupPeople(filteredPeople), [filteredPeople])

  // Auto-select first non-empty network category (skip Direct Reports — they have their own page).
  useEffect(() => {
    const populated = groups.filter(g => g.people.length > 0)
    if (selectedCategory) {
      const stillThere = populated.find(g => g.key === selectedCategory)
      if (stillThere) return
    }
    setSelectedCategory(populated[0]?.key ?? null)
  }, [groups, selectedCategory])

  const handleCreated = useCallback((slug: string) => {
    navigate(`/people/${slug}`)
  }, [navigate])

  const networkCount = groups.reduce((sum, g) => sum + g.people.length, 0)
  const selectedGroup = groups.find(g => g.key === selectedCategory) ?? null

  return (
    <div className="px-6 py-5 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <NetworkIcon className="w-4 h-4 text-brand" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-zinc-100">Network</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Peer managers, partners, stakeholders, mentors — everyone outside your direct team.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Add person
        </button>
      </div>

      <div className="mb-4 relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, role, or alias…"
          aria-label="Search network"
          className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand/50"
        />
      </div>

      {loading && <p className="text-xs text-zinc-500">Loading…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {!loading && !error && networkCount === 0 && directReports.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <NetworkIcon className="w-8 h-8 text-zinc-600 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-sm font-medium text-zinc-200 mb-1">Build your network</h2>
          <p className="text-xs text-zinc-500 mb-4 max-w-sm mx-auto">Track peer managers, cross-functional partners, stakeholders, and mentors so you can prep for and reflect on those conversations too.</p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add your first person
          </button>
        </div>
      )}

      {!loading && !error && (networkCount > 0 || directReports.length > 0) && (
        <div className="grid lg:grid-cols-[minmax(220px,280px)_1fr] gap-5">
          <nav aria-label="Network categories" className="space-y-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
            {groups.map(g => (
              <button
                key={g.key}
                onClick={() => setSelectedCategory(g.key)}
                aria-current={selectedCategory === g.key ? 'true' : undefined}
                className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  selectedCategory === g.key
                    ? 'bg-brand/10 text-brand-light'
                    : g.people.length === 0
                      ? 'text-zinc-600'
                      : 'text-zinc-300 hover:bg-surface-raised'
                }`}
              >
                <span>{pluralize(g.label)}</span>
                <span className="text-[10px] text-zinc-500">{g.people.length}</span>
              </button>
            ))}

            {directReports.length > 0 && (
              <div className="pt-3 mt-3 border-t border-border/60">
                <button
                  onClick={() => navigate('/team')}
                  className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-surface-raised hover:text-zinc-200 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-3 h-3" aria-hidden="true" />
                    Direct Reports
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    {directReports.length}
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </span>
                </button>
              </div>
            )}
          </nav>

          <div className="min-w-0">
            {selectedGroup ? (
              <section aria-labelledby="network-section-heading">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 id="network-section-heading" className="text-sm font-medium text-zinc-200">{pluralize(selectedGroup.label)}</h2>
                  <span className="text-[10px] text-zinc-500">{selectedGroup.people.length} {selectedGroup.people.length === 1 ? 'person' : 'people'}</span>
                </div>
                {selectedGroup.people.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-border rounded-xl">
                    <p className="text-xs text-zinc-500 mb-3">No {pluralize(selectedGroup.label).toLowerCase()} yet.</p>
                    <button
                      onClick={() => setModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-300 border border-border rounded-md hover:bg-surface-raised transition-colors"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      Add person
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedGroup.people.map(p => (
                      <PersonRow
                        key={p.slug}
                        person={p}
                        isSelected={false}
                        onClick={() => navigate(`/people/${p.slug}`)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <p className="text-xs text-zinc-500">Pick a category to view its people.</p>
            )}
          </div>
        </div>
      )}

      <AddPersonModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}
