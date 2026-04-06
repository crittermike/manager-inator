import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'

export function FindBar() {
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState(0)
  const [activeMatch, setActiveMatch] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setVisible(false)
    setQuery('')
    setMatches(0)
    setActiveMatch(0)
    window.api.stopFindInPage()
  }, [])

  useEffect(() => {
    if (!window.api.onFindToggle) return
    const unsub = window.api.onFindToggle(() => {
      setVisible(prev => {
        if (prev) {
          window.api.stopFindInPage()
          setQuery('')
          setMatches(0)
          setActiveMatch(0)
          return false
        }
        return true
      })
    })
    return unsub
  }, [])

  // Focus input when bar becomes visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [visible])

  // Search as user types (debounced to avoid focus-stealing mid-keystroke)
  useEffect(() => {
    if (!visible || !query.trim()) {
      if (!query.trim() && visible) {
        window.api.stopFindInPage()
        setMatches(0)
        setActiveMatch(0)
      }
      return
    }
    const timer = setTimeout(() => {
      // Temporarily clear input to prevent findInPage from matching the search bar itself
      const input = inputRef.current
      const savedValue = input?.value ?? ''
      if (input) input.value = ''
      window.api.findInPage(query).then(result => {
        if (input) input.value = savedValue
        if (result) {
          setMatches(result.matches)
          setActiveMatch(result.activeMatchOrdinal)
        }
        setTimeout(() => inputRef.current?.focus(), 50)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [query, visible])

  const findNext = useCallback(() => {
    if (!query.trim()) return
    const input = inputRef.current
    const saved = input?.value ?? ''
    if (input) input.value = ''
    window.api.findInPage(query, { forward: true, findNext: true }).then(result => {
      if (input) input.value = saved
      if (result) {
        setMatches(result.matches)
        setActiveMatch(result.activeMatchOrdinal)
      }
      setTimeout(() => inputRef.current?.focus(), 50)
    })
  }, [query])

  const findPrev = useCallback(() => {
    if (!query.trim()) return
    const input = inputRef.current
    const saved = input?.value ?? ''
    if (input) input.value = ''
    window.api.findInPage(query, { forward: false, findNext: true }).then(result => {
      if (input) input.value = saved
      if (result) {
        setMatches(result.matches)
        setActiveMatch(result.activeMatchOrdinal)
      }
      setTimeout(() => inputRef.current?.focus(), 50)
    })
  }, [query])

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
    <div className="absolute top-0 right-16 z-50 flex items-center gap-1.5 bg-surface-raised border border-border rounded-b-lg shadow-lg px-3 py-1.5">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find on page…"
        className="w-48 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
      />
      {query && (
        <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">
          {matches > 0 ? `${activeMatch}/${matches}` : 'No results'}
        </span>
      )}
      <button onClick={findPrev} className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors" aria-label="Previous match" title="Previous (Shift+Enter)">
        <ChevronUp className="w-4 h-4" aria-hidden="true" />
      </button>
      <button onClick={findNext} className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors" aria-label="Next match" title="Next (Enter)">
        <ChevronDown className="w-4 h-4" aria-hidden="true" />
      </button>
      <button onClick={close} className="p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors" aria-label="Close find bar" title="Close (Esc)">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  )
}
