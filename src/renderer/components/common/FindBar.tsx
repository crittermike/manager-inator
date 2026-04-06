import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'

export function FindBar() {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState(0)
  const [activeMatch, setActiveMatch] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const findNextRef = useRef<() => void>(() => {})
  const findPrevRef = useRef<() => void>(() => {})

  const close = useCallback(() => {
    setVisible(false)
    setQuery('')
    setMatches(0)
    setActiveMatch(0)
    window.api.stopFindInPage()
  }, [])

  const doFind = useCallback((text: string, options?: { forward?: boolean; findNext?: boolean }) => {
    if (!text.trim()) return
    const input = inputRef.current
    const saved = input?.value ?? ''
    if (input) input.value = ''
    window.api.findInPage(text, options).then(result => {
      if (input) input.value = saved
      if (result) {
        setMatches(result.matches)
        setActiveMatch(result.activeMatchOrdinal)
      }
      setTimeout(() => inputRef.current?.focus(), 50)
    })
  }, [])

  // ⌘F = always show + select all text
  useEffect(() => {
    if (!window.api.onFindToggle) return
    const unsub = window.api.onFindToggle(() => {
      setVisible(true)
      requestAnimationFrame(() => inputRef.current?.select())
    })
    return unsub
  }, [])

  // ⌘G / ⌘Shift+G from menu
  useEffect(() => {
    const unsubNext = window.api.onFindNext?.(() => findNextRef.current())
    const unsubPrev = window.api.onFindPrev?.(() => findPrevRef.current())
    return () => { unsubNext?.(); unsubPrev?.() }
  }, [])

  // Focus input when bar becomes visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [visible])

  // Search as user types (debounced)
  useEffect(() => {
    if (!visible || !query.trim()) {
      if (!query.trim() && visible) {
        window.api.stopFindInPage()
        setMatches(0)
        setActiveMatch(0)
      }
      return
    }
    const timer = setTimeout(() => doFind(query), 200)
    return () => clearTimeout(timer)
  }, [query, visible, doFind])

  const findNext = useCallback(() => {
    if (query.trim()) doFind(query, { forward: true, findNext: true })
  }, [query, doFind])

  const findPrev = useCallback(() => {
    if (query.trim()) doFind(query, { forward: false, findNext: true })
  }, [query, doFind])

  // Keep refs current for IPC callbacks
  findNextRef.current = findNext
  findPrevRef.current = findPrev

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) findPrev()
      else findNext()
    }
  }, [close, findNext, findPrev])

  if (!visible) return null

  return (
    <div className="absolute top-0 right-4 lg:right-8 z-50 flex items-center gap-1.5 bg-surface-raised border border-border border-t-0 rounded-b-lg shadow-lg px-3 py-1.5 w-[320px]">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find on page…"
        className="flex-1 min-w-0 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
      />
      <span className="text-[11px] text-zinc-500 tabular-nums shrink-0 w-16 text-right">
        {query ? (matches > 0 ? `${activeMatch}/${matches}` : 'No results') : ''}
      </span>
      <button onClick={findPrev} className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors" aria-label="Previous match" title="Previous (shift+enter)">
        <ChevronUp className="w-4 h-4" aria-hidden="true" />
      </button>
      <button onClick={findNext} className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors" aria-label="Next match" title="Next (enter)">
        <ChevronDown className="w-4 h-4" aria-hidden="true" />
      </button>
      <button onClick={close} className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors" aria-label="Close find bar" title="Close (esc)">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  )
}
