import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Sparkles, X, Loader2, Check } from 'lucide-react'
import { useAI } from '../../hooks/useAI'
import { useToast } from './Toast'
import { lineDiff, hasChanges } from '../../utils/lineDiff'

export interface RefineWithAIProps {
  /** Repo-relative path of the file to write back to (passed to commitFile). */
  filePath: string
  /** Current full markdown content of the file. */
  currentContent: string
  /** Used in the system prompt and commit message (e.g. "context", "check-in", "review", "profile"). */
  documentType?: string
  /** Called with the new content after a successful save. Parents should refresh local state. */
  onSaved: (newContent: string) => void
  /** Optional override to handle saving (e.g. when refining a section, not the whole file). If provided, commitFile is NOT called automatically. */
  onSaveOverride?: (newContent: string) => Promise<void>
  /** Optional override for the commit message prefix. */
  commitMessagePrefix?: string
  /** Optional className for the trigger button (allows positioning tweaks). */
  className?: string
  /** Optional title to show in the modal header. */
  modalTitle?: string
  /** Disable the trigger button. */
  disabled?: boolean
}

/**
 * Reusable "Refine with AI" trigger + modal flow. Renders a small icon button
 * that opens a modal where the user types a natural-language instruction,
 * the AI rewrites the document, and the user reviews a diff before saving.
 */
export function RefineWithAI({
  filePath,
  currentContent,
  documentType = 'document',
  onSaved,
  onSaveOverride,
  commitMessagePrefix = 'Refine via AI',
  className = '',
  modalTitle = 'Refine with AI',
  disabled = false,
}: RefineWithAIProps) {
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [generated, setGenerated] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const ai = useAI()
  const { success, error: showError } = useToast()

  const dialogRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const closeModal = useCallback(() => {
    if (saving) return
    if (ai.streaming) {
      ai.cancel().catch(() => undefined)
    }
    setOpen(false)
    setInstruction('')
    setGenerated(null)
    ai.reset()
  }, [ai, saving])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleKeyDown)
    setTimeout(() => textareaRef.current?.focus(), 0)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, closeModal])

  const handleGenerate = useCallback(async () => {
    if (!instruction.trim() || ai.streaming) return
    setGenerated(null)
    try {
      const result = await ai.generate('refine-document', {
        currentContent,
        instruction: instruction.trim(),
        documentType,
      })
      const cleaned = stripCodeFence(result)
      setGenerated(cleaned)
    } catch (err) {
      console.error('Refine generation failed:', err)
      showError('Failed to generate refinement')
    }
  }, [ai, currentContent, documentType, instruction, showError])

  const handleAccept = useCallback(async () => {
    if (!generated || saving) return
    setSaving(true)
    try {
      if (onSaveOverride) {
        await onSaveOverride(generated)
      } else {
        const trimmedInstruction = instruction.trim().slice(0, 80)
        const message = `${commitMessagePrefix}: ${trimmedInstruction}`
        await window.api.commitFile(filePath, generated, message)
      }
      onSaved(generated)
      success('Refinement applied')
      setOpen(false)
      setInstruction('')
      setGenerated(null)
    } catch (err) {
      console.error('Refine save failed:', err)
      showError('Failed to save refinement')
    } finally {
      setSaving(false)
    }
  }, [generated, saving, instruction, commitMessagePrefix, filePath, onSaved, onSaveOverride, success, showError])

  const handleRetry = useCallback(() => {
    setGenerated(null)
    ai.reset()
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [ai])

  const diff = useMemo(() => {
    if (generated == null) return null
    return lineDiff(currentContent, generated)
  }, [currentContent, generated])

  const noChanges = generated != null && !hasChanges(currentContent, generated)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`p-1.5 text-zinc-500 hover:text-brand hover:bg-brand/10 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none ${className}`}
        title="Refine with AI"
        aria-label="Refine with AI"
      >
        <Sparkles className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={closeModal}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-surface border border-border rounded-2xl shadow-2xl m-4 animate-scale-in"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="refine-title"
          >
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-brand/10 text-brand">
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                </div>
                <h2 id="refine-title" className="text-lg font-semibold text-zinc-100">
                  {modalTitle}
                </h2>
              </div>
              <button
                onClick={closeModal}
                disabled={saving}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -m-1 rounded-lg hover:bg-white/5 disabled:opacity-40"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {!generated && !ai.streaming && (
              <div className="p-5 space-y-4">
                <p className="text-sm text-zinc-400">
                  Describe what you want to change. The AI will rewrite the {documentType} and you can review the diff before saving.
                </p>
                <textarea
                  ref={textareaRef}
                  value={instruction}
                  onChange={e => setInstruction(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleGenerate()
                    }
                  }}
                  placeholder="e.g. The section on the security incident isn't accurate. What actually happened was Tara found the issue first, then escalated to Steve."
                  className="w-full min-h-[140px] bg-bg border border-border rounded-lg p-3 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y"
                />
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={!instruction.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Generate
                  </button>
                </div>
              </div>
            )}

            {ai.streaming && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-brand" aria-hidden="true" />
                <span className="text-sm">Refining…</span>
                <button
                  onClick={() => ai.cancel()}
                  className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 underline"
                >
                  Cancel
                </button>
              </div>
            )}

            {generated && !ai.streaming && (
              <>
                <div className="px-5 pt-4 pb-2 text-xs text-zinc-400 flex items-center justify-between">
                  <span>Instruction: <span className="text-zinc-300">{instruction}</span></span>
                  <button
                    onClick={handleRetry}
                    className="text-zinc-500 hover:text-zinc-300 underline"
                  >
                    Edit instruction
                  </button>
                </div>
                <div className="flex-1 overflow-auto px-5 py-3 border-y border-border bg-bg/40">
                  {noChanges ? (
                    <div className="text-sm text-zinc-400 italic py-4">
                      No changes were made to the document.
                    </div>
                  ) : (
                    <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
                      {diff!.map((line, idx) => {
                        const cls =
                          line.op === 'add'
                            ? 'bg-success/15 text-success-foreground'
                            : line.op === 'remove'
                              ? 'bg-danger/15 text-danger line-through opacity-80'
                              : 'text-zinc-500'
                        const prefix = line.op === 'add' ? '+ ' : line.op === 'remove' ? '- ' : '  '
                        return (
                          <div key={idx} className={`px-2 ${cls}`}>
                            {prefix}
                            {line.text || '\u00A0'}
                          </div>
                        )
                      })}
                    </pre>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3 p-5">
                  <button
                    onClick={handleRetry}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors disabled:opacity-40"
                  >
                    Try again
                  </button>
                  <button
                    onClick={closeModal}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors disabled:opacity-40"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={saving || noChanges}
                    className="px-4 py-2 text-sm font-medium text-white bg-brand hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" aria-hidden="true" />
                        Accept &amp; save
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** Strip a wrapping ```...``` fence if the AI returned one despite instructions. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:[a-zA-Z]+)?\n([\s\S]*?)\n```$/)
  if (fenceMatch) return fenceMatch[1]
  return text
}
