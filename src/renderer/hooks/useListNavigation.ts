import { useEffect, useCallback, useRef } from 'react'

interface UseListNavigationOptions {
  /** Total number of items in the list */
  itemCount: number
  /** Called when Enter is pressed on focused item */
  onSelect: (index: number) => void
  /** Whether navigation is active (disable when editing, etc.) */
  enabled?: boolean
  /** Ref to the scrollable container */
  containerRef?: React.RefObject<HTMLElement | null>
}

const FOCUS_CLASS = 'nav-focused'

/**
 * Adds vim-style j/k/Enter keyboard navigation to a list.
 * Uses direct DOM manipulation for focus ring to avoid re-rendering
 * the entire list on each keystroke. Items need `data-nav-index={index}`.
 */
export function useListNavigation({
  itemCount,
  onSelect,
  enabled = true,
  containerRef,
}: UseListNavigationOptions) {
  const indexRef = useRef(-1)
  const countRef = useRef(itemCount)
  countRef.current = itemCount
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Reset when item count changes
  useEffect(() => {
    indexRef.current = -1
    document.querySelectorAll(`.${FOCUS_CLASS}`).forEach(el => el.classList.remove(FOCUS_CLASS))
  }, [itemCount])

  const moveFocus = useCallback((newIndex: number) => {
    const container = containerRef?.current ?? document
    // Remove old ring
    const prev = container.querySelector?.(`.${FOCUS_CLASS}`)
    if (prev) prev.classList.remove(FOCUS_CLASS)
    // Apply new ring
    indexRef.current = newIndex
    if (newIndex >= 0) {
      const el = container.querySelector?.(`[data-nav-index="${newIndex}"]`)
      if (el) {
        el.classList.add(FOCUS_CLASS)
        el.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [containerRef])

  useEffect(() => {
    if (!enabled || itemCount === 0) return

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      const count = countRef.current

      if (e.key === 'j') {
        e.preventDefault()
        const next = indexRef.current < count - 1 ? indexRef.current + 1 : 0
        moveFocus(next)
      } else if (e.key === 'k') {
        e.preventDefault()
        const next = indexRef.current > 0 ? indexRef.current - 1 : count - 1
        moveFocus(next)
      } else if (e.key === 'Enter' && indexRef.current >= 0) {
        e.preventDefault()
        onSelectRef.current(indexRef.current)
      } else if (e.key === 'Escape') {
        moveFocus(-1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, itemCount, moveFocus])

  const getItemProps = useCallback((index: number) => ({
    'data-nav-index': index,
  }), [])

  return { getItemProps }
}
