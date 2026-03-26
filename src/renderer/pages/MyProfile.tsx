import { useState, useEffect, useCallback, useRef } from 'react'
import { useAI } from '../hooks/useAI'
import { useToast } from '../components/common/Toast'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { IMPACT_LOG_PATH } from '../../shared/constants'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import {
  UserCircle,
  Plus,
  Save,
  RefreshCw,
  Sparkles,
  X,
  Edit3
} from 'lucide-react'

export function MyProfile() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [newEntry, setNewEntry] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const { streaming, streamedText, generate, cancel, reset } = useAI()
  const [showAI, setShowAI] = useState(false)
  const toast = useToast()
  const { blockerState, proceed, reset: resetBlocker } = useUnsavedChanges(editing)
  const saveRef = useRef<() => void>(() => {})

  useEffect(() => {
    return () => { cancel() }
  }, [cancel])

  useKeyboardShortcut({ key: 's', handler: useCallback(() => saveRef.current(), []), enabled: editing })

  const loadLog = async () => {
    setLoading(true)
    try {
      const data = await window.api.getImpactLog()
      setContent(data)
    } catch {
      setContent('# Impact log\n\n_No entries yet._')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLog() }, [])

  const handleAddEntry = async () => {
    if (!newEntry.trim()) return
    setSaving(true)

    const date = new Date().toISOString().split('T')[0]
    const entry = `### ${date}\n\n${newEntry.trim()}`

    // Insert after the first heading so newest entries appear at the top
    const headingMatch = content.match(/^(#[^\n]*\n(?:\s*\n)*)/)
    const updated = headingMatch
      ? headingMatch[0] + entry + '\n\n' + content.slice(headingMatch[0].length)
      : entry + '\n\n' + content

    try {
      await window.api.commitFile(
        IMPACT_LOG_PATH,
        updated,
        `Add impact log entry for ${date}`
      )
      setContent(updated)
      setNewEntry('')
      setShowAdd(false)
      toast.success('Entry saved')
    } catch (e) {
      console.error('Failed to save:', e)
      toast.error('Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    setSaving(true)
    try {
      await window.api.commitFile(
        IMPACT_LOG_PATH,
        editContent,
        'Update impact log'
      )
      setContent(editContent)
      setEditing(false)
      toast.success('Impact log updated')
    } catch (e) {
      console.error('Failed to save:', e)
      toast.error('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }
  saveRef.current = handleSaveEdit

  const handleAISummarize = async () => {
    setShowAI(true)
    reset()
    await generate('chat', {
      message: `Here is my impact log as an engineering manager. Summarize the key themes of my impact this quarter. Group by category (technical leadership, people management, org impact, process improvement). Be specific and cite entries.\n\n${content}`,
      history: []
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <UserCircle className="w-6 h-6 text-brand" aria-hidden="true" />
            My Profile
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Your profile and impact as a manager
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadLog}
            disabled={streaming}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Refresh impact log"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={handleAISummarize}
            disabled={streaming}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Summarize
          </button>
          <button
            onClick={() => { setEditing(!editing); setEditContent(content) }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add entry
          </button>
        </div>
      </div>

      {/* AI summary panel */}
      {showAI && (
        <div className="bg-surface rounded-xl border border-brand/20 p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Impact summary
            </div>
            <div className="flex items-center gap-2">
              {streaming && (
                <button onClick={cancel} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  Stop generating
                </button>
              )}
              <button onClick={() => { if (streaming) cancel(); setShowAI(false) }} aria-label="Close summary" className="p-1 text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className={`prose-dark max-h-96 overflow-y-auto ${streaming ? 'cursor-blink' : ''}`}>
            {streaming ? (
              <div className="text-sm whitespace-pre-wrap text-zinc-300">{streamedText || 'Generating...'}</div>
            ) : (
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                {streamedText || '_Generating..._'}
              </ReactMarkdown>
            )}
          </div>
          <div className="sr-only" aria-live="polite">
            {streaming ? 'AI is summarizing your impact log...' : ''}
          </div>
        </div>
      )}

      {/* Quick add entry */}
      {showAdd && (
        <div className="bg-surface rounded-xl border border-border p-5 space-y-3 animate-fade-in">
          <label className="block text-sm font-medium text-zinc-300">
            What impact did you have?
          </label>
          <textarea
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            placeholder="e.g. Led architecture review for Quick Setup, identified 3 security gaps before launch..."
            rows={4}
            className="w-full px-4 py-3 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddEntry}
              disabled={!newEntry.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-40 transition-colors"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" aria-hidden="true" />
              )}
              Save entry
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewEntry('') }}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={24}
            className="w-full px-4 py-3 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 font-mono focus:outline-none focus:border-brand transition-colors resize-none"
          />
          <button
            onClick={handleSaveEdit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            Save changes
          </button>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border p-6 prose-dark">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
      <ConfirmDialog
        open={blockerState === 'blocked'}
        title="Unsaved changes"
        message="You have unsaved edits to your impact log. Leave anyway?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={proceed}
        onCancel={resetBlocker}
      />
    </>
  )
}
