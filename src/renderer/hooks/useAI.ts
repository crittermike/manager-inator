import { useState, useCallback, useRef } from 'react'

export function useAI() {
  const [streaming, setStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fullTextRef = useRef('')

  const generate = useCallback(
    async (action: string, context: Record<string, unknown>): Promise<string> => {
      setStreaming(true)
      setStreamedText('')
      setError(null)
      fullTextRef.current = ''

      try {
        const result = await window.api.aiGenerate(action, context, (chunk) => {
          fullTextRef.current += chunk
          setStreamedText(fullTextRef.current)
        })
        setStreamedText(result)
        return result
      } catch (e) {
        const msg = (e as Error).message
        setError(msg)
        throw e
      } finally {
        setStreaming(false)
      }
    },
    []
  )

  const cancel = useCallback(async () => {
    await window.api.aiCancel()
    setStreaming(false)
  }, [])

  const reset = useCallback(() => {
    setStreamedText('')
    setError(null)
    fullTextRef.current = ''
  }, [])

  return { streaming, streamedText, error, generate, cancel, reset }
}
