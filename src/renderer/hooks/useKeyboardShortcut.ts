import { useEffect } from 'react'

type Modifier = 'meta' | 'ctrl' | 'shift' | 'alt'

interface ShortcutOptions {
  key: string
  modifiers?: Modifier[]
  handler: (e: KeyboardEvent) => void
  enabled?: boolean
}

export function useKeyboardShortcut({ key, modifiers = ['meta'], handler, enabled = true }: ShortcutOptions) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      const matchesMeta = !modifiers.includes('meta') || e.metaKey
      const matchesCtrl = !modifiers.includes('ctrl') || e.ctrlKey
      const matchesShift = !modifiers.includes('shift') || e.shiftKey
      const matchesAlt = !modifiers.includes('alt') || e.altKey

      if (e.key.toLowerCase() === key.toLowerCase() && matchesMeta && matchesCtrl && matchesShift && matchesAlt) {
        e.preventDefault()
        handler(e)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, modifiers, handler, enabled])
}
