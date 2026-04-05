import { useState, useCallback, useEffect } from 'react'
import { useToast } from '../../components/common/Toast'
import { useAI } from '../../hooks/useAI'
import { format } from 'date-fns'
import { Sparkles, Loader2 } from 'lucide-react'

type FeedbackType = 'positive' | 'constructive' | 'mixed'

const typeLabels: Record<FeedbackType, { label: string, color: string }> = {
  positive: { label: 'Positive', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  constructive: { label: 'Constructive', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  mixed: { label: 'Mixed', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
}

export function InlineFeedback({
  reportName,
  displayName,
  onDone,
  onCancel,
}: {
  reportName: string
  displayName: string
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const { streaming, generate, cancel } = useAI()
  const [draft, setDraft] = useState('')
  const [type, setType] = useState<FeedbackType>('positive')
  const [saving, setSaving] = useState(false)
  const [rewriting, setRewriting] = useState(false)

  const handleRewrite = useCallback(async () => {
    if (!draft.trim()) return
    setRewriting(true)
    try {
      const result = await generate('rewrite-feedback', { feedback: draft, feedbackType: type })
      if (result) setDraft(result)
    } catch (e) {
      console.error('AI rewrite failed:', e)
      toast.error('AI rewrite failed')
    } finally {
      setRewriting(false)
    }
  }, [draft, type, generate, toast])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (streaming) cancel()
        onCancel()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel, streaming, cancel])

  const handleSave = useCallback(async () => {
    if (!draft.trim()) return
    setSaving(true)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const feedbackLogPath = `reports/${reportName}/feedback/log.md`
      let existing = ''
      try {
        existing = await window.api.getFileContent(feedbackLogPath)
      } catch (e) { console.debug('Feedback log file may not exist:', e) }
      const entry = `### ${today}\n**Type:** ${type}\n\n${draft.trim()}\n`
      const updated = existing ? `${entry}\n---\n\n${existing}` : entry
      await window.api.commitFile(
        feedbackLogPath,
        updated,
        `Add ${type} feedback for ${displayName}`
      )
      toast.success(`Feedback saved for ${displayName}`)
      onDone()
    } catch (e) {
      console.error('Failed to save feedback:', e)
      toast.error('Failed to save feedback')
    } finally {
      setSaving(false)
    }
  }, [reportName, displayName, draft, type, toast, onDone])

  return (
    <div className="space-y-3 py-3 px-1">
      <div className="flex items-center gap-2">
        {(Object.keys(typeLabels) as FeedbackType[]).map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              type === t
                ? typeLabels[t].color
                : 'bg-surface-raised text-zinc-500 border-border hover:text-zinc-300'
            }`}
          >
            {typeLabels[t].label}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() } }}
        placeholder={`What did you observe about ${displayName}?`}
        className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand/50 focus:ring-1 focus:ring-brand/20 outline-none transition-colors resize-none"
        rows={3}
      />
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleRewrite}
          disabled={rewriting || streaming || !draft.trim()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {rewriting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
          {rewriting ? 'Rewriting…' : 'AI rewrite'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !draft.trim()}
          className="px-3 py-1.5 text-xs font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save feedback'}
        </button>
      </div>
    </div>
  )
}
