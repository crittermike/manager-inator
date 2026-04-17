import { useState, useCallback, useEffect, useMemo, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import type { ActionItem, CheckIn, FeedbackEntry, PrepEntry, ContextNote } from '../../../shared/types'
import { cleanSummaryContent } from '../../utils/cleanSummary'
import { useFileContent } from '../../hooks/useData'
import { useAttachedImages } from '../../hooks/useAttachedImages'
import { useToast } from '../common/Toast'
import { FormattedDate } from '../common/FormattedDate'
import { RefineWithAI } from '../common/RefineWithAI'
import { OpenInExternal } from '../common/OpenInExternal'
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Maximize2,
  Save,
  Check,
  Copy,
  X,
  RefreshCw,
} from 'lucide-react'

// ── Types ──

interface StreamEntryBase {
  id: string
  date: string
  title: string
  preview: string
  pinned?: boolean
  source?: string
}

export interface ContextStreamEntry extends StreamEntryBase {
  type: 'context'
  data: ContextNote
}

export interface FeedbackStreamEntry extends StreamEntryBase {
  type: 'feedback'
  data: FeedbackEntry & { _index: number }
}

export interface ActionStreamEntry extends StreamEntryBase {
  type: 'action'
  data: ActionItem[]
}

export interface CheckinStreamEntry extends StreamEntryBase {
  type: 'checkin'
  data: CheckIn
}

export interface ReviewStreamEntry extends StreamEntryBase {
  type: 'review'
  data: { period: string; title: string; content: string }
}

export interface PrepStreamEntry extends StreamEntryBase {
  type: 'prep'
  data: PrepEntry
}

export type StreamEntry = ContextStreamEntry | FeedbackStreamEntry | ActionStreamEntry | CheckinStreamEntry | ReviewStreamEntry | PrepStreamEntry

// ── Inline Editor ──

function InlineEditor({ initialContent, onSave, onCancel }: { initialContent: string; onSave: (content: string) => Promise<void>; onCancel?: () => void }) {
  const [content, setContent] = useState(initialContent)
  const [isSaving, setIsSaving] = useState(false)

  const [saveError, setSaveError] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(false)
    try {
      await onSave(content)
    } catch (e) {
      console.error('Failed to save:', e)
      setSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }
  
  return (
    <div className="space-y-3">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() } }}
        className="w-full h-64 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-300 font-mono resize-y focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 transition-all"
        autoFocus
      />
      <div className="flex items-center justify-end gap-2">
        {saveError && (
          <span className="text-xs text-danger mr-auto">Save failed — try again</span>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving || content === initialContent}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-sm rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
        >
          {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" aria-hidden="true" />}
          Save
        </button>
      </div>
    </div>
  )
}

function ContentLoadError({ label, onRetry }: { label?: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <p className="text-sm text-zinc-500">Unable to load {label || 'content'}.</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-raised/80 border border-border rounded-lg transition-colors"
        aria-label={`Retry loading ${label || 'content'}`}
      >
        <RefreshCw className="w-3 h-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// ── Stream Entry Card ──

export interface StreamEntryCardProps {
  entry: StreamEntry
  expanded: boolean
  onToggle: (id: string) => void
  name: string
  onViewContent: (id: string, path: string, title: string) => void
  onToggleAction: (a: ActionItem) => void
  isToggling: boolean
  isViewing: boolean
  viewingPath: string | null
  viewingTitle: string | null
  fileContent: string | null
  fileLoading: boolean
  fileError: boolean
  onRetryContent: () => void
  onCloseContent: () => void
  onCopyContent: (text: string) => void
  copied: boolean
  isEditing: boolean
  onEditContent: (id: string, path: string) => void
  onDeleteContent: (path: string) => void
  onSaveContent: (path: string, content: string) => Promise<void>
  onCancelEdit: () => void
  onUpdateFeedback: (entryIndex: number, newContent: string, newType: FeedbackEntry['type']) => Promise<void>
  onDeleteFeedback: (entryIndex: number) => Promise<void>
  onExpand?: (entry: StreamEntry) => void
}

export const StreamEntryCard = memo(function StreamEntryCard({
  entry,
  expanded,
  onToggle,
  name,
  onViewContent,
  onToggleAction,
  isToggling,
  isViewing,
  viewingPath,
  viewingTitle,
  fileContent,
  fileLoading,
  fileError,
  onRetryContent,
  onCloseContent,
  onCopyContent,
  copied,
  isEditing,
  onEditContent,
  onDeleteContent,
  onSaveContent,
  onCancelEdit,
  onUpdateFeedback,
  onDeleteFeedback,
  onExpand
}: StreamEntryCardProps) {
  const typeStyles: Record<string, { bg: string; text: string; label: string }> = {
    context: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Context' },
    feedback: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Feedback' },
    action: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Actions' },
    checkin: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Check-in' },
    review: { bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Review' },
    prep: { bg: 'bg-sky-500/10', text: 'text-sky-400', label: 'Prep' }
  }

  const sourceStyles: Record<string, { bg: string; text: string; label: string }> = {
    meeting: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Meeting' },
    slack: { bg: 'bg-violet-500/10', text: 'text-violet-400', label: 'Slack' },
    github: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'GitHub' },
    email: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'Email' },
    other: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Note' }
  }

  const style = entry.type === 'context' && entry.source
    ? sourceStyles[entry.source] || typeStyles['context']
    : typeStyles[entry.type] || typeStyles['context']
  const handleToggle = useCallback(() => onToggle(entry.id), [onToggle, entry.id])
  const [contextTab, setContextTab] = useState<'processed' | 'raw'>('processed')

  // Compute file path for all entry types that use file-based storage
  const entryPath = useMemo(() => {
    switch (entry.type) {
      case 'context': return `contexts/${entry.data.filename}`
      case 'checkin': return `reports/${name}/check-ins/monthly/${entry.data.date}.md`
      case 'review': return `reports/${name}/reviews/${entry.data.period}.md`
      case 'prep': return `reports/${name}/prep/${entry.data.date}.md`
      default: return ''
    }
  }, [entry.type, entry.data, name])

  // Shared editing state for all detail types
  const [detailEditing, setDetailEditing] = useState(false)
  const stopEditing = useCallback(() => setDetailEditing(false), [])

  useEffect(() => {
    if (!expanded) { setDetailEditing(false) }
  }, [expanded])

  const canEditDelete = entry.type !== 'action'
  const canRefine = expanded && (entry.type === 'context' || entry.type === 'checkin' || entry.type === 'review' || entry.type === 'prep')
  const refinePath = canRefine ? entryPath : null
  const { content: refineContent } = useFileContent(refinePath)
  const refineDocumentType =
    entry.type === 'context' ? 'context' :
    entry.type === 'checkin' ? 'monthly check-in' :
    entry.type === 'review' ? 'performance review' :
    entry.type === 'prep' ? '1:1 prep document' :
    'document'

  const handleHeaderEdit = useCallback(() => {
    if (entry.type === 'context' || entry.type === 'prep') {
      onEditContent(entry.id, entryPath)
    } else {
      setDetailEditing(true)
    }
  }, [entry.type, entry.id, entryPath, onEditContent])

  const handleHeaderDelete = useCallback(() => {
    if (entry.type === 'feedback') {
      onDeleteFeedback(entry.data._index)
    } else {
      onDeleteContent(entryPath)
    }
  }, [entry.type, entry.data, entryPath, onDeleteContent, onDeleteFeedback])

  return (
    <div className={`bg-surface rounded-xl border transition-all duration-150 ${entry.pinned ? 'border-brand/20' : 'border-border hover:border-zinc-500 hover:shadow-lg hover:shadow-black/10'}`}>
      {/* Header row — always visible */}
      <div className="flex items-center gap-3 p-3.5">
        {/* Clickable area: badge + title + date + chevron */}
        <button
          onClick={handleToggle}
          aria-expanded={expanded}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
            {style.label}
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-sm text-zinc-300 block">{entry.title}</span>
            {!expanded && entry.preview && (
              <span className="text-xs text-zinc-500 truncate block mt-0.5">{entry.preview}</span>
            )}
          </div>
          {!entry.pinned && entry.type !== 'checkin' && entry.type !== 'review' && (
            <FormattedDate date={entry.date} className="text-xs text-zinc-600 shrink-0" />
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
          )}
        </button>

        {/* Inline controls — shown in header for all editable types */}
        {expanded && canEditDelete && !detailEditing && (
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {entry.type === 'context' && (
              <>
                <button
                  onClick={() => setContextTab('processed')}
                  className={`px-2 py-1 text-[11px] rounded transition-colors ${contextTab === 'processed' ? 'bg-surface-raised text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Processed
                </button>
                <button
                  onClick={() => setContextTab('raw')}
                  className={`px-2 py-1 text-[11px] rounded transition-colors ${contextTab === 'raw' ? 'bg-surface-raised text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Raw
                </button>
                <div className="w-px h-4 bg-border mx-1" />
              </>
            )}
            {canRefine && refineContent != null && (
              <RefineWithAI
                filePath={entryPath}
                currentContent={refineContent}
                documentType={refineDocumentType}
                onSaved={() => { /* file change events trigger reload */ }}
                className="!p-1"
              />
            )}
            {canRefine && entryPath ? (
              <OpenInExternal
                filePath={entryPath}
                onOpenFullView={onExpand ? () => onExpand(entry) : undefined}
              />
            ) : onExpand && (
              <button
                onClick={() => onExpand(entry)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="Open full view"
                title="Open full view"
              >
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            <button
              onClick={handleHeaderEdit}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Edit"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={handleHeaderDelete}
              className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
              aria-label="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 animate-slide-down">
          <div className="border-t border-border pt-3">
            {entry.type === 'context' && !(isViewing && isEditing) && <ContextDetail entry={entry} activeTab={contextTab} />}
            {entry.type === 'feedback' && <FeedbackDetail entry={entry} editing={detailEditing} onStopEditing={stopEditing} onUpdate={onUpdateFeedback} />}
            {entry.type === 'action' && <ActionDetail entry={entry} onToggleAction={onToggleAction} isToggling={isToggling} />}
            {entry.type === 'checkin' && <CheckinDetail entry={entry} name={name} editing={detailEditing} onStopEditing={stopEditing} onSave={onSaveContent} />}
            {entry.type === 'review' && <ReviewDetail entry={entry} name={name} editing={detailEditing} onStopEditing={stopEditing} onSave={onSaveContent} />}
            {entry.type === 'prep' && <PrepDetail entry={entry} name={name} />}
          </div>

          {isViewing && viewingPath && (
            <div className={`animate-fade-in ${!(isEditing && entry.type === 'context') ? 'mt-4 pt-4 border-t border-zinc-800/50' : ''}`}>
              {!(isEditing && entry.type === 'context') && (
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-300">
                  {viewingTitle}
                </span>
                <button
                  onClick={isEditing ? onCancelEdit : onCloseContent}
                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              )}
              
              {fileLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                </div>
              ) : fileContent !== null ? (
                isEditing ? (
                  <InlineEditor
                    initialContent={fileContent}
                    onSave={(content) => onSaveContent(viewingPath, content)}
                    onCancel={onCancelEdit}
                  />
                ) : (
                  <div className="relative group/content">
                    <button
                      onClick={() => onCopyContent(fileContent)}
                      className="absolute top-0 right-0 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 transition-opacity"
                      aria-label="Copy"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                    </button>
                    <div className="prose-dark text-sm max-h-96 overflow-y-auto pr-2">
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{cleanSummaryContent(fileContent)}</ReactMarkdown>
                    </div>
                  </div>
                )
              ) : (
                <ContentLoadError onRetry={onRetryContent} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// ── Detail sub-components ──

function ContextDetail({ 
  entry, 
  activeTab,
}: { 
  entry: ContextStreamEntry; 
  activeTab: 'processed' | 'raw';
}) {
  const ctx = entry.data
  const tags = ctx.tags || []
  const contextPath = `contexts/${ctx.filename}`

  const { content: fileContent, loading: fileLoading, reload } = useFileContent(contextPath)
  const { stripImageRefs, getImageUrls } = useAttachedImages(fileContent)

  const { processed, raw } = useMemo(() => {
    if (!fileContent) return { processed: '', raw: '' }
    const cleaned = cleanSummaryContent(fileContent)
    const rawMarker = /\n## Raw content\n/i
    const match = cleaned.match(rawMarker)
    if (match && match.index != null) {
      return {
        processed: cleaned.slice(0, match.index).trim(),
        raw: cleaned.slice(match.index + match[0].length).trim()
      }
    }
    return { processed: cleaned, raw: '' }
  }, [fileContent])

  const displayContent = activeTab === 'processed' || !raw ? processed : raw
  const renderedContent = stripImageRefs(displayContent)
  const imageUrls = getImageUrls()

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span key={i} className="px-2 py-0.5 bg-surface-raised rounded text-[11px] text-zinc-400 border border-border">
              {tag}
            </span>
          ))}
        </div>
      )}

      {fileLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : fileContent ? (
        <div className="prose-dark text-sm max-h-96 overflow-y-auto pr-2">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
            {renderedContent}
          </ReactMarkdown>
          {imageUrls.map((url, i) => (
            <img key={i} src={url} alt="Attached image" className="max-w-full rounded-lg mt-3" />
          ))}
        </div>
      ) : (
        <ContentLoadError onRetry={reload} />
      )}
    </div>
  )
}

function FeedbackDetail({ entry, editing, onStopEditing, onUpdate }: { 
  entry: FeedbackStreamEntry; 
  editing: boolean;
  onStopEditing: () => void;
  onUpdate: (entryIndex: number, newContent: string, newType: FeedbackEntry['type']) => Promise<void>;
}) {
  const f = entry.data
  const [draft, setDraft] = useState(f.content)
  const [draftType, setDraftType] = useState<FeedbackEntry['type']>(f.type)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing) { setDraft(f.content); setDraftType(f.type) }
  }, [editing, f.content, f.type])

  const handleSave = useCallback(async () => {
    if (!draft.trim()) return
    setSaving(true)
    await onUpdate(f._index, draft, draftType)
    setSaving(false)
    onStopEditing()
  }, [f._index, draft, draftType, onUpdate, onStopEditing])

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {(['positive', 'constructive', 'mixed', 'observation'] as const).map(t => (
            <button
              key={t}
              onClick={() => setDraftType(t)}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                draftType === t
                  ? 'bg-brand/20 text-brand-light'
                  : 'bg-surface-raised text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() } }}
          className="w-full h-24 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button onClick={() => { onStopEditing(); setDraft(f.content); setDraftType(f.type) }} className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draft.trim()}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-sm rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="prose-dark text-sm leading-relaxed"><ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={{ p: ({ children }) => <p className="text-zinc-300 my-1">{children}</p> }}>{f.content}</ReactMarkdown></div>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <FormattedDate date={f.date} />
        {f.source && <span>from {f.source}</span>}
        {f.context && (
          <a href={f.context} target="_blank" rel="noopener noreferrer" className="text-brand-light hover:text-brand">
            View context →
          </a>
        )}
      </div>
    </div>
  )
}

function ActionDetail({ entry, onToggleAction, isToggling }: { entry: ActionStreamEntry; onToggleAction: (a: ActionItem) => void; isToggling: boolean }) {
  const actions = entry.data

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto">
      {actions.map((a, i) => {
        return (
          <button
            key={`${a.sourceFile ?? ''}:${a.sourceLineNumber ?? i}`}
            disabled={isToggling || !a.sourceFile || a.sourceLineNumber == null}
            onClick={() => onToggleAction(a)}
            className="w-full flex items-start gap-2.5 py-1.5 px-1 rounded-lg hover:bg-surface-raised transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isToggling ? (
              <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 group-hover:border-brand group-hover:bg-brand/20 transition-colors" />
            )}
            <span className="text-sm text-zinc-300">{a.text}</span>
            {a.owner && a.owner !== 'Unknown' && (
              <span className="text-xs text-zinc-500 shrink-0 ml-auto">({a.owner})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CheckinDetail({ entry, name, editing, onStopEditing, onSave }: {
  entry: CheckinStreamEntry;
  name: string;
  editing: boolean;
  onStopEditing: () => void;
  onSave: (path: string, content: string) => Promise<void>;
}) {
  const c = entry.data
  const checkinPath = `reports/${name}/check-ins/monthly/${c.date}.md`
  const { content, loading, reload } = useFileContent(checkinPath)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (editing && content != null) {
    return (
      <InlineEditor 
        initialContent={content} 
        onSave={async (newContent) => {
          await onSave(checkinPath, newContent)
          onStopEditing()
        }}
        onCancel={onStopEditing}
      />
    )
  }

  return (
    <div className="space-y-2">
      {content ? (
        <div className="prose-dark text-sm max-h-96 overflow-y-auto pr-2">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{cleanSummaryContent(content)}</ReactMarkdown>
        </div>
      ) : c.accomplishments.length > 0 ? (
        <ul className="space-y-1">
          {c.accomplishments.slice(0, 5).map((a, i) => (
            <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
              <span className="text-zinc-600 mt-0.5">•</span>
              {a}
            </li>
          ))}
        </ul>
      ) : (
        <ContentLoadError label="check-in" onRetry={reload} />
      )}
    </div>
  )
}

function ReviewDetail({ entry, name, editing, onStopEditing, onSave }: {
  entry: ReviewStreamEntry
  name: string
  editing: boolean
  onStopEditing: () => void
  onSave: (path: string, content: string) => Promise<void>
}) {
  const r = entry.data
  const reviewPath = `reports/${name}/reviews/${r.period}.md`
  const { content, loading, reload } = useFileContent(reviewPath)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (editing && content != null) {
    return (
      <InlineEditor
        initialContent={content}
        onSave={async (newContent) => {
          await onSave(reviewPath, newContent)
          onStopEditing()
        }}
        onCancel={onStopEditing}
      />
    )
  }

  const reviewContent = content || r.content

  return (
    <div className="space-y-3">
      {reviewContent ? (
        <div className="prose-dark text-sm max-h-96 overflow-y-auto pr-2">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{cleanSummaryContent(reviewContent)}</ReactMarkdown>
        </div>
      ) : (
        <ContentLoadError label="review" onRetry={reload} />
      )}
    </div>
  )
}

function PrepDetail({ entry, name }: { entry: PrepStreamEntry; name: string }) {
  const p = entry.data
  const prepPath = `reports/${name}/prep/${p.date}.md`
  const [content, setContent] = useState(p.content)
  const toast = useToast()

  const handleCheckboxToggle = useCallback(async (lineIndex: number) => {
    const lines = content.split('\n')
    const line = lines[lineIndex]
    const wasUnchecked = line.includes('- [ ] ')
    if (wasUnchecked) {
      lines[lineIndex] = line.replace('- [ ] ', '- [x] ')
    } else if (line.includes('- [x] ')) {
      lines[lineIndex] = line.replace('- [x] ', '- [ ] ')
    } else {
      return
    }
    const updated = lines.join('\n')
    setContent(updated)
    try {
      await window.api.commitFile(prepPath, updated, `Toggle prep checkbox for ${name}`)
      if (wasUnchecked) {
        const checkboxText = line.replace(/^(\s*)- \[ \]\s*/, '')
        window.api.resolveAndToggleActionItem(name, checkboxText).catch(err => { console.error('Failed to toggle action item', err); toast.error('Failed to toggle action item') })
      }
    } catch (e) { console.error('Failed to toggle prep checkbox:', e); toast.error('Failed to save prep checkbox') }
  }, [content, prepPath, name])

  const lines = content.split('\n')
  const hasCheckboxes = lines.some(l => /^(\s*)- \[[ x]\]/.test(l))

  return (
    <div className="space-y-2">
      {hasCheckboxes ? (
        <div className="max-h-96 overflow-y-auto pr-2">
          {lines.map((line, i) => {
            const unchecked = line.match(/^(\s*)- \[ \] (.+)/)
            const checked = line.match(/^(\s*)- \[x\] (.+)/)
            if (unchecked) {
              return (
                <label key={i} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => handleCheckboxToggle(i)}
                    className="mt-1 accent-brand w-4 h-4 shrink-0"
                  />
                  <span className="text-sm text-zinc-300 group-hover:text-zinc-100 leading-relaxed">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={{ p: ({ children }) => <>{children}</> }}>{unchecked[2]}</ReactMarkdown>
                  </span>
                </label>
              )
            }
            if (checked) {
              return (
                <label key={i} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => handleCheckboxToggle(i)}
                    className="mt-1 accent-brand w-4 h-4 shrink-0"
                  />
                  <span className="text-sm text-zinc-500 line-through leading-relaxed">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={{ p: ({ children }) => <>{children}</> }}>{checked[2]}</ReactMarkdown>
                  </span>
                </label>
              )
            }
            if (line.match(/^#{1,3}\s/)) {
              return <h3 key={i} className="text-base font-semibold text-zinc-100 mt-5 mb-2 first:mt-0">{line.replace(/^#{1,3}\s*/, '')}</h3>
            }
            if (line.match(/^-\s/)) {
              return <p key={i} className="text-sm text-zinc-400 pl-1 py-0.5 leading-relaxed">• {line.replace(/^-\s*/, '')}</p>
            }
            if (line.trim() === '' || line.match(/^---/)) return <div key={i} className="h-1" />
            if (line.trim()) return <p key={i} className="text-sm text-zinc-400 py-0.5 leading-relaxed">{line}</p>
            return null
          })}
        </div>
      ) : (
        <div className="prose-dark text-sm max-h-96 overflow-y-auto pr-2">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
