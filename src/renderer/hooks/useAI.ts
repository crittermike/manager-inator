import { useState, useCallback, useRef, useEffect, useMemo } from 'react'

const STREAM_THROTTLE_MS = 150

export function useAI() {
  const [streaming, setStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fullTextRef = useRef('')
  const requestIdRef = useRef<string | null>(null)
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFlush = useRef(false)

  useEffect(() => {
    const unsub = window.api.onAiStreamReset((data) => {
      if (requestIdRef.current && data.requestId === requestIdRef.current) {
        fullTextRef.current = ''
        setStreamedText('')
      }
    })
    return () => {
      unsub()
      if (throttleTimer.current) {
        clearTimeout(throttleTimer.current)
        throttleTimer.current = null
      }
      pendingFlush.current = false
    }
  }, [])

  const flushStreamedText = useCallback(() => {
    setStreamedText(fullTextRef.current)
    pendingFlush.current = false
  }, [])

  const generate = useCallback(
    async (action: string, context: Record<string, unknown>): Promise<string> => {
      setStreaming(true)
      setStreamedText('')
      setError(null)
      fullTextRef.current = ''

      const rid = crypto.randomUUID()
      requestIdRef.current = rid

      try {
        const result = await window.api.aiGenerate(action, context, (chunk: string) => {
          fullTextRef.current += chunk
          if (!pendingFlush.current) {
            pendingFlush.current = true
            throttleTimer.current = setTimeout(flushStreamedText, STREAM_THROTTLE_MS)
          }
        }, rid)
        if (throttleTimer.current) {
          clearTimeout(throttleTimer.current)
          throttleTimer.current = null
        }
        pendingFlush.current = false
        setStreamedText(result)
        return result
      } catch (e) {
        const msg = (e as Error).message
        setError(msg)
        throw e
      } finally {
        setStreaming(false)
        requestIdRef.current = null
      }
    },
    [flushStreamedText]
  )

  const cancel = useCallback(async () => {
    if (throttleTimer.current) {
      clearTimeout(throttleTimer.current)
      throttleTimer.current = null
    }
    pendingFlush.current = false
    await window.api.aiCancel(requestIdRef.current ?? undefined)
    setStreaming(false)
    setStreamedText('')
    fullTextRef.current = ''
  }, [])

  const reset = useCallback(() => {
    if (throttleTimer.current) {
      clearTimeout(throttleTimer.current)
      throttleTimer.current = null
    }
    pendingFlush.current = false
    setStreamedText('')
    setError(null)
    fullTextRef.current = ''
    requestIdRef.current = null
  }, [])

  return useMemo(() => ({ streaming, streamedText, error, generate, cancel, reset, fullTextRef, requestIdRef }), [streaming, streamedText, error, generate, cancel, reset])
}
