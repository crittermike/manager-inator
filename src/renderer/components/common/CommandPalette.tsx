import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeamOverview } from '../../hooks/useData'
import type { PersonEntry } from '../../../shared/types'
import {
  LayoutDashboard,
  BookOpen,
  Settings,
  Search,
  User,
  ClipboardPaste,
  Sparkles,
  MessageSquare
} from 'lucide-react'

interface PaletteItem {
  id: string
  label: string
  path?: string
  icon: React.ReactNode
  section: string
  action?: () => void
  subtitle?: string
}

interface CommandPaletteProps {
  onOpenCapture?: () => void
  onOpenAI?: () => void
}

export function CommandPalette({ onOpenCapture, onOpenAI }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []
  const [people, setPeople] = useState<PersonEntry[]>([])

  useEffect(() => {
    if (open && people.length === 0) {
      window.api.listPeople().then(setPeople).catch(err => console.error('Failed to load people for command palette', err))
    }
  }, [open, people.length])

  const pages: PaletteItem[] = useMemo(() => [
    { id: 'today', label: 'Today', path: '/', icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" />, section: 'Pages' },
    { id: 'playbook', label: 'Playbook', path: '/playbook', icon: <BookOpen className="w-4 h-4" aria-hidden="true" />, section: 'Pages' },
    { id: 'search', label: 'Search', path: '/search', icon: <Search className="w-4 h-4" aria-hidden="true" />, section: 'Pages' },
    { id: 'settings', label: 'Settings', path: '/settings', icon: <Settings className="w-4 h-4" aria-hidden="true" />, section: 'Pages' },
  ], [])

  const reportItems: PaletteItem[] = useMemo(() => reports.map(r => ({
    id: `report-${r.name}`,
    label: r.displayName,
    path: `/report/${r.name}`,
    icon: <User className="w-4 h-4" aria-hidden="true" />,
    section: 'Direct reports',
  })), [reports])

  const peopleItems: PaletteItem[] = useMemo(() => {
    const reportNames = new Set(reports.map(r => r.displayName.toLowerCase()))
    return people
      .filter(p => !reportNames.has(p.name.toLowerCase()))
      .map(p => ({
        id: `person-${p.slug}`,
        label: p.name,
        path: `/search?q=${encodeURIComponent(p.name)}`,
        icon: <User className="w-4 h-4" aria-hidden="true" />,
        section: 'People',
      }))
  }, [reports, people])

  const actionItems: PaletteItem[] = useMemo(() => [
    {
      id: 'action-capture',
      label: 'Capture context',
      icon: <ClipboardPaste className="w-4 h-4" aria-hidden="true" />,
      section: 'Actions',
      action: onOpenCapture,
      subtitle: 'Paste a meeting or document'
    },
    {
      id: 'action-ai',
      label: 'Ask AI assistant',
      icon: <Sparkles className="w-4 h-4" aria-hidden="true" />,
      section: 'Actions',
      action: onOpenAI,
      subtitle: 'Chat with your AI assistant'
    }
  ], [onOpenCapture, onOpenAI])

  const quickActionItems: PaletteItem[] = useMemo(() => reports.flatMap(r => [
    {
      id: `action-prep-${r.name}`,
      label: `Prep 1:1 with ${r.displayName}`,
      path: `/report/${r.name}?action=prep`,
      icon: <Sparkles className="w-4 h-4" aria-hidden="true" />,
      section: 'Quick actions'
    },
    {
      id: `action-feedback-${r.name}`,
      label: `Add feedback for ${r.displayName}`,
      path: `/report/${r.name}?action=feedback`,
      icon: <MessageSquare className="w-4 h-4" aria-hidden="true" />,
      section: 'Quick actions'
    }
  ]), [reports])

  const allItems = useMemo(
    () => [...pages, ...reportItems, ...peopleItems, ...actionItems, ...quickActionItems],
    [pages, reportItems, peopleItems, actionItems, quickActionItems]
  )

  const filtered = useMemo(
    () => query.trim()
      ? allItems.filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
      : allItems,
    [query, allItems]
  )

  const handleSelect = useCallback((item: PaletteItem) => {
    if (item.action) {
      item.action()
    } else if (item.path) {
      navigate(item.path)
    }
    setOpen(false)
    setQuery('')
  }, [navigate])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlightIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-palette-item]')
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[highlightIndex]) handleSelect(filtered[highlightIndex])
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  const sections = useMemo(
    () => [...new Set(filtered.map(item => item.section))],
    [filtered]
  )

  const flatItems = useMemo(() => {
    const result: PaletteItem[] = []
    for (const section of sections) {
      for (const item of filtered) {
        if (item.section === section) result.push(item)
      }
    }
    return result
  }, [filtered, sections])

  const activeDescendantId = highlightIndex >= 0 && highlightIndex < flatItems.length
    ? `palette-option-${flatItems[highlightIndex].id}`
    : undefined

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages and people..."
            aria-label="Search pages and people"
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-controls="palette-listbox"
            aria-activedescendant={activeDescendantId}
            aria-autocomplete="list"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 bg-surface-raised border border-border rounded">
            esc
          </kbd>
        </div>

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {filtered.length === 0 && query.trim()
            ? `No results for ${query}`
            : `${filtered.length} result${filtered.length === 1 ? '' : 's'} available`
          }
        </div>

        <div ref={listRef} id="palette-listbox" role="listbox" aria-label="Command palette results" className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            sections.map(section => {
              const sectionItems = filtered.filter(item => item.section === section)
              let globalOffset = 0
              for (const s of sections) {
                if (s === section) break
                globalOffset += filtered.filter(item => item.section === s).length
              }
              return (
                <div key={section} role="group" aria-label={section}>
                  <div className="px-4 py-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider" aria-hidden="true">
                    {section}
                  </div>
                  {sectionItems.map((item, localIdx) => {
                    const globalIdx = globalOffset + localIdx
                    return (
                      <div
                        key={item.id}
                        id={`palette-option-${item.id}`}
                        role="option"
                        aria-selected={globalIdx === highlightIndex}
                        data-palette-item
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setHighlightIndex(globalIdx)}
                        className={`w-full flex ${item.subtitle ? 'items-start' : 'items-center'} gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                          globalIdx === highlightIndex
                            ? 'bg-brand/15 text-brand-light'
                            : 'text-zinc-300 hover:bg-surface-raised'
                        }`}
                      >
                        <span className={`text-zinc-500 shrink-0 ${item.subtitle ? 'mt-0.5' : ''}`}>{item.icon}</span>
                        <div className="flex flex-col text-left">
                          <span>{item.label}</span>
                          {item.subtitle && (
                            <span className="text-[11px] text-zinc-500 leading-tight mt-0.5">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
