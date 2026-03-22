import { useState, useRef, useEffect } from 'react'
import { useAI } from '../../hooks/useAI'
import { useToast } from '../../components/common/Toast'
import { useTeamOverview } from '../../hooks/useData'
import { IMPACT_LOG_PATH } from '../../../shared/constants'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Loader2 } from 'lucide-react'

export function InlineProcessor({
  filename,
  onDone,
  onCancel
}: {
  filename: string
  onDone: () => void
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
    window.api.getFileContent(`meetings/${filename}`)
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
      const titleSlug = filename.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/\.md$/, '').replace(/-/g, ' ')

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
      const titleSlug = filename.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/\.md$/, '').replace(/-/g, ' ')

      if (summary) {
        let summaryToSave = summary
        if (titleSlug) {
          const fmMatch = summaryToSave.match(/^---\n([\s\S]*?)\n---/)
          if (fmMatch) {
            summaryToSave = `---\ntitle: ${titleSlug}\n${fmMatch[1]}\n---` + summaryToSave.slice(fmMatch[0].length)
          } else {
            summaryToSave = `---\ntitle: ${titleSlug}\n---\n\n${summaryToSave}`
          }
        }
        await window.api.commitFile(
          `meetings/${filename}`,
          summaryToSave,
          `Add meeting summary: ${titleSlug} on ${date}`
        )
      }

      if (impact && !impact.includes('No manager impact')) {
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
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Summary</h4>
          <div className="prose-dark text-sm max-h-48 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          </div>
        </div>
      )}
      {actionItems && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Action items</h4>
          <div className="prose-dark text-sm max-h-32 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{actionItems}</ReactMarkdown>
          </div>
        </div>
      )}
      {feedback && !feedback.includes('No feedback') && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Feedback</h4>
          <div className="prose-dark text-sm max-h-32 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{feedback}</ReactMarkdown>
          </div>
        </div>
      )}
      {impact && !impact.includes('No manager impact') && (
        <div>
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Your impact</h4>
          <div className="prose-dark text-sm max-h-32 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{impact}</ReactMarkdown>
          </div>
        </div>
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
