import { useState, useRef, useEffect, useId, useCallback } from 'react'

interface ComboInputProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  label?: string
}

export function ComboInput({ value, onChange, options, placeholder, label }: ComboInputProps) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const inputId = `combo-input-${id}`
  const listId = `combo-list-${id}`

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o =>
    o.toLowerCase().includes((filter || value).toLowerCase())
  )

  useEffect(() => {
    setHighlightIndex(-1)
  }, [filter, open])

  const selectOption = useCallback((opt: string) => {
    onChange(opt)
    setOpen(false)
    setFilter('')
    setHighlightIndex(-1)
    inputRef.current?.focus()
  }, [onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      e.preventDefault()
      return
    }

    if (!open) return

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
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          selectOption(filtered[highlightIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setHighlightIndex(-1)
        break
    }
  }

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]')
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIndex])

  return (
    <div ref={ref} className="relative">
      {label && <label htmlFor={inputId} className="block text-xs text-zinc-500 mb-1">{label}</label>}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlightIndex >= 0 ? `${listId}-opt-${highlightIndex}` : undefined}
        value={value}
        onChange={(e) => { onChange(e.target.value); setFilter(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface-raised border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto animate-slide-down"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={opt === value}
              onClick={() => selectOption(opt)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === highlightIndex
                  ? 'bg-brand/20 text-brand-light'
                  : opt === value
                  ? 'text-brand-light'
                  : 'text-zinc-300'
              } hover:bg-brand/10`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
