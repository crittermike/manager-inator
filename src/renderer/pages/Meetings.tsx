import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Calendar,
  FileText,
  ArrowLeft,
  Users,
  RefreshCw,
  Edit3,
  Save,
  X,
  ScrollText,
  Sparkles
} from 'lucide-react'

interface MeetingEntry {
  date: string
  title: string
  filename: string
}

function toTitleCase(str: string): string {
  return str.replace(
    /\b\w+/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  )
}

function parseSpeakers(content: string): string[] {
  // Try YAML frontmatter first
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    const yaml = fmMatch[1]
    const speakerLines = yaml.match(/speakers:\n((?:\s+-\s+.+\n?)+)/)
    if (speakerLines) {
      return speakerLines[1]
        .split('\n')
        .map(l => l.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean)
    }
  }

  // Fallback: look for ## Attendees section
  const attendeesMatch = content.match(/## Attendees\n([\s\S]*?)(?=\n##|$)/)
  if (attendeesMatch) {
    return attendeesMatch[1]
      .split('\n')
      .map(l => l.replace(/^[-*]\s*/, '').trim())
      .filter(l => l.length > 1 && l.length < 40)
  }

  return []
}

type DetailTab = 'summary' | 'transcript'

export function Meetings() {
  const [meetings, setMeetings] = useState<MeetingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MeetingEntry | null>(null)
  const [summaryContent, setSummaryContent] = useState<string | null>(null)
  const [transcriptContent, setTranscriptContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('summary')
  const [speakers, setSpeakers] = useState<string[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillStatus, setBackfillStatus] = useState('')

  const loadMeetings = async () => {
    setLoading(true)
    try {
      const data = await window.api.listMeetings()
      setMeetings(data)
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadMeetings() }, [])

  const openMeeting = async (meeting: MeetingEntry) => {
    setSelected(meeting)
    setDetailTab('summary')
    setFileLoading(true)
    setSpeakers([])

    try {
      // Load the main file (transcript)
      const content = await window.api.getFileContent(`meetings/${meeting.filename}`)
      setSummaryContent(content)
      setTranscriptContent(content)

      // Try loading a separate summary file (has speakers in frontmatter)
      const summaryName = meeting.filename.replace('.md', '-summary.md')
      try {
        const summary = await window.api.getFileContent(`meetings/${summaryName}`)
        setSummaryContent(summary)
        // Parse speakers from summary frontmatter
        setSpeakers(parseSpeakers(summary))
      } catch {
        // No separate summary — try parsing speakers from main content
        setSpeakers(parseSpeakers(content))
      }
    } catch {
      setSummaryContent('_Failed to load meeting._')
      setTranscriptContent(null)
    } finally {
      setFileLoading(false)
    }
  }

  const handleSaveTitle = async () => {
    if (!selected || !newTitle.trim()) return
    // We'd need to rename the file; for now just update local state
    setSelected({ ...selected, title: newTitle.trim() })
    setEditingTitle(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {selected ? (
        <>
          <button
            onClick={() => { setSelected(null); setSummaryContent(null); setTranscriptContent(null) }}
            className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to meetings
          </button>

          {/* Meeting header */}
          <div className="flex items-start justify-between">
            <div>
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="text-xl font-bold bg-surface-raised border border-border rounded-lg px-3 py-1 text-zinc-100 focus:outline-none focus:border-brand"
                    autoFocus
                  />
                  <button onClick={handleSaveTitle} className="p-1 text-success hover:text-success/80">
                    <Save className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingTitle(false)} className="p-1 text-zinc-500 hover:text-zinc-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-zinc-100">
                    {toTitleCase(selected.title || 'Meeting')}
                  </h1>
                  <button
                    onClick={() => { setEditingTitle(true); setNewTitle(selected.title) }}
                    className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-sm text-zinc-500 mt-0.5">{selected.date}</p>
            </div>
          </div>

          {/* Speakers */}
          {speakers.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="w-4 h-4 text-zinc-500 shrink-0" />
              {speakers.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-raised rounded-full text-xs text-zinc-300"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Detail tabs */}
          <div className="flex gap-1 border-b border-border">
            <button
              onClick={() => setDetailTab('summary')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                detailTab === 'summary'
                  ? 'border-brand text-brand-light'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              Summary
            </button>
            <button
              onClick={() => setDetailTab('transcript')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                detailTab === 'transcript'
                  ? 'border-brand text-brand-light'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ScrollText className="w-4 h-4" />
              Transcript
            </button>
          </div>

          {/* Content */}
          {fileLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="prose-dark">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {detailTab === 'summary'
                  ? (summaryContent || '_No summary available._')
                  : (transcriptContent || '_No transcript available._')}
              </ReactMarkdown>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-brand" />
                Meetings
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                {meetings.length} meetings on record
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  // Find meetings without summaries (no -summary.md companion)
                  const withoutSummary = meetings.filter(m => !meetings.some(s => s.filename === m.filename.replace('.md', '-summary.md')))
                  const batch = withoutSummary.slice(0, 5)
                  if (batch.length === 0) { setBackfillStatus('All meetings have summaries!'); return }
                  setBackfilling(true)
                  setBackfillStatus(`Generating summaries for ${batch.length} meetings...`)
                  const cleanup = window.api.onBackfillProgress((data: { filename: string; status: string }) => {
                    setBackfillStatus(`${data.status === 'generating' ? '⏳' : data.status === 'done' ? '✅' : '❌'} ${data.filename}`)
                  })
                  try {
                    await window.api.backfillSummaries(batch.map(m => m.filename))
                    setBackfillStatus('Done! Refresh to see updates.')
                    loadMeetings()
                  } catch (e) {
                    setBackfillStatus(`Error: ${(e as Error).message}`)
                  } finally {
                    setBackfilling(false)
                    cleanup()
                  }
                }}
                disabled={backfilling}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {backfilling ? 'Generating...' : 'Generate summaries'}
              </button>
              <button
                onClick={loadMeetings}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {backfillStatus && (
            <div className="text-sm text-zinc-400 bg-surface rounded-lg px-4 py-2">
              {backfillStatus}
            </div>
          )}

          {meetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="w-8 h-8 text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500">No meetings yet</p>
              <p className="text-xs text-zinc-600 mt-1">
                Process a transcript to add your first meeting
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {meetings.map((m) => (
                <button
                  key={m.filename}
                  onClick={() => openMeeting(m)}
                  className="w-full flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all text-left group"
                >
                  <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors">
                    <FileText className="w-5 h-5 text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200">
                      {toTitleCase(m.title || 'Meeting')}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{m.date}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
