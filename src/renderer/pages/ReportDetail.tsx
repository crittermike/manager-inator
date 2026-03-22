import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useReportData, useFileContent } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import { useToast } from '../components/common/Toast'
import { formatDate } from '../utils/formatDate'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  TrendingUp,
  Activity,
  Pencil
} from 'lucide-react'

type Tab = 'overview' | 'checkins' | 'transcripts' | 'feedback' | 'actions' | 'reviews' | 'prep'

function cleanSummaryContent(content: string): string {
  let cleaned = content
  cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n*/m, '').trim()
  cleaned = cleaned.replace(/^Here(?:'s| is) (?:your |the )?(?:meeting )?summary:?\s*\n*/i, '').trim()
  cleaned = cleaned.replace(/^---\n*/m, '').trim()
  cleaned = cleaned.replace(/\*\*speakers:\*\*\n(?:[-*]\s+.+\n?)*/im, '').trim()
  cleaned = cleaned.replace(/## Attendees\n(?:[-*]\s+.+\n?)*/m, '').trim()
  return cleaned
}

export function ReportDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { report, loading, error, refresh } = useReportData(name)
  const initialTab = (searchParams.get('tab') as Tab) || 'overview'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [transcriptSubTab, setTranscriptSubTab] = useState<'summary' | 'transcript'>('summary')
  const { content: fileContent, loading: fileLoading } = useFileContent(selectedFile)
  const { streaming, streamedText, generate, cancel, reset, fullTextRef } = useAI()
  const toast = useToast()
  const [showAI, setShowAI] = useState(false)
  const [prepContent, setPrepContent] = useState<string | null>(null)
  const [prepLoading, setPrepLoading] = useState(false)
  const [prepSaving, setPrepSaving] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [showAllOpen, setShowAllOpen] = useState(false)
  const [showAllDone, setShowAllDone] = useState(false)
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set())
  const [savingCheckIn, setSavingCheckIn] = useState(false)
  const [showReviewAI, setShowReviewAI] = useState(false)
  const [reviewContent, setReviewContent] = useState<string | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [savingReview, setSavingReview] = useState(false)
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  const [savingAbout, setSavingAbout] = useState(false)
  const [editingJobExpectations, setEditingJobExpectations] = useState(false)
  const [jobExpectationsDraft, setJobExpectationsDraft] = useState('')
  const [savingJobExpectations, setSavingJobExpectations] = useState(false)
  const savePrepRef = useRef<() => void>(() => {})
  const [copied, setCopied] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; cancel() }
  }, [cancel])

  // Sync selectedFile when transcriptSubTab changes (avoids setState during render)
  useEffect(() => {
    if (activeTab !== 'transcripts' || !selectedFile || !name) return
    const dateMatch = selectedFile.match(/meetings\/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) return
    const date = dateMatch[1]
    const hasSummary = report?.transcripts.find(t => t.date === date)?.hasSummary
    const summaryFile = `meetings/${date}-${name}-1-1-summary.md`
    const transcriptFile = `meetings/${date}-${name}-1-1.md`
    const isSummaryView = transcriptSubTab === 'summary' && hasSummary
    const targetFile = isSummaryView ? summaryFile : transcriptFile
    if (targetFile !== selectedFile) setSelectedFile(targetFile)
  }, [transcriptSubTab, activeTab, selectedFile, name, report?.transcripts])

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

  useKeyboardShortcut({ key: 's', handler: useCallback(() => savePrepRef.current(), []), enabled: !!prepContent && !prepSaving })

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

  const tabs: { id: Tab; label: string; icon: typeof FileText; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: BookOpen },
    { id: 'prep', label: 'Prep 1:1', icon: Sparkles },
    { id: 'checkins', label: 'Check-ins', icon: FileText, count: report.checkIns.length },
    { id: 'transcripts', label: '1-1s', icon: MessageSquare, count: report.transcripts.length },
    { id: 'feedback', label: 'Feedback', icon: Star, count: report.feedback.length },
    { id: 'actions', label: 'Action items', icon: CheckSquare, count: report.actionItems.length },
    { id: 'reviews', label: 'Reviews', icon: BookOpen, count: report.reviews.length }
  ]

  const handlePrepOneOnOne = async () => {
    setActiveTab('prep')
    setPrepLoading(true)
    setPrepContent(null)
    reset()

    // Load actual content for recent summaries
    const recentSummaryDates = report.summaries.slice(-5)
    const summaryContents = await Promise.all(
      recentSummaryDates.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${name}-1-1-summary.md`)
          return content
        } catch { return '' }
      })
    )
    const summariesText = summaryContents.filter(Boolean).join('\n\n---\n\n')
    if (!mountedRef.current) return
    const openActions = report.actionItems.filter(a => !a.completed).map(a => `- [ ] ${a.text}`).join('\n')

    // Scan other recent meetings for mentions of this person
    const displayName = report.profile.displayName
    const firstName = displayName.split(' ')[0]
    const namePattern = new RegExp(`\\b(${firstName}|${displayName})\\b`, 'i')
    const ownSummaryPrefix = `${name}-1-1`

    let crossMentions = ''
    try {
      const allMeetings = await window.api.listMeetings()
      const otherWithSummaries = allMeetings
        .filter(m => m.hasSummary && !m.filename.replace('.md', '').includes(ownSummaryPrefix))
        .slice(0, 15)

      const mentionResults = await Promise.all(
        otherWithSummaries.map(async (m) => {
          try {
            const content = await window.api.getFileContent(`meetings/${m.filename.replace('.md', '-summary.md')}`)
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
    // Use whatever source has content — result, ref, or state
    const content = result || fullTextRef.current
    if (content) {
      setPrepContent(content)
    } else {
      setPrepContent('_Failed to generate prep. Try clicking Regenerate._')
    }
    setPrepLoading(false)
  }

  const handlePrepCheckboxToggle = (lineIndex: number) => {
    if (!prepContent) return
    const lines = prepContent.split('\n')
    const line = lines[lineIndex]
    if (line.includes('- [ ] ')) {
      lines[lineIndex] = line.replace('- [ ] ', '- [x] ')
    } else if (line.includes('- [x] ')) {
      lines[lineIndex] = line.replace('- [x] ', '- [ ] ')
    }
    setPrepContent(lines.join('\n'))
  }

  const handleSavePrep = async () => {
    if (!prepContent) return
    setPrepSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      await window.api.commitFile(
        `reports/${name}/prep/${today}.md`,
        prepContent,
        `Save 1:1 prep for ${report.profile.displayName} on ${today}`
      )
      toast.success('Prep saved')
    } catch (e) {
      console.error('Failed to save prep:', e)
      toast.error('Failed to save prep')
    } finally {
      setPrepSaving(false)
    }
  }
  savePrepRef.current = handleSavePrep

  const handleGenerateCheckIn = async () => {
    setShowAI(true)
    reset()
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const recentSummaries = report.summaries.slice(-8)
    const summaryContents = await Promise.all(
      recentSummaries.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${name}-1-1-summary.md`)
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
  }

  const handleSaveCheckIn = async () => {
    const content = fullTextRef.current || streamedText
    if (!content || !name) return
    setSavingCheckIn(true)
    try {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      await window.api.commitFile(
        `reports/${name}/check-ins/monthly/${month}.md`,
        content,
        `Save ${report.profile.displayName} check-in for ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}`
      )
      toast.success('Check-in saved to repo')
    } catch (e) {
      console.error('Failed to save check-in:', e)
      toast.error('Failed to save check-in')
    } finally {
      setSavingCheckIn(false)
    }
  }

  const handleGenerateReview = async () => {
    setActiveTab('reviews')
    setShowReviewAI(true)
    setReviewLoading(true)
    setReviewContent(null)
    reset()

    const now = new Date()
    const month = now.getMonth()
    // Determine review period: H1 (Jan-Jun) or H2 (Jul-Dec)
    const year = now.getFullYear()
    const isH2 = month >= 6
    const periodLabel = isH2 ? `${year} H2 (Jul–Dec)` : `${year} H1 (Jan–Jun)`
    const periodFile = isH2 ? `${year}-H2` : `${year}-H1`

    // Load actual content for recent summaries (last 6 months worth)
    const recentSummaries = report.summaries.slice(-20)
    const summaryContents = await Promise.all(
      recentSummaries.map(async (s) => {
        try {
          const content = await window.api.getFileContent(`meetings/${s.date}-${name}-1-1-summary.md`)
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
      setReviewContent(content)
    } else {
      setReviewContent('_Failed to generate review. Try clicking Regenerate._')
    }
    setReviewLoading(false)
  }

  const handleSaveReview = async () => {
    const content = reviewContent || fullTextRef.current || streamedText
    if (!content || !name) return
    setSavingReview(true)
    try {
      const now = new Date()
      const month = now.getMonth()
      const year = now.getFullYear()
      const periodFile = month >= 6 ? `${year}-H2` : `${year}-H1`
      await window.api.commitFile(
        `reports/${name}/reviews/${periodFile}.md`,
        content,
        `Save performance review for ${report.profile.displayName} (${periodFile})`
      )
      toast.success('Review saved to repo')
      refresh()
    } catch (e) {
      console.error('Failed to save review:', e)
      toast.error('Failed to save review')
    } finally {
      setSavingReview(false)
    }
  }

  const handleEditAbout = () => {
    setAboutDraft(report.profile.about.replace(/<!--[\s\S]*?-->/g, '').trim())
    setEditingAbout(true)
  }

  const handleSaveAbout = async () => {
    if (!name) return
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
  }

  const handleEditJobExpectations = () => {
    setJobExpectationsDraft((report.jobExpectations || '').replace(/<!--[\s\S]*?-->/g, '').trim())
    setEditingJobExpectations(true)
  }

  const handleSaveJobExpectations = async () => {
    if (!name) return
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
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to dashboard
      </button>

      {/* Profile header */}
      <div className="flex items-start gap-5">
        <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center text-xl font-bold text-brand-light shrink-0">
          {report.profile.displayName.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-zinc-100">
            {report.profile.displayName}
          </h1>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-zinc-500 flex-wrap">
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

        {/* AI actions */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleGenerateCheckIn}
            disabled={streaming}
            className="flex items-center gap-2 px-3 py-2 bg-surface-raised text-zinc-300 rounded-lg text-sm hover:bg-surface-overlay transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            Generate check-in
          </button>
          <button
            onClick={handleGenerateReview}
            disabled={streaming}
            className="flex items-center gap-2 px-3 py-2 bg-surface-raised text-zinc-300 rounded-lg text-sm hover:bg-surface-overlay transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Generate review
          </button>
        </div>
      </div>

      {/* AI panel for check-in generation */}
      {showAI && (
        <div className="bg-surface rounded-xl border border-brand/20 p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Generating check-in
            </div>
            <div className="flex items-center gap-2">
              {streaming && (
                <button
                  onClick={cancel}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Stop generating
                </button>
              )}
              <button
                onClick={() => { if (streaming) cancel(); setShowAI(false) }}
                aria-label="Close check-in panel"
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className={`prose-dark max-h-96 overflow-y-auto ${streaming ? 'cursor-blink' : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {streamedText || '_Generating..._'}
            </ReactMarkdown>
          </div>
          {!streaming && streamedText && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <button
                onClick={handleSaveCheckIn}
                disabled={savingCheckIn}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-3 h-3" aria-hidden="true" />
                {savingCheckIn ? 'Saving...' : 'Save to repo'}
              </button>
              <button
                onClick={() => handleCopy(fullTextRef.current || streamedText)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                aria-label="Copy check-in to clipboard"
              >
                {copied ? <Check className="w-3 h-3 text-success" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                Copy
              </button>
              <button
                onClick={() => handleDownload(fullTextRef.current || streamedText, `${name}-checkin-${new Date().toISOString().split('T')[0]}.md`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                aria-label="Download check-in as Markdown"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                Download
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSelectedFile(null) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-brand text-brand-light'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
            {count !== undefined && count > 0 && (
              <span className="text-[11px] bg-surface-raised px-1.5 py-0.5 rounded-full">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {/* Overview */}
        {activeTab === 'overview' && (() => {
          const lastTranscript = report.transcripts.length > 0
            ? report.transcripts[report.transcripts.length - 1]
            : null
          const lastTranscriptDate = lastTranscript?.date ? new Date(lastTranscript.date) : null
          const daysSince1on1 = lastTranscriptDate
            ? Math.floor((Date.now() - lastTranscriptDate.getTime()) / (1000 * 60 * 60 * 24))
            : null
          const openItems = report.actionItems.filter(a => !a.completed)
          const completedCount = report.actionItems.filter(a => a.completed).length
          const sortedFeedback = [...report.feedback].sort((a, b) => b.date.localeCompare(a.date))
          const lastFeedbackEntry = sortedFeedback[0] ?? null
          const lastCheckIn = report.checkIns.length > 0
            ? report.checkIns[report.checkIns.length - 1]
            : null
          const recentTopics = report.summaries.slice(-5).flatMap(s => s.keyTopics).slice(-8)

          const now = new Date()
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          const lastFeedbackDaysAgo = lastFeedbackEntry
            ? Math.floor((Date.now() - new Date(lastFeedbackEntry.date).getTime()) / (1000 * 60 * 60 * 24))
            : null
          const checkInDue = !lastCheckIn || lastCheckIn.date < currentMonth
          const meetingDay = report.profile.meetingDay?.toLowerCase()
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
          const todayIndex = now.getDay()
          const meetingDayIndex = meetingDay ? dayNames.indexOf(meetingDay) : -1
          const daysUntilMeeting = meetingDayIndex >= 0
            ? (meetingDayIndex - todayIndex + 7) % 7
            : null

          const nudges: { text: string; severity: 'high' | 'medium' | 'low'; action?: () => void }[] = []
          if (daysSince1on1 !== null && daysSince1on1 > 14) {
            nudges.push({ text: `No 1:1 in ${daysSince1on1} days`, severity: 'high', action: () => { setActiveTab('prep'); handlePrepOneOnOne() } })
          }
          if (daysUntilMeeting !== null && daysUntilMeeting <= 2 && daysUntilMeeting > 0) {
            nudges.push({ text: `1:1 is in ${daysUntilMeeting} day${daysUntilMeeting !== 1 ? 's' : ''} — prep notes not generated yet`, severity: 'medium', action: () => { setActiveTab('prep'); handlePrepOneOnOne() } })
          } else if (daysUntilMeeting === 0) {
            nudges.push({ text: '1:1 is today', severity: 'high', action: () => { setActiveTab('prep'); handlePrepOneOnOne() } })
          }
          if (checkInDue) {
            nudges.push({ text: 'Monthly check-in is due', severity: 'medium', action: handleGenerateCheckIn })
          }
          if (lastFeedbackDaysAgo !== null && lastFeedbackDaysAgo > 21) {
            nudges.push({ text: `No feedback logged in ${lastFeedbackDaysAgo} days`, severity: 'medium', action: () => setActiveTab('feedback') })
          } else if (!lastFeedbackEntry) {
            nudges.push({ text: 'No feedback logged yet', severity: 'low', action: () => setActiveTab('feedback') })
          }
          if (openItems.length > 10) {
            nudges.push({ text: `${openItems.length} open action items piling up`, severity: 'medium', action: () => setActiveTab('actions') })
          }

          const recentActivity: { date: string; type: string; label: string; action?: () => void }[] = []
          for (const t of [...report.transcripts].reverse().slice(0, 3)) {
            recentActivity.push({
              date: t.date,
              type: '1:1',
              label: `1:1 meeting${t.hasSummary ? ' (summarized)' : ''}`,
              action: () => {
                setActiveTab('transcripts')
                setTranscriptSubTab('summary')
                setSelectedFile(t.hasSummary ? `meetings/${t.date}-${name}-1-1-summary.md` : `meetings/${t.date}-${name}-1-1.md`)
              }
            })
          }
          for (const f of sortedFeedback.slice(0, 2)) {
            recentActivity.push({
              date: f.date,
              type: f.type === 'positive' ? '🌟 Positive' : f.type === 'constructive' ? '🔧 Constructive' : '💬 Mixed',
              label: f.content.length > 80 ? f.content.slice(0, 80) + '...' : f.content,
              action: () => setActiveTab('feedback')
            })
          }
          for (const c of [...report.checkIns].reverse().slice(0, 1)) {
            recentActivity.push({
              date: c.date,
              type: 'Check-in',
              label: `Monthly check-in for ${c.date}`,
              action: () => {
                setActiveTab('checkins')
                setSelectedFile(`reports/${name}/check-ins/monthly/${c.date}.md`)
              }
            })
          }
          recentActivity.sort((a, b) => b.date.localeCompare(a.date))

          const aboutText = report.profile.about
            ? report.profile.about.replace(/<!--[\s\S]*?-->/g, '').trim()
            : ''

          return (
            <div className="space-y-5">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button onClick={() => setActiveTab('transcripts')} className="bg-surface rounded-xl border border-border p-4 text-left hover:border-brand/30 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Last 1:1</span>
                  </div>
                  {lastTranscript ? (
                    <>
                      <p className="text-lg font-semibold text-zinc-100">{formatDate(lastTranscript.date)}</p>
                      <p className={`text-xs mt-1 ${daysSince1on1! > 14 ? 'text-danger' : daysSince1on1! > 7 ? 'text-warning' : 'text-zinc-500'}`}>
                        {daysSince1on1} day{daysSince1on1 !== 1 ? 's' : ''} ago
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-600">None recorded</p>
                  )}
                </button>

                <button onClick={() => setActiveTab('actions')} className="bg-surface rounded-xl border border-border p-4 text-left hover:border-brand/30 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckSquare className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Action items</span>
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">{openItems.length} open</p>
                  <p className="text-xs text-zinc-500 mt-1">{completedCount} completed</p>
                </button>

                <button onClick={() => setActiveTab('feedback')} className="bg-surface rounded-xl border border-border p-4 text-left hover:border-brand/30 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Feedback</span>
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">{report.feedback.length} entries</p>
                  {lastFeedbackEntry ? (
                    <p className="text-xs text-zinc-500 mt-1">Last: {formatDate(lastFeedbackEntry.date)}</p>
                  ) : (
                    <p className="text-xs text-zinc-600 mt-1">None yet</p>
                  )}
                </button>

                <button onClick={() => setActiveTab('checkins')} className="bg-surface rounded-xl border border-border p-4 text-left hover:border-brand/30 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                    <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Check-ins</span>
                  </div>
                  <p className="text-lg font-semibold text-zinc-100">{report.checkIns.length} on file</p>
                  {lastCheckIn ? (
                    <p className="text-xs text-zinc-500 mt-1">Last: {formatDate(lastCheckIn.date)}</p>
                  ) : (
                    <p className="text-xs text-zinc-600 mt-1">None yet</p>
                  )}
                </button>
              </div>

              {/* Nudges / suggested actions */}
              {nudges.length > 0 && (
                <div className="bg-surface rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-brand-light" aria-hidden="true" />
                    <span className="text-sm font-medium text-zinc-300">Suggested actions</span>
                  </div>
                  {nudges.map((nudge, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        nudge.severity === 'high' ? 'bg-danger' : nudge.severity === 'medium' ? 'bg-warning' : 'bg-zinc-500'
                      }`} />
                      {nudge.action ? (
                        <button
                          onClick={nudge.action}
                          className="text-sm text-zinc-300 hover:text-brand-light transition-colors text-left"
                        >
                          {nudge.text}
                        </button>
                      ) : (
                        <span className="text-sm text-zinc-400">{nudge.text}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Open action items (top 5) */}
              {openItems.length > 0 && (
                <div className="bg-surface rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                      <span className="text-sm font-medium text-zinc-300">Open action items</span>
                    </div>
                    {openItems.length > 5 && (
                      <button
                        onClick={() => setActiveTab('actions')}
                        className="text-xs text-brand-light hover:text-brand transition-colors"
                      >
                        View all {openItems.length}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {openItems.slice(0, 5).map((a, i) => {
                      const toggleKey = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
                      const isToggling = togglingItems.has(toggleKey)
                      return (
                        <button
                          key={i}
                          disabled={isToggling || !a.sourceFile || a.sourceLineNumber == null}
                          onClick={async () => {
                            if (!a.sourceFile || a.sourceLineNumber == null) return
                            setTogglingItems(prev => new Set(prev).add(toggleKey))
                            try {
                              await window.api.toggleActionItem(a.sourceFile, a.sourceLineNumber)
                              refresh()
                            } catch (e) {
                              console.error('Failed to check off item:', e)
                              toast.error('Failed to update action item')
                            } finally {
                              setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
                            }
                          }}
                          className="w-full flex items-start gap-2.5 py-1.5 rounded-lg hover:bg-surface-raised transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isToggling ? (
                            <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                          ) : (
                            <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 group-hover:border-brand group-hover:bg-brand/20 transition-colors" aria-hidden="true" />
                          )}
                          <span className="text-sm text-zinc-300">{a.text}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Recent activity timeline */}
              {recentActivity.length > 0 && (
                <div className="bg-surface rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                    <span className="text-sm font-medium text-zinc-300">Recent activity</span>
                  </div>
                  <div className="space-y-3">
                    {recentActivity.slice(0, 6).map((event, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-zinc-600 mt-1.5 shrink-0" />
                          {i < Math.min(recentActivity.length, 6) - 1 && (
                            <div className="w-px h-full bg-zinc-800 min-h-[16px]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">{formatDate(event.date)}</span>
                            <span className="text-xs text-zinc-600">·</span>
                            <span className="text-xs text-zinc-500">{event.type}</span>
                          </div>
                          {event.action ? (
                            <button
                              onClick={event.action}
                              className="text-sm text-zinc-300 hover:text-brand-light transition-colors text-left mt-0.5 line-clamp-2"
                            >
                              {event.label}
                            </button>
                          ) : (
                            <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">{event.label}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Latest feedback */}
              {sortedFeedback.length > 0 && (
                <div className="bg-surface rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                      <span className="text-sm font-medium text-zinc-300">Recent feedback</span>
                    </div>
                    {sortedFeedback.length > 2 && (
                      <button
                        onClick={() => setActiveTab('feedback')}
                        className="text-xs text-brand-light hover:text-brand transition-colors"
                      >
                        View all {sortedFeedback.length}
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {sortedFeedback.slice(0, 2).map((f, i) => (
                      <div key={i} className="p-3 bg-surface-raised rounded-lg">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-xs font-medium ${
                            f.type === 'positive' ? 'text-success' :
                            f.type === 'constructive' ? 'text-warning' : 'text-blue-400'
                          }`}>
                            {f.type === 'positive' ? '🌟 Positive' : f.type === 'constructive' ? '🔧 Constructive' : '💬 Mixed'}
                          </span>
                          <span className="text-xs text-zinc-600">{formatDate(f.date)}</span>
                        </div>
                        <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">{f.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent discussion topics */}
              {recentTopics.length > 0 && (
                <div className="bg-surface rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                    <span className="text-sm font-medium text-zinc-300">Recent discussion topics</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentTopics.map((topic, i) => (
                      <span key={i} className="px-2.5 py-1 bg-surface-raised rounded-lg text-xs text-zinc-400 border border-border">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* About */}
              {editingAbout ? (
                <div className="bg-surface rounded-xl border border-brand/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-zinc-300">About</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingAbout(false)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveAbout}
                        disabled={savingAbout}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Save className="w-3 h-3" aria-hidden="true" />
                        {savingAbout ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={aboutDraft}
                    onChange={(e) => setAboutDraft(e.target.value)}
                    placeholder="Career goals, working style, communication preferences, strengths, areas for growth..."
                    className="w-full h-32 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
                    autoFocus
                  />
                  <p className="text-xs text-zinc-600 mt-1.5">Supports markdown formatting.</p>
                </div>
              ) : aboutText ? (
                <div className="bg-surface rounded-xl border border-border p-4 group/about">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-zinc-300">About</h3>
                    <button
                      onClick={handleEditAbout}
                      className="p-1 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover/about:opacity-100 transition-all"
                      aria-label="Edit about section"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="prose-dark text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{aboutText}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleEditAbout}
                  className="w-full bg-surface rounded-xl border border-border/50 border-dashed p-4 text-left hover:border-brand/30 hover:bg-surface-raised/30 transition-all group/about"
                >
                  <h3 className="text-sm font-medium text-zinc-500 group-hover/about:text-zinc-400 mb-1">About</h3>
                  <p className="text-xs text-zinc-600 group-hover/about:text-zinc-500">
                    Add notes about this person's career goals, working style, or communication preferences.
                  </p>
                </button>
              )}

              {/* Job expectations */}
              {editingJobExpectations ? (
                <div className="bg-surface rounded-xl border border-brand/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-zinc-300">Job expectations</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingJobExpectations(false)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveJobExpectations}
                        disabled={savingJobExpectations}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Save className="w-3 h-3" aria-hidden="true" />
                        {savingJobExpectations ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={jobExpectationsDraft}
                    onChange={(e) => setJobExpectationsDraft(e.target.value)}
                    placeholder="Role expectations, competencies, performance criteria, level-specific skills..."
                    className="w-full h-40 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
                    autoFocus
                  />
                  <p className="text-xs text-zinc-600 mt-1.5">Supports markdown formatting. Used as AI context for reviews and check-ins.</p>
                </div>
              ) : report.jobExpectations ? (
                <div className="bg-surface rounded-xl border border-border p-4 group/jobexp">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-zinc-300">Job expectations</h3>
                    <button
                      onClick={handleEditJobExpectations}
                      className="p-1 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover/jobexp:opacity-100 transition-all"
                      aria-label="Edit job expectations"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="prose-dark text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.jobExpectations}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleEditJobExpectations}
                  className="w-full bg-surface rounded-xl border border-border/50 border-dashed p-4 text-left hover:border-brand/30 hover:bg-surface-raised/30 transition-all group/jobexp"
                >
                  <h3 className="text-sm font-medium text-zinc-500 group-hover/jobexp:text-zinc-400 mb-1">Job expectations</h3>
                  <p className="text-xs text-zinc-600 group-hover/jobexp:text-zinc-500">
                    Add role expectations, competencies, and performance criteria. Used as AI context for reviews and check-ins.
                  </p>
                </button>
              )}
            </div>
          )
        })()}

        {/* Prep 1:1 */}
        {activeTab === 'prep' && (
          <div className="space-y-4">
            {!prepContent && !prepLoading && !streaming ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="w-8 h-8 text-zinc-700 mb-3" aria-hidden="true" />
                <p className="text-sm text-zinc-400 mb-1">Generate an AI-powered prep document for your next 1:1</p>
                <p className="text-xs text-zinc-600 mb-4">
                  Includes carry-forward action items, discussion topics, and questions based on recent meetings and feedback.
                </p>
                <button
                  onClick={handlePrepOneOnOne}
                  className="flex items-center gap-2 px-5 py-3 bg-brand text-white rounded-xl font-medium text-sm hover:bg-brand-dark transition-colors"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Generate prep
                </button>
              </div>
            ) : (prepLoading || streaming) && !prepContent ? (
              <div className="bg-surface rounded-xl border border-brand/20 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
                    <Sparkles className="w-4 h-4 animate-pulse" aria-hidden="true" />
                    Generating prep...
                  </div>
                  <button onClick={() => { cancel(); setPrepLoading(false) }} className="text-xs text-zinc-500 hover:text-zinc-300">
                    Cancel
                  </button>
                </div>
                <div className="prose-dark cursor-blink">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamedText || '_Analyzing recent meetings..._'}</ReactMarkdown>
                </div>
              </div>
            ) : prepContent ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">Check items off during your 1:1. Save to keep a record.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(prepContent || '')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                      aria-label="Copy to clipboard"
                    >
                      {copied ? <Check className="w-3 h-3 text-success" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                      Copy
                    </button>
                    <button
                      onClick={() => handleDownload(prepContent || '', `${name}-prep-${new Date().toISOString().split('T')[0]}.md`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                      aria-label="Download as Markdown"
                    >
                      <Download className="w-3 h-3" aria-hidden="true" />
                      Download
                    </button>
                    <button
                      onClick={handlePrepOneOnOne}
                      disabled={streaming || prepLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      Regenerate
                    </button>
                    <button
                      onClick={handleSavePrep}
                      disabled={prepSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" aria-hidden="true" />
                      {prepSaving ? 'Saving...' : 'Save to repo'}
                    </button>
                  </div>
                </div>
                <div className="bg-surface rounded-xl border border-border p-6">
                  {(() => {
                    const lines = prepContent.split('\n')
                    const hasCheckboxes = lines.some(l => /^(\s*)- \[[ x]\]/.test(l))
                    // If no checkboxes found, render as regular markdown
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
              </div>
            ) : null}
          </div>
        )}

        {/* Check-ins */}
        {activeTab === 'checkins' && (
          <div className="space-y-2">
            {report.checkIns.length === 0 ? (
              <EmptyState icon={FileText} text="No check-ins yet" action="Generate check-in" onAction={handleGenerateCheckIn} />
            ) : (
              <>
                {selectedFile && fileLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : selectedFile && fileContent ? (
                  <div>
                    <button onClick={() => setSelectedFile(null)} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4">
                      <ArrowLeft className="w-3 h-3" aria-hidden="true" /> Back to list
                    </button>
                    <div className="relative group/content">
                      <button
                        onClick={() => handleCopy(fileContent)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Copy to clipboard"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                      <button
                        onClick={() => handleDownload(fileContent, selectedFile?.split('/').pop() || 'check-in.md')}
                        className="absolute top-2 right-12 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Download as Markdown"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <div className="prose-dark">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ) : (
                  report.checkIns.map((c) => (
                    <button
                      key={c.date}
                      onClick={() => setSelectedFile(`reports/${name}/check-ins/monthly/${c.date}.md`)}
                      className="w-full flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-brand/30 transition-all text-left"
                    >
                      <Calendar className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                      <span className="text-sm text-zinc-300">{formatDate(c.date)}</span>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {/* Transcripts */}
        {activeTab === 'transcripts' && (
          <div className="space-y-2">
            {report.transcripts.length === 0 ? (
              <EmptyState icon={MessageSquare} text="No transcripts yet" />
            ) : (
              <>
                {selectedFile && fileLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : selectedFile && fileContent ? (
                  <div>
                    <button onClick={() => { setSelectedFile(null); setTranscriptSubTab('summary') }} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4">
                      <ArrowLeft className="w-3 h-3" aria-hidden="true" /> Back to list
                    </button>
                    {/* Sub-tabs for summary vs raw transcript */}
                    {(() => {
                      const dateMatch = selectedFile.match(/meetings\/(\d{4}-\d{2}-\d{2})/)
                      const date = dateMatch?.[1] || ''
                      const hasSummary = report.transcripts.find(t => t.date === date)?.hasSummary
                      const summaryFile = `meetings/${date}-${name}-1-1-summary.md`
                      const transcriptFile = `meetings/${date}-${name}-1-1.md`
                      return hasSummary ? (
                        <div className="flex gap-1 mb-4 bg-surface rounded-lg p-1 w-fit border border-border">
                          <button
                            onClick={() => { setTranscriptSubTab('summary'); setSelectedFile(summaryFile) }}
                            className={`px-3 py-1.5 text-xs rounded-md transition-all ${transcriptSubTab === 'summary' ? 'bg-brand/20 text-brand-light font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                            Summary
                          </button>
                          <button
                            onClick={() => { setTranscriptSubTab('transcript'); setSelectedFile(transcriptFile) }}
                            className={`px-3 py-1.5 text-xs rounded-md transition-all ${transcriptSubTab === 'transcript' ? 'bg-brand/20 text-brand-light font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                            Raw transcript
                          </button>
                        </div>
                      ) : null
                    })()}
                    <div className="prose-dark">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanSummaryContent(fileContent)}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  [...report.transcripts].reverse().map((t) => (
                    <button
                      key={t.date}
                      onClick={() => {
                        setTranscriptSubTab('summary')
                        setSelectedFile(t.hasSummary ? `meetings/${t.date}-${name}-1-1-summary.md` : `meetings/${t.date}-${name}-1-1.md`)
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-brand/30 transition-all text-left"
                    >
                      <MessageSquare className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                      <span className="text-sm text-zinc-300">{formatDate(t.date)}</span>
                      {t.hasSummary && (
                        <span className="text-[11px] bg-success/10 text-success px-2 py-0.5 rounded-full">
                          Summarized
                        </span>
                      )}
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {/* Feedback */}
        {activeTab === 'feedback' && (
          <div className="space-y-3">
            {report.feedback.length === 0 ? (
              <EmptyState icon={Star} text="No feedback logged yet" />
            ) : (
              [...report.feedback].sort((a, b) => b.date.localeCompare(a.date)).map((f, i) => (
                <div key={i} className="p-4 bg-surface rounded-xl border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-medium ${
                      f.type === 'positive' ? 'text-success' :
                      f.type === 'constructive' ? 'text-warning' : 'text-info'
                    }`}>
                      {f.type === 'positive' ? '🌟' : f.type === 'constructive' ? '🔧' : '💬'}
                      {' '}{f.type.charAt(0).toUpperCase() + f.type.slice(1)}
                    </span>
                    <span className="text-xs text-zinc-600">·</span>
                    <span className="text-xs text-zinc-500">{formatDate(f.date)}</span>
                    {f.source && (
                      <>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-500">from {f.source}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{f.content}</p>
                  {f.context && (
                    <a
                      href={f.context}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-light hover:text-brand mt-2"
                    >
                      View context →
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Action items */}
        {activeTab === 'actions' && (
          <div className="space-y-1">
            {report.actionItems.length === 0 ? (
              <EmptyState icon={CheckSquare} text="No action items" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 text-sm text-zinc-500">
                    <span>{report.actionItems.filter(a => !a.completed).length} open</span>
                    <span>{report.actionItems.filter(a => a.completed).length} completed</span>
                  </div>
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showCompleted ? 'Hide completed' : 'Show completed'}
                  </button>
                </div>
                {(() => {
                  const openItems = report.actionItems.filter(a => !a.completed)
                  const visibleOpen = showAllOpen ? openItems : openItems.slice(0, 50)
                  return visibleOpen
                })().map((a, i) => {
                  const toggleKey = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
                  const isToggling = togglingItems.has(toggleKey)
                  return (
                  <button
                    key={i}
                    disabled={isToggling || !a.sourceFile || a.sourceLineNumber == null}
                    onClick={async () => {
                      if (!a.sourceFile || a.sourceLineNumber == null) return
                      setTogglingItems(prev => new Set(prev).add(toggleKey))
                      try {
                        await window.api.toggleActionItem(a.sourceFile, a.sourceLineNumber)
                        refresh()
                      } catch (e) {
                        console.error('Failed to check off item:', e)
                        toast.error('Failed to update action item')
                      } finally {
                        setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
                      }
                    }}
                    role="checkbox"
                    aria-checked={a.completed ? 'true' : 'false'}
                    className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isToggling ? (
                      <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                    ) : (
                      <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 group-hover:border-brand group-hover:bg-brand/20 transition-colors" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-300">{a.text}</span>
                      {a.owner && a.owner !== 'Unknown' && (
                        <span className="ml-2 text-xs text-zinc-500">({a.owner})</span>
                      )}
                    </div>
                  </button>
                  )
                })}
                {!showAllOpen && report.actionItems.filter(a => !a.completed).length > 50 && (
                  <button
                    onClick={() => setShowAllOpen(true)}
                    className="w-full text-center py-2 text-xs text-brand-light hover:text-brand transition-colors"
                  >
                    Show all {report.actionItems.filter(a => !a.completed).length} open items
                  </button>
                )}
                {showCompleted && report.actionItems.filter(a => a.completed).length > 0 && (
                  <>
                    <div className="border-t border-border mt-3 pt-3">
                      <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Completed</p>
                    </div>
                    {(() => {
                      const doneItems = report.actionItems.filter(a => a.completed)
                      const visibleDone = showAllDone ? doneItems : doneItems.slice(0, 50)
                      return visibleDone
                    })().map((a, i) => {
                      const toggleKey = `${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`
                      const isToggling = togglingItems.has(toggleKey)
                      return (
                      <button
                        key={`done-${i}`}
                        disabled={isToggling || !a.sourceFile || a.sourceLineNumber == null}
                        onClick={async () => {
                          if (!a.sourceFile || a.sourceLineNumber == null) return
                          setTogglingItems(prev => new Set(prev).add(toggleKey))
                          try {
                            await window.api.toggleActionItem(a.sourceFile, a.sourceLineNumber)
                            refresh()
                          } catch (e) {
                            console.error('Failed to uncheck item:', e)
                            toast.error('Failed to update action item')
                          } finally {
                            setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
                          }
                        }}
                        role="checkbox"
                        aria-checked={a.completed ? 'true' : 'false'}
                        className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isToggling ? (
                          <div className="w-4 h-4 mt-0.5 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                        ) : (
                          <div className="w-4 h-4 mt-0.5 border border-zinc-600 rounded shrink-0 bg-brand/20 flex items-center justify-center transition-colors" aria-hidden="true">
                            <CheckSquare className="w-3 h-3 text-brand-light" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-zinc-500 line-through">{a.text}</span>
                          {a.owner && a.owner !== 'Unknown' && (
                            <span className="ml-2 text-xs text-zinc-600">({a.owner})</span>
                          )}
                        </div>
                      </button>
                      )
                    })}
                    {!showAllDone && report.actionItems.filter(a => a.completed).length > 50 && (
                      <button
                        onClick={() => setShowAllDone(true)}
                        className="w-full text-center py-2 text-xs text-brand-light hover:text-brand transition-colors"
                      >
                        Show all {report.actionItems.filter(a => a.completed).length} completed items
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Reviews */}
        {activeTab === 'reviews' && (
          <div className="space-y-2">
            {/* AI review generation panel */}
            {showReviewAI && (
              <div className="bg-surface rounded-xl border border-brand/20 p-5 animate-fade-in mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-brand-light">
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    {reviewLoading ? 'Generating performance review' : 'Performance review draft'}
                  </div>
                  <div className="flex items-center gap-2">
                    {streaming && (
                      <button
                        onClick={cancel}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Stop generating
                      </button>
                    )}
                    <button
                      onClick={() => { if (streaming) cancel(); setShowReviewAI(false); setReviewContent(null) }}
                      aria-label="Close review panel"
                      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className={`prose-dark max-h-[32rem] overflow-y-auto ${streaming ? 'cursor-blink' : ''}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {reviewContent || streamedText || '_Generating..._'}
                  </ReactMarkdown>
                </div>
                {!streaming && !reviewLoading && (reviewContent || streamedText) && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <button
                      onClick={handleSaveReview}
                      disabled={savingReview}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" aria-hidden="true" />
                      {savingReview ? 'Saving...' : 'Save to repo'}
                    </button>
                    <button
                      onClick={() => handleCopy(reviewContent || fullTextRef.current || streamedText)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                      aria-label="Copy review to clipboard"
                    >
                      {copied ? <Check className="w-3 h-3 text-success" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleDownload(reviewContent || fullTextRef.current || streamedText, `review-${name}.md`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                      aria-label="Download review as Markdown"
                    >
                      <Download className="w-3 h-3" aria-hidden="true" />
                      Download
                    </button>
                    <button
                      onClick={handleGenerateReview}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                    >
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      Regenerate
                    </button>
                  </div>
                )}
              </div>
            )}

            {report.reviews.length === 0 && !showReviewAI ? (
              <EmptyState icon={BookOpen} text="No reviews on file" action="Generate review" onAction={handleGenerateReview} />
            ) : (
              <>
                {selectedFile && fileLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : selectedFile && fileContent ? (
                  <div>
                    <button onClick={() => setSelectedFile(null)} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4">
                      <ArrowLeft className="w-3 h-3" aria-hidden="true" /> Back to list
                    </button>
                    <div className="relative group/content">
                      <button
                        onClick={() => handleCopy(fileContent)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Copy to clipboard"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                      <button
                        onClick={() => handleDownload(fileContent, selectedFile?.split('/').pop() || 'review.md')}
                        className="absolute top-2 right-12 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Download as Markdown"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <div className="prose-dark">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {!showReviewAI && (
                      <button
                        onClick={handleGenerateReview}
                        disabled={streaming}
                        className="w-full flex items-center justify-center gap-2 p-3 mb-2 bg-brand/5 border border-brand/20 rounded-lg text-sm text-brand-light hover:bg-brand/10 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" aria-hidden="true" />
                        Generate new review
                      </button>
                    )}
                    {report.reviews.map((r) => (
                      <button
                        key={r.period}
                        onClick={() => setSelectedFile(`reports/${name}/reviews/${r.period}.md`)}
                        className="w-full flex items-center gap-3 p-3 bg-surface rounded-lg border border-border hover:border-brand/30 transition-all text-left"
                      >
                        <BookOpen className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                        <span className="text-sm text-zinc-300">{r.period}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Empty state component
function EmptyState({
  icon: Icon,
  text,
  action,
  onAction
}: {
  icon: typeof FileText
  text: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-8 h-8 text-zinc-700 mb-3" aria-hidden="true" />
      <p className="text-sm text-zinc-500">{text}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="mt-3 text-sm text-brand-light hover:text-brand transition-colors"
        >
          {action}
        </button>
      )}
    </div>
  )
}
