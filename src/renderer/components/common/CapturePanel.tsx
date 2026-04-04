import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTeamOverview } from '../../hooks/useData'
import { ClipboardPaste, X, ChevronDown, ChevronUp, Plus, Loader2, Check, AlertCircle, Pencil } from 'lucide-react'
import { CaptureSession } from './CaptureSession'

type SourceHint = 'slack' | 'github' | 'email' | 'meeting' | 'feedback' | 'other' | ''
type SessionState = 'processing' | 'saved' | 'editing' | 'error'

const SOURCE_OPTIONS: { value: SourceHint; label: string }[] = [
  { value: '', label: 'Auto-detect' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'slack', label: 'Slack' },
  { value: 'github', label: 'GitHub' },
  { value: 'email', label: 'Email' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'other', label: 'Other' },
]

interface SessionItem {
  id: string
  content: string
  sourceHint: SourceHint
  status: SessionState
  imagePaths?: string[]
}

interface AttachedImage {
  id: string
  filename: string
  dataUrl: string
  saved: boolean
}

export function CapturePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []

  const [content, setContent] = useState('')
  const [sourceHint, setSourceHint] = useState<SourceHint>('')
  const [minimized, setMinimized] = useState(false)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [images, setImages] = useState<AttachedImage[]>([])

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
    setImages([])
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

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = reader.result as string
          const ext = item.type.split('/')[1] === 'jpeg' ? 'jpg' : item.type.split('/')[1] || 'png'
          const id = crypto.randomUUID().slice(0, 8)
          const filename = `${new Date().toISOString().split('T')[0]}-${id}.${ext}`
          const base64 = dataUrl.split(',')[1]
          await window.api.commitBinaryFile(
            `attachments/${filename}`,
            base64,
            `Attach image: ${filename}`
          )
          setImages(prev => [...prev, { id, filename, dataUrl, saved: true }])
        }
        reader.readAsDataURL(blob)
      }
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        const ext = file.name.split('.').pop() || 'png'
        const id = crypto.randomUUID().slice(0, 8)
        const filename = `${new Date().toISOString().split('T')[0]}-${id}.${ext}`
        const base64 = dataUrl.split(',')[1]
        await window.api.commitBinaryFile(`attachments/${filename}`, base64, `Attach image: ${filename}`)
        setImages(prev => [...prev, { id, filename, dataUrl, saved: true }])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleCreateSession = useCallback(() => {
    if (!content.trim() && images.length === 0) return
    const id = crypto.randomUUID()
    const imageRefs = images.map(img => `\n[Attached image: attachments/${img.filename}]`).join('')
    const imagePaths = images.map(img => `attachments/${img.filename}`)
    setSessions(prev => [
      {
        id,
        content: (content.trim() + imageRefs).trim(),
        sourceHint,
        status: 'processing',
        imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
      },
      ...prev,
    ])
    setContent('')
    setImages([])
    setSourceHint('')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [content, sourceHint, images])

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

  // Auto-expand when all processing finishes
  useEffect(() => {
    if (minimized && processingCount === 0) {
      setMinimized(false)
    }
  }, [minimized, processingCount])

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
          <div onDrop={handleDrop} onDragOver={handleDragOver}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              onPaste={handlePaste}
              placeholder={sourceHint === 'feedback' ? 'e.g. "Chanakya did great presenting the architecture proposal — clear, concise, anticipated questions well"' : 'Paste a meeting transcript, Slack thread, GitHub discussion, email, or any content…'}
              className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand/50 focus:ring-1 focus:ring-brand/20 outline-none transition-colors resize-none min-h-[220px] max-h-[420px]"
            />
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {images.map(img => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.dataUrl}
                      alt={img.filename}
                      className="w-16 h-16 object-cover rounded-lg border border-border"
                    />
                    <button
                      onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-border rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-zinc-300 px-1 py-0.5 rounded-b-lg truncate">
                      {img.filename}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-zinc-600">
              AI will classify, extract feedback, and auto-save.
            </p>
            <button
              onClick={handleCreateSession}
              disabled={!content.trim() && images.length === 0}
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
            imagePaths={session.imagePaths}
            reports={reports}
            onStatusChange={handleStatusChange}
            onRemove={handleRemoveSession}
          />
        ))}
      </div>
    </div>
  )
}
