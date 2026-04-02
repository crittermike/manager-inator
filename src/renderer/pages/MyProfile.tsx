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
  Edit3,
  Trophy,
  PenLine,
  Lightbulb,
  FileText,
  ChevronRight,
  FolderOpen
} from 'lucide-react'

type ProfileTab = 'impact' | 'weekly-log'

export function MyProfile() {
  const [tab, setTab] = useState<ProfileTab>('impact')
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

  // Weekly log state
  const [weeklyLogEntries, setWeeklyLogEntries] = useState<{ filename: string; title: string; date: string; category: string }[]>([])
  const [weeklyLogLoading, setWeeklyLogLoading] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<{ filename: string; title: string } | null>(null)
  const [entryContent, setEntryContent] = useState('')
  const [entryLoading, setEntryLoading] = useState(false)
  const [editingEntry, setEditingEntry] = useState(false)
  const [entryEditDraft, setEntryEditDraft] = useState('')

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

  const loadWeeklyLog = useCallback(async () => {
    setWeeklyLogLoading(true)
    try {
      const entries = await window.api.listWeeklyLog()
      setWeeklyLogEntries(entries)
    } catch {
      setWeeklyLogEntries([])
    } finally {
      setWeeklyLogLoading(false)
    }
  }, [])

  const openEntry = useCallback(async (entry: { filename: string; title: string }) => {
    setSelectedEntry(entry)
    setEntryLoading(true)
    setEditingEntry(false)
    try {
      const data = await window.api.getFileContent(`weekly-log/${entry.filename}`)
      setEntryContent(data)
    } catch {
      setEntryContent('_Failed to load file._')
    } finally {
      setEntryLoading(false)
    }
  }, [])

  const saveEntry = useCallback(async () => {
    if (!selectedEntry || !entryEditDraft.trim()) return
    setSaving(true)
    try {
      await window.api.commitFile(
        `weekly-log/${selectedEntry.filename}`,
        entryEditDraft,
        `Update ${selectedEntry.title}`
      )
      setEntryContent(entryEditDraft)
      setEditingEntry(false)
      toast.success('Updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }, [selectedEntry, entryEditDraft, toast])

  useEffect(() => { loadLog() }, [])

  useEffect(() => {
    if (tab === 'weekly-log' && weeklyLogEntries.length === 0) {
      loadWeeklyLog()
    }
  }, [tab, weeklyLogEntries.length, loadWeeklyLog])

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
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="space-y-2">
          <div className="skeleton h-8 w-40 rounded" />
          <div className="skeleton h-4 w-72 rounded" />
        </div>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <UserCircle className="w-6 h-6 text-brand" aria-hidden="true" />
          My Profile
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Your management artifacts, reflections, and impact log.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border" role="tablist">
        <button
          onClick={() => setTab('impact')}
          role="tab"
          aria-selected={tab === 'impact'}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'impact'
              ? 'text-brand-light border-brand'
              : 'text-zinc-500 border-transparent hover:text-zinc-300'
          }`}
        >
          <Trophy className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          Impact Log
        </button>
        <button
          onClick={() => setTab('weekly-log')}
          role="tab"
          aria-selected={tab === 'weekly-log'}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === 'weekly-log'
              ? 'text-brand-light border-brand'
              : 'text-zinc-500 border-transparent hover:text-zinc-300'
          }`}
        >
          <FileText className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          Management Log
        </button>
      </div>

      {tab === 'impact' && (
      <>
      <div className="flex items-center justify-end gap-2">
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
            className="flex items-center gap-2 px-3 py-2 text-sm bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="flex items-center gap-2 px-3 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand-dark transition-all active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add entry
          </button>
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
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleAddEntry() } }}
            placeholder="e.g. Led architecture review for Quick Setup, identified 3 security gaps before launch..."
            rows={4}
            className="w-full px-4 py-3 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddEntry}
              disabled={!newEntry.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-40 transition-all active:scale-[0.97]"
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
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveEdit() } }}
            rows={24}
            className="w-full px-4 py-3 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 font-mono focus:outline-none focus:border-brand transition-colors resize-none"
          />
          <button
            onClick={handleSaveEdit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-50 transition-all active:scale-[0.97]"
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
        (() => {
          const isEmpty = !content.trim() || content.includes('_No entries yet._')
          return isEmpty ? (
            <div className="bg-surface rounded-xl border border-border p-8 space-y-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-surface-raised flex items-center justify-center">
                <Trophy className="w-7 h-7 text-zinc-600" aria-hidden="true" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h2 className="text-lg font-medium text-zinc-200">Track your impact</h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Your impact log is a private record of the wins, decisions, and outcomes that matter for your career. Use it during performance reviews, promotion cases, or just to reflect on what you've accomplished.
                </p>
              </div>
              <div className="grid gap-3 max-w-sm mx-auto text-left">
                <div className="flex items-start gap-3 bg-surface-raised rounded-lg p-3">
                  <PenLine className="w-4 h-4 text-brand-light mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Log as you go</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Click "Add entry" to quickly capture a win, decision, or outcome while it's fresh.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-surface-raised rounded-lg p-3">
                  <Sparkles className="w-4 h-4 text-brand-light mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-zinc-300">AI-powered summaries</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Once you have entries, click "Summarize" to get a thematic breakdown of your impact.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-surface-raised rounded-lg p-3">
                  <Lightbulb className="w-4 h-4 text-brand-light mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Auto-captured from meetings</p>
                    <p className="text-xs text-zinc-500 mt-0.5">When you process meeting transcripts, impact evidence is automatically extracted and added here.</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand-dark transition-all active:scale-[0.97]"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add your first entry
              </button>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-border p-6 prose-dark">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
            </div>
          )
        })()
      )}
      </>
      )}

      {/* Management Log tab */}
      {tab === 'weekly-log' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              Your weekly priorities, reflections, OKR drafts, health checks, and other management artifacts.
            </p>
            <button
              onClick={loadWeeklyLog}
              className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
              aria-label="Refresh management log"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {weeklyLogLoading && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-zinc-500">Loading...</span>
            </div>
          )}

          {!weeklyLogLoading && weeklyLogEntries.length === 0 && (
            <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-3">
              <FolderOpen className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-sm text-zinc-500">No management log entries yet.</p>
              <p className="text-xs text-zinc-600">
                Entries are created when you complete items on the Today page — weekly priorities, reflections, OKR drafts, team health checks, and more.
              </p>
            </div>
          )}

          {!weeklyLogLoading && weeklyLogEntries.length > 0 && !selectedEntry && (
            <div className="bg-surface rounded-xl border border-border overflow-hidden divide-y divide-border">
              {weeklyLogEntries.map(entry => (
                <button
                  key={entry.filename}
                  onClick={() => openEntry(entry)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-surface-raised/50 transition-colors group"
                >
                  <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{entry.title}</div>
                    <div className="text-xs text-zinc-600">{entry.category} · {entry.date}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {selectedEntry && (
            <div className="space-y-3">
              <button
                onClick={() => { setSelectedEntry(null); setEditingEntry(false) }}
                className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                &larr; Back to list
              </button>
              <h2 className="text-lg font-medium text-zinc-200">{selectedEntry.title}</h2>

              {entryLoading ? (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                </div>
              ) : editingEntry ? (
                <div className="space-y-3">
                  <textarea
                    value={entryEditDraft}
                    onChange={e => setEntryEditDraft(e.target.value)}
                    onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveEntry() } }}
                    className="w-full min-h-[20rem] bg-surface-raised border border-border rounded-xl p-4 text-sm text-zinc-100 font-mono focus:outline-none focus:border-brand transition-colors resize-y"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveEntry}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingEntry(false)}
                      className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-surface rounded-xl border border-border p-5 prose-dark">
                    <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{entryContent}</ReactMarkdown>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setEntryEditDraft(entryContent); setEditingEntry(true) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                    <FolderOpen className="w-3 h-3" />
                    weekly-log/{selectedEntry.filename}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
      <ConfirmDialog
        open={blockerState === 'blocked'}
        title="Unsaved changes"
        message="You have unsaved changes. Leave without saving?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={proceed}
        onCancel={resetBlocker}
      />
    </>
  )
}
