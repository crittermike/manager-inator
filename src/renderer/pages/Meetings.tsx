import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Calendar,
  FileText,
  ArrowLeft,
  Users,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Search
} from 'lucide-react'
import { format, parseISO, compareDesc } from 'date-fns'

interface Meeting {
  date: string
  title: string
  filename: string
}

export function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [meetingContent, setMeetingContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.api.listMeetings()
      const sorted = [...data].sort((a, b) =>
        compareDesc(parseISO(a.date), parseISO(b.date))
      )
      setMeetings(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  const handleSelectMeeting = async (meeting: Meeting) => {
    setSelectedMeeting(meeting)
    setContentLoading(true)
    setMeetingContent(null)
    try {
      const content = await window.api.getFileContent(`meetings/${meeting.filename}`)
      setMeetingContent(content)
    } catch (err) {
      setMeetingContent(
        `_Failed to load meeting content: ${err instanceof Error ? err.message : 'Unknown error'}_`
      )
    } finally {
      setContentLoading(false)
    }
  }

  const handleBack = () => {
    setSelectedMeeting(null)
    setMeetingContent(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading meetings...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" />
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            onClick={fetchMeetings}
            className="text-sm text-brand-light hover:text-brand transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  const filteredMeetings = searchQuery
    ? meetings.filter(
        (m) =>
          m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.date.includes(searchQuery)
      )
    : meetings

  // Detail view for a selected meeting
  if (selectedMeeting) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to meetings
        </button>

        <div className="flex items-start gap-4">
          <div className="p-3 bg-brand/10 rounded-xl">
            <FileText className="w-6 h-6 text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              {selectedMeeting.title}
            </h1>
            <div className="flex items-center gap-2 mt-1.5 text-sm text-zinc-500">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(selectedMeeting.date)}
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border p-6">
          {contentLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="prose-dark">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {meetingContent || '_No content available_'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Meetings</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} on file
          </p>
        </div>
        <button
          onClick={fetchMeetings}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search meetings by title or date..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-lg border border-border text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand/50 transition-colors"
        />
      </div>

      {/* Meeting list */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          {searchQuery ? `${filteredMeetings.length} result${filteredMeetings.length !== 1 ? 's' : ''}` : 'All meetings'}
        </h2>

        {filteredMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">
              {searchQuery ? 'No meetings match your search' : 'No meetings found'}
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {filteredMeetings.map((meeting) => (
              <button
                key={meeting.filename}
                onClick={() => handleSelectMeeting(meeting)}
                className="w-full flex items-center gap-4 p-4 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all group text-left"
              >
                <div className="p-2 bg-brand/10 rounded-lg group-hover:bg-brand/20 transition-colors shrink-0">
                  <FileText className="w-4 h-4 text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200 truncate">
                    {meeting.title}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-zinc-500">
                    <Calendar className="w-3 h-3" />
                    {formatDate(meeting.date)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMMM d, yyyy')
  } catch {
    return dateStr
  }
}
