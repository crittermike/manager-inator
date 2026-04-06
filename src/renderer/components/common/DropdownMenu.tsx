import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface DropdownMenuProps {
  trigger: React.ReactNode
  items: { label: string; onClick: () => void }[]
  className?: string
}

/**
 * Portal-based dropdown menu that escapes overflow-hidden containers.
 * Positions itself below the trigger button using getBoundingClientRect.
 */
export function DropdownMenu({ trigger, items, className = '' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.right })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()

    const handleClose = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const handleScroll = () => updatePosition()

    document.addEventListener('mousedown', handleClose)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClose)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, updatePosition])

  return (
    <div ref={triggerRef} className={className} onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev) }}>
      {trigger}
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-surface-raised border border-border rounded-lg shadow-xl shadow-black/40 py-1 min-w-[140px]"
          style={{ top: pos.top, left: pos.left, transform: 'translateX(-100%)', zIndex: 9999 }}
        >
          {items.map(item => (
            <button
              key={item.label}
              onClick={(e) => { e.stopPropagation(); item.onClick(); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-surface-overlay transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
