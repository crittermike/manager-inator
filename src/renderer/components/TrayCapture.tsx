import { useEffect, useRef, useState, useCallback } from 'react'

export function TrayCapture() {
  const [content, setContent] = useState('')
  const [sent, setSent] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const cleanupReset = window.api.onTrayCaptureReset(() => {
      setContent('')
      setSent(false)
      textareaRef.current?.focus()
    })
    return cleanupReset
  }, [])

  const close = useCallback(async () => {
    await window.api.trayCaptureClose()
  }, [])

  const submit = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || sent) return
    await window.api.trayCaptureSubmit(trimmed)
    setSent(true)
    setContent('')
    setTimeout(() => {
      void window.api.trayCaptureClose()
    }, 300)
  }, [content, sent])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void submit()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        void close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close, submit])

  return (
    <div className="h-screen w-screen p-2">
      <div className="relative bg-zinc-950/95 border border-zinc-700/50 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="absolute left-1/2 top-0 w-3 h-3 bg-zinc-950 border-l border-t border-zinc-700/50 rotate-45 -translate-x-1/2 -translate-y-1.5" />
        <div className="px-4 pt-4 pb-3 space-y-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste content for AI processing..."
            className="w-full min-h-[170px] max-h-[170px] resize-none rounded-xl bg-zinc-900 border border-zinc-700/60 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40"
          />
          <div className="flex items-center justify-between">
            <span className={`text-xs ${sent ? 'text-green-400' : 'text-zinc-500'}`}>
              {sent ? 'Sent!' : 'Press Cmd+Enter to capture'}
            </span>
            <button
              onClick={() => void submit()}
              disabled={!content.trim() || sent}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Capture
              <kbd className="text-[10px] text-white/70">Cmd+Enter</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
