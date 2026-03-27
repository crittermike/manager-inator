import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useReportData, useFileContent, useSettings } from '../hooks/useData'
import { useAI } from '../hooks/useAI'
import { useToast } from '../components/common/Toast'
import { formatDate } from '../utils/formatDate'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import type { ActionItem, FeedbackEntry, PrepEntry } from '../../shared/types'
import { cleanSummaryContent } from '../utils/cleanSummary'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Github,
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
  MoreHorizontal
} from 'lucide-react'

// ── Types ──

type StreamFilter = 'all' | 'context' | 'feedback' | 'action' | 'checkin' | 'review' | 'prep'

interface StreamEntry {
  id: string
  type: 'context' | 'feedback' | 'action' | 'checkin' | 'review' | 'prep'
  date: string
  title: string
  preview: string
  data: unknown
  pinned?: boolean
  source?: string
}

// ── Helpers ──

// ── Main Component ──

export function ReportDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { report, loading, error, load, refresh } = useReportData(name)
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
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileFields, setProfileFields] = useState({ role: '', team: '', meetingDay: '', github: '', location: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [editingAbout, setEditingAbout] = useState(false)
  const [aboutDraft, setAboutDraft] = useState('')
  const [savingAbout, setSavingAbout] = useState(false)
  const [editingJobExpectations, setEditingJobExpectations] = useState(false)
  const [jobExpectationsDraft, setJobExpectationsDraft] = useState('')
  const [savingJobExpectations, setSavingJobExpectations] = useState(false)
  const [detailsTab, setDetailsTab] = useState<'about' | 'expectations'>('about')
  const [detailsCollapsed, setDetailsCollapsed] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  // Action item toggling
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set())

  // Prep checkbox editing
  const [prepContent, setPrepContent] = useState<string | null>(null)

  // Content viewing & editing
  const [viewingContent, setViewingContent] = useState<{ id: string; path: string; title: string } | null>(null)
  const [isEditingContent, setIsEditingContent] = useState(false)
  const { content: fileContent, loading: fileLoading } = useFileContent(viewingContent?.path ?? null)

  // Copy state
  const [copied, setCopied] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Adding feedback
  const [addingFeedback, setAddingFeedback] = useState(false)
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [feedbackType, setFeedbackType] = useState<'positive' | 'constructive' | 'mixed'>('positive')
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [ptoReports, setPtoReports] = useState<Record<string, string>>({})
  const [showPtoModal, setShowPtoModal] = useState(false)
  const [ptoInput, setPtoInput] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })

  // Refs
  const savePrepRef = useRef<() => void>(() => {})

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; cancel() }
  }, [cancel])

  useEffect(() => {
    if (!actionsOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [actionsOpen])

  const { settings: _rdSettings } = useSettings()

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
      refresh()
      setViewingContent(null)
      setIsEditingContent(false)
    } catch (err) {
      toast.error('Failed to delete file')
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, refresh, toast])

  const handleSaveContent = useCallback(async (path: string, newContent: string) => {
    try {
      await window.api.commitFile(path, newContent, 'Update context note')
      toast.success('Changes saved successfully')
      refresh()
      setIsEditingContent(false)
    } catch (err) {
      toast.error('Failed to save changes')
    }
  }, [refresh, toast])

  const handleCloseContent = useCallback(() => {
    setViewingContent(null)
    setIsEditingContent(false)
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
    const summaryPaths = recentSummaryDates.map(s => `contexts/${s.filename || `${s.date}-${name}-1-1.md`}`)
    const summaryMap = await window.api.getFilesContentBulk(summaryPaths)
    const summariesText = summaryPaths.map(p => summaryMap[p]).filter(Boolean).join('\n\n---\n\n')
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

      const otherPaths = otherWithSummaries.map(m => `contexts/${m.filename}`)
      const otherMap = await window.api.getFilesContentBulk(otherPaths)
      const mentionResults = otherWithSummaries.map(m => {
        const content = otherMap[`contexts/${m.filename}`]
        if (content && namePattern.test(content)) {
          return `### ${m.title} (${m.date})\n${content}`
        }
        return ''
      })
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
      const today = new Date().toISOString().split('T')[0]
      try {
        await window.api.commitFile(
          `reports/${name}/prep/${today}.md`,
          content,
          `Save 1:1 prep for ${report.profile.displayName} on ${today}`
        )
        toast.success('Prep saved')
        load()
      } catch {
        toast.error('Failed to auto-save prep')
      }
    } else {
      setAiContent('_Failed to generate prep. Try clicking Regenerate._')
    }
    setAiLoading(false)
  }, [report, name, generate, reset, fullTextRef, toast, cancel, load])

  const handleGenerateCheckIn = useCallback(async () => {
    if (!report || !name) return
    setShowAI(true)
    setAiMode('checkin')
    setAiContent(null)
    reset()

    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const recentSummaries = report.summaries.slice(-8)
    const checkInPaths = recentSummaries.map(s => `contexts/${s.filename || `${s.date}-${name}-1-1.md`}`)
    const checkInMap = await window.api.getFilesContentBulk(checkInPaths)
    const summariesText = recentSummaries.map(s => {
      const content = checkInMap[`contexts/${s.filename || `${s.date}-${name}-1-1.md`}`]
      return content ? `### ${s.date}\n${content}` : ''
    }).filter(Boolean).join('\n\n---\n\n')

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
        actionItems: report.actionItems.filter(a => !a.completed).slice(0, 20).map(a => `- ${a.text}`).join('\n'),
        contextNotes: report.contextNotes.length > 0
          ? report.contextNotes.map(n => `### ${n.date} (${n.source})\n${n.summary}\n\n${n.content}`).join('\n\n---\n\n')
          : undefined
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
    const reviewPaths = recentSummaries.map(s => `contexts/${s.filename || `${s.date}-${name}-1-1.md`}`)
    const reviewMap = await window.api.getFilesContentBulk(reviewPaths)
    const summariesText = recentSummaries.map(s => {
      const content = reviewMap[`contexts/${s.filename || `${s.date}-${name}-1-1.md`}`]
      return content ? `### ${s.date}\n${content}` : ''
    }).filter(Boolean).join('\n\n---\n\n')
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
        actionItems: allActions || undefined,
        contextNotes: report.contextNotes.length > 0
          ? report.contextNotes.map(n => `### ${n.date} (${n.source})\n${n.summary}\n\n${n.content}`).join('\n\n---\n\n')
          : undefined
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
          `Update 1:1 prep for ${report.profile.displayName} on ${today}`
        )
        toast.success('Prep updated')
        load()
      } else if (aiMode === 'checkin') {
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        await window.api.commitFile(
          `reports/${name}/check-ins/monthly/${month}.md`,
          content,
          `Save ${report.profile.displayName} check-in for ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}`
        )
        toast.success('Check-in saved')
        load()
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
      if (line.includes('- [ ] ')) {
        lines[lineIndex] = line.replace('- [ ] ', '- [x] ')
      } else if (line.includes('- [x] ')) {
        lines[lineIndex] = line.replace('- [x] ', '- [ ] ')
      }
      return lines.join('\n')
    })
  }, [])

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
      refresh()
    } catch (e) {
      console.error('Failed to save profile:', e)
      toast.error('Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }, [name, report, profileFields, toast, refresh])

  const handleEditAbout = useCallback(() => {
    if (!report) return
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
    const wasCompleted = a.completed
    
    // Optimistic update
    setTogglingItems(prev => new Set(prev).add(toggleKey))
    
    try {
      await window.api.toggleActionItem(a.sourceFile, a.sourceLineNumber)
      
      if (!wasCompleted) {
        toast.success('Action item completed ✓', 'Done', { 
          label: 'Undo', 
          onClick: async () => {
            try {
              await window.api.toggleActionItem(a.sourceFile!, a.sourceLineNumber!)
              refresh()
            } catch {
              toast.error('Failed to undo')
            }
          }
        })
      }
      
      refresh()
    } catch (e) {
      console.error('Failed to toggle action item:', e)
      toast.error('Failed to update action item')
    } finally {
      setTogglingItems(prev => { const s = new Set(prev); s.delete(toggleKey); return s })
    }
  }, [refresh, toast])

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
        toast.success(`${report.profile.displayName} marked back from PTO`)
      } catch {
        toast.error('Failed to update PTO status')
      }
      return
    }

    setShowPtoModal(true)
  }, [name, report, ptoReports, toast])

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
      toast.success(`${report.profile.displayName} marked on PTO until ${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
      setShowPtoModal(false)
    } catch {
      toast.error('Failed to update PTO status')
    }
  }, [name, report, ptoReports, toast, ptoInput])

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
      const title = ctx.source === 'meeting'
        ? `1:1 with ${report.profile.displayName}`
        : ctx.summary || `${sourceLabel} — ${formatDate(ctx.date)}`
      entries.push({
        id: `context-${ctx.filename}`,
        type: 'context',
        date: ctx.date,
        title,
        preview: ctx.tags.length > 0 ? ctx.tags.join(', ') : sourceLabel,
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

  // ── Pre-computed values (must be above early returns to preserve hook ordering) ──

  const sortedFeedback = useMemo(() => report ? [...report.feedback].sort((a, b) => b.date.localeCompare(a.date)) : [], [report])

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Profile header skeleton */}
        <div className="flex items-center gap-4">
          <div className="skeleton w-10 h-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="skeleton h-6 w-48 rounded" />
            <div className="skeleton h-4 w-32 rounded" />
          </div>
        </div>
        {/* Key facts skeleton */}
        <div className="grid grid-cols-4 gap-4">
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
            <AlertCircle className="w-6 h-6 text-zinc-500" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-300 mb-1">{error || 'We looked everywhere but couldn\'t find this report 🕵️'}</h3>
            <p className="text-xs text-zinc-500">This person may not exist in your data repo, or the profile hasn't been set up yet.</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-200 bg-surface hover:bg-surface-overlay rounded-lg border border-border transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
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
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Back + breadcrumb */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Today
      </button>

      {/* ── Profile header ── */}
      <div className="flex items-start gap-5">
        <div className="w-14 h-14 rounded-2xl bg-brand/20 ring-1 ring-brand/10 flex items-center justify-center text-lg font-bold text-brand-light shrink-0">
          {report.profile.displayName.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-100">
              {report.profile.displayName}
            </h1>
            <button
              onClick={handleEditProfileStart}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors hover:bg-surface-raised rounded"
              aria-label="Edit profile"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </button>
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
                <Github className="w-3 h-3 text-zinc-600" aria-hidden="true" />
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
        <div className="relative shrink-0" ref={actionsRef}>
          <button
            onClick={() => setActionsOpen(!actionsOpen)}
            className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
            aria-label="Actions"
          >
            <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
          </button>
          {actionsOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-surface-raised border border-border rounded-xl shadow-xl z-20 py-1 animate-fade-in">
              <button
                onClick={() => { handlePrepOneOnOne(); setActionsOpen(false) }}
                disabled={streaming || aiLoading}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-300 hover:bg-surface-overlay transition-colors disabled:opacity-40"
              >
                <Sparkles className="w-4 h-4 text-brand-light" aria-hidden="true" />
                Prep 1:1
              </button>
              <button
                onClick={() => { handleGenerateCheckIn(); setActionsOpen(false) }}
                disabled={streaming || aiLoading}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-300 hover:bg-surface-overlay transition-colors disabled:opacity-40"
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                Generate check-in
              </button>
              <button
                onClick={() => { handleGenerateReview(); setActionsOpen(false) }}
                disabled={streaming || aiLoading}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-300 hover:bg-surface-overlay transition-colors disabled:opacity-40"
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                Generate review
              </button>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => { setAddingFeedback(true); setActionsOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-zinc-300 hover:bg-surface-overlay transition-colors"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add feedback
              </button>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => { handleTogglePto(); setActionsOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors ${
                  isOnPto ? 'text-amber-300 hover:bg-amber-500/10' : 'text-zinc-300 hover:bg-surface-overlay'
                }`}
              >
                <Plane className="w-4 h-4" aria-hidden="true" />
                {isOnPto ? 'Clear PTO' : 'Mark PTO'}
              </button>
            </div>
          )}
        </div>
      </div>

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
          <div className="grid grid-cols-2 gap-4">
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
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveFeedback() } }}
            placeholder="What happened? Be specific about the behavior and its impact..."
            className="w-full h-24 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSaveFeedback}
              disabled={!feedbackDraft.trim() || savingFeedback}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
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
            <div className="flex gap-2 mt-3 pt-3 border-t border-border flex-wrap">
              <button
                onClick={handleSaveAI}
                disabled={aiSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
              >
                <Save className="w-3 h-3" aria-hidden="true" />
                {aiSaving ? 'Saving…' : aiMode === 'prep' ? 'Save changes' : 'Save to repo'}
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

      {/* ── Details (About + Job Expectations) ── */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <div className="flex gap-1">
            <button
              onClick={() => { setDetailsTab('about'); setDetailsCollapsed(false) }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                detailsTab === 'about' && !detailsCollapsed
                  ? 'bg-surface-raised text-zinc-200 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              About
            </button>
            <button
              onClick={() => { setDetailsTab('expectations'); setDetailsCollapsed(false) }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                detailsTab === 'expectations' && !detailsCollapsed
                  ? 'bg-surface-raised text-zinc-200 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Expectations
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => detailsTab === 'about' ? handleEditAbout() : handleEditJobExpectations()}
              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              aria-label={`Edit ${detailsTab === 'about' ? 'about' : 'job expectations'}`}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setDetailsCollapsed(!detailsCollapsed)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-expanded={!detailsCollapsed}
              aria-label="Toggle details"
            >
              {detailsCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {!detailsCollapsed && (
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
        )}
      </div>

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
            <div className="w-12 h-12 rounded-full bg-surface-raised flex items-center justify-center mb-4">
              <Filter className="w-6 h-6 text-zinc-500" aria-hidden="true" />
            </div>
            {activeFilter === 'all' ? (
              <>
                <p className="text-sm font-medium text-zinc-300 mb-1">No activity yet</p>
                <p className="text-sm text-zinc-500 max-w-sm">Once you have 1:1s and feedback, they'll show up here.</p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">No {activeFilter} entries yet</p>
            )}
          </div>
        ) : (
          filteredEntries.map((entry, idx) => {
            const toggleKey = entry.type === 'action'
              ? (entry.data as ActionItem[]).some(a => togglingItems.has(`${a.sourceFile ?? ''}:${a.sourceLineNumber ?? -1}`))
              : false
            return (
              <div key={entry.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(idx * 50, 300)}ms`, animationFillMode: 'both' }}>
              <StreamEntryCard
                key={entry.id}
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
                onCloseContent={handleCloseContent}
                onCopyContent={handleCopy}
                copied={copied}
                isEditing={isEditingContent}
                onEditContent={handleEditContent}
                onDeleteContent={handleDeleteContent}
                onSaveContent={handleSaveContent}
                onCancelEdit={() => setIsEditingContent(false)}
              />
              </div>
            )
          })
        )}
      </div>

      {/* ── PTO Modal ── */}
      {showPtoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in">
          <div className="bg-surface rounded-xl border border-border p-5 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-100">PTO return date</h3>
              <button
                onClick={() => setShowPtoModal(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-surface-raised"
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
                  className="px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand/90 transition-all active:scale-[0.97] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
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

// ── Inline Editor ──

function InlineEditor({ initialContent, onSave }: { initialContent: string; onSave: (content: string) => Promise<void> }) {
  const [content, setContent] = useState(initialContent)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    await onSave(content)
    setIsSaving(false)
  }
  
  return (
    <div className="space-y-3">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() } }}
        className="w-full h-64 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-300 font-mono resize-y focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 transition-all"
      />
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving || content === initialContent}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand hover:bg-brand-light text-white text-sm rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
        >
          {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  )
}

// ── Stream Entry Card ──

interface StreamEntryCardProps {
  entry: StreamEntry
  expanded: boolean
  onToggle: (id: string) => void
  name: string
  onViewContent: (id: string, path: string, title: string) => void
  onToggleAction: (a: ActionItem) => void
  isToggling: boolean
  isViewing: boolean
  viewingPath: string | null
  viewingTitle: string | null
  fileContent: string | null
  fileLoading: boolean
  onCloseContent: () => void
  onCopyContent: (text: string) => void
  copied: boolean
  isEditing: boolean
  onEditContent: (id: string, path: string) => void
  onDeleteContent: (path: string) => void
  onSaveContent: (path: string, content: string) => Promise<void>
  onCancelEdit: () => void
}

const StreamEntryCard = memo(function StreamEntryCard({
  entry,
  expanded,
  onToggle,
  name,
  onViewContent,
  onToggleAction,
  isToggling,
  isViewing,
  viewingPath,
  viewingTitle,
  fileContent,
  fileLoading,
  onCloseContent,
  onCopyContent,
  copied,
  isEditing,
  onEditContent,
  onDeleteContent,
  onSaveContent,
  onCancelEdit
}: StreamEntryCardProps) {
  const typeStyles: Record<string, { bg: string; text: string; label: string }> = {
    context: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Context' },
    feedback: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Feedback' },
    action: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Actions' },
    checkin: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Check-in' },
    review: { bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Review' },
    prep: { bg: 'bg-sky-500/10', text: 'text-sky-400', label: 'Prep' }
  }

  const sourceStyles: Record<string, { bg: string; text: string; label: string }> = {
    meeting: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Meeting' },
    slack: { bg: 'bg-violet-500/10', text: 'text-violet-400', label: 'Slack' },
    github: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'GitHub' },
    email: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'Email' },
    other: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Note' }
  }

  const style = entry.type === 'context' && entry.source
    ? sourceStyles[entry.source] || typeStyles['context']
    : typeStyles[entry.type] || typeStyles['context']
  const handleToggle = useCallback(() => onToggle(entry.id), [onToggle, entry.id])

  return (
    <div className={`bg-surface rounded-xl border transition-all duration-150 ${entry.pinned ? 'border-brand/20' : 'border-border hover:border-zinc-500 hover:shadow-lg hover:shadow-black/10'}`}>
      {/* Collapsed header — always visible */}
      <button
        onClick={handleToggle}
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
            {entry.type === 'context' && <ContextDetail entry={entry} name={name} onViewContent={onViewContent} onEdit={onEditContent} onDelete={onDeleteContent} />}
            {entry.type === 'feedback' && <FeedbackDetail entry={entry} />}
            {entry.type === 'action' && <ActionDetail entry={entry} onToggleAction={onToggleAction} isToggling={isToggling} />}
            {entry.type === 'checkin' && <CheckinDetail entry={entry} name={name} onViewContent={onViewContent} />}
            {entry.type === 'review' && <ReviewDetail entry={entry} name={name} onViewContent={onViewContent} />}
            {entry.type === 'prep' && <PrepDetail entry={entry} name={name} onViewContent={onViewContent} />}
          </div>

          {isViewing && viewingPath && (
            <div className="mt-4 pt-4 border-t border-zinc-800/50 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-300">
                  {isEditing ? `Editing: ${viewingTitle}` : viewingTitle}
                </span>
                <button
                  onClick={isEditing ? onCancelEdit : onCloseContent}
                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              
              {fileLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                </div>
              ) : fileContent !== null ? (
                isEditing ? (
                  <InlineEditor
                    initialContent={fileContent}
                    onSave={(content) => onSaveContent(viewingPath, content)}
                  />
                ) : (
                  <div className="relative group/content">
                    <button
                      onClick={() => onCopyContent(fileContent)}
                      className="absolute top-0 right-0 p-1.5 rounded-lg bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/content:opacity-100 transition-opacity"
                      aria-label="Copy"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <div className="prose-dark text-sm max-h-96 overflow-y-auto pr-2">
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{cleanSummaryContent(fileContent)}</ReactMarkdown>
                    </div>
                  </div>
                )
              ) : (
                <p className="text-sm text-zinc-500">Unable to load content.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// ── Detail sub-components ──

function ContextDetail({ 
  entry, 
  name, 
  onViewContent, 
  onEdit, 
  onDelete 
}: { 
  entry: StreamEntry; 
  name: string; 
  onViewContent: (id: string, path: string, title: string) => void;
  onEdit: (id: string, path: string) => void;
  onDelete: (path: string) => void;
}) {
  const ctx = entry.data as unknown as { date: string; source: string; summary: string; tags: string[]; content: string; filename: string }
  const tags = ctx.tags || []
  const contextPath = `contexts/${ctx.filename}`

  useEffect(() => {
    onViewContent(entry.id, contextPath, ctx.summary || `Context — ${formatDate(ctx.date)}`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      {ctx.summary && (
        <p className="text-sm text-zinc-300 leading-relaxed">{ctx.summary}</p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span key={i} className="px-2 py-0.5 bg-surface-raised rounded text-[11px] text-zinc-400 border border-border">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={() => onEdit(entry.id, contextPath)} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <Pencil className="w-3 h-3" /> Edit
        </button>
        <button onClick={() => onDelete(contextPath)} className="text-xs text-zinc-500 hover:text-danger flex items-center gap-1">
          <Trash2 className="w-3 h-3" /> Delete
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

function ActionDetail({ entry, onToggleAction, isToggling }: { entry: StreamEntry; onToggleAction: (a: ActionItem) => void; isToggling: boolean }) {
  const actions = entry.data as ActionItem[]

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto">
      {actions.map((a, i) => {
        return (
          <button
            key={`${a.sourceFile ?? ''}:${a.sourceLineNumber ?? i}`}
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

function CheckinDetail({ entry, name, onViewContent }: { entry: StreamEntry; name: string; onViewContent: (id: string, path: string, title: string) => void }) {
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
          entry.id,
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

function ReviewDetail({ entry, name, onViewContent }: { entry: StreamEntry; name: string; onViewContent: (id: string, path: string, title: string) => void }) {
  const r = entry.data as { period: string; content: string }

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-400 leading-relaxed line-clamp-4">
        {r.content.slice(0, 300).replace(/[#*_]/g, '')}…
      </p>
      <button
        onClick={() => onViewContent(
          entry.id,
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

function PrepDetail({ entry, name, onViewContent }: { entry: StreamEntry; name: string; onViewContent: (id: string, path: string, title: string) => void }) {
  const p = entry.data as PrepEntry

  return (
    <div className="space-y-2">
      <div className="prose-dark text-sm max-h-48 overflow-y-auto">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{p.content}</ReactMarkdown>
      </div>
      <button
        onClick={() => onViewContent(
          entry.id,
          `reports/${name}/prep/${p.date}.md`,
          `1:1 Prep — ${formatDate(p.date)}`
        )}
        className="text-xs text-brand-light hover:text-brand transition-colors"
      >
        View full prep →
      </button>
    </div>
  )
}
