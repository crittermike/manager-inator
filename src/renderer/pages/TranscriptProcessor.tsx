import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeamOverview } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import { useToast } from '../components/common/Toast'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { IMPACT_LOG_PATH } from '../../shared/constants'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText,
  Sparkles,
  Check,
  X,
  Save,
  Star,
  Trophy
} from 'lucide-react'

export function TranscriptProcessor() {
  const navigate = useNavigate()
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []
  const { streaming, streamedText, generate, cancel, reset } = useAI()
  const toast = useToast()
  const [transcript, setTranscript] = useState('')
  const [meetingTitle, setMeetingTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [step, setStep] = useState<'input' | 'processing' | 'review'>('input')
  const [summaryResult, setSummaryResult] = useState('')
  const [actionItemsResult, setActionItemsResult] = useState('')
  const [feedbackResult, setFeedbackResult] = useState('')
  const [impactResult, setImpactResult] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const { blockerState, proceed, reset: resetBlocker } = useUnsavedChanges(step === 'review' && !saved)
  const mountedRef = useRef(true)
  const cancelledRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancel()
    }
  }, [cancel])

  const handleProcess = async () => {
    if (!transcript.trim() || !date) return

    setStep('processing')
    reset()
    cancelledRef.current = false

    const reportNames = reports.map(r => r.displayName).join(', ')

    // Step 1: Summarize (includes speakers in YAML frontmatter)
    setProcessingStep('Generating summary (1/4)...')
    try {
      const summary = await generate('summarize-meeting', {
        meetingTitle: meetingTitle || 'Meeting',
        date,
        reportNames,
        transcript
      })
      if (!mountedRef.current || cancelledRef.current) return
      setSummaryResult(summary)
    } catch (e) {
      if (!mountedRef.current || cancelledRef.current) return
      console.error('Summary generation failed:', e)
      toast.error('Summary generation failed — continuing with remaining steps')
    }

    // Step 2: Extract action items
    if (!mountedRef.current || cancelledRef.current) return
    setProcessingStep('Extracting action items (2/4)...')
    reset()
    try {
      const actions = await generate('extract-action-items', {
        reportName: reportNames,
        transcript
      })
      if (!mountedRef.current || cancelledRef.current) return
      setActionItemsResult(actions)
    } catch (e) {
      if (!mountedRef.current || cancelledRef.current) return
      console.error('Action item extraction failed:', e)
      toast.error('Action item extraction failed — continuing')
    }

    // Step 3: Extract feedback for direct reports
    if (!mountedRef.current || cancelledRef.current) return
    setProcessingStep('Extracting feedback (3/4)...')
    reset()
    try {
      const feedback = await generate('extract-feedback', {
        reportNames,
        transcript
      })
      if (!mountedRef.current || cancelledRef.current) return
      setFeedbackResult(feedback)
    } catch (e) {
      if (!mountedRef.current || cancelledRef.current) return
      console.error('Feedback extraction failed:', e)
      toast.error('Feedback extraction failed — continuing')
    }

    // Step 4: Extract manager impact
    if (!mountedRef.current || cancelledRef.current) return
    setProcessingStep('Extracting your impact (4/4)...')
    reset()
    try {
      const impact = await generate('extract-impact', {
        transcript
      })
      if (!mountedRef.current || cancelledRef.current) return
      setImpactResult(impact)
    } catch (e) {
      if (!mountedRef.current || cancelledRef.current) return
      console.error('Impact extraction failed:', e)
      toast.error('Impact extraction failed')
    }

    if (mountedRef.current && !cancelledRef.current) {
      setStep('review')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const slug = meetingTitle
        ? meetingTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
        : 'meeting'
      let filename = `${date}-${slug}`

      // Check for collision — try reading existing transcript file
      let exists = false
      try {
        await window.api.getFileContent(`meetings/${filename}.md`)
        exists = true
      } catch { /* file doesn't exist — proceed */ }

      if (exists) {
        // Auto-suffix with incrementing number
        let n = 2
        while (true) {
          try {
            await window.api.getFileContent(`meetings/${filename}-${n}.md`)
            n++
          } catch { break }
        }
        filename = `${filename}-${n}`
      }

      // Save transcript
      await window.api.commitFile(
        `meetings/${filename}.md`,
        `# ${meetingTitle || 'Meeting'} — ${date}\n\n${transcript}`,
        `Add meeting transcript: ${meetingTitle || 'meeting'} on ${date}`
      )

      // Save summary (includes speakers in YAML frontmatter, add title)
      if (summaryResult) {
        let summaryToSave = summaryResult
        // Inject title into frontmatter if it exists
        if (meetingTitle) {
          const fmMatch = summaryToSave.match(/^---\n([\s\S]*?)\n---/)
          if (fmMatch) {
            summaryToSave = `---\ntitle: ${meetingTitle}\n${fmMatch[1]}\n---` + summaryToSave.slice(fmMatch[0].length)
          } else {
            summaryToSave = `---\ntitle: ${meetingTitle}\n---\n\n${summaryToSave}`
          }
        }
        await window.api.commitFile(
          `meetings/${filename}-summary.md`,
          summaryToSave,
          `Add meeting summary: ${meetingTitle || 'meeting'} on ${date}`
        )
      }

      // Append impact items to impact log
      if (impactResult && !impactResult.includes('No manager impact')) {
        try {
          const currentLog = await window.api.getImpactLog()
          const entry = `\n\n### ${date} — ${meetingTitle || 'Meeting'}\n\n${impactResult}`
          await window.api.commitFile(
            IMPACT_LOG_PATH,
            currentLog + entry,
            `Add impact items from ${meetingTitle || 'meeting'} on ${date}`
          )
        } catch (e) {
          console.error('Failed to save impact:', e)
          toast.error('Failed to save impact log entry')
        }
      }

      setSaved(true)
      toast.success('Meeting saved successfully')
      navigate(`/meetings/${filename}`)
    } catch (e) {
      console.error('Failed to save:', e)
      toast.error('Failed to save meeting')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setTranscript('')
    setMeetingTitle('')
    setDate(new Date().toISOString().split('T')[0])
    setStep('input')
    setSummaryResult('')
    setActionItemsResult('')
    setFeedbackResult('')
    setImpactResult('')
    setSaved(false)
    reset()
  }

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Process transcript</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste any meeting transcript to get a summary, action items, and feedback for your reports
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {['Paste transcript', 'AI processing', 'Review and save'].map((label, i) => {
          const stepIndex = ['input', 'processing', 'review'].indexOf(step)
          const isActive = i === stepIndex
          const isDone = i < stepIndex

          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isDone
                    ? 'bg-success text-white'
                    : isActive
                    ? 'bg-brand text-white'
                    : 'bg-surface-raised text-zinc-500'
                }`}
              >
                {isDone ? <Check className="w-3 h-3" aria-hidden="true" /> : i + 1}
              </div>
              <span
                className={`text-sm ${
                  isActive ? 'text-zinc-200 font-medium' : 'text-zinc-500'
                }`}
              >
                {label}
              </span>
              {i < 2 && (
                <div className="w-12 h-px bg-border mx-1" />
              )}
            </div>
          )
        })}
      </div>

      {/* Input step */}
      {step === 'input' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Meeting title
              </label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="e.g. 1:1 with Tara, Team standup, Sprint retro..."
                className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Meeting date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Transcript
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your 1:1 transcript here..."
              rows={16}
              className="w-full px-4 py-3 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors resize-none font-mono"
            />
          </div>

          <button
            onClick={handleProcess}
            disabled={!transcript.trim() || !date}
            className="flex items-center gap-2 px-5 py-3 bg-brand text-white rounded-xl font-medium text-sm hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Process with AI
          </button>
        </div>
      )}

      {/* Processing step */}
      {step === 'processing' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-brand/20 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
                <Sparkles className="w-4 h-4 animate-pulse" aria-hidden="true" />
                {processingStep}
              </div>
              <button
                onClick={() => { cancelledRef.current = true; cancel(); setStep('input'); setProcessingStep('') }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
            <div className="sr-only" aria-live="polite">
              {streaming ? processingStep : ''}
            </div>
            {/* Progress bar */}
            <div className="w-full h-1 bg-surface-raised rounded-full mb-3 overflow-hidden">
              <div
                className="h-full bg-brand rounded-full transition-all duration-500"
                style={{ width: processingStep.includes('1/4') ? '25%' : processingStep.includes('2/4') ? '50%' : processingStep.includes('3/4') ? '75%' : '95%' }}
              />
            </div>
            <div className={`prose-dark max-h-96 overflow-y-auto ${streaming ? 'cursor-blink' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {streamedText || '_Processing..._'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Review step */}
      {step === 'review' && (
        <div className="space-y-6">
          {saved ? (
            <div className="bg-success/10 border border-success/20 rounded-xl p-6 text-center">
              <Check className="w-8 h-8 text-success mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-success font-medium">Saved and committed to repo</p>
              <button
                onClick={handleReset}
                className="mt-4 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Process another transcript
              </button>
            </div>
          ) : (
            <>
              {/* Meeting title (editable before save) */}
              <div className="bg-surface rounded-xl border border-border p-5">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Meeting title
                </label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="e.g. Nic 1-1, Team standup..."
                  className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
                />
                <p className="text-xs text-zinc-600 mt-1">This title will be saved in the meeting metadata.</p>
              </div>

              {/* Summary */}
              <div className="bg-surface rounded-xl border border-border p-5">
                <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                   Summary
                </h3>
                <div className="prose-dark max-h-80 overflow-y-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {summaryResult}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Action items */}
              {actionItemsResult && (
                <div className="bg-surface rounded-xl border border-border p-5">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                    <Check className="w-4 h-4" aria-hidden="true" />
                     Action items
                  </h3>
                  <div className="prose-dark">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {actionItemsResult}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Feedback for reports */}
              {feedbackResult && (
                <div className="bg-surface rounded-xl border border-border p-5">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4" aria-hidden="true" />
                     Feedback for direct reports
                  </h3>
                  <div className="prose-dark">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {feedbackResult}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Manager impact */}
              {impactResult && !impactResult.includes('No manager impact') && (
                <div className="bg-surface rounded-xl border border-brand/20 p-5">
                  <h3 className="text-sm font-medium text-brand-light mb-3 flex items-center gap-2">
                    <Trophy className="w-4 h-4" aria-hidden="true" />
                     Your impact
                  </h3>
                  <div className="prose-dark">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {impactResult}
                    </ReactMarkdown>
                  </div>
                  <p className="text-xs text-zinc-600 mt-3">Will be appended to your impact log on save.</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-3 bg-brand text-white rounded-xl font-medium text-sm hover:bg-brand-dark transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" aria-hidden="true" />
                   )}
                  Save to repo
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-3 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                   Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
      <ConfirmDialog
        open={blockerState === 'blocked'}
        title="Unsaved changes"
        message="You have unreviewed AI results that haven't been saved. Leave anyway?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={proceed}
        onCancel={resetBlocker}
      />
    </>
  )
}
