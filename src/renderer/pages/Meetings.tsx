import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useToast } from '../components/common/Toast'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { formatDate } from '../utils/formatDate'
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
  Sparkles,
  Search,
  Copy,
  Check,
  Download
} from 'lucide-react'

interface MeetingEntry {
  date: string
  title: string
  filename: string
  hasSummary: boolean
}

function formatMeetingTitle(str: string): string {
  // Restore "1-1" from "1 1"
  const fixed = str.replace(/\b1\s+1\b/g, '1-1')
  return fixed.replace(
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

function stripFrontmatter(content: string): string {
  let cleaned = content
  // Remove YAML frontmatter at start
  cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n*/m, '').trim()
  // Remove AI preamble lines like "Here's your meeting summary:"
  cleaned = cleaned.replace(/^Here(?:'s| is) (?:your |the )?(?:meeting )?summary:?\s*\n*/i, '').trim()
  // Remove stray --- separator at start (after preamble removal)
  cleaned = cleaned.replace(/^---\n*/m, '').trim()
  // Remove bold **speakers:** block rendered as markdown (AI sometimes does this instead of YAML)
  cleaned = cleaned.replace(/\*\*speakers:\*\*\n(?:[-*]\s+.+\n?)*/im, '').trim()
  // Remove Attendees section (redundant with speaker pills)
  cleaned = cleaned.replace(/## Attendees\n(?:[-*]\s+.+\n?)*/m, '').trim()
  return cleaned
}

type DetailTab = 'summary' | 'transcript'

export function Meetings() {
  const { filename: routeFilename } = useParams<{ filename: string }>()
  const navigate = useNavigate()
  const toast = useToast()
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
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [savingTitle, setSavingTitle] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 300)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadMeetings = async () => {
    setLoading(true)
    try {
      const data = await window.api.listMeetings()
      if (!mountedRef.current) return
      setMeetings(data)
      if (routeFilename) {
        const meeting = data.find((m: MeetingEntry) => m.filename === routeFilename || m.filename === routeFilename + '.md')
        if (meeting) openMeeting(meeting)
      }
    } catch (e) {
      console.error('Failed to load meetings:', e)
      if (mountedRef.current) toast.error('Failed to load meetings')
    }
    finally { if (mountedRef.current) setLoading(false) }
  }

  useEffect(() => { loadMeetings() }, [])

  const openMeeting = async (meeting: MeetingEntry) => {
    setSelected(meeting)
    setDetailTab('summary')
    setFileLoading(true)
    setSpeakers([])

    try {
      const content = await window.api.getFileContent(`meetings/${meeting.filename}`)
      if (!mountedRef.current) return
      setSummaryContent(content)
      setTranscriptContent(content)

      const summaryName = meeting.filename.replace('.md', '-summary.md')
      try {
        const summary = await window.api.getFileContent(`meetings/${summaryName}`)
        if (!mountedRef.current) return
        setSummaryContent(summary)
        setSpeakers(parseSpeakers(summary))
      } catch {
        if (!mountedRef.current) return
        setSpeakers(parseSpeakers(content))
      }
    } catch {
      if (!mountedRef.current) return
      setSummaryContent('_Failed to load meeting._')
      setTranscriptContent(null)
    } finally {
      if (mountedRef.current) setFileLoading(false)
    }
  }

  const handleSaveTitle = async () => {
    if (!selected || !newTitle.trim() || savingTitle) return
    setSavingTitle(true)
    try {
      await window.api.saveMeetingTitle(selected.filename, newTitle.trim())
      setSelected({ ...selected, title: newTitle.trim() })
      setMeetings(prev => prev.map(m =>
        m.filename === selected.filename ? { ...m, title: newTitle.trim() } : m
      ))
      toast.success('Title saved')
      setEditingTitle(false)
    } catch (e) {
      console.error('Failed to save title:', e)
      toast.error('Failed to save title')
    } finally {
      setSavingTitle(false)
    }
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
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
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
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                    aria-label="Meeting title"
                    className="text-xl font-bold bg-surface-raised border border-border rounded-lg px-3 py-1 text-zinc-100 focus:outline-none focus:border-brand"
                    autoFocus
                  />
                  <button onClick={handleSaveTitle} disabled={savingTitle} aria-label="Save title" className="p-1 text-success hover:text-success/80 disabled:opacity-50">
                    <Save className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button onClick={() => setEditingTitle(false)} disabled={savingTitle} aria-label="Cancel editing" className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-50">
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-zinc-100">
                    {formatMeetingTitle(selected.title || 'Meeting')}
                  </h1>
                  <button
                    onClick={() => { setEditingTitle(true); setNewTitle(selected.title) }}
                    aria-label="Edit title"
                    className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
              <p className="text-sm text-zinc-500 mt-0.5">{formatDate(selected.date)}</p>
            </div>
          </div>

          {/* Speakers — clickable to go to person profile */}
          {speakers.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
              {speakers.map((s) => {
                // Clean name: strip parenthetical role/title suffixes for slug
                const cleanName = s.replace(/\s*\(.*?\)\s*/g, '').trim()
                const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
                return (
                  <button
                    key={s}
                    onClick={async () => {
                      try {
                        const existingSlug = await window.api.findPersonByName(cleanName)
                        if (existingSlug) {
                          navigate(`/people/${existingSlug}`)
                          return
                        }
                        let fileAlreadyExists = false
                        try {
                          await window.api.getFileContent(`people/${slug}.md`)
                          fileAlreadyExists = true
                        } catch {
                          // File doesn't exist — safe to create
                        }
                        if (fileAlreadyExists) {
                          navigate(`/people/${slug}`)
                          return
                        }
                        const roleHint = s.match(/\(([^)]+)\)/)?.[1] || ''
                        await window.api.commitFile(
                          `people/${slug}.md`,
                          `---\nname: ${cleanName}\nslug: ${slug}\naliases: \nrole: ${roleHint}\ngithub: \nlocation: \nrelationship: \n---\n\n# ${cleanName}\n\n## Notes\n\n_No notes yet._\n`,
                          `Create profile for ${cleanName}`
                        )
                        navigate(`/people/${slug}`)
                      } catch (e) {
                        console.error('Failed to create profile:', e)
                        toast.error(`Failed to create profile for ${cleanName}`)
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-raised hover:bg-brand/20 hover:text-brand-light rounded-full text-xs text-zinc-300 transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                )
              })}
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
              <FileText className="w-4 h-4" aria-hidden="true" />
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
              <ScrollText className="w-4 h-4" aria-hidden="true" />
              Transcript
            </button>
          </div>

          {/* Content */}
          {fileLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="relative group/content">
              <button
                onClick={async () => {
                  const text = detailTab === 'summary'
                    ? stripFrontmatter(summaryContent || '')
                    : (transcriptContent || '')
                  if (!text) return
                  await navigator.clipboard.writeText(text)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 focus:opacity-100 transition-opacity"
                aria-label="Copy to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              </button>
              <button
                onClick={() => {
                  const text = detailTab === 'summary'
                    ? stripFrontmatter(summaryContent || '')
                    : (transcriptContent || '')
                  if (!text) return
                  const fname = `${selected?.filename?.replace('.md', '') || 'meeting'}.md`
                  const blob = new Blob([text], { type: 'text/markdown' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = fname
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                className="absolute top-2 right-12 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 focus:opacity-100 transition-opacity"
                aria-label="Download as Markdown"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <div className="prose-dark">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detailTab === 'summary'
                    ? stripFrontmatter(summaryContent || '_No summary available._')
                    : (transcriptContent || '_No transcript available._')}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-brand" aria-hidden="true" />
                Meetings
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                {meetings.length} meetings on record
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  // Find meetings without summaries
                  const withoutSummary = meetings.filter(m => !m.hasSummary)
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
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {backfilling ? 'Generating...' : 'Generate summaries'}
              </button>
              {backfilling && (
                <button
                  onClick={async () => {
                    await window.api.cancelBackfill()
                    await window.api.aiCancel()
                    setBackfillStatus('Cancelled.')
                    setBackfilling(false)
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  Cancel
                </button>
              )}
              <button
                onClick={loadMeetings}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>

          {backfillStatus && (
            <div className="text-sm text-zinc-400 bg-surface rounded-lg px-4 py-2">
              {backfillStatus}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings..."
              aria-label="Search meetings"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand transition-colors"
            />
          </div>

          {(() => {
            const filtered = debouncedSearch
              ? meetings.filter(m =>
                  (m.title || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                  m.date.includes(debouncedSearch) ||
                  m.filename.toLowerCase().includes(debouncedSearch.toLowerCase())
                )
              : meetings

            if (meetings.length === 0) return (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Calendar className="w-8 h-8 text-zinc-700 mb-3" aria-hidden="true" />
                <p className="text-sm text-zinc-500">No meetings yet</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Process a transcript to add your first meeting
                </p>
                <button
                  onClick={() => navigate('/transcript')}
                  className="mt-4 px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-light text-white rounded-lg transition-colors"
                >
                  Process a transcript
                </button>
              </div>
            )

            if (filtered.length === 0) return (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-6 h-6 text-zinc-700 mb-2" aria-hidden="true" />
                <p className="text-sm text-zinc-500">No meetings match "{debouncedSearch}"</p>
                <button
                  onClick={() => setSearch('')}
                  className="text-xs text-brand-light hover:text-brand mt-2 transition-colors"
                >
                  Clear search
                </button>
              </div>
            )

            return (
            <div className="space-y-2">
              {filtered.map((m) => (
                <button
                  key={m.filename}
                  onClick={() => openMeeting(m)}
                  className="w-full flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all text-left group"
                >
                  <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors">
                    <FileText className="w-5 h-5 text-brand" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200">
                      {formatMeetingTitle(m.title || 'Meeting')}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{formatDate(m.date)}</div>
                  </div>
                </button>
              ))}
            </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
