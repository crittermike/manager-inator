import { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

interface UseUnsavedChangesReturn {
  blockerState: 'unblocked' | 'blocked' | 'proceeding'
  proceed: () => void
  reset: () => void
}

export function useUnsavedChanges(dirty: boolean): UseUnsavedChangesReturn {
  const blocker = useBlocker(
    useCallback(() => dirty, [dirty])
  )

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Keep the legacy assignment for browser confirmation dialogs without surfacing the TS deprecation hint.
      ;(e as BeforeUnloadEvent & { returnValue: string }).returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  return {
    blockerState: blocker.state,
    proceed: blocker.state === 'blocked' ? () => blocker.proceed() : () => {},
    reset: blocker.state === 'blocked' ? () => blocker.reset() : () => {}
  }
}
