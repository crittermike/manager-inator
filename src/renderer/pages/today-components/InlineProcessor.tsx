import { useState, useRef, useEffect } from 'react'
import { useAI } from '../../hooks/useAI'
import { useToast } from '../../components/common/Toast'
import { useTeamOverview } from '../../hooks/useData'
import { IMPACT_LOG_PATH } from '../../../shared/constants'
import { parseFeedbackByPerson, matchFeedbackToReport } from '../../utils/parseFeedback'
import { format } from 'date-fns'
import { Sparkles, Loader2, Check, ChevronDown, ChevronRight } from 'lucide-react'

const EditableSection = ({
  title,
  content,
  setContent,
  approved,
  setApproved,
  collapsed,
  setCollapsed
}: {
  title: string
  content: string
  setContent: (val: string) => void
  approved: boolean
  setApproved: (val: boolean) => void
  collapsed: boolean
  setCollapsed: (val: boolean) => void
}) => {
  if (!content) return null
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-surface-raised/50">
        <button 
          type="button"
          className="flex items-center gap-2 cursor-pointer select-none text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded-sm transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <h4 className="text-xs font-medium uppercase tracking-wider">{title}</h4>
        </button>
        <label className="text-xs text-zinc-400 cursor-pointer flex items-center gap-1.5">
          <input 
            type="checkbox" 
            className="sr-only peer"
            checked={approved} 
            onChange={(e) => setApproved(e.target.checked)} 
          />
          <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${approved ? 'bg-brand border-brand' : 'border-border bg-surface'} peer-focus-visible:ring-2 peer-focus-visible:ring-brand/50`}>
            {approved && <Check className="w-3 h-3 text-white" />}
          </span>
          Approve
        </label>
      </div>
      {!collapsed && (
        <div className="p-3 border-t border-border bg-surface">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-surface-raised/50 text-zinc-200 border border-border rounded-lg text-sm p-3 focus:border-brand/50 focus:ring-1 focus:ring-brand/20 focus:outline-none min-h-[120px] resize-y"
          />
        </div>
      )}
    </div>
  )
}

export function InlineProcessor({
  filename,
  onDone,
  onProcessed,
  onCancel
}: {
  filename: string
  onDone: () => void
  onProcessed?: () => void
  onCancel: () => void
}) {
  const { streaming, streamedText, generate, cancel, reset } = useAI()
  const toast = useToast()
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []

  const [phase, setPhase] = useState<'loading' | 'processing' | 'review' | 'saving'>('loading')
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [actionItems, setActionItems] = useState('')
  const [feedback, setFeedback] = useState('')
  const [impact, setImpact] = useState('')
  const [processingLabel, setProcessingLabel] = useState('')
  const [approved, setApproved] = useState({
    summary: true,
    actionItems: true,
    feedback: true,
    impact: true
  })
  const [collapsed, setCollapsed] = useState({
    summary: false,
    actionItems: false,
    feedback: false,
    impact: false
  })
  const mountedRef = useRef(true)
  const cancelledRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancel()
    }
  }, [cancel])

  useEffect(() => {
    window.api.getFileContent(`transcripts/raw/${filename}`)
      .then(content => {
        if (mountedRef.current) {
          setTranscript(content)
          setPhase('processing')
        }
      })
      .catch(() => {
        toast.error('Failed to load transcript')
        onCancel()
      })
  }, [filename, onCancel, toast])

  useEffect(() => {
    if (phase !== 'processing' || !transcript) return
    let cancelled = false
    cancelledRef.current = false

    const run = async () => {
      const reportNames = reports.map(r => r.displayName).join(', ')
      const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch?.[1] || format(new Date(), 'yyyy-MM-dd')
      const titleSlug = filename.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/\.(md|txt)$/i, '').replace(/-/g, ' ')

      setProcessingLabel('Generating summary...')
      try {
        const s = await generate('summarize-meeting', {
          meetingTitle: titleSlug,
          date,
          reportNames,
          transcript
        })
        if (cancelled || !mountedRef.current) return
        setSummary(s)
      } catch {
        if (cancelled || !mountedRef.current) return
      }

      setProcessingLabel('Extracting action items...')
      reset()
      try {
        const a = await generate('extract-action-items', {
          reportName: reportNames,
          transcript
        })
        if (cancelled || !mountedRef.current) return
        setActionItems(a)
      } catch {
        if (cancelled || !mountedRef.current) return
      }

      setProcessingLabel('Extracting feedback...')
      reset()
      try {
        const f = await generate('extract-feedback', {
          reportNames,
          transcript
        })
        if (cancelled || !mountedRef.current) return
        setFeedback(f)
      } catch {
        if (cancelled || !mountedRef.current) return
      }

      setProcessingLabel('Extracting impact...')
      reset()
      try {
        const imp = await generate('extract-impact', {
          transcript
        })
        if (cancelled || !mountedRef.current) return
        setImpact(imp)
      } catch {
        if (cancelled || !mountedRef.current) return
      }

      if (mountedRef.current && !cancelled) {
        setPhase('review')
      }
    }

    run()
    return () => { cancelled = true; cancelledRef.current = true }
  }, [phase, transcript, filename, reports, generate, reset])

  const handleSave = async () => {
    setPhase('saving')
    try {
      const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch?.[1] || format(new Date(), 'yyyy-MM-dd')
      const rawStem = filename.replace(/\.(txt|md)$/i, '')
      const derivedStem = rawStem.replace(/^\d{4}-\d{2}-\d{2}-?/, '')
      const normalizedSlug = (derivedStem || 'meeting')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'meeting'
      const summaryFilename = `${date}-${normalizedSlug}`
      const titleSlug = normalizedSlug.replace(/-/g, ' ')

      let meetingContent = ''
      let shouldSaveMeeting = false

      if (approved.summary && summary) {
        meetingContent = summary
        shouldSaveMeeting = true
      }

      if (shouldSaveMeeting || (approved.actionItems && actionItems)) {
        if (!shouldSaveMeeting) {
          meetingContent = `---\ntitle: ${titleSlug}\n---\n`
        } else {
          const fmMatch = meetingContent.match(/^---\n([\s\S]*?)\n---/)
          if (fmMatch) {
            meetingContent = `---\ntitle: ${titleSlug}\n${fmMatch[1]}\n---` + meetingContent.slice(fmMatch[0].length)
          } else {
            meetingContent = `---\ntitle: ${titleSlug}\n---\n\n${meetingContent}`
          }
        }

        if (approved.actionItems && actionItems) {
          meetingContent += `\n\n## Action Items\n\n${actionItems}`
        }

        await window.api.commitFile(
          `meetings/${summaryFilename}.md`,
          meetingContent,
          `Process meeting notes: ${titleSlug} on ${date}`
        )
      }

      await window.api.commitFile(
        `transcripts/processed/${filename}`,
        transcript,
        `Archive raw transcript: ${titleSlug} on ${date}`
      )
      await window.api.deleteFile(`transcripts/raw/${filename}`)
      onProcessed?.()

      if (approved.feedback && feedback && !feedback.includes('No feedback')) {
        const parsed = parseFeedbackByPerson(feedback)
        if (parsed.length === 0) {
          toast.error('Skipped feedback: could not parse per-person entries')
        } else {
          for (const entry of parsed) {
            const report = matchFeedbackToReport(entry, reports)
            if (!report) continue

            const feedbackLogPath = `reports/${report.name}/feedback/log.md`
            const formattedEntry = `### ${date}\n**Type:** ${entry.type}\n**Source:** ${titleSlug}\n\n${entry.content}\n`

            let currentLog = ''
            try {
              currentLog = await window.api.getFileContent(feedbackLogPath)
            } catch (e) {}

            const updated = currentLog ? `${formattedEntry}\n---\n\n${currentLog}` : formattedEntry
            await window.api.commitFile(
              feedbackLogPath,
              updated,
              `Add ${entry.type} feedback for ${report.displayName} from ${titleSlug}`
            )
          }
        }
      }

      if (approved.impact && impact && !impact.includes('No manager impact')) {
        try {
          const currentLog = await window.api.getImpactLog()
          const entry = `\n\n### ${date} — ${titleSlug}\n\n${impact}`
          await window.api.commitFile(
            IMPACT_LOG_PATH,
            currentLog + entry,
            `Add impact items from ${titleSlug} on ${date}`
          )
        } catch {
          // impact log save is best-effort
        }
      }

      toast.success('Meeting processed and saved')
      onDone()
    } catch (e) {
      toast.error('Failed to save: ' + (e instanceof Error ? e.message : 'Unknown error'))
      setPhase('review')
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-3 py-4 px-1">
        <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
        <span className="text-sm text-zinc-500">Loading transcript...</span>
      </div>
    )
  }

  if (phase === 'processing') {
    return (
      <div className="space-y-3 py-4 px-1 animate-shimmer rounded-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-brand" />
            <div className="absolute inset-0 animate-ping">
              <Sparkles className="w-4 h-4 text-brand opacity-30" />
            </div>
          </div>
          <span className="text-sm text-zinc-300">{processingLabel}</span>
        </div>
        {streaming && streamedText && (
          <div className="text-xs text-zinc-600 max-h-24 overflow-hidden rounded-lg bg-surface-raised/50 p-3 line-clamp-4">
            {streamedText.slice(-200)}
          </div>
        )}
        <button
          onClick={() => { cancelledRef.current = true; cancel(); onCancel() }}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (phase === 'saving') {
    return (
      <div className="flex items-center gap-3 py-4 px-1">
        <Loader2 className="w-4 h-4 text-brand animate-spin" />
        <span className="text-sm text-zinc-400">Saving...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-4 px-1">
      {summary && (
        <EditableSection
          title="Summary"
          content={summary}
          setContent={setSummary}
          approved={approved.summary}
          setApproved={(val) => setApproved(prev => ({ ...prev, summary: val }))}
          collapsed={collapsed.summary}
          setCollapsed={(val) => setCollapsed(prev => ({ ...prev, summary: val }))}
        />
      )}
      {actionItems && (
        <EditableSection
          title="Action items"
          content={actionItems}
          setContent={setActionItems}
          approved={approved.actionItems}
          setApproved={(val) => setApproved(prev => ({ ...prev, actionItems: val }))}
          collapsed={collapsed.actionItems}
          setCollapsed={(val) => setCollapsed(prev => ({ ...prev, actionItems: val }))}
        />
      )}
      {feedback && !feedback.includes('No feedback') && (
        <EditableSection
          title="Feedback"
          content={feedback}
          setContent={setFeedback}
          approved={approved.feedback}
          setApproved={(val) => setApproved(prev => ({ ...prev, feedback: val }))}
          collapsed={collapsed.feedback}
          setCollapsed={(val) => setCollapsed(prev => ({ ...prev, feedback: val }))}
        />
      )}
      {impact && !impact.includes('No manager impact') && (
        <EditableSection
          title="Your impact"
          content={impact}
          setContent={setImpact}
          approved={approved.impact}
          setApproved={(val) => setApproved(prev => ({ ...prev, impact: val }))}
          collapsed={collapsed.impact}
          setCollapsed={(val) => setCollapsed(prev => ({ ...prev, impact: val }))}
        />
      )}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-colors"
        >
          Approve & save
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
