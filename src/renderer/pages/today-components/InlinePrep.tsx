import { useState, useRef, useEffect, useCallback } from 'react'
import { useAI } from '../../hooks/useAI'
import { useToast } from '../../components/common/Toast'
import { format } from 'date-fns'
import type { Report } from '../../../shared/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Loader2, Save, RotateCcw } from 'lucide-react'

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

  const [phase, setPhase] = useState<'loading' | 'generating' | 'review'>('loading')
  const [reportData, setReportData] = useState<Report | null>(null)
  const [prepContent, setPrepContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [existingPrep, setExistingPrep] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; cancel() }
  }, [cancel])

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const prepPath = `reports/${reportName}/prep/${today}.md`

    Promise.all([
      window.api.getReportData(reportName),
      window.api.getFileContent(prepPath).catch(() => null)
    ]).then(([data, existing]) => {
      if (!mountedRef.current) return
      setReportData(data)
      if (existing) {
        setPrepContent(existing)
        setExistingPrep(true)
        setPhase('review')
      }
    }).catch(() => {
      toast.error('Failed to load report data')
      onCancel()
    })
  }, [reportName, onCancel, toast])

  const doGenerate = useCallback(async (data: Report) => {
    if (generatingRef.current) return
    generatingRef.current = true
    setPhase('generating')
    reset()

    const openActions = data.actionItems.filter(a => !a.completed)
    const recentSummaryDates = data.summaries.slice(-5)
    const summaryContents = await Promise.all(
      recentSummaryDates.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${reportName}-1-1.md`)
          return content
        } catch { return '' }
      })
    )
    const summariesText = summaryContents.filter(Boolean).join('\n\n---\n\n')
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
      const mentionResults = await Promise.all(
        otherMeetings.map(async (m) => {
          try {
            const content = await window.api.getFileContent(`meetings/${m.filename}`)
            if (namePattern.test(content)) {
              return `### ${m.title} (${m.date})\n${content}`
            }
          } catch { /* skip */ }
          return ''
        })
      )
      crossMentions = mentionResults.filter(Boolean).slice(0, 5).join('\n\n---\n\n')
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
        setPrepContent(result || fullTextRef.current)
        setPhase('review')
      }
    } catch {
      if (mountedRef.current) {
        setPrepContent(fullTextRef.current || '_Failed to generate prep._')
        setPhase('review')
      }
    } finally {
      generatingRef.current = false
    }
  }, [reportName, generate, reset, fullTextRef, cancel])

  useEffect(() => {
    if (reportData && !existingPrep && phase === 'loading') {
      doGenerate(reportData)
    }
  }, [reportData, existingPrep, phase, doGenerate])

  const handleRegenerate = useCallback(() => {
    if (!reportData) return
    setExistingPrep(false)
    setPrepContent('')
    generatingRef.current = false
    doGenerate(reportData)
  }, [reportData, doGenerate])

  const handleSave = useCallback(async () => {
    if (!prepContent) return
    setSaving(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    try {
      await window.api.commitFile(
        `reports/${reportName}/prep/${today}.md`,
        prepContent,
        `Save 1:1 prep for ${reportData?.profile.displayName ?? reportName} on ${today}`
      )
      toast.success('Prep saved')
      onDone()
    } catch {
      toast.error('Failed to save prep')
    } finally {
      setSaving(false)
    }
  }, [prepContent, reportName, reportData, toast, onDone])

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
    <div className="space-y-4 py-4 px-1">
      {existingPrep && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Prep already generated today</span>
        </div>
      )}
      <div className="prose-dark text-sm max-h-64 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{prepContent}</ReactMarkdown>
      </div>
      <div className="flex items-center gap-2 pt-2">
        {!existingPrep && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save prep'}
          </button>
        )}
        <button
          onClick={handleRegenerate}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Regenerate
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          {existingPrep ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
