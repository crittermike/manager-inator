import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useReportData, useFileContent, useSettings } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import { useActiveFile } from '../hooks/useActiveFile'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useToast } from '../components/common/Toast'
import { formatDate } from '../utils/formatDate'
import { FormattedDate } from '../components/common/FormattedDate'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { useListNavigation } from '../hooks/useListNavigation'
import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import type { ActionItem, CheckIn, ContextNote, FeedbackEntry, PrepEntry, PersonActivityResult } from '../../shared/types'

import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { RefineWithAI } from '../components/common/RefineWithAI'
import { OpenInExternal } from '../components/common/OpenInExternal'
import { StreamEntryCard } from '../components/report/StreamEntryCard'
import type { StreamEntry } from '../components/report/StreamEntryCard'
import {
  ArrowLeft,
  Calendar,
  MapPin,
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
  Plus,
  AlertCircle,
  Plane,
  ClipboardList,
  Trash2,
  RefreshCw,
  GitPullRequest,
  Loader2,
  Upload,
  MoreVertical,
  UserMinus,
  Maximize2
} from 'lucide-react'
import { GitHubMark } from '../components/common/GitHubMark'
import { getCheckInContext } from '../utils/checkin'

type StreamFilter = 'all' | 'context' | 'feedback' | 'action' | 'checkin' | 'review' | 'prep'

// ── Helpers ──

/** DST-safe day grouping using UTC day numbers to avoid 23h/25h day issues */
export function getTimeGroup(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'Older'
  const parts = dateStr.split('-')
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const day = parseInt(parts[2], 10)
  const date = new Date(year, month, day)
  if (isNaN(date.getTime())) return 'Older'

  const now = new Date()
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const dateUTC = Date.UTC(year, month, day)
  const diffDays = Math.round((todayUTC - dateUTC) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'Upcoming'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 7) return 'This week'
  if (diffDays <= 30) return 'This month'
  if (diffDays <= 90) return 'Last 3 months'
  return 'Older'
}

// ── Main Component ──

export function ReportDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { report, setReport, loading, error, load, refresh } = useReportData(name)
  const { streaming, streamedText, generate, cancel, reset, fullTextRef } = useAI()
  const { setActiveFile } = useActiveFile()
  const toast = useToast()
  useDocumentTitle(report?.profile?.displayName ?? name)
  const mountedRef = useRef(true)
  const aiPanelRef = useRef<HTMLDivElement>(null)

  // Stream filter state
  const initialFilter = (searchParams.get('filter') as StreamFilter) || 'all'
  const [activeFilter, setActiveFilter] = useState<StreamFilter>(initialFilter)

  // Animation replay: toggle off/on to restart CSS animations without remounting
  const [animating, setAnimating] = useState(true)
  const prevFilterRef = useRef(activeFilter)
  const rafRef = useRef<{ outer: number; inner: number }>({ outer: 0, inner: 0 })
  useLayoutEffect(() => {
    if (prevFilterRef.current !== activeFilter) {
      prevFilterRef.current = activeFilter
      cancelAnimationFrame(rafRef.current.outer)
      cancelAnimationFrame(rafRef.current.inner)
      setAnimating(false)
      rafRef.current.outer = requestAnimationFrame(() => {
        rafRef.current.inner = requestAnimationFrame(() => {
          setAnimating(true)
        })
      })
    }
  }, [activeFilter])
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current.outer)
      cancelAnimationFrame(rafRef.current.inner)
    }
  }, [])

  // Expanded item tracking
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  // AI generation states
  const [showAI, setShowAI] = useState(false)
  const [aiMode, setAiMode] = useState<'checkin' | 'review' | 'prep'>('checkin')
  const [aiContent, setAiContent] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)
  const [showAiActionsMenu, setShowAiActionsMenu] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  // Edit states
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileFields, setProfileFields] = useState({ role: '', team: '', meetingDay: '', github: '', location: '' })
  const [savingProfile, setSavingProfile] = useState(false)


  const [showActivity, setShowActivity] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityData, setActivityData] = useState<PersonActivityResult | null>(null)
  const [activityRange, setActivityRange] = useState(() => {
    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)
    return { start: weekAgo.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
  })
  const [savingSnapshot, setSavingSnapshot] = useState(false)

  // Action item toggling
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set())

  // Prep checkbox editing
  const [prepContent, setPrepContent] = useState<string | null>(null)

  // Content viewing & editing
  const [viewingContent, setViewingContent] = useState<{ id: string; path: string; title: string } | null>(null)
  const [isEditingContent, setIsEditingContent] = useState(false)
  const { content: fileContent, loading: fileLoading, error: fileError, reload: retryContent } = useFileContent(viewingContent?.path ?? null)

  // Sync viewed file to AI context
  useEffect(() => {
    if (viewingContent && fileContent != null && fileContent !== '') {
      setActiveFile({ path: viewingContent.path, title: viewingContent.title, content: fileContent })
    } else if (!viewingContent) {
      setActiveFile(null)
    }
    return () => setActiveFile(null)
  }, [viewingContent, fileContent, setActiveFile])

  // Copy state
  const [copied, setCopied] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Adding feedback
  const [addingFeedback, setAddingFeedback] = useState(false)
  const [addingReview, setAddingReview] = useState(false)
  const [ptoReports, setPtoReports] = useState<Record<string, string>>({})
  const [showPtoModal, setShowPtoModal] = useState(false)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [ptoInput, setPtoInput] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })

  // Refs
  const savePrepRef = useRef<() => void>(() => {})
  const aiActionsMenuRef = useRef<HTMLDivElement | null>(null)
  const addMenuRef = useRef<HTMLDivElement | null>(null)

  // Reset AI/panel state when switching between people
  useEffect(() => {
    if (streaming) cancel()
    setShowAI(false)
    setAiContent(null)
    setAiLoading(false)
    setAiSaving(false)
    setAiSaved(false)
    setPrepContent(null)
    setExpandedItems(new Set())
    setViewingContent(null)
    setIsEditingContent(false)
    setShowActivity(false)
    setActivityData(null)
    setAddingFeedback(false)
    setAddingReview(false)
    setDeleteTarget(null)
    reset()
  }, [name]) // eslint-disable-line react-hooks/exhaustive-deps
  const moreMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; cancel() }
  }, [cancel])

  // Single global listener for all dropdown menus — avoids re-render-triggered
  // effect setup/teardown which causes visible delay when toggling menus
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (showAiActionsMenu && aiActionsMenuRef.current && !aiActionsMenuRef.current.contains(target)) {
        setShowAiActionsMenu(false)
      }
      if (showAddMenu && addMenuRef.current && !addMenuRef.current.contains(target)) {
        setShowAddMenu(false)
      }
      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showAiActionsMenu) setShowAiActionsMenu(false)
        else if (showAddMenu) setShowAddMenu(false)
        else if (showMoreMenu) setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showAiActionsMenu, showAddMenu, showMoreMenu])

  const { settings: _rdSettings, refreshSettings } = useSettings()

  useEffect(() => {
    if (!_rdSettings) return
    if (!mountedRef.current) return
    setPtoReports(_rdSettings.ptoReports || {})
  }, [_rdSettings])

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

  const handleViewContent = useCallback((id: string, path: string, title: string) => {
    setViewingContent({ id, path, title })
    setIsEditingContent(false)
    setExpandedItems(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const handleEditContent = useCallback((id: string, path: string) => {
    setViewingContent({ id, path, title: 'Edit Content' })
    setIsEditingContent(true)
    setExpandedItems(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const handleDeleteContent = useCallback(async (path: string) => {
    setDeleteTarget(path)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await window.api.deleteFile(deleteTarget)
      toast.success('File deleted successfully')
      // Optimistically remove the deleted entry from local state
      if (report && deleteTarget.startsWith('contexts/')) {
        const deletedFilename = deleteTarget.replace('contexts/', '')
        setReport(prev => prev ? {
          ...prev,
          contextNotes: prev.contextNotes.filter(c => c.filename !== deletedFilename)
        } : prev)
      } else {
        // For non-context deletions, do a full refresh
        refresh()
      }
      setViewingContent(null)
      setIsEditingContent(false)
      setExpandedItems(prev => { const next = new Set(prev); next.delete(`context-${deleteTarget.replace('contexts/', '')}`); return next })
    } catch (err) {
      toast.error('Failed to delete file')
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, report, setReport, refresh, toast])

  const handleSaveContent = useCallback(async (path: string, newContent: string) => {
    try {
      await window.api.commitFile(path, newContent, 'Update context note')
      toast.success('Changes saved successfully')
      setIsEditingContent(false)
      setViewingContent(null)
    } catch (err) {
      toast.error('Failed to save changes')
    }
  }, [toast])

  const handleCloseContent = useCallback(() => {
    setViewingContent(null)
    setIsEditingContent(false)
  }, [])

  // ── AI Handlers (preserved from original) ──

  const handlePrepOneOnOne = useCallback(async () => {
    if (!report || !name) return
    setShowAI(true)
    requestAnimationFrame(() => aiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    setAiMode('prep')
    setAiLoading(true)
    setAiContent(null)
    setAiSaved(false)
    setPrepContent(null)
    reset()

    try {
      const recentSummaryDates = report.summaries.slice(-5)
      const summaryPaths = recentSummaryDates.map(s => `contexts/${s.filename || `${s.date}-${name}-1-1.md`}`)
      const summaryMap = await window.api.getFilesContentBulk(summaryPaths)
      const summariesText = summaryPaths.map(p => summaryMap[p]).filter(Boolean).map(c => c.slice(0, 4000)).join('\n\n---\n\n')
      if (!mountedRef.current) return
      const openActions = report.actionItems.filter(a => !a.completed).map(a => `- [ ] ${a.text}`).join('\n')

    const displayName = report.profile.displayName
    const firstName = displayName.split(' ')[0]
    const namePattern = new RegExp(`\\b(${firstName}|${displayName})\\b`, 'i')
    const ownSummaryPrefix = `${name}-1-1`

    let crossMentions = ''
    try {
      const allContexts = await window.api.listContexts()
      const otherWithSummaries = allContexts
        .filter(m => !m.filename.replace('.md', '').includes(ownSummaryPrefix))
        .slice(0, 10)

      const otherPaths = otherWithSummaries.map(m => `contexts/${m.filename}`)
      const otherMap = await window.api.getFilesContentBulk(otherPaths)
      const mentionResults = otherWithSummaries.map(m => {
        const content = otherMap[`contexts/${m.filename}`]
        if (content && namePattern.test(content)) {
          return `### ${m.title} (${m.date})\n${content.slice(0, 3000)}`
        }
        return ''
      })
      crossMentions = mentionResults.filter(Boolean).slice(0, 5).join('\n\n---\n\n')
    } catch (e) { console.debug('Cross-meeting mentions unavailable:', e) }
    if (!mountedRef.current) return

    let githubActivityText: string | undefined
    try {
      const now = new Date()
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)
      const endDate = now.toISOString().split('T')[0]
      const startDate = weekAgo.toISOString().split('T')[0]
      const activityResult = await window.api.fetchActivityForPerson(name, startDate, endDate)
      if (activityResult && activityResult.items.length > 0) {
        const sections: string[] = []
        const prs = activityResult.items.filter(i => i.type === 'pr')
        const issues = activityResult.items.filter(i => i.type === 'issue')
        const discussions = activityResult.items.filter(i => i.type === 'discussion')
        sections.push(`Summary: ${prs.length} PRs, ${issues.length} issues, ${discussions.length} discussions in the past week`)
        for (const pr of prs.slice(0, 10)) {
          let line = `- [${pr.state}] ${pr.title} (${pr.repo})`
          if (pr.reviewComments?.length) {
            line += `\n  Reviews: ${pr.reviewComments.slice(0, 3).map(r => `@${r.author} [${r.reviewState || 'comment'}]: ${r.body.split('\n')[0].slice(0, 150)}`).join('; ')}`
          }
          sections.push(line)
        }
        for (const issue of issues.slice(0, 5)) {
          let line = `- [${issue.state}] ${issue.title} (${issue.repo})`
          if (issue.issueComments?.length) {
            line += `\n  Recent comments: ${issue.issueComments.slice(0, 2).map(c => `@${c.author}: ${c.body.split('\n')[0].slice(0, 150)}`).join('; ')}`
          }
          sections.push(line)
        }
        for (const d of discussions.slice(0, 3)) {
          sections.push(`- [discussion] ${d.title} (${d.repo})`)
        }
        githubActivityText = sections.join('\n')
      }
    } catch (e) { console.debug('GitHub activity fetch is non-critical:', e) }
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
        crossMeetingMentions: crossMentions || undefined,
        githubActivity: githubActivityText
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
      setAiLoading(false)
      setAiSaving(true)
      const today = new Date().toISOString().split('T')[0]
      try {
        await window.api.commitFile(
          `reports/${name}/prep/${today}.md`,
          content,
          `Save 1:1 prep for ${report.profile.displayName} on ${today}`
        )
        toast.success('Prep saved')
        setAiSaved(true)
        setReport(prev => {
          if (!prev) return prev
          const newPrep = { date: today, content }
          const existing = prev.preps.findIndex(p => p.date === today)
          const preps = existing >= 0
            ? prev.preps.map((p, i) => i === existing ? newPrep : p)
            : [newPrep, ...prev.preps]
          return { ...prev, preps }
        })
      } catch (e) {
        console.error('Failed to auto-save prep:', e)
        toast.error('Failed to auto-save prep')
      } finally {
        setAiSaving(false)
      }
    } else {
      setAiContent('_Failed to generate prep. Try clicking Regenerate._')
    }
    setAiLoading(false)
    } catch (e) {
      if (!mountedRef.current) return
      setAiContent('_Failed to load data for prep. Try again._')
      setAiLoading(false)
    }
  }, [report, name, generate, reset, fullTextRef, toast, cancel])

  const handleGenerateCheckIn = useCallback(async () => {
    if (!report || !name) return
    setShowAI(true)
    setAiMode('checkin')
    setAiLoading(true)
    setAiContent(null)
    setAiSaved(false)
    reset()

    try {
      const { context } = await getCheckInContext(report, name)
      const result = await generate('generate-checkin', context)
      if (!mountedRef.current) return
      const content = result || fullTextRef.current
      if (content) {
        setAiContent(content)
        setAiLoading(false)
        setAiSaving(true)
        const { month } = await getCheckInContext(report, name, new Date())
        try {
          await window.api.commitFile(
            `reports/${name}/check-ins/monthly/${month}.md`,
            content,
            `Save ${report.profile.displayName} check-in for ${month}`
          )
          toast.success('Check-in saved')
          setAiSaved(true)
          setReport(prev => {
            if (!prev) return prev
            const newCheckIn = { date: month, content, accomplishments: [], concerns: [], githubActivity: {} }
            const existing = prev.checkIns.findIndex(c => c.date === month)
            const checkIns = existing >= 0
              ? prev.checkIns.map((c, i) => i === existing ? newCheckIn : c)
              : [newCheckIn, ...prev.checkIns]
            return { ...prev, checkIns }
          })
      } catch (e) {
        console.error('Failed to auto-save check-in:', e)
        toast.error('Failed to auto-save check-in')
      } finally {
          setAiSaving(false)
        }
      } else {
        setAiContent('_Failed to generate check-in. Try clicking Regenerate._')
      }
    } catch (e) {
      console.error('Failed to generate check-in:', e)
      if (!mountedRef.current) return
    } finally {
      if (mountedRef.current) setAiLoading(false)
    }
  }, [report, name, generate, reset, fullTextRef, toast])

  const handleGenerateReview = useCallback(async () => {
    if (!report || !name) return
    setShowAI(true)
    setAiMode('review')
    setAiLoading(true)
    setAiContent(null)
    setAiSaved(false)
    reset()

    try {
      const now = new Date()
      const month = now.getMonth()
      const year = now.getFullYear()
      const isH2 = month >= 6
      const periodLabel = isH2 ? `${year} H2 (Jul–Dec)` : `${year} H1 (Jan–Jun)`

      const recentSummaries = report.summaries.slice(-20)
      const reviewPaths = recentSummaries.map(s => `contexts/${s.filename || `${s.date}-${name}-1-1.md`}`)
      const reviewMap = await window.api.getFilesContentBulk(reviewPaths)
    const summariesText = recentSummaries.map(s => {
      const content = reviewMap[`contexts/${s.filename || `${s.date}-${name}-1-1.md`}`]
      return content ? `### ${s.date}\n${content.slice(0, 4000)}` : ''
    }).filter(Boolean).join('\n\n---\n\n')
    if (!mountedRef.current) return

    const checkInsText = report.checkIns.slice(-6).map(c =>
      `### ${c.date}\n${c.content || c.accomplishments.join('\n') || '(no content)'}`
    ).join('\n\n---\n\n')

    const feedbackText = report.feedback.slice(-15).map(f =>
      `${f.date} (${f.type}): ${f.content}`
    ).join('\n---\n')

    const allActions = report.actionItems.slice(-30).map(a =>
      `- [${a.completed ? 'x' : ' '}] ${a.text}`
    ).join('\n')

    let githubActivityText: string | undefined
    try {
      const halfStart = isH2 ? `${year}-07-01` : `${year}-01-01`
      const halfEnd = isH2 ? `${year}-12-31` : `${year}-06-30`
      const activityResult = await window.api.fetchActivityForPerson(name, halfStart, halfEnd)
      if (activityResult && activityResult.items.length > 0) {
        const prs = activityResult.items.filter(i => i.type === 'pr')
        const issues = activityResult.items.filter(i => i.type === 'issue')
        const discussions = activityResult.items.filter(i => i.type === 'discussion')
        const sections: string[] = []
        sections.push(`Period: ${halfStart} to ${halfEnd}`)
        sections.push(`Total: ${prs.length} PRs, ${issues.length} issues, ${discussions.length} discussions`)
        const merged = prs.filter(p => p.state === 'merged')
        const reviewed = prs.filter(p => p.reviewComments?.length)
        if (merged.length > 0) {
          sections.push('PRs merged:\n' + merged.slice(0, 15).map(pr => `- ${pr.title} (${pr.repo})`).join('\n'))
        }
        if (reviewed.length > 0) {
          sections.push('Code reviews with substantive feedback:\n' + reviewed.slice(0, 10).map(pr => {
            const reviews = pr.reviewComments!.slice(0, 2)
            return `- ${pr.title}: ${reviews.map(r => `@${r.author} [${r.reviewState}]: ${r.body.split('\n')[0].slice(0, 100)}`).join('; ')}`
          }).join('\n'))
        }
        if (issues.length > 0) {
          sections.push('Issues:\n' + issues.slice(0, 10).map(i => `- [${i.state}] ${i.title} (${i.repo})`).join('\n'))
        }
        if (discussions.length > 0) {
          sections.push('Discussions:\n' + discussions.slice(0, 5).map(d => `- ${d.title} (${d.repo})`).join('\n'))
        }
        githubActivityText = sections.join('\n\n')
      }
    } catch (e) { console.debug('GitHub activity for review is non-critical:', e) }
    if (!mountedRef.current) return

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
        actionItems: allActions || undefined,
        contextNotes: report.contextNotes.length > 0
          ? report.contextNotes.slice(-8).map(n => {
              const content = n.content.length > 2000 ? n.content.slice(0, 2000) + '...[truncated]' : n.content
              return `### ${n.date} (${n.source})\n${n.summary}\n\n${content}`
            }).join('\n\n---\n\n')
          : undefined,
        githubActivity: githubActivityText
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
    } catch (e) {
      console.error('Failed to generate review:', e)
      if (!mountedRef.current) return
      setAiContent('_Failed to load data for review. Try again._')
      setAiLoading(false)
    }
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
        const savedContent = prepContent || content
        await window.api.commitFile(
          `reports/${name}/prep/${today}.md`,
          savedContent,
          `Update 1:1 prep for ${report.profile.displayName} on ${today}`
        )
        toast.success('Prep updated')
        setReport(prev => {
          if (!prev) return prev
          const newPrep = { date: today, content: savedContent }
          const existing = prev.preps.findIndex(p => p.date === today)
          const preps = existing >= 0
            ? prev.preps.map((p, i) => i === existing ? newPrep : p)
            : [newPrep, ...prev.preps]
          return { ...prev, preps }
        })
      } else if (aiMode === 'checkin') {
        const { month } = await getCheckInContext(report, name, new Date())
        await window.api.commitFile(
          `reports/${name}/check-ins/monthly/${month}.md`,
          content,
          `Save ${report.profile.displayName} check-in for ${month}`
        )
        toast.success('Check-in saved')
        setReport(prev => {
          if (!prev) return prev
          const newCheckIn = { date: month, content, accomplishments: [], concerns: [], githubActivity: {} }
          const existing = prev.checkIns.findIndex(c => c.date === month)
          const checkIns = existing >= 0
            ? prev.checkIns.map((c, i) => i === existing ? newCheckIn : c)
            : [newCheckIn, ...prev.checkIns]
          return { ...prev, checkIns }
        })
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
        load()
      }
    } catch (e) {
      console.error('Failed to save:', e)
      toast.error('Failed to save')
    } finally {
      setAiSaving(false)
      setAiSaved(true)
    }
  }, [name, report, aiContent, aiMode, prepContent, fullTextRef, streamedText, toast, load])

  savePrepRef.current = handleSaveAI

  useKeyboardShortcut({ key: 's', handler: useCallback(() => savePrepRef.current(), []), enabled: !!aiContent && !aiSaving })
  useKeyboardShortcut({ key: 'Escape', handler: useCallback(() => setShowPtoModal(false), []), enabled: showPtoModal })

  // ── Prep checkbox toggle ──

  const handlePrepCheckboxToggle = useCallback((lineIndex: number) => {
    setPrepContent(prev => {
      if (!prev) return prev
      const lines = prev.split('\n')
      const line = lines[lineIndex]
      const wasUnchecked = line.includes('- [ ] ')
      if (wasUnchecked) {
        lines[lineIndex] = line.replace('- [ ] ', '- [x] ')
        if (name) {
          const checkboxText = line.replace(/^(\s*)- \[ \]\s*/, '')
          window.api.resolveAndToggleActionItem(name, checkboxText).catch(err => { console.error('Failed to toggle action item', err); toast.error('Failed to toggle action item') })
        }
      } else if (line.includes('- [x] ')) {
        lines[lineIndex] = line.replace('- [x] ', '- [ ] ')
      }
      return lines.join('\n')
    })
  }, [name])

  // ── Edit handlers ──

  const handleEditProfileStart = useCallback(() => {
    if (!report) return
    setProfileFields({
      role: report.profile.role || '',
      team: report.profile.team || '',
      meetingDay: report.profile.meetingDay || '',
      github: report.profile.github || '',
      location: report.profile.location || ''
    })
    setEditingProfile(true)
  }, [report])

  const handleSaveProfile = useCallback(async () => {
    if (!name || !report) return
    setSavingProfile(true)
    try {
      const content = await window.api.getFileContent(`reports/${name}/profile.md`)
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---(\n*[\s\S]*)$/)
      
      let newFmLines: string[] = []
      let body = content
      
      if (fmMatch) {
        const existingFm = fmMatch[1]
        body = fmMatch[2]
        
        const fmMap = new Map<string, string>()
        for (const line of existingFm.split('\n')) {
          const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/)
          if (m) fmMap.set(m[1], m[2])
        }
        
        fmMap.set('role', profileFields.role)
        fmMap.set('team', profileFields.team)
        fmMap.set('meetingDay', profileFields.meetingDay)
        fmMap.set('github', profileFields.github)
        fmMap.set('location', profileFields.location)
        
        for (const [k, v] of fmMap.entries()) {
          if (v) newFmLines.push(`${k}: ${v}`)
        }
      } else {
        if (profileFields.role) newFmLines.push(`role: ${profileFields.role}`)
        if (profileFields.team) newFmLines.push(`team: ${profileFields.team}`)
        if (profileFields.meetingDay) newFmLines.push(`meetingDay: ${profileFields.meetingDay}`)
        if (profileFields.github) newFmLines.push(`github: ${profileFields.github}`)
        if (profileFields.location) newFmLines.push(`location: ${profileFields.location}`)
      }
      
      const newContent = `---\n${newFmLines.join('\n')}\n---${body.startsWith('\n') ? '' : '\n\n'}${body}`
      
      await window.api.commitFile(
        `reports/${name}/profile.md`,
        newContent,
        `Update profile for ${report.profile.displayName}`
      )
      toast.success('Profile saved')
      setEditingProfile(false)
      setReport(prev => {
        if (!prev) return prev
        return {
          ...prev,
          profile: {
            ...prev.profile,
            role: profileFields.role,
            team: profileFields.team,
            meetingDay: profileFields.meetingDay,
            github: profileFields.github,
            location: profileFields.location
          }
        }
      })
    } catch (e) {
      console.error('Failed to save profile:', e)
      toast.error('Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }, [name, report, profileFields, toast])

  // ── GitHub Activity handlers ──

  const handleFetchActivity = useCallback(async () => {
    if (!name) return
    setActivityLoading(true)
    try {
      const result = await window.api.fetchActivityForPerson(name, activityRange.start, activityRange.end)
      setActivityData(result)
      if (!result || result.items.length === 0) {
        toast.info('No GitHub activity found for that date range')
      }
    } catch (e) {
      console.error('Failed to fetch activity:', e)
      toast.error('Failed to fetch GitHub activity')
    } finally {
      setActivityLoading(false)
    }
  }, [name, activityRange, toast])

  const handleOpenActivity = useCallback(() => {
    setShowActivity(true)
  }, [])

  const handleSaveSnapshot = useCallback(async () => {
    if (!name || !activityData) return
    setSavingSnapshot(true)
    try {
      await window.api.saveActivitySnapshot(name, activityRange.start, activityRange.end)
      toast.success('Activity snapshot saved to context notes')
      refresh()
    } catch (e) {
      console.error('Failed to save snapshot:', e)
      toast.error('Failed to save activity snapshot')
    } finally {
      setSavingSnapshot(false)
    }
  }, [name, activityData, activityRange, toast, refresh])

  const handleSummarizeActivity = useCallback(async () => {
    if (!activityData || !report) return
    setShowAI(true)
    setAiMode('checkin')
    setAiContent(null)
    setPrepContent(null)
    setAiSaved(false)
    // Scroll to AI panel after it renders
    requestAnimationFrame(() => aiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

    const sections: string[] = []
    const prs = activityData.items.filter(i => i.type === 'pr')
    const issues = activityData.items.filter(i => i.type === 'issue')
    const discussions = activityData.items.filter(i => i.type === 'discussion')
    sections.push(`Summary: ${prs.length} PRs, ${issues.length} issues, ${discussions.length} discussions`)
    for (const pr of prs) {
      let line = `- [${pr.state}] ${pr.title} (${pr.repo})`
      if (pr.reviewComments?.length) {
        line += `\n  Reviews: ${pr.reviewComments.slice(0, 5).map(r => `@${r.author} [${r.reviewState || 'comment'}]: ${r.body.split('\n')[0].slice(0, 200)}`).join('\n  ')}`
      }
      if (pr.issueComments?.length) {
        line += `\n  Comments: ${pr.issueComments.slice(0, 3).map(c => `@${c.author}: ${c.body.split('\n')[0].slice(0, 200)}`).join('\n  ')}`
      }
      sections.push(line)
    }
    for (const issue of issues) {
      let line = `- [${issue.state}] ${issue.title} (${issue.repo})`
      if (issue.issueComments?.length) {
        line += `\n  Comments: ${issue.issueComments.slice(0, 3).map(c => `@${c.author}: ${c.body.split('\n')[0].slice(0, 200)}`).join('\n  ')}`
      }
      sections.push(line)
    }
    for (const d of discussions) {
      sections.push(`- [discussion] ${d.title} (${d.repo})`)
    }

    try {
      const result = await generate('summarize-person-activity', {
        displayName: report.profile.displayName,
        githubUsername: report.profile.github || '',
        startDate: activityRange.start,
        endDate: activityRange.end,
        activityData: sections.join('\n')
      })
      if (mountedRef.current) {
        setAiContent(result || fullTextRef.current || '')
      }
    } catch (e) {
      console.error('Activity summary failed:', e)
      toast.error('Failed to generate activity summary')
    }
  }, [activityData, report, activityRange, generate, fullTextRef, toast])

  const handleUpdateFeedback = useCallback(async (entryIndex: number, newContent: string, newType: FeedbackEntry['type']) => {
    if (!name) return
    try {
      await window.api.updateFeedbackEntry(name, entryIndex, newContent, newType)
      toast.success('Feedback updated')
      setReport(prev => {
        if (!prev) return prev
        const newFeedback = [...prev.feedback]
        newFeedback[entryIndex] = { ...newFeedback[entryIndex], content: newContent, type: newType }
        return { ...prev, feedback: newFeedback }
      })
    } catch (e) {
      console.error('Failed to update feedback:', e)
      toast.error('Failed to update feedback')
    }
  }, [name, toast])

  const handleDeleteFeedback = useCallback(async (entryIndex: number) => {
    if (!name) return
    try {
      await window.api.deleteFeedbackEntry(name, entryIndex)
      toast.success('Feedback deleted')
      setReport(prev => {
        if (!prev) return prev
        return { ...prev, feedback: prev.feedback.filter((_, i) => i !== entryIndex) }
      })
    } catch (e) {
      console.error('Failed to delete feedback:', e)
      toast.error('Failed to delete feedback')
    }
  }, [name, toast])

  // ── Action item toggle ──

  const optimisticToggleAction = useCallback((sourceFile: string, sourceLineNumber: number) => {
    setReport(prev => {
      if (!prev) return prev
      return {
        ...prev,
        actionItems: prev.actionItems.map(item =>
          item.sourceFile === sourceFile && item.sourceLineNumber === sourceLineNumber
            ? { ...item, completed: !item.completed }
            : item
        )
      }
    })
  }, [setReport])

  const handleToggleAction = useCallback(async (a: ActionItem) => {
    if (!a.sourceFile || a.sourceLineNumber == null) return
    const toggleKey = `${a.sourceFile}:${a.sourceLineNumber}`
    const wasCompleted = a.completed
    
    // Optimistic UI update
    setTogglingItems(prev => new Set(prev).add(toggleKey))
    optimisticToggleAction(a.sourceFile, a.sourceLineNumber)
    
    try {
      await window.api.toggleActionItem(a.sourceFile, a.sourceLineNumber)
      
      if (!wasCompleted) {
        toast.success('Action item completed ✓', 'Done', { 
          label: 'Undo', 
          onClick: async () => {
            try {
              await window.api.toggleActionItem(a.sourceFile!, a.sourceLineNumber!)
              optimisticToggleAction(a.sourceFile!, a.sourceLineNumber!)
            } catch (e) {
              console.error('Failed to undo action item:', e)
              toast.error('Failed to undo')
            }
          }
        })
      }
    } catch (e) {
      console.error('Failed to toggle action item:', e)
      // Revert optimistic update on failure
      optimisticToggleAction(a.sourceFile, a.sourceLineNumber)
      toast.error('Failed to update action item')
    } finally {
      setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
    }
  }, [optimisticToggleAction, toast])

  const handleTogglePto = useCallback(async () => {
    if (!name || !report) return
    const currentExpiry = ptoReports[name]
    const isActive = !!currentExpiry && new Date(currentExpiry) > new Date()

    if (isActive) {
      const next = { ...ptoReports }
      delete next[name]
      try {
        await window.api.saveSettings({ ptoReports: next })
        setPtoReports(next)
        refreshSettings()
        toast.success(`${report.profile.displayName} marked back from PTO`)
      } catch (e) {
        console.error('Failed to update PTO status:', e)
        toast.error('Failed to update PTO status')
      }
      return
    }

    setShowPtoModal(true)
  }, [name, report, ptoReports, toast, refreshSettings])

  const handleSavePto = useCallback(async () => {
    if (!name || !report) return
    const iso = ptoInput.trim()
    if (!iso) return

    const parsed = new Date(iso + 'T00:00:00')
    if (isNaN(parsed.getTime())) {
      toast.error('Invalid date')
      return
    }

    const next = { ...ptoReports, [name]: iso }
    try {
      await window.api.saveSettings({ ptoReports: next })
      setPtoReports(next)
      refreshSettings()
      toast.success(`${report.profile.displayName} marked on PTO until ${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
      setShowPtoModal(false)
    } catch (e) {
      console.error('Failed to save PTO status:', e)
      toast.error('Failed to update PTO status')
    }
  }, [name, report, ptoReports, toast, ptoInput, refreshSettings])

  const handleDeactivate = useCallback(async () => {
    if (!name) return
    try {
      const s = await window.api.getSettings()
      const current = s.deactivatedReports || []
      if (!current.includes(name)) {
        await window.api.saveSettings({ deactivatedReports: [...current, name] })
      }
      refreshSettings()
      toast.success(`${report?.profile.displayName ?? name} deactivated`)
      setShowDeactivateConfirm(false)
      navigate('/')
    } catch (e) {
      console.error('Failed to deactivate report:', e)
      toast.error('Failed to deactivate report')
    }
  }, [name, report, toast, refreshSettings, navigate])

  // ── Build activity stream ──

  const streamEntries = useMemo((): StreamEntry[] => {
    if (!report) return []
    const entries: StreamEntry[] = []

    for (const ctx of report.contextNotes) {
      const sourceLabels: Record<string, string> = {
        slack: 'Slack',
        github: 'GitHub',
        email: 'Email',
        meeting: 'Meeting',
        other: 'Note'
      }
      const sourceLabel = sourceLabels[ctx.source] || ctx.source
      const title = ctx.title || ctx.summary || `${sourceLabel} — ${formatDate(ctx.date)}`
      entries.push({
        id: `context-${ctx.filename}`,
        type: 'context',
        date: ctx.date,
        title,
        preview: ctx.summary ? (ctx.summary.length > 120 ? ctx.summary.slice(0, 120) + '…' : ctx.summary) : '',
        data: ctx,
        source: ctx.source
      })
    }

    // Feedback
    for (let i = 0; i < report.feedback.length; i++) {
      const f = report.feedback[i]
      entries.push({
        id: `feedback-${f.date}-${i}`,
        type: 'feedback',
        date: f.date,
        title: `${f.type === 'positive' ? '👍' : f.type === 'constructive' ? '🔧' : f.type === 'observation' ? '💡' : '💬'} ${f.type.charAt(0).toUpperCase() + f.type.slice(1)}`,
        preview: (() => { const plain = f.content.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1'); return plain.length > 120 ? plain.slice(0, 120) + '…' : plain })(),
        data: { ...f, _index: i }
      })
    }

    // Check-ins
    for (const c of report.checkIns) {
      entries.push({
        id: `checkin-${c.date}`,
        type: 'checkin',
        date: c.date + '-15',
        title: `Monthly check-in — ${c.date}`,
        preview: c.accomplishments.length > 0 ? c.accomplishments[0] : '',
        data: c
      })
    }

    // Reviews
    for (const r of report.reviews) {
      // Parse period to get a sortable date
      const yearMatch = r.period.match(/(\d{4})/)
      const year = yearMatch ? yearMatch[1] : '2024'
      const isH2 = r.period.toLowerCase().includes('h2')
      entries.push({
        id: `review-${r.period}`,
        type: 'review',
        date: `${year}-${isH2 ? '07' : '01'}-15`,
        title: r.title || `Performance review — ${r.period}`,
        preview: r.content.slice(0, 120).replace(/[#*_]/g, '') + '…',
        data: r
      })
    }

    // Preps
    for (const p of (report.preps ?? [])) {
      entries.push({
        id: `prep-${p.date}`,
        type: 'prep',
        date: p.date,
        title: `1:1 Prep — ${formatDate(p.date)}`,
        preview: p.content.slice(0, 120).replace(/[#*_\[\]]/g, '').trim() + (p.content.length > 120 ? '…' : ''),
        data: p
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
    return streamEntries.filter(e => (e.pinned && activeFilter === 'action') || e.type === activeFilter)
  }, [streamEntries, activeFilter])

  // ── j/k list navigation ──
  const navEnabled = !showAI && !isEditingContent && !viewingContent && !showPtoModal
  const handleNavSelect = useCallback((index: number) => {
    const entry = filteredEntries[index]
    if (entry) toggleExpanded(entry.id)
  }, [filteredEntries, toggleExpanded])
  const { getItemProps: getNavProps } = useListNavigation({
    itemCount: filteredEntries.length,
    onSelect: handleNavSelect,
    enabled: navEnabled,
  })

  // ── Expand to full view ──
  const handleExpand = useCallback((entry: StreamEntry) => {
    if (entry.type === 'context') {
      navigate(`/context/${encodeURIComponent(entry.data.filename)}?dir=contexts`)
    } else if (entry.type === 'checkin') {
      navigate(`/context/${encodeURIComponent(entry.data.date + '.md')}?dir=reports/${name}/check-ins/monthly`)
    } else if (entry.type === 'review') {
      navigate(`/context/${encodeURIComponent(entry.data.period + '.md')}?dir=reports/${name}/reviews`)
    } else if (entry.type === 'prep') {
      navigate(`/context/${encodeURIComponent(entry.data.date + '.md')}?dir=reports/${name}/prep`)
    }
  }, [navigate, name])

  // Sync expanded entry content to AI context (for check-ins, reviews, etc.)
  useEffect(() => {
    if (viewingContent) return // File viewer has its own sync
    if (expandedItems.size !== 1) { setActiveFile(null); return }
    const expandedId = [...expandedItems][0]
    const entry = streamEntries.find(e => e.id === expandedId)
    if (!entry) return
    // Only sync types that have meaningful file content
    if (entry.type === 'checkin') {
      setActiveFile({ path: `reports/${name}/check-ins/monthly/${entry.data.date}.md`, title: entry.title, content: '' })
    } else if (entry.type === 'review') {
      if (entry.data.content) setActiveFile({ path: `reports/${name}/reviews/${entry.data.period}.md`, title: entry.title, content: entry.data.content })
    } else if (entry.type === 'context') {
      setActiveFile({ path: `contexts/${entry.data.filename}`, title: entry.title, content: entry.data.summary || '' })
    } else if (entry.type === 'feedback') {
      setActiveFile({ path: '', title: entry.title, content: entry.data.content })
    }
  }, [expandedItems, streamEntries, viewingContent, name, setActiveFile])

  // ── Pre-computed values (must be above early returns to preserve hook ordering) ──

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        {/* Profile header skeleton */}
        <div className="flex items-center gap-4">
          <div className="skeleton w-10 h-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="skeleton h-6 w-48 rounded" />
            <div className="skeleton h-4 w-32 rounded" />
          </div>
        </div>
        {/* Key facts skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
        {/* Filter bar skeleton */}
        <div className="flex gap-2">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-8 w-20 rounded-lg" />)}
        </div>
        {/* Stream entries skeleton */}
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-surface rounded-xl border border-border p-5">
              <div className="space-y-3">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4 p-8 bg-surface-raised/50 rounded-2xl border border-border max-w-sm">
          <div className="w-12 h-12 mx-auto rounded-full bg-zinc-800 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-zinc-500" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-1">{error || 'We looked everywhere but couldn\'t find this report 🕵️'}</h3>
            <p className="text-xs text-zinc-500">This person may not exist in your data repo, or the profile hasn't been set up yet.</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-200 bg-surface hover:bg-surface-overlay rounded-lg border border-border transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Today
          </button>
        </div>
      </div>
    )
  }

  const aboutText = report.profile.about ? report.profile.about.replace(/<!--[\s\S]*?-->/g, '').trim() : ''
  const ptoExpiry = name ? ptoReports[name] : undefined
  const isOnPto = !!ptoExpiry && new Date(ptoExpiry) > new Date()

  const filterCounts: Record<StreamFilter, number> = {
    all: streamEntries.length,
    context: streamEntries.filter(e => e.type === 'context').length,
    feedback: streamEntries.filter(e => e.type === 'feedback').length,
    action: report.actionItems.filter(a => !a.completed).length,
    checkin: streamEntries.filter(e => e.type === 'checkin').length,
    review: streamEntries.filter(e => e.type === 'review').length,
    prep: streamEntries.filter(e => e.type === 'prep').length
  }

  const filters: { id: StreamFilter; label: string; icon: typeof FileText }[] = [
    { id: 'all', label: 'All', icon: Filter },
    { id: 'context', label: 'Context', icon: MessageSquare },
    { id: 'prep', label: 'Prep', icon: ClipboardList },
    { id: 'feedback', label: 'Feedback', icon: Star },
    { id: 'action', label: 'Actions', icon: CheckSquare },
    { id: 'checkin', label: 'Check-ins', icon: FileText },
    { id: 'review', label: 'Reviews', icon: BookOpen }
  ]

  // ── Render ──

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Back + breadcrumb */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Today
      </button>

      {/* ── Profile header ── */}
      <div className="rounded-2xl border border-border/60 bg-surface">
        <div className="bg-gradient-to-r from-brand/[0.06] via-transparent to-transparent px-4 py-5">
          <div className="flex items-start gap-5">
            {report.profile.github ? (
              <img src={`https://github.com/${report.profile.github}.png?size=112`} alt={report.profile.displayName} className="w-14 h-14 rounded-2xl shrink-0 object-cover ring-1 ring-brand/20" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand/30 to-brand/10 ring-1 ring-brand/20 flex items-center justify-center text-lg font-bold text-brand-light shrink-0">
                {report.profile.displayName.split(' ').map(n => n[0]).join('')}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">
                  {report.profile.displayName}
                </h1>
                <button
                  onClick={handleEditProfileStart}
                  className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors hover:bg-white/[0.06] rounded"
                  aria-label="Edit profile"
                >
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                </button>
                <div className="flex-1" />
                {/* Generate + More menu in header */}
                <div className="flex items-center gap-2">
                  <div className="relative" ref={aiActionsMenuRef}>
                    <button
                      onClick={() => setShowAiActionsMenu(prev => !prev)}
                      disabled={streaming || aiLoading}
                      aria-label="Generate"
                      aria-haspopup="menu"
                      aria-expanded={showAiActionsMenu}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-4 h-4" aria-hidden="true" />
                      Generate
                      <ChevronDown className={`w-4 h-4 transition-transform ${showAiActionsMenu ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>

                    {showAiActionsMenu && (
                      <div
                        role="menu"
                        aria-label="Generate menu"
                        className="absolute right-0 top-full z-20 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-border bg-surface-raised py-1 shadow-2xl shadow-black/30"
                      >
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowAiActionsMenu(false)
                            void handlePrepOneOnOne()
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-surface-overlay hover:text-zinc-100"
                        >
                          <ClipboardList className="w-4 h-4 text-brand-light" aria-hidden="true" />
                          (Weekly) 1:1 prep
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowAiActionsMenu(false)
                            void handleGenerateCheckIn()
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-surface-overlay hover:text-zinc-100"
                        >
                          <CheckSquare className="w-4 h-4 text-brand-light" aria-hidden="true" />
                          (Monthly) Performance check-in
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowAiActionsMenu(false)
                            void handleGenerateReview()
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-surface-overlay hover:text-zinc-100"
                        >
                          <BookOpen className="w-4 h-4 text-brand-light" aria-hidden="true" />
                          (6 months) Performance review
                        </button>
                        <div className="my-1 h-px bg-border" role="separator" />
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowAiActionsMenu(false)
                            handleOpenActivity()
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-surface-overlay hover:text-zinc-100"
                        >
                          <GitPullRequest className="w-4 h-4 text-brand-light" aria-hidden="true" />
                          GitHub activity summary
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="relative" ref={moreMenuRef}>
                    <button
                      onClick={() => setShowMoreMenu(prev => !prev)}
                      aria-label="More actions"
                      aria-haspopup="menu"
                      aria-expanded={showMoreMenu}
                      className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" aria-hidden="true" />
                    </button>

                    {showMoreMenu && (
                      <div
                        role="menu"
                        aria-label="More actions menu"
                        className="absolute right-0 top-full z-20 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-border bg-surface-raised py-1 shadow-2xl shadow-black/30"
                      >
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowMoreMenu(false)
                            setAddingReview(true)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-surface-overlay hover:text-zinc-100"
                        >
                          <BookOpen className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                          Add past review
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowMoreMenu(false)
                            refresh()
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-surface-overlay hover:text-zinc-100"
                        >
                          <RefreshCw className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                          Refresh data
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowMoreMenu(false)
                            handleTogglePto()
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-overlay ${
                            isOnPto ? 'text-amber-300' : 'text-zinc-300 hover:text-zinc-100'
                          }`}
                        >
                          <Plane className={`w-4 h-4 ${isOnPto ? 'text-amber-400' : 'text-zinc-400'}`} aria-hidden="true" />
                          {isOnPto ? 'Clear PTO' : 'Mark PTO'}
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setShowMoreMenu(false)
                            setShowDeactivateConfirm(true)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-surface-overlay"
                        >
                          <UserMinus className="w-4 h-4" aria-hidden="true" />
                          Deactivate
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
          {/* Identity facts inline */}
          <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-500 flex-wrap">
            {report.profile.role && (
              <span className="flex items-center gap-1">
                <Briefcase className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                {report.profile.role}
              </span>
            )}
            {report.profile.team && (
              <span className="flex items-center gap-1">
                {report.profile.team}
              </span>
            )}
            {report.profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                {report.profile.location}
              </span>
            )}
            {report.profile.github && (
              <span className="flex items-center gap-1">
                <GitHubMark className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                @{report.profile.github}
              </span>
            )}
            {report.profile.meetingDay && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                {report.profile.meetingDay.includes('/')
                  ? report.profile.meetingDay.split('/').map(d => d.trim() + 's').join(' & ')
                  : report.profile.meetingDay + 's'
                }
              </span>
            )}
            {report.profile.timezone && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-zinc-600" aria-hidden="true" />
                {report.profile.timezone}
              </span>
            )}
          </div>
          {isOnPto && ptoExpiry && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <Plane className="w-3.5 h-3.5" aria-hidden="true" />
              On PTO until {new Date(ptoExpiry + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
      </div>
      </div>

      </div>

      {addingReview && (
        <InlineReviewForm
          name={name!}
          report={report}
          toast={toast}
          refresh={refresh}
          onClose={() => setAddingReview(false)}
        />
      )}

      {editingProfile && (
        <div className="bg-surface rounded-xl border border-brand/20 p-4 animate-fade-in space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-300">Edit Profile</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditingProfile(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
              >
                <Save className="w-3 h-3" aria-hidden="true" />
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Role</label>
              <input
                type="text"
                value={profileFields.role}
                onChange={e => setProfileFields({ ...profileFields, role: e.target.value })}
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Team</label>
              <input
                type="text"
                value={profileFields.team}
                onChange={e => setProfileFields({ ...profileFields, team: e.target.value })}
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Meeting Days</label>
              <div className="flex gap-1.5">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => {
                  const selected = profileFields.meetingDay
                    .split('/')
                    .map(d => d.trim().toLowerCase())
                    .includes(day.toLowerCase())
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const current = profileFields.meetingDay
                          .split('/')
                          .map(d => d.trim())
                          .filter(Boolean)
                        const updated = selected
                          ? current.filter(d => d.toLowerCase() !== day.toLowerCase())
                          : [...current, day]
                        setProfileFields({ ...profileFields, meetingDay: updated.join('/') })
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-brand/20 text-brand-light border border-brand/30'
                          : 'bg-surface-raised text-zinc-500 border border-border hover:text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">GitHub</label>
              <input
                type="text"
                value={profileFields.github}
                onChange={e => setProfileFields({ ...profileFields, github: e.target.value })}
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand/40 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Location</label>
              <input
                type="text"
                value={profileFields.location}
                onChange={e => setProfileFields({ ...profileFields, location: e.target.value })}
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand/40 transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Inline feedback form ── */}
      {addingFeedback && (
        <InlineFeedbackForm
          name={name!}
          report={report}
          toast={toast}
          refresh={refresh}
          onClose={() => setAddingFeedback(false)}
        />
      )}

      {/* ── AI Panel (unified for prep/checkin/review) ── */}
      {showAI && (
        <div ref={aiPanelRef} className="bg-surface rounded-xl border border-brand/20 p-5 animate-fade-in">
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
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{prepContent}</ReactMarkdown>
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
                          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={{ p: ({ children }) => <>{children}</> }}>{unchecked[2]}</ReactMarkdown>
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
                          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={{ p: ({ children }) => <>{children}</> }}>{checked[2]}</ReactMarkdown>
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
              {streaming ? (
                <div className="text-sm whitespace-pre-wrap text-zinc-300">{streamedText || 'Generating...'}</div>
              ) : (
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                  {aiContent || streamedText || '_Generating…_'}
                </ReactMarkdown>
              )}
            </div>
          )}

          {/* Actions */}
          {!streaming && !aiLoading && (aiContent || streamedText) && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-border flex-wrap items-center">
              {aiSaving ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-brand-light">
                  <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  Saving…
                </span>
              ) : aiSaved ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-success">
                  <Check className="w-3 h-3" aria-hidden="true" />
                  Saved
                </span>
              ) : (
                <button
                  onClick={handleSaveAI}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand text-white hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] shadow-lg shadow-brand/10"
                >
                  <Save className="w-3 h-3" aria-hidden="true" />
                  {aiMode === 'prep' ? 'Save changes' : 'Save to repo'}
                </button>
              )}
              <button
                onClick={() => handleCopy(aiContent || prepContent || fullTextRef.current || streamedText)}
                className="p-2 text-zinc-500 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                aria-label={copied ? 'Copied' : 'Copy AI content'}
              >
                {copied ? <Check className="w-3 h-3 text-success" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
              </button>
              <button
                onClick={() => handleDownload(
                  aiContent || prepContent || fullTextRef.current || streamedText,
                  `${name}-${aiMode}-${new Date().toISOString().split('T')[0]}.md`
                )}
                className="p-2 text-zinc-500 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors"
                aria-label="Download AI content"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
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

      {/* ── GitHub Activity Panel ── */}
      {showActivity && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-brand-light" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-200">GitHub Activity</span>
              {activityData && (
                <span className="text-xs text-zinc-500">
                  {activityData.items.length} items
                </span>
              )}
            </div>
            <button
              onClick={() => setShowActivity(false)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Close activity panel"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-zinc-500 mb-1">From</label>
                <input
                  type="date"
                  value={activityRange.start}
                  onChange={e => setActivityRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-brand/40"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-zinc-500 mb-1">To</label>
                <input
                  type="date"
                  value={activityRange.end}
                  onChange={e => setActivityRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-brand/40"
                />
              </div>
              <div className="flex gap-1.5">
                {[
                  { label: 'Week', days: 7 },
                  { label: 'Month', days: 30 },
                  { label: 'Quarter', days: 90 }
                ].map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      const end = new Date()
                      const start = new Date(end)
                      start.setDate(start.getDate() - preset.days)
                      setActivityRange({
                        start: start.toISOString().split('T')[0],
                        end: end.toISOString().split('T')[0]
                      })
                    }}
                    className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleFetchActivity}
                disabled={activityLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
              >
                {activityLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <GitPullRequest className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {activityLoading ? 'Fetching…' : 'Fetch'}
              </button>
            </div>

            {activityData && activityData.items.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                  {(() => {
                    const prs = activityData.items.filter(i => i.type === 'pr')
                    const authored = prs.filter(i => i.role !== 'commenter')
                    const reviewed = prs.filter(i => i.role === 'commenter')
                    const issues = activityData.items.filter(i => i.type === 'issue')
                    const issueAuthored = issues.filter(i => i.role !== 'commenter')
                    const issueCommented = issues.filter(i => i.role === 'commenter')
                    const discussions = activityData.items.filter(i => i.type === 'discussion')
                    const parts: string[] = []
                    if (authored.length > 0) parts.push(`${authored.length} PRs authored`)
                    if (reviewed.length > 0) parts.push(`${reviewed.length} PRs reviewed`)
                    if (issueAuthored.length > 0) parts.push(`${issueAuthored.length} issues created`)
                    if (issueCommented.length > 0) parts.push(`${issueCommented.length} issues commented`)
                    if (discussions.length > 0) parts.push(`${discussions.length} discussions`)
                    return parts.map((p, i) => (
                      <span key={i}>{i > 0 && <span className="mr-3">·</span>}{p}</span>
                    ))
                  })()}
                </div>

                {(() => {
                  const groups: { label: string; type: string; emoji: string; roleLabels: [string, string] }[] = [
                    { label: 'Pull Requests', type: 'pr', emoji: '🔀', roleLabels: ['Authored', 'Reviewed'] },
                    { label: 'Issues', type: 'issue', emoji: '📋', roleLabels: ['Created', 'Commented'] },
                    { label: 'Discussions', type: 'discussion', emoji: '💬', roleLabels: ['Started', 'Commented'] }
                  ]
                  return groups.map(group => {
                    const allItems = activityData.items.filter(i => i.type === group.type)
                    if (allItems.length === 0) return null
                    const authored = allItems.filter(i => i.role !== 'commenter')
                    const commented = allItems.filter(i => i.role === 'commenter')
                    const sections = [
                      { items: authored, label: group.roleLabels[0] },
                      { items: commented, label: group.roleLabels[1] }
                    ].filter(s => s.items.length > 0)
                    return (
                      <div key={group.type}>
                        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
                          {group.emoji} {group.label} ({allItems.length})
                        </h4>
                        {sections.map(section => (
                          <div key={section.label} className="mb-3">
                            {sections.length > 1 && (
                              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5 ml-1">{section.label} ({section.items.length})</div>
                            )}
                            <div className="space-y-1.5">
                          {section.items.map(item => {
                            const stateColor = item.state === 'merged' ? 'text-purple-400'
                              : item.state === 'open' ? 'text-green-400'
                              : item.state === 'closed' ? 'text-zinc-500'
                              : 'text-zinc-400'
                            const itemId = `activity-${item.id}`
                            const isExpanded = expandedItems.has(itemId)
                            const hasDetails = (item.reviewComments && item.reviewComments.length > 0) ||
                                             (item.issueComments && item.issueComments.length > 0)
                            return (
                              <div key={item.id} className="rounded-lg bg-surface-raised border border-border/50">
                                <button
                                  onClick={() => hasDetails && toggleExpanded(itemId)}
                                  className={`w-full flex items-start gap-2 px-3 py-2 text-left ${hasDetails ? 'cursor-pointer hover:bg-zinc-800/50' : 'cursor-default'}`}
                                >
                                  <span className={`text-xs mt-0.5 ${stateColor}`}>●</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="text-sm text-zinc-200 hover:text-brand-light transition-colors truncate"
                                      >
                                        {item.title}
                                      </a>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                                      <span>{item.repo}</span>
                                      <span>·</span>
                                      <span className={stateColor}>{item.state}</span>
                                      {item.comments > 0 && (
                                        <>
                                          <span>·</span>
                                          <span>{item.comments} comments</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {hasDetails && (
                                    isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 mt-1 shrink-0" aria-hidden="true" />
                      : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 mt-1 shrink-0" aria-hidden="true" />
                                  )}
                                </button>
                                {isExpanded && hasDetails && (
                                  <div className="px-3 pb-2 pt-0 ml-5 space-y-1.5 border-t border-border/30">
                                    {item.reviewComments && item.reviewComments.length > 0 && (
                                      <div className="mt-2">
                                        <span className="text-xs text-zinc-500 font-medium">Reviews:</span>
                                        {item.reviewComments.map((r, ri) => (
                                          <div key={ri} className="mt-1 text-xs text-zinc-400 pl-2 border-l-2 border-purple-500/30">
                                            <span className="text-zinc-300">@{r.author}</span>
                                            {r.reviewState && (
                                              <span className={`ml-1 px-1 py-0.5 rounded text-[10px] ${
                                                r.reviewState === 'APPROVED' ? 'bg-green-500/10 text-green-400' :
                                                r.reviewState === 'CHANGES_REQUESTED' ? 'bg-red-500/10 text-red-400' :
                                                'bg-zinc-500/10 text-zinc-400'
                                              }`}>{r.reviewState}</span>
                                            )}
                                            {r.body && <p className="mt-0.5 text-zinc-500 leading-relaxed">{r.body.split('\n')[0].slice(0, 300)}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {item.issueComments && item.issueComments.length > 0 && (
                                      <div className="mt-2">
                                        <span className="text-xs text-zinc-500 font-medium">Comments:</span>
                                        {item.issueComments.map((c, ci) => (
                                          <div key={ci} className="mt-1 text-xs text-zinc-400 pl-2 border-l-2 border-blue-500/30">
                                            <span className="text-zinc-300">@{c.author}</span>
                                            <p className="mt-0.5 text-zinc-500 leading-relaxed">{c.body.split('\n')[0].slice(0, 300)}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })
                })()}

                <div className="flex gap-2 pt-2 border-t border-border">
                  <button
                    onClick={handleSaveSnapshot}
                    disabled={savingSnapshot}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-raised text-zinc-300 hover:text-zinc-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" aria-hidden="true" />
                    {savingSnapshot ? 'Saving…' : 'Save Snapshot'}
                  </button>
                  <button
                    onClick={handleSummarizeActivity}
                    disabled={streaming || aiLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    AI Summary
                  </button>
                </div>
              </div>
            )}

            {activityData && activityData.items.length === 0 && !activityLoading && (
              <div className="text-center py-6 text-sm text-zinc-500">
                No GitHub activity found for this date range.
                {!report.profile.github && (
                  <p className="mt-1 text-xs text-zinc-600">
                    Tip: Add a GitHub username to this person's profile.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <EditableDetailsPanel report={report} name={name!} aboutText={aboutText} toast={toast} setReport={setReport} />

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
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-surface-raised flex items-center justify-center mb-4">
              <Filter className="w-6 h-6 text-zinc-500" aria-hidden="true" />
            </div>
            {activeFilter === 'all' ? (
              <div className="space-y-6 max-w-md">
                <div>
                  <p className="text-sm font-medium text-zinc-300 mb-1">No activity yet</p>
                  <p className="text-sm text-zinc-500">Here's how to start building this person's history:</p>
                </div>
                <div className="grid gap-3 text-left">
                  <div className="flex items-start gap-3 bg-surface rounded-lg border border-border p-3">
                    <Upload className="w-4 h-4 text-brand-light mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-zinc-300">Process a meeting transcript</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Use the capture panel (<kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono text-[10px]">cmd+shift+c</kbd>) to paste a transcript and extract summaries, action items, and feedback.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-surface rounded-lg border border-border p-3">
                    <MessageSquare className="w-4 h-4 text-brand-light mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-zinc-300">Add feedback</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Use the "Add feedback" button above to log feedback as it happens — positive, constructive, or mixed.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-surface rounded-lg border border-border p-3">
                    <ClipboardList className="w-4 h-4 text-brand-light mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-zinc-300">Prep a 1:1</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Click "Prep 1:1" above to generate a prep doc with talking points based on recent activity.</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, shiftKey: true, bubbles: true }))
                  }}
                  className="text-sm text-brand-light hover:text-brand transition-colors"
                >
                  Open capture panel to process a transcript
                </button>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No {activeFilter} entries yet</p>
            )}
          </div>
        ) : (
          (() => {
            let lastGroup = ''
            return filteredEntries.map((entry, idx) => {
              const toggleKey = entry.type === 'action'
                ? entry.data.some(a => togglingItems.has(`${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`))
                : false
              const group = entry.pinned ? '' : getTimeGroup(entry.date)
              const showHeader = group && group !== lastGroup
              if (showHeader) lastGroup = group
              return (
                <div key={entry.id}>
                  {showHeader && (
                    <div className={`flex items-center gap-3 ${idx === 0 || (idx === 1 && filteredEntries[0]?.pinned) ? '' : 'mt-6'} mb-2`} role="heading" aria-level={3}>
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{group}</span>
                      <hr className="flex-1 border-0 h-px bg-border" aria-hidden="true" />
                    </div>
                  )}
                  <div {...getNavProps(idx)} className={animating ? 'animate-fade-up' : ''} style={animating ? { animationDelay: `${Math.min(idx * 50, 300)}ms`, animationFillMode: 'both' } : undefined}>
                  <StreamEntryCard
                    entry={entry}
                    expanded={expandedItems.has(entry.id)}
                    onToggle={toggleExpanded}
                    name={name!}
                    onViewContent={handleViewContent}
                    onToggleAction={handleToggleAction}
                    isToggling={toggleKey}
                    isViewing={viewingContent?.id === entry.id}
                    viewingPath={viewingContent?.path ?? null}
                    viewingTitle={viewingContent?.title ?? null}
                    fileContent={fileContent}
                    fileLoading={fileLoading}
                    fileError={fileError}
                    onRetryContent={retryContent}
                    onCloseContent={handleCloseContent}
                    onCopyContent={handleCopy}
                    copied={copied}
                    isEditing={isEditingContent}
                    onEditContent={handleEditContent}
                    onDeleteContent={handleDeleteContent}
                    onSaveContent={handleSaveContent}
                    onCancelEdit={() => { setIsEditingContent(false); setViewingContent(null) }}
                    onUpdateFeedback={handleUpdateFeedback}
                    onDeleteFeedback={handleDeleteFeedback}
                    onExpand={['context', 'checkin', 'review', 'prep'].includes(entry.type) ? handleExpand : undefined}
                  />
                  </div>
                </div>
              )
            })
          })()
        )}
      </div>

      {/* ── PTO Modal ── */}
      {showPtoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="pto-dialog-title">
          <div className="bg-surface rounded-xl border border-border p-5 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 id="pto-dialog-title" className="text-lg font-bold text-zinc-100">PTO return date</h3>
              <button
                onClick={() => setShowPtoModal(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-surface-raised"
                aria-label="Close PTO modal"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const d = new Date()
                    d.setDate(d.getDate() + 7)
                    setPtoInput(d.toISOString().split('T')[0])
                  }}
                  className="flex-1 py-2 px-3 text-sm rounded-lg border transition-colors bg-surface-raised border-border text-zinc-300 hover:bg-surface-overlay"
                >
                  1 week
                </button>
                <button
                  onClick={() => {
                    const d = new Date()
                    d.setDate(d.getDate() + 14)
                    setPtoInput(d.toISOString().split('T')[0])
                  }}
                  className="flex-1 py-2 px-3 text-sm rounded-lg border transition-colors bg-surface-raised border-border text-zinc-300 hover:bg-surface-overlay"
                >
                  2 weeks
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Return date</label>
                <input
                  type="date"
                  value={ptoInput}
                  onChange={e => setPtoInput(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand/40 transition-colors"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSavePto()
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowPtoModal(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePto}
                  disabled={!ptoInput.trim()}
                  className="px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-dark transition-all active:scale-[0.97] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirmation ── */}
      {showDeactivateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="deactivate-dialog-title">
          <div className="bg-surface rounded-xl border border-border p-5 w-96 shadow-2xl">
            <h3 id="deactivate-dialog-title" className="text-lg font-bold text-zinc-100 mb-2">Deactivate {report?.profile.displayName}?</h3>
            <p className="text-sm text-zinc-400 mb-4">
              They&#39;ll be hidden from the sidebar and Today page. Their data will be preserved and you can reactivate them anytime from Settings.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeactivateConfirm(false)} className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
              <button onClick={handleDeactivate} className="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors">Deactivate</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete file"
        message="Are you sure you want to delete this file? This cannot be undone."
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ── Editable Details Panel (About + Job Expectations) ──
// Extracted to isolate textarea draft state from ReportDetail re-renders

function EditableDetailsPanel({ report, name, aboutText, toast, setReport }: {
  report: NonNullable<ReturnType<typeof useReportData>['report']>
  name: string
  aboutText: string
  toast: ReturnType<typeof useToast>
  setReport: React.Dispatch<React.SetStateAction<ReturnType<typeof useReportData>['report']>>
}) {
  const [detailsTab, setDetailsTab] = useState<'about' | 'expectations'>('about')
  const [detailsCollapsed, setDetailsCollapsed] = useState(false)
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  const [savingAbout, setSavingAbout] = useState(false)
  const [editingJobExpectations, setEditingJobExpectations] = useState(false)
  const [jobExpectationsDraft, setJobExpectationsDraft] = useState('')
  const [savingJobExpectations, setSavingJobExpectations] = useState(false)

  const handleEditAbout = useCallback(() => {
    setAboutDraft((report.profile.about || '').replace(/<!--[\s\S]*?-->/g, '').trim())
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
      setReport(prev => prev ? { ...prev, profile: { ...prev.profile, about: aboutDraft.trim() } } : prev)
    } catch (e) {
      console.error('Failed to save about:', e)
      toast.error('Failed to save about section')
    } finally {
      setSavingAbout(false)
    }
  }, [name, report, aboutDraft, toast])

  const handleEditJobExpectations = useCallback(() => {
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
      setReport(prev => prev ? { ...prev, jobExpectations: jobExpectationsDraft.trim() + '\n' } : prev)
    } catch (e) {
      console.error('Failed to save job expectations:', e)
      toast.error('Failed to save job expectations')
    } finally {
      setSavingJobExpectations(false)
    }
  }, [name, report, jobExpectationsDraft, toast])

  if (detailsCollapsed) {
    return (
      <div className="flex items-center gap-3 px-1">
        <button
          onClick={() => { setDetailsTab('about'); setDetailsCollapsed(false) }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          About
        </button>
        <span className="text-zinc-700">·</span>
        <button
          onClick={() => { setDetailsTab('expectations'); setDetailsCollapsed(false) }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          Expectations
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <div className="flex gap-1">
          <button
            onClick={() => { setDetailsTab('about'); setDetailsCollapsed(false) }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              detailsTab === 'about'
                ? 'bg-surface-raised text-zinc-200 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            About
          </button>
          <button
            onClick={() => { setDetailsTab('expectations'); setDetailsCollapsed(false) }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              detailsTab === 'expectations'
                ? 'bg-surface-raised text-zinc-200 font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Expectations
          </button>
        </div>
        <div className="flex items-center gap-1">
          {!editingAbout && !editingJobExpectations && (
            detailsTab === 'about' ? (
              <RefineWithAI
                filePath={`reports/${name}/profile.md`}
                currentContent={aboutText}
                documentType="about section"
                modalTitle="Refine About"
                onSaved={(updated) => {
                  setReport(prev => prev ? { ...prev, profile: { ...prev.profile, about: updated.trim() } } : prev)
                }}
                onSaveOverride={async (updated) => {
                  const profileContent = await window.api.getFileContent(`reports/${name}/profile.md`)
                  const aboutSection = `## About\n\n${updated.trim()}`
                  let merged: string
                  if (profileContent.match(/## About\s*\n/)) {
                    merged = profileContent.replace(/## About\s*\n[\s\S]*?(?=\n##|$)/, aboutSection)
                  } else {
                    merged = profileContent.trimEnd() + '\n\n' + aboutSection + '\n'
                  }
                  await window.api.commitFile(
                    `reports/${name}/profile.md`,
                    merged,
                    `Refine via AI: about section for ${report.profile.displayName}`
                  )
                }}
              />
            ) : (
              <RefineWithAI
                filePath={`reports/${name}/job-expectations.md`}
                currentContent={report.jobExpectations || ''}
                documentType="job expectations"
                modalTitle="Refine job expectations"
                onSaved={(updated) => {
                  setReport(prev => prev ? { ...prev, jobExpectations: updated } : prev)
                }}
              />
            )
          )}
          {!editingAbout && !editingJobExpectations && (
            <OpenInExternal
              filePath={detailsTab === 'about' ? `reports/${name}/profile.md` : `reports/${name}/job-expectations.md`}
            />
          )}
          <button
            onClick={() => detailsTab === 'about' ? handleEditAbout() : handleEditJobExpectations()}
            className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
            aria-label={`Edit ${detailsTab === 'about' ? 'about' : 'job expectations'}`}
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setDetailsCollapsed(true)}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-expanded={true}
            aria-label="Collapse details"
          >
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 pt-2 animate-fade-in">
        {editingAbout && detailsTab === 'about' ? (
          <div className="space-y-2">
            <textarea
              value={aboutDraft}
              onChange={e => setAboutDraft(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveAbout() } }}
              placeholder="Career goals, working style, communication preferences, strengths, areas for growth…"
              className="w-full h-32 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingAbout(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveAbout}
                disabled={savingAbout}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
              >
                <Save className="w-3 h-3" aria-hidden="true" />
                {savingAbout ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : editingJobExpectations && detailsTab === 'expectations' ? (
          <div className="space-y-2">
            <textarea
              value={jobExpectationsDraft}
              onChange={e => setJobExpectationsDraft(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveJobExpectations() } }}
              placeholder="Role expectations, competencies, performance criteria, level-specific skills…"
              className="w-full h-40 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
              autoFocus
            />
            <p className="text-xs text-zinc-600">Used as AI context for reviews and check-ins.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingJobExpectations(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveJobExpectations}
                disabled={savingJobExpectations}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
              >
                <Save className="w-3 h-3" aria-hidden="true" />
                {savingJobExpectations ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : detailsTab === 'about' ? (
          aboutText ? (
            <div className="prose-dark text-sm">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{aboutText}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-zinc-600">
              No about info yet. Click the pencil to add career goals, working style, or communication preferences.
            </p>
          )
        ) : (
          report.jobExpectations ? (
            <div className="prose-dark text-sm">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{report.jobExpectations}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-zinc-600">
              No expectations set yet. Click the pencil to add role expectations and performance criteria.
            </p>
          )
        )}
      </div>
    </div>
  )
}

// ── Inline Feedback Form ──
// Extracted to isolate feedbackDraft state from ReportDetail re-renders

function InlineFeedbackForm({ name, report, toast, refresh, onClose }: {
  name: string
  report: NonNullable<ReturnType<typeof useReportData>['report']>
  toast: ReturnType<typeof useToast>
  refresh: () => void
  onClose: () => void
}) {
  const { streaming, generate, cancel } = useAI()
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [feedbackType, setFeedbackType] = useState<'positive' | 'constructive' | 'mixed'>('positive')
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [rewriting, setRewriting] = useState(false)

  const typeLabels = {
    positive: { label: 'Positive', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    constructive: { label: 'Constructive', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    mixed: { label: 'Mixed', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  }

  const handleRewrite = useCallback(async () => {
    if (!feedbackDraft.trim()) return
    setRewriting(true)
    try {
      const result = await generate('rewrite-feedback', { feedback: feedbackDraft, feedbackType })
      if (result) setFeedbackDraft(result)
    } catch (e) {
      console.error('AI rewrite failed:', e)
      toast.error('AI rewrite failed')
    } finally {
      setRewriting(false)
    }
  }, [feedbackDraft, feedbackType, generate, toast])

  const handleSaveFeedback = useCallback(async () => {
    if (!name || !report || !feedbackDraft.trim()) return
    setSavingFeedback(true)
    try {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const feedbackLogPath = `reports/${name}/feedback/log.md`
      let existing = ''
      try {
        existing = await window.api.getFileContent(feedbackLogPath)
      } catch (e) { console.debug('Feedback log file may not exist:', e) }
      const entry = `### ${today}\n**Type:** ${feedbackType}\n\n${feedbackDraft.trim()}\n`
      const updated = existing ? `${entry}\n---\n\n${existing}` : entry
      await window.api.commitFile(
        feedbackLogPath,
        updated,
        `Add ${feedbackType} feedback for ${report.profile.displayName}`
      )
      toast.success('Feedback saved')
      onClose()
      refresh()
    } catch (e) {
      console.error('Failed to save feedback:', e)
      toast.error('Failed to save feedback')
    } finally {
      setSavingFeedback(false)
    }
  }, [name, report, feedbackDraft, feedbackType, toast, refresh, onClose])

  return (
    <div className="bg-surface rounded-xl border border-brand/20 p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-zinc-300">Add feedback</span>
        <button
          onClick={() => { if (streaming) cancel(); onClose() }}
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
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              feedbackType === type
                ? typeLabels[type].color
                : 'bg-surface-raised text-zinc-500 border-border hover:text-zinc-300'
            }`}
          >
            {typeLabels[type].label}
          </button>
        ))}
      </div>
      <textarea
        value={feedbackDraft}
        onChange={e => setFeedbackDraft(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveFeedback() } }}
        placeholder="What happened? Be specific about the behavior and its impact..."
        className="w-full h-24 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
        autoFocus
      />
      <div className="flex items-center gap-2 mt-2 justify-end">
        <button
          onClick={() => { if (streaming) cancel(); onClose() }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleRewrite}
          disabled={rewriting || streaming || !feedbackDraft.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {rewriting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
          {rewriting ? 'Rewriting...' : 'AI rewrite'}
        </button>
        <button
          onClick={handleSaveFeedback}
          disabled={!feedbackDraft.trim() || savingFeedback}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand text-white hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-3 h-3" aria-hidden="true" />
          {savingFeedback ? 'Saving...' : 'Save feedback'}
        </button>
      </div>
    </div>
  )
}

function InlineReviewForm({ name, report, toast, refresh, onClose }: {
  name: string
  report: NonNullable<ReturnType<typeof useReportData>['report']>
  toast: ReturnType<typeof useToast>
  refresh: () => void
  onClose: () => void
}) {
  const [periodDraft, setPeriodDraft] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${now.getMonth() >= 6 ? 'H2' : 'H1'}`
  })
  const [reviewDraft, setReviewDraft] = useState('')
  const [savingReview, setSavingReview] = useState(false)

  const handleSaveReview = useCallback(async () => {
    if (!name || !report || !periodDraft.trim() || !reviewDraft.trim()) return
    // Sanitize period: only allow alphanumeric, hyphens, and dots (e.g., "2026-H1", "Q2-2026")
    const sanitizedPeriod = periodDraft.trim().replace(/[^a-zA-Z0-9\-_.]/g, '-')
    if (!sanitizedPeriod) return
    setSavingReview(true)
    try {
      await window.api.commitFile(
        `reports/${name}/reviews/${sanitizedPeriod}.md`,
        reviewDraft.trim() + '\n',
        `Save performance review for ${report.profile.displayName} (${sanitizedPeriod})`
      )
      toast.success('Review saved')
      onClose()
      refresh()
    } catch (e) {
      console.error('Failed to save review:', e)
      toast.error('Failed to save review')
    } finally {
      setSavingReview(false)
    }
  }, [name, report, periodDraft, reviewDraft, toast, refresh, onClose])

  return (
    <div className="bg-surface rounded-xl border border-brand/20 p-4 animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">Add performance review</span>
        <button
          onClick={onClose}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Close review form"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Review period</label>
        <input
          type="text"
          value={periodDraft}
          onChange={e => setPeriodDraft(e.target.value)}
          placeholder="2026-H1"
          className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand/40 transition-colors"
        />
      </div>
      <textarea
        value={reviewDraft}
        onChange={e => setReviewDraft(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveReview() } }}
        placeholder="Write or paste the review here..."
        className="w-full h-48 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSaveReview}
          disabled={!periodDraft.trim() || !reviewDraft.trim() || savingReview}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand text-white hover:bg-brand-dark rounded-lg transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-3 h-3" aria-hidden="true" />
          {savingReview ? 'Saving...' : 'Save review'}
        </button>
      </div>
    </div>
  )
}
