import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTeamOverview } from '../../hooks/useData'
import { ClipboardPaste, X, ChevronDown, ChevronUp, Plus, Loader2, Check, AlertCircle, Pencil } from 'lucide-react'
import { CaptureSession } from './CaptureSession'

type SourceHint = 'slack' | 'github' | 'email' | 'meeting' | 'other' | ''
type SessionState = 'processing' | 'saved' | 'editing' | 'error'

const SOURCE_OPTIONS: { value: SourceHint; label: string }[] = [
  { value: '', label: 'Auto-detect' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'slack', label: 'Slack' },
  { value: 'github', label: 'GitHub' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
]

interface SessionItem {
  id: string
  content: string
  sourceHint: SourceHint
  status: SessionState
}

export function CapturePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []

  const [content, setContent] = useState('')
  const [sourceHint, setSourceHint] = useState<SourceHint>('')
  const [minimized, setMinimized] = useState(false)
  const [sessions, setSessions] = useState<SessionItem[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const processingCount = useMemo(
    () => sessions.filter(s => s.status === 'processing').length,
    [sessions]
  )
  const savedCount = useMemo(
    () => sessions.filter(s => s.status === 'saved').length,
    [sessions]
  )
  const errorCount = useMemo(
    () => sessions.filter(s => s.status === 'error').length,
    [sessions]
  )
  const editingCount = useMemo(
    () => sessions.filter(s => s.status === 'editing').length,
    [sessions]
  )

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open, minimized])

  useEffect(() => {
    if (open) return
    setContent('')
    setSourceHint('')
    setMinimized(false)
    setSessions(prev => prev.filter(s => s.status === 'processing'))
  }, [open])

  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent<string>).detail
      if (content) {
        const id = crypto.randomUUID()
        setSessions(prev => [
          { id, content, sourceHint: '' as SourceHint, status: 'processing' },
          ...prev,
        ])
      }
    }
    window.addEventListener('tray-capture-content', handler)
    return () => window.removeEventListener('tray-capture-content', handler)
  }, [])

  const handleClose = useCallback(() => {
    if (processingCount > 0) {
      setMinimized(true)
      return
    }
    onClose()
  }, [onClose, processingCount])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (processingCount > 0) {
        setMinimized(true)
      } else {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose, processingCount])

  const handleCreateSession = useCallback(() => {
    if (!content.trim()) return
    const id = crypto.randomUUID()
    setSessions(prev => [
      {
        id,
        content: content.trim(),
        sourceHint,
        status: 'processing',
      },
      ...prev,
    ])
    setContent('')
    setSourceHint('')
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [content, sourceHint])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleCreateSession()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleCreateSession])

  const handleStatusChange = useCallback((id: string, status: SessionState) => {
    setSessions(prev => prev.map(session => (
      session.id === id
        ? { ...session, status }
        : session
    )))
  }, [])

  const handleRemoveSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id))
  }, [])

  if (!open) {
    return null
  }

  if (minimized && processingCount > 0) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="absolute bottom-20 right-6 flex items-center gap-2 px-3 py-2 bg-brand/20 border border-brand/30 rounded-full text-xs text-brand-light hover:bg-brand/30 transition-colors z-20 animate-scale-in"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        {processingCount} {processingCount === 1 ? 'capture processing…' : 'captures processing…'}
        <ChevronUp className="w-3 h-3" />
      </button>
    )
  }

  if (minimized && processingCount === 0) {
    setMinimized(false)
  }

  const headerStatus = processingCount > 0
    ? <span className="text-[10px] text-brand-light">{processingCount} processing</span>
    : editingCount > 0
      ? <span className="text-[10px] text-amber-400 flex items-center gap-1"><Pencil className="w-2.5 h-2.5" />{editingCount} editing</span>
      : errorCount > 0
        ? <span className="text-[10px] text-danger flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" />{errorCount} error{errorCount > 1 ? 's' : ''}</span>
        : savedCount > 0
          ? <span className="text-[10px] text-success flex items-center gap-1"><Check className="w-2.5 h-2.5" />{savedCount} saved</span>
          : null

  return (
    <div className="absolute bottom-20 right-6 w-[560px] max-w-[calc(100vw-18rem-3rem)] max-h-[calc(100vh-8rem)] bg-zinc-950 border border-border rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden z-20 animate-scale-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-brand" />
          <span className="text-sm font-medium text-zinc-200">Capture</span>
          {headerStatus}
        </div>
        <div className="flex items-center gap-1">
          {processingCount > 0 && (
            <button
              onClick={() => setMinimized(true)}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
              title="Minimize"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div className="bg-surface border border-border rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">New capture</div>
            <button
              onClick={() => textareaRef.current?.focus()}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-surface-raised transition-colors"
            >
              <Plus className="w-3 h-3" />
              New Capture
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {SOURCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSourceHint(opt.value)}
                className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                  sourceHint === opt.value
                    ? 'bg-brand/15 text-brand-light border-brand/30'
                    : 'bg-surface text-zinc-500 border-border hover:text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Paste a meeting transcript, Slack thread, GitHub discussion, email, or any content…"
            className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand/50 focus:ring-1 focus:ring-brand/20 outline-none transition-colors resize-none min-h-[220px] max-h-[420px]"
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-zinc-600">
              AI will classify, extract feedback, and auto-save.
            </p>
            <button
              onClick={handleCreateSession}
              disabled={!content.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="w-3 h-3" />
              Capture
              <kbd className="ml-1 text-[9px] opacity-50 font-sans">Cmd+Enter</kbd>
            </button>
          </div>
        </div>

        {sessions.map(session => (
          <CaptureSession
            key={session.id}
            id={session.id}
            initialContent={session.content}
            sourceHint={session.sourceHint}
            reports={reports}
            onStatusChange={handleStatusChange}
            onRemove={handleRemoveSession}
          />
        ))}
      </div>
    </div>
  )
}
