import { useState, useRef, useEffect } from 'react'

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
  const ref = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-xs text-zinc-500 mb-1">{label}</label>}
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setFilter(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface-raised border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); setFilter('') }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-brand/10 transition-colors ${
                opt === value ? 'text-brand-light' : 'text-zinc-300'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
