import { useState, useRef, useEffect, useCallback } from 'react'
import { useAI } from '../../hooks/useAI'
import { useToast } from './Toast'
import { useTeamOverview } from '../../hooks/useData'
import { format } from 'date-fns'
import { IMPACT_LOG_PATH } from '../../../shared/constants'
import { ConfirmDialog } from './ConfirmDialog'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const REMARK_PLUGINS = [remarkGfm]
import {
  ClipboardPaste, X, ChevronDown, ChevronUp,
  Loader2, Check, AlertCircle, Sparkles,
  Pencil, Trash2
} from 'lucide-react'

type PanelState = 'idle' | 'processing' | 'saved' | 'editing' | 'error'
type SourceHint = 'slack' | 'github' | 'email' | 'meeting' | 'other' | ''

interface ClassifiedResult {
  source: 'slack' | 'github' | 'email' | 'meeting' | 'other'
  summary: string
  detailed_summary: string
  tags: string[]
  people_mentioned: string[]
  feedback: { person: string; type: 'positive' | 'constructive' | 'mixed'; content: string }[]
  action_items: { text: string; owner: string }[]
  impact: { text: string }[]
  key_context: string
}

const SOURCE_OPTIONS: { value: SourceHint; label: string }[] = [
  { value: '', label: 'Auto-detect' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'slack', label: 'Slack' },
  { value: 'github', label: 'GitHub' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function CapturePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []
  const { streaming, streamedText, generate, cancel, reset } = useAI()

  const [state, setState] = useState<PanelState>('idle')
  const [content, setContent] = useState('')
  const [sourceHint, setSourceHint] = useState<SourceHint>('')
  const [result, setResult] = useState<ClassifiedResult | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [savedFilepath, setSavedFilepath] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const mountedRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancel()
    }
  }, [cancel])

  useEffect(() => {
    if (open && !minimized && state === 'idle') {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open, minimized, state])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (streaming) {
          setMinimized(true)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose, streaming])

  const handleProcess = useCallback(async () => {
    if (!content.trim() || streaming) return

    setState('processing')
    setSaveError(null)
    setResult(null)
    reset()

    const reportNames = reports.map(r => r.displayName).join(', ')

    try {
      const response = await generate('classify-content', {
        content: content.trim(),
        reportNames,
        sourceHint: sourceHint || undefined,
      })

      if (!mountedRef.current) return

      let parsed: ClassifiedResult
      try {
        const jsonStr = response.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
        parsed = JSON.parse(jsonStr)
      } catch {
        setSaveError('AI returned invalid JSON. Try again.')
        setState('error')
        return
      }

      setResult(parsed)
      await autoSave(parsed)
    } catch (e) {
      if (!mountedRef.current) return
      setSaveError((e as Error).message || 'AI processing failed')
      setState('error')
    }
  }, [content, sourceHint, streaming, reports, generate, reset])

  useEffect(() => {
    if (!open || state !== 'idle') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleProcess()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, state, handleProcess])

  const autoSave = useCallback(async (classified: ClassifiedResult) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const sourceSlug = classified.source || 'capture'
    const summarySlug = slugify(classified.summary.split(' ').slice(0, 5).join(' ') || 'captured-content')
    const baseFilename = `${today}-${sourceSlug}-${summarySlug}.md`

    const peopleSlugs: string[] = []
    for (const personName of classified.people_mentioned) {
      const slug = await window.api.findPersonByName(personName)
      if (slug) peopleSlugs.push(slug)
    }

    const peopleYaml = peopleSlugs.length > 0
      ? `people:\n${peopleSlugs.map(s => `  - ${s}`).join('\n')}`
      : 'people: []'

    const frontmatter = [
      '---',
      `date: ${today}`,
      `source: ${classified.source}`,
      `summary: ${classified.summary.replace(/\n/g, ' ')}`,
      `tags: ${classified.tags.join(', ')}`,
      peopleYaml,
      '---',
      '',
    ].join('\n')

    const body = [
      classified.detailed_summary ? `## Summary\n\n${classified.detailed_summary}\n` : '',
      classified.key_context ? `## Context\n\n${classified.key_context}\n` : '',
      classified.feedback.length > 0
        ? `## Feedback\n\n${classified.feedback.map(f => `- **${f.person}** (${f.type}): ${f.content}`).join('\n')}\n`
        : '',
      classified.action_items.length > 0
        ? `## Action items\n\n${classified.action_items.map(a => `- [ ] **${a.owner}**: ${a.text}`).join('\n')}\n`
        : '',
      `## Raw content\n\n${content.trim()}`,
    ].filter(Boolean).join('\n')

    const fileContent = frontmatter + body

    try {
      const filepath = `contexts/${baseFilename}`
      await window.api.commitFile(
        filepath,
        fileContent,
        `Capture: ${classified.summary.slice(0, 60)}`
      )

      setSavedFilepath(filepath)

      const savePromises: Promise<void>[] = []

      for (const fb of classified.feedback) {
        const slug = await window.api.findPersonByName(fb.person)
        if (!slug) continue

        const reportDir = reports.find(r => r.name === slug)
        if (!reportDir) continue

        const feedbackLogPath = `reports/${slug}/feedback/log.md`
        let existing = ''
        try {
          existing = await window.api.getFileContent(feedbackLogPath)
        } catch { /* file may not exist */ }

        const entry = `### ${today}\n**Type:** ${fb.type}\n**Source:** ${classified.source} (captured)\n\n${fb.content}\n`
        const updated = existing ? `${entry}\n---\n\n${existing}` : entry

        savePromises.push(
          window.api.commitFile(
            feedbackLogPath,
            updated,
            `Add ${fb.type} feedback for ${reportDir.displayName} (captured)`
          )
        )
      }

      await Promise.all(savePromises)

      // Save impact items
      if (classified.impact && classified.impact.length > 0) {
        let existingImpact = ''
        try {
          existingImpact = await window.api.getFileContent(IMPACT_LOG_PATH)
        } catch { /* file may not exist */ }
        const impactEntries = classified.impact.map(i => `- ${i.text}`).join('\n')
        const updatedImpact = existingImpact
          ? `${existingImpact.trimEnd()}\n${impactEntries}\n`
          : `${impactEntries}\n`
        await window.api.commitFile(
          IMPACT_LOG_PATH,
          updatedImpact,
          'Add impact items from captured content'
        )
      }

      if (mountedRef.current) {
        setState('saved')
        toast.success('Content captured and saved')
      }
    } catch (e) {
      if (mountedRef.current) {
        setSaveError((e as Error).message || 'Failed to save')
        setState('error')
        toast.error('Failed to save captured content')
      }
    }
  }, [content, reports, toast])

  const handleReset = useCallback(() => {
    setState('idle')
    setContent('')
    setSourceHint('')
    setResult(null)
    setSaveError(null)
    setSavedFilepath(null)
    setEditContent('')
    reset()
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [reset])

  const handleEdit = useCallback(async () => {
    if (!savedFilepath) return
    try {
      const fileContent = await window.api.getFileContent(savedFilepath)
      setEditContent(fileContent)
      setState('editing')
    } catch (e) {
      toast.error('Failed to load file for editing')
    }
  }, [savedFilepath, toast])

  const handleSaveEdit = useCallback(async () => {
    if (!savedFilepath || !editContent.trim()) return
    try {
      await window.api.commitFile(
        savedFilepath,
        editContent,
        `Edit captured context: ${savedFilepath.split('/').pop()}`
      )
      toast.success('Changes saved')
      setState('saved')
    } catch (e) {
      toast.error('Failed to save changes')
    }
  }, [savedFilepath, editContent, toast])

  const handleDelete = useCallback(async () => {
    if (!savedFilepath) return
    try {
      await window.api.deleteFile(savedFilepath)
      toast.success('Context deleted')
      handleReset()
    } catch (e) {
      toast.error('Failed to delete context')
    }
  }, [savedFilepath, toast, handleReset])

  const handleClose = useCallback(() => {
    if (streaming) {
      setMinimized(true)
    } else {
      onClose()
    }
  }, [streaming, onClose])

  if (!open) {
    return null
  }

  if (minimized && streaming) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="absolute bottom-20 right-6 flex items-center gap-2 px-3 py-2 bg-brand/20 border border-brand/30 rounded-full text-xs text-brand-light hover:bg-brand/30 transition-colors z-20 animate-scale-in"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Capture processing…
        <ChevronUp className="w-3 h-3" />
      </button>
    )
  }

  if (minimized && !streaming) {
    setMinimized(false)
  }

  return (
    <div className="absolute bottom-20 right-6 w-[560px] max-w-[calc(100vw-18rem-3rem)] max-h-[calc(100vh-8rem)] bg-zinc-950 border border-border rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden z-20 animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-brand" />
          <span className="text-sm font-medium text-zinc-200">Capture</span>
          {state === 'processing' && (
            <span className="text-[10px] text-brand-light flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Processing
            </span>
          )}
          {state === 'saved' && (
            <span className="text-[10px] text-success flex items-center gap-1">
              <Check className="w-2.5 h-2.5" />
              Saved
            </span>
          )}
          {state === 'editing' && (
            <span className="text-[10px] text-amber-400 flex items-center gap-1">
              <Pencil className="w-2.5 h-2.5" />
              Editing
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {streaming && (
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {state === 'idle' && (
          <>
            <div className="flex items-center gap-2">
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
              className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand/50 focus:ring-1 focus:ring-brand/20 outline-none transition-colors resize-none min-h-[320px] max-h-[500px]"
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-zinc-600">
                AI will classify, extract feedback, and auto-save.
              </p>
              <button
                onClick={handleProcess}
                disabled={!content.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand/80 hover:bg-brand rounded-lg transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3 h-3" />
                Capture
                <kbd className="ml-1 text-[9px] opacity-50 font-sans">⌘↵</kbd>
              </button>
            </div>
          </>
        )}

        {state === 'processing' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
              Analyzing content…
            </div>
            {streamedText && (
              <div className="bg-surface border border-border rounded-lg p-3 text-xs text-zinc-400 max-h-[300px] overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-[11px]">{streamedText}</pre>
              </div>
            )}
          </div>
        )}

        {state === 'saved' && result && (
          <div className="space-y-3">
            <div className="bg-surface border border-border rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand-light border border-brand/20">
                  {result.source}
                </span>
                {result.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-border">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-zinc-300">{result.summary}</p>
            </div>

            {result.people_mentioned.length > 0 && (
              <div className="text-xs text-zinc-500">
                <span className="text-zinc-400">People:</span>{' '}
                {result.people_mentioned.join(', ')}
              </div>
            )}

            {result.feedback.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Feedback saved</span>
                {result.feedback.map((fb, i) => (
                  <div key={i} className="bg-surface border border-border rounded-lg p-2 text-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-medium text-zinc-300">{fb.person}</span>
                      <span className={`text-[10px] px-1 py-0.5 rounded ${
                        fb.type === 'positive' ? 'bg-emerald-500/15 text-emerald-400' :
                        fb.type === 'constructive' ? 'bg-amber-500/15 text-amber-400' :
                        'bg-blue-500/15 text-blue-400'
                      }`}>{fb.type}</span>
                    </div>
                    <p className="text-zinc-400">{fb.content}</p>
                    <button
                      onClick={() => {
                        const prompt = `Rewrite this feedback to be more specific, behavior-anchored, and actionable. Keep the same sentiment (${fb.type}).\n\nOriginal: ${fb.content}`
                        navigator.clipboard.writeText(prompt)
                        toast.success('Rewrite prompt copied — paste in AI chat')
                      }}
                      className="mt-1 text-[10px] text-brand-light/60 hover:text-brand-light transition-colors"
                    >
                      Rewrite with AI →
                    </button>
                  </div>
                ))}
              </div>
            )}

            {result.action_items.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Action items</span>
                {result.action_items.map((item, i) => (
                  <div key={i} className="text-xs text-zinc-400">
                    <span className="text-zinc-300 font-medium">{item.owner}:</span> {item.text}
                  </div>
                ))}
              </div>
            )}

            {result.impact && result.impact.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Impact logged</span>
                {result.impact.map((item, i) => (
                  <div key={i} className="text-xs text-zinc-400 prose-dark prose-sm">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{item.text}</ReactMarkdown>
                  </div>
                ))}
              </div>
            )}

            {result.key_context && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Key context</span>
                <div className="text-xs text-zinc-400 prose-dark prose-sm">
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{result.key_context}</ReactMarkdown>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleEdit}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
              <button
                onClick={handleReset}
                className="text-xs text-brand-light hover:text-brand transition-colors ml-auto"
              >
                Capture another
              </button>
            </div>
          </div>
        )}

        {state === 'editing' && (
          <div className="space-y-3">
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveEdit() } }}
              className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 font-mono focus:border-brand/50 focus:ring-1 focus:ring-brand/20 outline-none transition-colors resize-none min-h-[320px] max-h-[500px]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setState('saved')}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editContent.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-brand/80 hover:bg-brand rounded-lg transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Save changes
              </button>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-danger">
              <AlertCircle className="w-3.5 h-3.5" />
              {saveError || 'Something went wrong'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleProcess}
                className="text-xs text-brand-light hover:text-brand transition-colors"
              >
                Retry
              </button>
              <button
                onClick={handleReset}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Start over
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete captured content"
        message="This will permanently delete the captured content and any extracted feedback. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false)
          handleDelete()
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
