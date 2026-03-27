import { useState, useRef, useEffect, useCallback } from 'react'
import { useAI } from '../../hooks/useAI'
import { useToast } from '../../components/common/Toast'
import { format } from 'date-fns'
import type { Report } from '../../../shared/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import { Sparkles, Loader2, RotateCcw, Pencil, Trash2, Check, X } from 'lucide-react'

export function InlinePrep({
  reportName,
  onDone,
  onCancel
}: {
  reportName: string
  onDone: () => void
  onCancel: () => void
}) {
  const { streaming, streamedText, generate, cancel, reset, fullTextRef } = useAI()
  const toast = useToast()
  const mountedRef = useRef(true)
  const generatingRef = useRef(false)
  const autoSavedRef = useRef(false)

  const [phase, setPhase] = useState<'loading' | 'generating' | 'review'>('loading')
  const [reportData, setReportData] = useState<Report | null>(null)
  const [prepContent, setPrepContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; cancel() }
  }, [cancel])

  const today = format(new Date(), 'yyyy-MM-dd')
  const prepPath = `reports/${reportName}/prep/${today}.md`

  const savePrep = useCallback(async (content: string) => {
    try {
      await window.api.commitFile(
        prepPath,
        content,
        `Save 1:1 prep for ${reportName} on ${today}`
      )
      return true
    } catch {
      return false
    }
  }, [prepPath, reportName, today])

  useEffect(() => {
    Promise.all([
      window.api.getReportData(reportName),
      window.api.getFileContent(prepPath).catch(() => null)
    ]).then(([data, existing]) => {
      if (!mountedRef.current) return
      setReportData(data)
      if (existing) {
        setPrepContent(existing)
        autoSavedRef.current = true
        setPhase('review')
      }
    }).catch(() => {
      toast.error('Failed to load report data')
      onCancel()
    })
  }, [reportName, prepPath, onCancel, toast])

  const doGenerate = useCallback(async (data: Report) => {
    if (generatingRef.current) return
    generatingRef.current = true
    autoSavedRef.current = false
    setPhase('generating')
    setEditing(false)
    reset()

    const openActions = data.actionItems.filter(a => !a.completed)
    const recentSummaryDates = data.summaries.slice(-5)
    const summaryPaths = recentSummaryDates.map(s => `contexts/${s.filename || `${s.date}-${reportName}-1-1.md`}`)
    const summaryFileMap = await window.api.getFilesContentBulk(summaryPaths)
    const summariesText = summaryPaths
      .map(p => summaryFileMap[p])
      .filter(Boolean)
      .join('\n\n---\n\n')
    if (!mountedRef.current) return

    const openActionsText = openActions.map(a => `- [ ] ${a.text}`).join('\n')
    const feedbackText = data.feedback.slice(-3).map(f => `${f.date} (${f.type}): ${f.content}`).join('\n---\n')

    const displayName = data.profile.displayName
    const firstName = displayName.split(' ')[0]
    const namePattern = new RegExp(`\\b(${firstName}|${displayName})\\b`, 'i')
    const ownSummaryPrefix = `${reportName}-1-1`

    let crossMentions = ''
    try {
      const allMeetings = await window.api.listMeetings()
      const otherMeetings = allMeetings
        .filter(m => !m.filename.replace('.md', '').includes(ownSummaryPrefix))
        .slice(0, 15)
      const paths = otherMeetings.map(m => `contexts/${m.filename}`)
      const fileMap = await window.api.getFilesContentBulk(paths)
      const mentions: string[] = []
      for (const m of otherMeetings) {
        const content = fileMap[`contexts/${m.filename}`]
        if (content && namePattern.test(content)) {
          mentions.push(`### ${m.title} (${m.date})\n${content}`)
          if (mentions.length >= 5) break
        }
      }
      crossMentions = mentions.join('\n\n---\n\n')
    } catch { /* non-critical */ }
    if (!mountedRef.current) return

    try {
      const result = await generate('prep-one-on-one', {
        reportName: displayName,
        about: data.profile.about || undefined,
        jobExpectations: data.jobExpectations || undefined,
        summaries: summariesText || 'No recent summaries available.',
        actionItems: openActionsText || 'No open action items.',
        feedback: feedbackText || undefined,
        crossMeetingMentions: crossMentions || undefined
      })
      if (mountedRef.current) {
        const finalContent = result || fullTextRef.current
        if (finalContent) {
          setPrepContent(finalContent)
          setPhase('review')
          const saved = await savePrep(finalContent)
          if (saved) {
            autoSavedRef.current = true
            toast.success('Prep saved')
          } else {
            toast.error('Failed to auto-save prep')
          }
        }
      }
    } catch {
      if (mountedRef.current) {
        const fallback = fullTextRef.current
        if (fallback) {
          setPrepContent(fallback)
          setPhase('review')
          const saved = await savePrep(fallback)
          if (saved) {
            autoSavedRef.current = true
            toast.success('Prep saved')
          }
        } else {
          setPrepContent('_Failed to generate prep._')
          setPhase('review')
        }
      }
    } finally {
      generatingRef.current = false
    }
  }, [reportName, generate, reset, fullTextRef, savePrep, toast])

  useEffect(() => {
    if (reportData && phase === 'loading' && !autoSavedRef.current) {
      doGenerate(reportData)
    }
  }, [reportData, phase, doGenerate])

  const handleRegenerate = useCallback(() => {
    if (!reportData) return
    setPrepContent('')
    setEditing(false)
    generatingRef.current = false
    doGenerate(reportData)
  }, [reportData, doGenerate])

  const handleStartEdit = useCallback(() => {
    setEditDraft(prepContent)
    setEditing(true)
  }, [prepContent])

  const handleCancelEdit = useCallback(() => {
    setEditing(false)
    setEditDraft('')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editDraft.trim()) return
    setSaving(true)
    const saved = await savePrep(editDraft)
    if (saved) {
      setPrepContent(editDraft)
      setEditing(false)
      toast.success('Prep updated')
    } else {
      toast.error('Failed to save changes')
    }
    setSaving(false)
  }, [editDraft, savePrep, toast])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await window.api.deleteFile(prepPath)
      toast.success('Prep deleted')
      onDone()
    } catch {
      toast.error('Failed to delete prep')
    } finally {
      setDeleting(false)
    }
  }, [prepPath, toast, onDone])

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-3 py-4 px-1">
        <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
        <span className="text-sm text-zinc-500">Loading context...</span>
      </div>
    )
  }

  if (phase === 'generating') {
    return (
      <div className="space-y-3 py-4 px-1 animate-shimmer rounded-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-brand" />
            <div className="absolute inset-0 animate-ping">
              <Sparkles className="w-4 h-4 text-brand opacity-30" />
            </div>
          </div>
          <span className="text-sm text-zinc-300">Generating prep notes...</span>
        </div>
        {streaming && streamedText && (
          <div className="text-xs text-zinc-600 max-h-24 overflow-hidden rounded-lg bg-surface-raised/50 p-3 line-clamp-4">
            {streamedText.slice(-200)}
          </div>
        )}
        <button
          onClick={() => { cancel(); onCancel() }}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 py-4 px-1">
      {editing ? (
        <textarea
          value={editDraft}
          onChange={e => setEditDraft(e.target.value)}
          className="w-full min-h-[16rem] bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 font-mono focus:outline-none focus:border-brand/40 transition-colors resize-y"
          autoFocus
        />
      ) : (
        <div className="prose-dark text-sm max-h-64 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{prepContent}</ReactMarkdown>
        </div>
      )}
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <button
              onClick={handleSaveEdit}
              disabled={saving || !editDraft.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Regenerate
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400/70 hover:text-red-400 bg-surface-raised hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
            <button onClick={onCancel} className="ml-auto px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
