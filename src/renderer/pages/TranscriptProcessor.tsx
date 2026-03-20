import { useState } from 'react'
import { useReportProfiles } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText,
  Upload,
  Sparkles,
  Check,
  X,
  Save,
  ChevronDown
} from 'lucide-react'

export function TranscriptProcessor() {
  const { profiles } = useReportProfiles()
  const { streaming, streamedText, generate, cancel, reset } = useAI()
  const [transcript, setTranscript] = useState('')
  const [selectedReport, setSelectedReport] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [step, setStep] = useState<'input' | 'processing' | 'review'>('input')
  const [summaryResult, setSummaryResult] = useState('')
  const [actionItemsResult, setActionItemsResult] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleProcess = async () => {
    if (!transcript.trim() || !selectedReport || !date) return

    setStep('processing')
    reset()

    // Step 1: Summarize
    const summary = await generate('summarize-transcript', {
      reportName: profiles.find(p => p.name === selectedReport)?.displayName || selectedReport,
      date,
      transcript
    })
    setSummaryResult(summary)

    // Step 2: Extract action items
    reset()
    const actions = await generate('extract-action-items', {
      reportName: profiles.find(p => p.name === selectedReport)?.displayName || selectedReport,
      transcript
    })
    setActionItemsResult(actions)

    setStep('review')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save transcript
      await window.api.commitFile(
        `reports/${selectedReport}/transcripts/${date}.md`,
        transcript,
        `Add 1:1 transcript for ${selectedReport} on ${date}`
      )

      // Save summary
      if (summaryResult) {
        await window.api.commitFile(
          `reports/${selectedReport}/summaries/${date}.md`,
          summaryResult,
          `Add 1:1 summary for ${selectedReport} on ${date}`
        )
      }

      setSaved(true)
    } catch (e) {
      console.error('Failed to save:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setTranscript('')
    setSelectedReport('')
    setDate(new Date().toISOString().split('T')[0])
    setStep('input')
    setSummaryResult('')
    setActionItemsResult('')
    setSaved(false)
    reset()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Process transcript</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste a 1:1 transcript to get an AI summary and action items
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
                {isDone ? <Check className="w-3 h-3" /> : i + 1}
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
                Direct report
              </label>
              <div className="relative">
                <select
                  value={selectedReport}
                  onChange={(e) => setSelectedReport(e.target.value)}
                  className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="">Select a report...</option>
                  {profiles.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              </div>
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
            disabled={!transcript.trim() || !selectedReport || !date}
            className="flex items-center gap-2 px-5 py-3 bg-brand text-white rounded-xl font-medium text-sm hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
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
                <Sparkles className="w-4 h-4 animate-pulse" />
                {summaryResult ? 'Extracting action items...' : 'Generating summary...'}
              </div>
              <button
                onClick={cancel}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
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
              <Check className="w-8 h-8 text-success mx-auto mb-2" />
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
              {/* Summary */}
              <div className="bg-surface rounded-xl border border-border p-5">
                <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
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
                    <Check className="w-4 h-4" />
                    Action items
                  </h3>
                  <div className="prose-dark">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {actionItemsResult}
                    </ReactMarkdown>
                  </div>
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
                    <Save className="w-4 h-4" />
                  )}
                  Save to repo
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-3 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
                >
                  <X className="w-4 h-4" />
                  Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
