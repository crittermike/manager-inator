import { useState, useCallback, useRef } from 'react'

export function useAI() {
  const [streaming, setStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fullTextRef = useRef('')
  const requestIdRef = useRef<string | null>(null)

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
          setStreamedText(fullTextRef.current)
        }, rid)
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
    []
  )

  const cancel = useCallback(async () => {
    await window.api.aiCancel(requestIdRef.current ?? undefined)
    setStreaming(false)
    setStreamedText('')
    fullTextRef.current = ''
  }, [])

  const reset = useCallback(() => {
    setStreamedText('')
    setError(null)
    fullTextRef.current = ''
    requestIdRef.current = null
  }, [])

  return { streaming, streamedText, error, generate, cancel, reset, fullTextRef, requestIdRef }
}
