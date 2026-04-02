import { useState, useRef, useEffect, useCallback } from 'react'
import { useAI } from '../../hooks/useAI'
import { useToast } from './Toast'
import { format } from 'date-fns'
import { IMPACT_LOG_PATH } from '../../../shared/constants'
import { ConfirmDialog } from './ConfirmDialog'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Loader2, Check, AlertCircle, Sparkles,
  Pencil, Trash2, ChevronDown, ChevronUp, X
} from 'lucide-react'

const REMARK_PLUGINS = [remarkGfm]

type SessionState = 'processing' | 'saved' | 'editing' | 'error'
type SourceHint = 'slack' | 'github' | 'email' | 'meeting' | 'other' | ''

interface ClassifiedResult {
  source: 'slack' | 'github' | 'email' | 'meeting' | 'other'
  summary: string
  detailed_summary: string
  tags: string[]
  people_mentioned: string[]
  feedback: { person: string; type: 'positive' | 'constructive' | 'mixed'; content: string }[]
  action_items: { text: string; owner: string }[]
  resolved_action_items: { original_text: string; owner: string; reason: string }[]
  impact: { text: string }[]
  key_context: string
}

interface ReportSummary {
  name: string
  displayName: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function CaptureSession({
  id,
  initialContent,
  sourceHint,
  reports,
  onStatusChange,
  onRemove,
}: {
  id: string
  initialContent: string
  sourceHint: SourceHint
  reports: ReportSummary[]
  onStatusChange: (id: string, status: SessionState) => void
  onRemove: (id: string) => void
}) {
  const toast = useToast()
  const { streaming, streamedText, generate, cancel, reset } = useAI()

  const [state, setState] = useState<SessionState>('processing')
  const [result, setResult] = useState<ClassifiedResult | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFilepath, setSavedFilepath] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [resolvedConfirmed, setResolvedConfirmed] = useState<Record<number, boolean>>({})
  const [expanded, setExpanded] = useState(false)

  const mountedRef = useRef(true)
  const startedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancel()
    }
  }, [cancel])

  useEffect(() => {
    onStatusChange(id, state)
  }, [id, onStatusChange, state])

  const autoSave = useCallback(async (classified: ClassifiedResult, confirmedResolved?: Record<number, boolean>) => {
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
      `title: ${classified.summary.replace(/\n/g, ' ')}`,
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
      `## Raw content\n\n${initialContent.trim()}`,
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
        } catch { }

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

      if (classified.impact && classified.impact.length > 0) {
        let existingImpact = ''
        try {
          existingImpact = await window.api.getFileContent(IMPACT_LOG_PATH)
        } catch { }
        const date = new Date().toISOString().split('T')[0]
        const impactEntries = classified.impact.map(i => `- ${i.text}`).join('\n')
        const entry = `### ${date}\n\n${impactEntries}`
        let updatedImpact: string
        if (existingImpact) {
          const headingMatch = existingImpact.match(/^(#[^\n]*\n(?:\s*\n)*)/)
          updatedImpact = headingMatch
            ? headingMatch[0] + entry + '\n\n' + existingImpact.slice(headingMatch[0].length)
            : entry + '\n\n' + existingImpact
        } else {
          updatedImpact = `# Impact log\n\n${entry}\n`
        }
        await window.api.commitFile(
          IMPACT_LOG_PATH,
          updatedImpact,
          'Add impact items from captured content'
        )
      }

      if (classified.resolved_action_items && classified.resolved_action_items.length > 0 && confirmedResolved) {
        const resolvePromises: Promise<void>[] = []
        for (let i = 0; i < classified.resolved_action_items.length; i++) {
          if (!confirmedResolved[i]) continue
          const resolved = classified.resolved_action_items[i]
          for (const slug of peopleSlugs) {
            resolvePromises.push(
              window.api.resolveAndToggleActionItem(slug, resolved.original_text)
                .then(() => {})
                .catch(() => {})
            )
          }
        }
        await Promise.all(resolvePromises)
      }

      if (mountedRef.current) {
        setState('saved')
        toast.success('Content captured and saved')
      }
    } catch (e) {
      if (mountedRef.current) {
        setSaveError((e as Error).message || 'Failed to save')
        setState('error')
        setExpanded(true)
        toast.error('Failed to save captured content')
      }
    }
  }, [initialContent, reports, toast])

  const retryCountRef = useRef(0)
  const MAX_RETRIES = 3

  const handleProcess = useCallback(async () => {
    if (!initialContent.trim() || streaming) return

    setState('processing')
    setSaveError(null)
    setResult(null)
    setResolvedConfirmed({})
    reset()

    const reportNames = reports.map(r => r.displayName).join(', ')
    const reportSlugs = reports.map(r => r.name)

    let openActionItemsText = ''
    try {
      const openItems = await window.api.getOpenActionItemsForPeople(reportSlugs)
      if (openItems.length > 0) {
        const lines: string[] = []
        for (const { items } of openItems) {
          for (const item of items) {
            lines.push(`- ${item.owner}: ${item.text}`)
          }
        }
        if (lines.length > 0) {
          openActionItemsText = lines.join('\n')
        }
      }
    } catch { }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (!mountedRef.current) return

      try {
        const response = await generate('classify-content', {
          content: initialContent.trim(),
          reportNames,
          sourceHint: sourceHint || undefined,
          openActionItems: openActionItemsText || undefined,
        })

        if (!mountedRef.current) return

        let parsed: ClassifiedResult
        try {
          const jsonStr = response.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
          parsed = JSON.parse(jsonStr)
          if (!parsed.resolved_action_items) {
            parsed.resolved_action_items = []
          }
        } catch {
          if (attempt < MAX_RETRIES) {
            reset()
            continue
          }
          setSaveError('AI returned invalid JSON after multiple attempts.')
          setState('error')
          setExpanded(true)
          return
        }

        retryCountRef.current = 0
        setResult(parsed)
        const confirmMap: Record<number, boolean> = {}
        parsed.resolved_action_items.forEach((_, i) => { confirmMap[i] = true })
        setResolvedConfirmed(confirmMap)
        await autoSave(parsed, confirmMap)
        return
      } catch (e) {
        if (!mountedRef.current) return
        if (attempt < MAX_RETRIES) {
          reset()
          continue
        }
        setSaveError((e as Error).message || 'AI processing failed after multiple attempts')
        setState('error')
        setExpanded(true)
        return
      }
    }
  }, [autoSave, generate, initialContent, reports, reset, sourceHint, streaming])

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      handleProcess()
    }
  }, [handleProcess])

  const handleEdit = useCallback(async () => {
    if (!savedFilepath) return
    try {
      const fileContent = await window.api.getFileContent(savedFilepath)
      setEditContent(fileContent)
      setState('editing')
      setExpanded(true)
    } catch {
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
    } catch {
      toast.error('Failed to save changes')
    }
  }, [savedFilepath, editContent, toast])

  const handleDelete = useCallback(async () => {
    if (!savedFilepath) return
    try {
      await window.api.deleteFile(savedFilepath)
      toast.success('Context deleted')
      onRemove(id)
    } catch {
      toast.error('Failed to delete context')
    }
  }, [id, onRemove, savedFilepath, toast])

  const handleCancelProcessing = useCallback(async () => {
    await cancel()
    if (mountedRef.current) {
      setSaveError('Capture canceled')
      setState('error')
      setExpanded(true)
    }
  }, [cancel])

  const summaryText = result?.summary || initialContent.trim().split('\n')[0] || 'Captured content'

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="flex-1 min-w-0 text-left flex items-center gap-2"
        >
          {state === 'processing' ? (
            <Loader2 className="w-3.5 h-3.5 text-brand animate-spin shrink-0" />
          ) : state === 'saved' ? (
            <Check className="w-3.5 h-3.5 text-success shrink-0" />
          ) : state === 'editing' ? (
            <Pencil className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-xs text-zinc-200 truncate">{summaryText}</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">
              {state === 'processing' ? 'Processing' : state === 'saved' ? 'Saved' : state === 'editing' ? 'Editing' : 'Error'}
            </div>
          </div>
        </button>
        {state === 'processing' && (
          <button
            onClick={handleCancelProcessing}
            className="px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200 border border-border rounded-md transition-colors"
            title="Cancel processing"
          >
            Cancel
          </button>
        )}
        {(state === 'saved' || state === 'error') && (
          <button
            onClick={() => onRemove(id)}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-md transition-colors"
            title="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-md transition-colors"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {state === 'processing' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                Analyzing content…
              </div>
              {streamedText && (
                <div className="bg-surface-raised border border-border rounded-lg p-3 text-xs text-zinc-400 max-h-[260px] overflow-y-auto">
                  <pre className="whitespace-pre-wrap font-mono text-[11px]">{streamedText}</pre>
                </div>
              )}
            </div>
          )}

          {state === 'saved' && result && (
            <div className="space-y-3">
              <div className="bg-surface-raised border border-border rounded-lg p-3 space-y-2">
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
                    <div key={i} className="bg-surface-raised border border-border rounded-lg p-2 text-xs">
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

              {result.resolved_action_items && result.resolved_action_items.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-medium text-emerald-500/80 uppercase tracking-wider flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" />
                    Resolved action items
                  </span>
                  <p className="text-[10px] text-zinc-600">
                    These existing items appear to be resolved based on this content. Uncheck any you want to keep open.
                  </p>
                  {result.resolved_action_items.map((item, i) => (
                    <label key={i} className="flex items-start gap-2 py-1 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={resolvedConfirmed[i] ?? true}
                        onChange={() => {
                          setResolvedConfirmed(prev => ({ ...prev, [i]: !prev[i] }))
                        }}
                        className="mt-0.5 accent-emerald-500 w-3.5 h-3.5 shrink-0"
                      />
                      <div className="text-xs">
                        <div className={`${resolvedConfirmed[i] !== false ? 'text-emerald-400/80 line-through' : 'text-zinc-300'}`}>
                          <span className="font-medium">{item.owner}:</span> {item.original_text}
                        </div>
                        <div className="text-zinc-600 text-[10px] mt-0.5">{item.reason}</div>
                      </div>
                    </label>
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
              </div>
            </div>
          )}

          {state === 'editing' && (
            <div className="space-y-3">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveEdit() } }}
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-sm text-zinc-200 font-mono focus:border-brand/50 focus:ring-1 focus:ring-brand/20 outline-none transition-colors resize-none min-h-[260px] max-h-[420px]"
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
                  className="px-3 py-1.5 text-xs font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
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
              <div className="flex items-center gap-3">
                <button
                  onClick={handleProcess}
                  className="flex items-center gap-1 text-xs text-brand-light hover:text-brand transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Retry
                </button>
                <button
                  onClick={() => onRemove(id)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
