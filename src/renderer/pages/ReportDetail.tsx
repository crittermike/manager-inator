import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useReportData, useFileContent } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import { useToast } from '../components/common/Toast'
import { formatDate } from '../utils/formatDate'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ActionItem, FeedbackEntry } from '../../shared/types'
import { cleanSummaryContent } from '../utils/cleanSummary'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  GithubIcon,
  Briefcase,
  FileText,
  MessageSquare,
  CheckSquare,
  Star,
  BookOpen,
  Sparkles,
  X,
  Save,
  Copy,
  Check,
  Download,
  Clock,
  Pencil,
  ChevronDown,
  ChevronRight,
  Filter,
  Plus
} from 'lucide-react'

// ── Types ──

type StreamFilter = 'all' | '1:1' | 'feedback' | 'action' | 'checkin' | 'review'

interface StreamEntry {
  id: string
  type: '1:1' | 'feedback' | 'action' | 'checkin' | 'review'
  date: string
  title: string
  preview: string
  data: unknown
  pinned?: boolean
}

// ── Helpers ──

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
}

function nextMeetingDate(meetingDay: string | undefined): string | null {
  if (!meetingDay) return null
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetIdx = dayNames.indexOf(meetingDay.toLowerCase())
  if (targetIdx < 0) return null
  const now = new Date()
  const todayIdx = now.getDay()
  const daysUntil = (targetIdx - todayIdx + 7) % 7 || 7
  const next = new Date(now)
  next.setDate(now.getDate() + daysUntil)
  return next.toISOString().split('T')[0]
}

// ── Main Component ──

export function ReportDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { report, loading, error, refresh } = useReportData(name)
  const { streaming, streamedText, generate, cancel, reset, fullTextRef } = useAI()
  const toast = useToast()
  const mountedRef = useRef(true)

  // Stream filter state
  const initialFilter = (searchParams.get('filter') as StreamFilter) || 'all'
  const [activeFilter, setActiveFilter] = useState<StreamFilter>(initialFilter)

  // Expanded item tracking
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  // AI generation states
  const [showAI, setShowAI] = useState(false)
  const [aiMode, setAiMode] = useState<'checkin' | 'review' | 'prep'>('checkin')
  const [aiContent, setAiContent] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)

  // Edit states
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  const [savingAbout, setSavingAbout] = useState(false)
  const [editingJobExpectations, setEditingJobExpectations] = useState(false)
  const [jobExpectationsDraft, setJobExpectationsDraft] = useState('')
  const [savingJobExpectations, setSavingJobExpectations] = useState(false)
  const [jobExpCollapsed, setJobExpCollapsed] = useState(true)
  const [aboutCollapsed, setAboutCollapsed] = useState(true)

  // Action item toggling
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set())

  // Prep checkbox editing
  const [prepContent, setPrepContent] = useState<string | null>(null)

  // Content viewing
  const [viewingContent, setViewingContent] = useState<{ path: string; title: string } | null>(null)
  const { content: fileContent, loading: fileLoading } = useFileContent(viewingContent?.path ?? null)

  // Copy state
  const [copied, setCopied] = useState(false)

  // Adding feedback
  const [addingFeedback, setAddingFeedback] = useState(false)
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [feedbackType, setFeedbackType] = useState<'positive' | 'constructive' | 'mixed'>('positive')
  const [savingFeedback, setSavingFeedback] = useState(false)

  // Refs
  const savePrepRef = useRef<() => void>(() => {})

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; cancel() }
  }, [cancel])

  // ── Utility callbacks ──

  const handleCopy = useCallback(async (text: string) => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const handleDownload = useCallback((text: string, filename: string) => {
    if (!text) return
    const blob = new Blob([text], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }, [])

  const toggleExpanded = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── AI Handlers (preserved from original) ──

  const handlePrepOneOnOne = useCallback(async () => {
    if (!report || !name) return
    setShowAI(true)
    setAiMode('prep')
    setAiLoading(true)
    setAiContent(null)
    setPrepContent(null)
    reset()

    const recentSummaryDates = report.summaries.slice(-5)
    const summaryContents = await Promise.all(
      recentSummaryDates.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${name}-1-1.md`)
          return content
        } catch { return '' }
      })
    )
    const summariesText = summaryContents.filter(Boolean).join('\n\n---\n\n')
    if (!mountedRef.current) return
    const openActions = report.actionItems.filter(a => !a.completed).map(a => `- [ ] ${a.text}`).join('\n')

    const displayName = report.profile.displayName
    const firstName = displayName.split(' ')[0]
    const namePattern = new RegExp(`\\b(${firstName}|${displayName})\\b`, 'i')
    const ownSummaryPrefix = `${name}-1-1`

    let crossMentions = ''
    try {
      const allMeetings = await window.api.listMeetings()
      const otherWithSummaries = allMeetings
        .filter(m => !m.filename.replace('.md', '').includes(ownSummaryPrefix))
        .slice(0, 15)

      const mentionResults = await Promise.all(
        otherWithSummaries.map(async (m) => {
          try {
            const content = await window.api.getFileContent(`meetings/${m.filename}`)
            if (namePattern.test(content)) {
              return `### ${m.title} (${m.date})\n${content}`
            }
          } catch { /* skip */ }
          return ''
        })
      )
      crossMentions = mentionResults.filter(Boolean).slice(0, 5).join('\n\n---\n\n')
    } catch { /* non-critical */ }
    if (!mountedRef.current) return

    let result = ''
    try {
      result = await generate('prep-one-on-one', {
        reportName: report.profile.displayName,
        about: report.profile.about || undefined,
        jobExpectations: report.jobExpectations || undefined,
        summaries: summariesText || 'No recent summaries available.',
        actionItems: openActions || 'No open action items.',
        feedback: report.feedback.slice(-3).map(f => `${f.date} (${f.type}): ${f.content}`).join('\n---\n'),
        crossMeetingMentions: crossMentions || undefined
      })
    } catch (e) {
      console.error('Prep generation failed:', e)
      toast.error('Failed to generate prep')
    }
    if (!mountedRef.current) return
    const content = result || fullTextRef.current
    if (content) {
      setAiContent(content)
      setPrepContent(content)
    } else {
      setAiContent('_Failed to generate prep. Try clicking Regenerate._')
    }
    setAiLoading(false)
  }, [report, name, generate, reset, fullTextRef, toast, cancel])

  const handleGenerateCheckIn = useCallback(async () => {
    if (!report || !name) return
    setShowAI(true)
    setAiMode('checkin')
    setAiContent(null)
    reset()

    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const recentSummaries = report.summaries.slice(-8)
    const summaryContents = await Promise.all(
      recentSummaries.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${name}-1-1.md`)
          return `### ${s.date}\n${content}`
        } catch { return '' }
      })
    )
    const summariesText = summaryContents.filter(Boolean).join('\n\n---\n\n')

    const recentCheckIns = report.checkIns.slice(-3)
    const checkInHistoryText = recentCheckIns.length > 0
      ? recentCheckIns.map(c => `### ${c.date}\n${c.content || c.accomplishments.join('\n') || '(no content)'}`).join('\n\n---\n\n')
      : undefined

    try {
      await generate('generate-checkin', {
        reportName: report.profile.displayName,
        displayName: report.profile.displayName,
        month,
        monthName: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
        about: report.profile.about || undefined,
        jobExpectations: report.jobExpectations || undefined,
        summaries: summariesText || 'No recent summaries available.',
        checkInHistory: checkInHistoryText,
        feedback: report.feedback.map(f => `${f.date}: ${f.content}`).join('\n---\n'),
        actionItems: report.actionItems.filter(a => !a.completed).slice(0, 20).map(a => `- ${a.text}`).join('\n')
      })
    } catch {
      if (!mountedRef.current) return
    }
  }, [report, name, generate, reset])

  const handleGenerateReview = useCallback(async () => {
    if (!report || !name) return
    setShowAI(true)
    setAiMode('review')
    setAiLoading(true)
    setAiContent(null)
    reset()

    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()
    const isH2 = month >= 6
    const periodLabel = isH2 ? `${year} H2 (Jul–Dec)` : `${year} H1 (Jan–Jun)`

    const recentSummaries = report.summaries.slice(-20)
    const summaryContents = await Promise.all(
      recentSummaries.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${name}-1-1.md`)
          return `### ${s.date}\n${content}`
        } catch { return '' }
      })
    )
    const summariesText = summaryContents.filter(Boolean).join('\n\n---\n\n')
    if (!mountedRef.current) return

    const checkInsText = report.checkIns.slice(-6).map(c =>
      `### ${c.date}\n${c.content || c.accomplishments.join('\n') || '(no content)'}`
    ).join('\n\n---\n\n')

    const feedbackText = report.feedback.map(f =>
      `${f.date} (${f.type}): ${f.content}`
    ).join('\n---\n')

    const allActions = report.actionItems.slice(-30).map(a =>
      `- [${a.completed ? 'x' : ' '}] ${a.text}`
    ).join('\n')

    let result = ''
    try {
      result = await generate('generate-review', {
        reportName: report.profile.displayName,
        displayName: report.profile.displayName,
        role: report.profile.role,
        period: periodLabel,
        about: report.profile.about || undefined,
        jobExpectations: report.jobExpectations || undefined,
        pastReviews: report.reviews.length > 0
          ? report.reviews.map(r => `### ${r.period}\n${r.content}`).join('\n\n---\n\n')
          : undefined,
        checkIns: checkInsText || undefined,
        summaries: summariesText || undefined,
        feedback: feedbackText || undefined,
        actionItems: allActions || undefined
      })
    } catch (e) {
      console.error('Review generation failed:', e)
      toast.error('Failed to generate review')
    }
    if (!mountedRef.current) return
    const content = result || fullTextRef.current
    if (content) {
      setAiContent(content)
    } else {
      setAiContent('_Failed to generate review. Try clicking Regenerate._')
    }
    setAiLoading(false)
  }, [report, name, generate, reset, fullTextRef, toast])

  // ── Save Handlers ──

  const handleSaveAI = useCallback(async () => {
    if (!name || !report) return
    const content = aiContent || fullTextRef.current || streamedText
    if (!content) return
    setAiSaving(true)
    try {
      if (aiMode === 'prep') {
        const today = new Date().toISOString().split('T')[0]
        await window.api.commitFile(
          `reports/${name}/prep/${today}.md`,
          prepContent || content,
          `Save 1:1 prep for ${report.profile.displayName} on ${today}`
        )
        toast.success('Prep saved')
      } else if (aiMode === 'checkin') {
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        await window.api.commitFile(
          `reports/${name}/check-ins/monthly/${month}.md`,
          content,
          `Save ${report.profile.displayName} check-in for ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}`
        )
        toast.success('Check-in saved')
      } else if (aiMode === 'review') {
        const now = new Date()
        const month = now.getMonth()
        const year = now.getFullYear()
        const periodFile = month >= 6 ? `${year}-H2` : `${year}-H1`
        await window.api.commitFile(
          `reports/${name}/reviews/${periodFile}.md`,
          content,
          `Save performance review for ${report.profile.displayName} (${periodFile})`
        )
        toast.success('Review saved')
      }
      refresh()
    } catch (e) {
      console.error('Failed to save:', e)
      toast.error('Failed to save')
    } finally {
      setAiSaving(false)
    }
  }, [name, report, aiContent, aiMode, prepContent, fullTextRef, streamedText, toast, refresh])

  savePrepRef.current = handleSaveAI

  useKeyboardShortcut({ key: 's', handler: useCallback(() => savePrepRef.current(), []), enabled: !!aiContent && !aiSaving })

  // ── Prep checkbox toggle ──

  const handlePrepCheckboxToggle = useCallback((lineIndex: number) => {
    setPrepContent(prev => {
      if (!prev) return prev
      const lines = prev.split('\n')
      const line = lines[lineIndex]
      if (line.includes('- [ ] ')) {
        lines[lineIndex] = line.replace('- [ ] ', '- [x] ')
      } else if (line.includes('- [x] ')) {
        lines[lineIndex] = line.replace('- [x] ', '- [ ] ')
      }
      return lines.join('\n')
    })
  }, [])

  // ── Edit handlers ──

  const handleEditAbout = useCallback(() => {
    if (!report) return
    setAboutDraft(report.profile.about.replace(/<!--[\s\S]*?-->/g, '').trim())
    setEditingAbout(true)
  }, [report])

  const handleSaveAbout = useCallback(async () => {
    if (!name || !report) return
    setSavingAbout(true)
    try {
      const profileContent = await window.api.getFileContent(`reports/${name}/profile.md`)
      let updated: string
      const aboutSection = `## About\n\n${aboutDraft.trim()}`
      if (profileContent.match(/## About\s*\n/)) {
        updated = profileContent.replace(
          /## About\s*\n[\s\S]*?(?=\n##|$)/,
          aboutSection
        )
      } else {
        updated = profileContent.trimEnd() + '\n\n' + aboutSection + '\n'
      }
      await window.api.commitFile(
        `reports/${name}/profile.md`,
        updated,
        `Update about section for ${report.profile.displayName}`
      )
      toast.success('About section saved')
      setEditingAbout(false)
      refresh()
    } catch (e) {
      console.error('Failed to save about:', e)
      toast.error('Failed to save about section')
    } finally {
      setSavingAbout(false)
    }
  }, [name, report, aboutDraft, toast, refresh])

  const handleEditJobExpectations = useCallback(() => {
    if (!report) return
    setJobExpectationsDraft((report.jobExpectations || '').replace(/<!--[\s\S]*?-->/g, '').trim())
    setEditingJobExpectations(true)
  }, [report])

  const handleSaveJobExpectations = useCallback(async () => {
    if (!name || !report) return
    setSavingJobExpectations(true)
    try {
      await window.api.commitFile(
        `reports/${name}/job-expectations.md`,
        jobExpectationsDraft.trim() + '\n',
        `Update job expectations for ${report.profile.displayName}`
      )
      toast.success('Job expectations saved')
      setEditingJobExpectations(false)
      refresh()
    } catch (e) {
      console.error('Failed to save job expectations:', e)
      toast.error('Failed to save job expectations')
    } finally {
      setSavingJobExpectations(false)
    }
  }, [name, report, jobExpectationsDraft, toast, refresh])

  // ── Feedback handler ──

  const handleSaveFeedback = useCallback(async () => {
    if (!name || !report || !feedbackDraft.trim()) return
    setSavingFeedback(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const feedbackLogPath = `reports/${name}/feedback/log.md`
      let existing = ''
      try {
        existing = await window.api.getFileContent(feedbackLogPath)
      } catch { /* file may not exist */ }
      const entry = `### ${today}\n**Type:** ${feedbackType}\n\n${feedbackDraft.trim()}\n`
      const updated = existing ? `${entry}\n---\n\n${existing}` : entry
      await window.api.commitFile(
        feedbackLogPath,
        updated,
        `Add ${feedbackType} feedback for ${report.profile.displayName}`
      )
      toast.success('Feedback saved')
      setAddingFeedback(false)
      setFeedbackDraft('')
      refresh()
    } catch (e) {
      console.error('Failed to save feedback:', e)
      toast.error('Failed to save feedback')
    } finally {
      setSavingFeedback(false)
    }
  }, [name, report, feedbackDraft, feedbackType, toast, refresh])

  // ── Action item toggle ──

  const handleToggleAction = useCallback(async (a: ActionItem) => {
    if (!a.sourceFile || a.sourceLineNumber == null) return
    const toggleKey = `${a.sourceFile}:${a.sourceLineNumber}`
    setTogglingItems(prev => new Set(prev).add(toggleKey))
    try {
      await window.api.toggleActionItem(a.sourceFile, a.sourceLineNumber)
      refresh()
    } catch (e) {
      console.error('Failed to toggle action item:', e)
      toast.error('Failed to update action item')
    } finally {
      setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
    }
  }, [refresh, toast])

  // ── Build activity stream ──

  const streamEntries = useMemo((): StreamEntry[] => {
    if (!report) return []
    const entries: StreamEntry[] = []

    // 1:1 meetings (use summaries preferring summary content, fall back to transcripts)
    for (const t of report.transcripts) {
      const summary = report.summaries.find(s => s.date === t.date)
      entries.push({
        id: `meeting-${t.date}`,
        type: '1:1',
        date: t.date,
        title: `1:1 meeting — ${formatDate(t.date)}`,
        preview: summary
          ? (summary.keyTopics.length > 0 ? summary.keyTopics.join(', ') : 'Meeting summarized')
          : 'Transcript available (not yet summarized)',
        data: { transcript: t, summary }
      })
    }

    // Feedback
    for (const f of report.feedback) {
      entries.push({
        id: `feedback-${f.date}-${f.content.slice(0, 20)}`,
        type: 'feedback',
        date: f.date,
        title: `${f.type === 'positive' ? '🌟' : f.type === 'constructive' ? '🔧' : '💬'} ${f.type.charAt(0).toUpperCase() + f.type.slice(1)} feedback`,
        preview: f.content.length > 120 ? f.content.slice(0, 120) + '…' : f.content,
        data: f
      })
    }

    // Check-ins
    for (const c of report.checkIns) {
      entries.push({
        id: `checkin-${c.date}`,
        type: 'checkin',
        date: c.date + '-15', // month dates sort correctly as mid-month
        title: `Monthly check-in — ${c.date}`,
        preview: c.accomplishments.length > 0 ? c.accomplishments[0] : 'Check-in on file',
        data: c
      })
    }

    // Reviews
    for (const r of report.reviews) {
      // Parse period to get a sortable date
      const yearMatch = r.period.match(/(\d{4})/)
      const year = yearMatch ? yearMatch[1] : '2024'
      const isH2 = r.period.includes('H2')
      entries.push({
        id: `review-${r.period}`,
        type: 'review',
        date: `${year}-${isH2 ? '12' : '06'}-30`,
        title: `Performance review — ${r.period}`,
        preview: r.content.slice(0, 120).replace(/[#*_]/g, '') + '…',
        data: r
      })
    }

    // Sort reverse chronologically
    entries.sort((a, b) => b.date.localeCompare(a.date))

    // Pin open action items at the top (only when showing 'all' or 'action')
    const openActions = report.actionItems.filter(a => !a.completed)
    if (openActions.length > 0) {
      entries.unshift({
        id: 'pinned-actions',
        type: 'action',
        date: new Date().toISOString().split('T')[0],
        title: `${openActions.length} open action item${openActions.length !== 1 ? 's' : ''}`,
        preview: openActions.slice(0, 3).map(a => a.text).join(' · '),
        data: openActions,
        pinned: true
      })
    }

    return entries
  }, [report])

  const filteredEntries = useMemo(() => {
    if (activeFilter === 'all') return streamEntries
    return streamEntries.filter(e => e.type === activeFilter)
  }, [streamEntries, activeFilter])

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        {error || 'Report not found'}
      </div>
    )
  }

  // ── Computed values ──

  const lastTranscript = report.transcripts.length > 0 ? report.transcripts[report.transcripts.length - 1] : null
  const daysSince1on1 = lastTranscript ? daysAgo(lastTranscript.date) : null
  const openActionCount = report.actionItems.filter(a => !a.completed).length
  const sortedFeedback = [...report.feedback].sort((a, b) => b.date.localeCompare(a.date))
  const daysSinceFeedback = sortedFeedback.length > 0 ? daysAgo(sortedFeedback[0].date) : null
  const nextMeeting = nextMeetingDate(report.profile.meetingDay)
  const aboutText = report.profile.about ? report.profile.about.replace(/<!--[\s\S]*?-->/g, '').trim() : ''

  const filterCounts: Record<StreamFilter, number> = {
    all: streamEntries.length,
    '1:1': streamEntries.filter(e => e.type === '1:1').length,
    feedback: streamEntries.filter(e => e.type === 'feedback').length,
    action: report.actionItems.length,
    checkin: streamEntries.filter(e => e.type === 'checkin').length,
    review: streamEntries.filter(e => e.type === 'review').length
  }

  const filters: { id: StreamFilter; label: string; icon: typeof FileText }[] = [
    { id: 'all', label: 'All', icon: Filter },
    { id: '1:1', label: '1:1s', icon: MessageSquare },
    { id: 'feedback', label: 'Feedback', icon: Star },
    { id: 'action', label: 'Actions', icon: CheckSquare },
    { id: 'checkin', label: 'Check-ins', icon: FileText },
    { id: 'review', label: 'Reviews', icon: BookOpen }
  ]

  // ── Render ──

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Back + breadcrumb */}
      <button
        onClick={() => navigate('/team')}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Team
      </button>

      {/* ── Profile header ── */}
      <div className="flex items-start gap-5">
        <div className="w-14 h-14 rounded-2xl bg-brand/20 ring-1 ring-brand/10 flex items-center justify-center text-lg font-bold text-brand-light shrink-0">
          {report.profile.displayName.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-zinc-100">
            {report.profile.displayName}
          </h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-zinc-500 flex-wrap">
            {report.profile.role && (
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
                {report.profile.role}
              </span>
            )}
            {report.profile.github && (
              <span className="flex items-center gap-1">
                <GithubIcon className="w-3.5 h-3.5" aria-hidden="true" />
                @{report.profile.github}
              </span>
            )}
            {report.profile.meetingDay && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                {report.profile.meetingDay}s
              </span>
            )}
            {report.profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                {report.profile.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Key Facts Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface rounded-xl border border-border p-4 hover:border-zinc-600 transition-colors">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Last 1:1</div>
          {lastTranscript ? (
            <>
              <div className="text-sm font-medium text-zinc-200">{formatDate(lastTranscript.date)}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{daysSince1on1} day{daysSince1on1 !== 1 ? 's' : ''} ago</div>
            </>
          ) : (
            <div className="text-sm text-zinc-600">None recorded</div>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 hover:border-zinc-600 transition-colors">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Next 1:1</div>
          {nextMeeting ? (
            <div className="text-sm font-medium text-zinc-200">{formatDate(nextMeeting)}</div>
          ) : (
            <div className="text-sm text-zinc-600">Not scheduled</div>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 hover:border-zinc-600 transition-colors">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Open actions</div>
          <div className="text-sm font-medium text-zinc-200">{openActionCount}</div>
          {report.actionItems.filter(a => a.completed).length > 0 && (
            <div className="text-xs text-zinc-500 mt-0.5">{report.actionItems.filter(a => a.completed).length} completed</div>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 hover:border-zinc-600 transition-colors">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Last feedback</div>
          {daysSinceFeedback !== null ? (
            <>
              <div className="text-sm font-medium text-zinc-200">{daysSinceFeedback} day{daysSinceFeedback !== 1 ? 's' : ''} ago</div>
              <div className="text-xs text-zinc-500 mt-0.5">{report.feedback.length} total</div>
            </>
          ) : (
            <div className="text-sm text-zinc-600">None logged</div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handlePrepOneOnOne}
          disabled={streaming || aiLoading}
          className="flex items-center gap-2 px-3.5 py-2 bg-surface-raised text-zinc-300 rounded-lg text-sm hover:bg-surface-overlay transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border"
        >
          <Sparkles className="w-4 h-4 text-brand-light" aria-hidden="true" />
          Prep 1:1
        </button>
        <button
          onClick={handleGenerateCheckIn}
          disabled={streaming || aiLoading}
          className="flex items-center gap-2 px-3.5 py-2 bg-surface-raised text-zinc-300 rounded-lg text-sm hover:bg-surface-overlay transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border"
        >
          <FileText className="w-4 h-4" aria-hidden="true" />
          Generate check-in
        </button>
        <button
          onClick={handleGenerateReview}
          disabled={streaming || aiLoading}
          className="flex items-center gap-2 px-3.5 py-2 bg-surface-raised text-zinc-300 rounded-lg text-sm hover:bg-surface-overlay transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border"
        >
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          Generate review
        </button>
        <button
          onClick={() => setAddingFeedback(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-surface-raised text-zinc-300 rounded-lg text-sm hover:bg-surface-overlay transition-colors border border-border"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add feedback
        </button>
      </div>

      {/* ── Inline feedback form ── */}
      {addingFeedback && (
        <div className="bg-surface rounded-xl border border-brand/20 p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-zinc-300">Add feedback</span>
            <button
              onClick={() => { setAddingFeedback(false); setFeedbackDraft('') }}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Close feedback form"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            {(['positive', 'constructive', 'mixed'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFeedbackType(type)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  feedbackType === type
                    ? type === 'positive' ? 'bg-success/10 border-success/30 text-success'
                    : type === 'constructive' ? 'bg-warning/10 border-warning/30 text-warning'
                    : 'bg-info/10 border-info/30 text-info'
                    : 'border-border text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {type === 'positive' ? '🌟' : type === 'constructive' ? '🔧' : '💬'} {type}
              </button>
            ))}
          </div>
          <textarea
            value={feedbackDraft}
            onChange={e => setFeedbackDraft(e.target.value)}
            placeholder="What happened? Be specific about the behavior and its impact..."
            className="w-full h-24 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSaveFeedback}
              disabled={!feedbackDraft.trim() || savingFeedback}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="w-3 h-3" aria-hidden="true" />
              {savingFeedback ? 'Saving…' : 'Save feedback'}
            </button>
          </div>
        </div>
      )}

      {/* ── AI Panel (unified for prep/checkin/review) ── */}
      {showAI && (
        <div className="bg-surface rounded-xl border border-brand/20 p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              {aiMode === 'prep' ? (aiLoading ? 'Generating prep…' : '1:1 Prep')
                : aiMode === 'checkin' ? 'Generating check-in'
                : aiLoading ? 'Generating review…' : 'Performance review draft'}
            </div>
            <div className="flex items-center gap-2">
              {streaming && (
                <button onClick={cancel} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  Stop generating
                </button>
              )}
              <button
                onClick={() => { if (streaming) cancel(); setShowAI(false); setAiContent(null); setPrepContent(null) }}
                aria-label="Close AI panel"
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Prep mode with interactive checkboxes */}
          {aiMode === 'prep' && prepContent ? (
            <div className="max-h-[32rem] overflow-y-auto">
              {(() => {
                const lines = prepContent.split('\n')
                const hasCheckboxes = lines.some(l => /^(\s*)- \[[ x]\]/.test(l))
                if (!hasCheckboxes) {
                  return (
                    <div className="prose-dark">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{prepContent}</ReactMarkdown>
                    </div>
                  )
                }
                return lines.map((line, i) => {
                  const unchecked = line.match(/^(\s*)- \[ \] (.+)/)
                  const checked = line.match(/^(\s*)- \[x\] (.+)/)
                  if (unchecked) {
                    return (
                      <label key={i} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handlePrepCheckboxToggle(i)}
                          className="mt-1 accent-brand w-4 h-4 shrink-0"
                        />
                        <span className="text-sm text-zinc-300 group-hover:text-zinc-100 leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>{unchecked[2]}</ReactMarkdown>
                        </span>
                      </label>
                    )
                  }
                  if (checked) {
                    return (
                      <label key={i} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => handlePrepCheckboxToggle(i)}
                          className="mt-1 accent-brand w-4 h-4 shrink-0"
                        />
                        <span className="text-sm text-zinc-500 line-through leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <>{children}</> }}>{checked[2]}</ReactMarkdown>
                        </span>
                      </label>
                    )
                  }
                  if (line.match(/^#{1,3}\s/)) {
                    return <h3 key={i} className="text-base font-semibold text-zinc-100 mt-5 mb-2 first:mt-0">{line.replace(/^#{1,3}\s*/, '')}</h3>
                  }
                  if (line.match(/^-\s/)) {
                    return <p key={i} className="text-sm text-zinc-400 pl-1 py-0.5 leading-relaxed">• {line.replace(/^-\s*/, '')}</p>
                  }
                  if (line.trim() === '' || line.match(/^---/)) return <div key={i} className="h-1" />
                  if (line.trim()) return <p key={i} className="text-sm text-zinc-400 py-0.5 leading-relaxed">{line}</p>
                  return null
                })
              })()}
            </div>
          ) : (
            <div className={`prose-dark max-h-[32rem] overflow-y-auto ${streaming ? 'cursor-blink' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {aiContent || streamedText || '_Generating…_'}
              </ReactMarkdown>
            </div>
          )}

          {/* Actions */}
          {!streaming && !aiLoading && (aiContent || streamedText) && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-border flex-wrap">
              <button
                onClick={handleSaveAI}
                disabled={aiSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-3 h-3" aria-hidden="true" />
                {aiSaving ? 'Saving…' : 'Save to repo'}
              </button>
              <button
                onClick={() => handleCopy(aiContent || prepContent || fullTextRef.current || streamedText)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-success" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => handleDownload(
                  aiContent || prepContent || fullTextRef.current || streamedText,
                  `${name}-${aiMode}-${new Date().toISOString().split('T')[0]}.md`
                )}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                Download
              </button>
              <button
                onClick={aiMode === 'prep' ? handlePrepOneOnOne : aiMode === 'checkin' ? handleGenerateCheckIn : handleGenerateReview}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── About section (collapsible) ── */}
      {editingAbout ? (
        <div className="bg-surface rounded-xl border border-brand/20 p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-zinc-300">About</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditingAbout(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveAbout}
                disabled={savingAbout}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-3 h-3" aria-hidden="true" />
                {savingAbout ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <textarea
            value={aboutDraft}
            onChange={e => setAboutDraft(e.target.value)}
            placeholder="Career goals, working style, communication preferences, strengths, areas for growth…"
            className="w-full h-32 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
            autoFocus
          />
        </div>
      ) : aboutText ? (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setAboutCollapsed(!aboutCollapsed)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAboutCollapsed(!aboutCollapsed) } }}
            className="w-full flex items-center justify-between p-4 text-left group hover:bg-surface-raised/30 transition-colors cursor-pointer"
          >
            <h3 className="text-sm font-medium text-zinc-300">About</h3>
            <div className="flex items-center gap-2">
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); handleEditAbout() }}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); handleEditAbout() } }}
                className="p-1 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                aria-label="Edit about section"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              {aboutCollapsed ? <ChevronRight className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
            </div>
          </div>
          {!aboutCollapsed && (
            <div className="px-4 pb-4 prose-dark text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{aboutText}</ReactMarkdown>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={handleEditAbout}
          className="w-full bg-surface rounded-xl border border-border/50 border-dashed p-4 text-left hover:border-brand/30 hover:bg-surface-raised/30 transition-all group"
        >
          <h3 className="text-sm font-medium text-zinc-500 group-hover:text-zinc-400 mb-1">About</h3>
          <p className="text-xs text-zinc-600 group-hover:text-zinc-500">
            Add notes about career goals, working style, or communication preferences.
          </p>
        </button>
      )}

      {/* ── Job expectations (collapsible) ── */}
      {editingJobExpectations ? (
        <div className="bg-surface rounded-xl border border-brand/20 p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-zinc-300">Job expectations</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditingJobExpectations(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveJobExpectations}
                disabled={savingJobExpectations}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-3 h-3" aria-hidden="true" />
                {savingJobExpectations ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <textarea
            value={jobExpectationsDraft}
            onChange={e => setJobExpectationsDraft(e.target.value)}
            placeholder="Role expectations, competencies, performance criteria, level-specific skills…"
            className="w-full h-40 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
            autoFocus
          />
          <p className="text-xs text-zinc-600 mt-1.5">Used as AI context for reviews and check-ins.</p>
        </div>
      ) : report.jobExpectations ? (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setJobExpCollapsed(!jobExpCollapsed)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setJobExpCollapsed(!jobExpCollapsed) } }}
            className="w-full flex items-center justify-between p-4 text-left group hover:bg-surface-raised/30 transition-colors cursor-pointer"
          >
            <h3 className="text-sm font-medium text-zinc-300">Job expectations</h3>
            <div className="flex items-center gap-2">
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); handleEditJobExpectations() }}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); handleEditJobExpectations() } }}
                className="p-1 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                aria-label="Edit job expectations"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              {jobExpCollapsed ? <ChevronRight className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
            </div>
          </div>
          {!jobExpCollapsed && (
            <div className="px-4 pb-4 prose-dark text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.jobExpectations}</ReactMarkdown>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={handleEditJobExpectations}
          className="w-full bg-surface rounded-xl border border-border/50 border-dashed p-4 text-left hover:border-brand/30 hover:bg-surface-raised/30 transition-all group"
        >
          <h3 className="text-sm font-medium text-zinc-500 group-hover:text-zinc-400 mb-1">Job expectations</h3>
          <p className="text-xs text-zinc-600 group-hover:text-zinc-500">
            Add role expectations, competencies, and performance criteria. Used as AI context.
          </p>
        </button>
      )}

      {/* ── Content viewer (for expanded items) ── */}
      {viewingContent && (
        <div className="bg-surface rounded-xl border border-brand/20 p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-zinc-300">{viewingContent.title}</span>
            <button
              onClick={() => setViewingContent(null)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Close viewer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          {fileLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : fileContent ? (
            <div className="relative group/content">
              <button
                onClick={() => handleCopy(fileContent)}
                className="absolute top-0 right-0 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 transition-opacity"
                aria-label="Copy"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <div className="prose-dark text-sm max-h-96 overflow-y-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanSummaryContent(fileContent)}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Unable to load content.</p>
          )}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex gap-1.5 flex-wrap">
        {filters.map(({ id, label, icon: Icon }) => {
          const count = filterCounts[id]
          const active = activeFilter === id
          return (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
                active
                  ? 'bg-brand/10 border-brand/30 text-brand-light font-medium'
                  : 'border-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-500'
              }`}
            >
              <Icon className="w-3 h-3" aria-hidden="true" />
              {label}
              {count > 0 && id !== 'all' && (
                <span className={`text-[10px] px-1 rounded ${active ? 'bg-brand/20' : 'bg-surface-raised'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Activity Stream ── */}
      <div className="space-y-2">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Filter className="w-8 h-8 text-zinc-700 mb-3" aria-hidden="true" />
            <p className="text-sm text-zinc-500">No {activeFilter === 'all' ? 'activity' : activeFilter} entries yet</p>
          </div>
        ) : (
          filteredEntries.map(entry => (
            <StreamEntryCard
              key={entry.id}
              entry={entry}
              expanded={expandedItems.has(entry.id)}
              onToggle={() => toggleExpanded(entry.id)}
              name={name!}
              onViewContent={(path, title) => setViewingContent({ path, title })}
              onToggleAction={handleToggleAction}
              togglingItems={togglingItems}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Stream Entry Card ──

function StreamEntryCard({
  entry,
  expanded,
  onToggle,
  name,
  onViewContent,
  onToggleAction,
  togglingItems
}: {
  entry: StreamEntry
  expanded: boolean
  onToggle: () => void
  name: string
  onViewContent: (path: string, title: string) => void
  onToggleAction: (a: ActionItem) => void
  togglingItems: Set<string>
}) {
  const typeStyles: Record<string, { bg: string; text: string; label: string }> = {
    '1:1': { bg: 'bg-blue-500/10', text: 'text-blue-400', label: '1:1' },
    feedback: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Feedback' },
    action: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Actions' },
    checkin: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Check-in' },
    review: { bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Review' }
  }

  const style = typeStyles[entry.type] || typeStyles['1:1']

  return (
    <div className={`bg-surface rounded-xl border transition-all duration-150 ${entry.pinned ? 'border-brand/20' : 'border-border hover:border-zinc-500 hover:shadow-lg hover:shadow-black/10'}`}>
      {/* Collapsed header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3.5 text-left"
      >
        <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
          {style.label}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-zinc-300 truncate block">{entry.title}</span>
          {!expanded && (
            <span className="text-xs text-zinc-500 truncate block mt-0.5">{entry.preview}</span>
          )}
        </div>
        {!entry.pinned && (
          <span className="text-xs text-zinc-600 shrink-0">{formatDate(entry.date)}</span>
        )}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 animate-slide-down">
          <div className="border-t border-border pt-3">
            {entry.type === '1:1' && <MeetingDetail entry={entry} name={name} onViewContent={onViewContent} />}
            {entry.type === 'feedback' && <FeedbackDetail entry={entry} />}
            {entry.type === 'action' && <ActionDetail entry={entry} onToggleAction={onToggleAction} togglingItems={togglingItems} />}
            {entry.type === 'checkin' && <CheckinDetail entry={entry} name={name} onViewContent={onViewContent} />}
            {entry.type === 'review' && <ReviewDetail entry={entry} name={name} onViewContent={onViewContent} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Detail sub-components ──

function MeetingDetail({ entry, name, onViewContent }: { entry: StreamEntry; name: string; onViewContent: (path: string, title: string) => void }) {
  const data = entry.data as { transcript: { date: string }; summary?: { keyTopics: string[]; content: string } }

  return (
    <div className="space-y-2">
      {data.summary && data.summary.keyTopics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.summary.keyTopics.map((topic, i) => (
            <span key={i} className="px-2 py-0.5 bg-surface-raised rounded text-[11px] text-zinc-400 border border-border">
              {topic}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onViewContent(
            `meetings/${data.transcript.date}-${name}-1-1.md`,
            `1:1 Summary — ${formatDate(data.transcript.date)}`
          )}
          className="text-xs text-brand-light hover:text-brand transition-colors"
        >
          View summary →
        </button>
        <button
          onClick={() => onViewContent(
            `transcripts/processed/${data.transcript.date}-${name}-1-1.txt`,
            `1:1 Transcript — ${formatDate(data.transcript.date)}`
          )}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          View transcript →
        </button>
      </div>
    </div>
  )
}

function FeedbackDetail({ entry }: { entry: StreamEntry }) {
  const f = entry.data as FeedbackEntry

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-300 leading-relaxed">{f.content}</p>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span>{formatDate(f.date)}</span>
        {f.source && <span>from {f.source}</span>}
        {f.context && (
          <a href={f.context} target="_blank" rel="noopener noreferrer" className="text-brand-light hover:text-brand">
            View context →
          </a>
        )}
      </div>
    </div>
  )
}

function ActionDetail({ entry, onToggleAction, togglingItems }: { entry: StreamEntry; onToggleAction: (a: ActionItem) => void; togglingItems: Set<string> }) {
  const actions = entry.data as ActionItem[]

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto">
      {actions.map((a, i) => {
        const toggleKey = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
        const isToggling = togglingItems.has(toggleKey)
        return (
          <button
            key={i}
            disabled={isToggling || !a.sourceFile || a.sourceLineNumber == null}
            onClick={() => onToggleAction(a)}
            className="w-full flex items-start gap-2.5 py-1.5 px-1 rounded-lg hover:bg-surface-raised transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isToggling ? (
              <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 group-hover:border-brand group-hover:bg-brand/20 transition-colors" />
            )}
            <span className="text-sm text-zinc-300">{a.text}</span>
            {a.owner && a.owner !== 'Unknown' && (
              <span className="text-xs text-zinc-500 shrink-0 ml-auto">({a.owner})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CheckinDetail({ entry, name, onViewContent }: { entry: StreamEntry; name: string; onViewContent: (path: string, title: string) => void }) {
  const c = entry.data as { date: string; accomplishments: string[] }

  return (
    <div className="space-y-2">
      {c.accomplishments.length > 0 && (
        <ul className="space-y-1">
          {c.accomplishments.slice(0, 5).map((a, i) => (
            <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
              <span className="text-zinc-600 mt-0.5">•</span>
              {a}
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => onViewContent(
          `reports/${name}/check-ins/monthly/${c.date}.md`,
          `Check-in — ${c.date}`
        )}
        className="text-xs text-brand-light hover:text-brand transition-colors"
      >
        View full check-in →
      </button>
    </div>
  )
}

function ReviewDetail({ entry, name, onViewContent }: { entry: StreamEntry; name: string; onViewContent: (path: string, title: string) => void }) {
  const r = entry.data as { period: string; content: string }

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-400 leading-relaxed line-clamp-4">
        {r.content.slice(0, 300).replace(/[#*_]/g, '')}…
      </p>
      <button
        onClick={() => onViewContent(
          `reports/${name}/reviews/${r.period}.md`,
          `Review — ${r.period}`
        )}
        className="text-xs text-brand-light hover:text-brand transition-colors"
      >
        View full review →
      </button>
    </div>
  )
}
