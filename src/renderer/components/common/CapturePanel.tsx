import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTeamOverview } from '../../hooks/useData'
import { ClipboardPaste, X, ChevronDown, ChevronUp, Plus, Loader2, Check, AlertCircle, Pencil, FileUp } from 'lucide-react'
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
  fileName?: string
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
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const createSessionsFromFiles = useCallback((files: File[]) => {
    const textFiles = Array.from(files).filter(f =>
      f.name.endsWith('.txt') || f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.type === 'text/plain'
    )
    if (textFiles.length === 0) return

    const readers = textFiles.map(file => {
      return new Promise<{ name: string; content: string }>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve({ name: file.name, content: reader.result as string })
        reader.onerror = () => resolve({ name: file.name, content: '' })
        reader.readAsText(file)
      })
    })

    Promise.all(readers).then(results => {
      const newSessions = results
        .filter(r => r.content.trim().length > 0)
        .map(r => ({
          id: crypto.randomUUID(),
          content: r.content.trim(),
          sourceHint: sourceHint as SourceHint,
          status: 'processing' as SessionState,
          fileName: r.name,
        }))
      if (newSessions.length > 0) {
        setSessions(prev => [...newSessions, ...prev])
      }
    })
  }, [sourceHint])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFiles(false)

    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    const textFiles = files.filter(f =>
      f.name.endsWith('.txt') || f.name.endsWith('.md') || f.name.endsWith('.markdown') || f.type === 'text/plain'
    )

    // Handle text files as bulk captures
    if (textFiles.length > 0) {
      createSessionsFromFiles(textFiles)
    }

    // Handle image files as attachments (existing behavior)
    for (const file of imageFiles) {
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
  }, [createSessionsFromFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFiles(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFiles(false)
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      createSessionsFromFiles(Array.from(files))
    }
    // Reset input so the same files can be selected again
    e.target.value = ''
  }, [createSessionsFromFiles])

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
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        {processingCount} {processingCount === 1 ? 'capture processing…' : 'captures processing…'}
        <ChevronUp className="w-3 h-3" aria-hidden="true" />
      </button>
    )
  }

  const totalSessions = sessions.length
  const headerStatus = processingCount > 0
    ? <span className="text-[10px] text-brand-light flex items-center gap-1">
        <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
        {totalSessions > 1 ? `${savedCount + errorCount}/${totalSessions} done` : 'Processing'}
      </span>
    : editingCount > 0
      ? <span className="text-[10px] text-amber-400 flex items-center gap-1"><Pencil className="w-2.5 h-2.5" aria-hidden="true" />{editingCount} editing</span>
      : errorCount > 0 && savedCount > 0
        ? <span className="text-[10px] text-zinc-400 flex items-center gap-1"><Check className="w-2.5 h-2.5 text-success" aria-hidden="true" />{savedCount} saved<span className="text-danger ml-1">{errorCount} failed</span></span>
        : errorCount > 0
          ? <span className="text-[10px] text-danger flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" aria-hidden="true" />{errorCount} error{errorCount > 1 ? 's' : ''}</span>
          : savedCount > 0
            ? <span className="text-[10px] text-success flex items-center gap-1"><Check className="w-2.5 h-2.5" aria-hidden="true" />{savedCount} saved</span>
            : null

  return (
    <div className="absolute bottom-20 right-6 w-[560px] max-w-[calc(100vw-18rem-3rem)] max-h-[calc(100vh-8rem)] bg-zinc-950 border border-border rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden z-20 animate-scale-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-brand" aria-hidden="true" />
          <span className="text-sm font-medium text-zinc-200">Capture</span>
          {headerStatus}
        </div>
        <div className="flex items-center gap-1">
          {processingCount > 0 && (
            <button
              onClick={() => setMinimized(true)}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
              title="Minimize"
              aria-label="Minimize"
            >
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
            aria-label="Close capture panel"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div className="bg-surface border border-border rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider">New capture</div>
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
          <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} className="relative">
            {isDraggingFiles && (
              <div className="absolute inset-0 z-10 bg-brand/10 border-2 border-dashed border-brand/50 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <FileUp className="w-8 h-8 text-brand-light mx-auto mb-2" aria-hidden="true" />
                  <p className="text-sm font-medium text-brand-light">Drop files to process</p>
                  <p className="text-xs text-zinc-500 mt-1">.txt and .md files</p>
                </div>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              onPaste={handlePaste}
              placeholder={sourceHint === 'feedback' ? `e.g. "${reports[0]?.displayName || 'Alex'} did great presenting the architecture proposal — clear, concise, anticipated questions well"` : 'Paste a meeting transcript, Slack thread, GitHub discussion, email, or any content…'}
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
                      aria-label={`Remove image ${img.filename}`}
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
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
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-zinc-600">
                AI will classify, extract feedback, and auto-save.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-border hover:border-zinc-600 rounded-lg transition-colors"
                title="Import transcript files"
              >
                <FileUp className="w-3 h-3" aria-hidden="true" />
                Import files
              </button>
              <button
                onClick={handleCreateSession}
                disabled={!content.trim() && images.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" aria-hidden="true" />
                Capture
                <kbd className="ml-1 text-[9px] opacity-50 font-sans">Cmd+Enter</kbd>
              </button>
            </div>
          </div>
        </div>

        {sessions.map(session => (
          <CaptureSession
            key={session.id}
            id={session.id}
            initialContent={session.content}
            sourceHint={session.sourceHint}
            imagePaths={session.imagePaths}
            fileName={session.fileName}
            reports={reports}
            onStatusChange={handleStatusChange}
            onRemove={handleRemoveSession}
          />
        ))}
      </div>
    </div>
  )
}
