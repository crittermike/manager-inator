import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/common/Toast'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '../../shared/constants'
import type { CheckInFrequency, DayOfWeek } from '../../shared/types'
import {
  Settings as SettingsIcon,
  LogOut,
  FolderGit2,
  Save,
  Check,
  User,
  Cpu,
  ChevronDown,
  CalendarClock,
  MessageSquare,
  Eye,
  EyeOff,
  ScrollText,
  Lightbulb,
  ArrowDown,
  UserPlus
} from 'lucide-react'
import { PROMPT_TEMPLATES } from '../../shared/prompts'
import { GitHubMark } from '../components/common/GitHubMark'

const cardClass = 'bg-surface rounded-2xl border border-border/80 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.18)]'
const fieldClass = 'w-full px-4 py-2.5 bg-zinc-950/70 shadow-inner shadow-black/20 border border-border/80 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15 transition-all'
const textFieldClass = `${fieldClass} placeholder-zinc-600`

export function Settings() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const [repoPathVal, setRepoPathVal] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [checkInFreq, setCheckInFreq] = useState<CheckInFrequency>('monthly')
  const [feedbackDays, setFeedbackDays] = useState(14)
  const [staleActionDays, setStaleActionDays] = useState(5)
  const [sprintLength, setSprintLength] = useState(2)
  const [endOfWeekDay, setEndOfWeekDay] = useState<DayOfWeek>('friday')
  const [snippetDay, setSnippetDay] = useState<DayOfWeek>('friday')
  const [sprintStartDate, setSprintStartDate] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [savedRepoPath, setSavedRepoPath] = useState('')
  const [savedModel, setSavedModel] = useState(DEFAULT_MODEL)
  const [savedCheckInFreq, setSavedCheckInFreq] = useState<CheckInFrequency>('monthly')
  const [savedFeedbackDays, setSavedFeedbackDays] = useState(14)
  const [savedStaleActionDays, setSavedStaleActionDays] = useState(5)
  const [savedSprintLength, setSavedSprintLength] = useState(2)
  const [savedEndOfWeekDay, setSavedEndOfWeekDay] = useState<DayOfWeek>('friday')
  const [savedSnippetDay, setSavedSnippetDay] = useState<DayOfWeek>('friday')
  const [savedSprintStartDate, setSavedSprintStartDate] = useState('')
  const [savedCustomInstructions, setSavedCustomInstructions] = useState('')
  const [githubOrgName, setGithubOrgName] = useState('')
  const [savedGithubOrgName, setSavedGithubOrgName] = useState('')
  const [githubOrgToken, setGithubOrgToken] = useState('')
  const [savedGithubOrgToken, setSavedGithubOrgToken] = useState('')
  const [showOrgToken, setShowOrgToken] = useState(false)
  const [hasGithubOrgToken, setHasGithubOrgToken] = useState(false)
  const [repoPathError, setRepoPathError] = useState('')
  const [activePromptTab, setActivePromptTab] = useState(PROMPT_TEMPLATES[0].id)
  const [userNameVal, setUserNameVal] = useState('')
  const [savedUserName, setSavedUserName] = useState('')
  const [userGithubVal, setUserGithubVal] = useState('')
  const [savedUserGithub, setSavedUserGithub] = useState('')
  const [deactivatedReports, setDeactivatedReports] = useState<string[]>([])

  const isDirty = repoPathVal !== savedRepoPath || model !== savedModel || checkInFreq !== savedCheckInFreq || feedbackDays !== savedFeedbackDays || staleActionDays !== savedStaleActionDays || sprintLength !== savedSprintLength || endOfWeekDay !== savedEndOfWeekDay || snippetDay !== savedSnippetDay || sprintStartDate !== savedSprintStartDate || customInstructions !== savedCustomInstructions || githubOrgName !== savedGithubOrgName || githubOrgToken !== savedGithubOrgToken || userNameVal !== savedUserName || userGithubVal !== savedUserGithub
  const { blockerState, proceed, reset: resetBlocker } = useUnsavedChanges(isDirty)
  const saveRef = useRef<() => void>(() => {})

  useKeyboardShortcut({ key: 's', handler: useCallback(() => saveRef.current(), []), enabled: isDirty && !saving })

  useEffect(() => {
    window.api.getSettings()
      .then((s: { repoPath?: string; defaultModel?: string; checkInFrequency?: CheckInFrequency; feedbackReminderDays?: number; staleActionDays?: number; sprintLengthWeeks?: number; endOfWeekDay?: DayOfWeek; snippetDay?: DayOfWeek; sprintStartDate?: string; aiCustomInstructions?: string; githubOrgName?: string; hasGithubOrgToken?: boolean; userName?: string; userGithub?: string; deactivatedReports?: string[] }) => {
        const rp = s.repoPath || ''
        const m = s.defaultModel || DEFAULT_MODEL
        const cif = s.checkInFrequency || 'monthly'
        const frd = s.feedbackReminderDays ?? 14
        const sad = s.staleActionDays ?? 5
        const sl = s.sprintLengthWeeks ?? 2
        const eow = s.endOfWeekDay || 'friday'
        const sd = s.snippetDay || 'friday'
        const ssd = s.sprintStartDate || ''
        const ci = s.aiCustomInstructions || ''
        const gon = s.githubOrgName || ''
        setRepoPathVal(rp)
        setModel(m)
        setCheckInFreq(cif)
        setFeedbackDays(frd)
        setStaleActionDays(sad)
        setSprintLength(sl)
        setEndOfWeekDay(eow)
        setSnippetDay(sd)
        setSprintStartDate(ssd)
        setCustomInstructions(ci)
        setGithubOrgName(gon)
        setHasGithubOrgToken(!!s.hasGithubOrgToken)
        const un = s.userName || ''
        const ug = s.userGithub || ''
        setUserNameVal(un)
        setUserGithubVal(ug)
        setSavedRepoPath(rp)
        setSavedModel(m)
        setSavedCheckInFreq(cif)
        setSavedFeedbackDays(frd)
        setSavedStaleActionDays(sad)
        setSavedSprintLength(sl)
        setSavedEndOfWeekDay(eow)
        setSavedSnippetDay(sd)
        setSavedSprintStartDate(ssd)
        setSavedCustomInstructions(ci)
        setSavedGithubOrgName(gon)
        setSavedUserName(un)
        setSavedUserGithub(ug)
        setDeactivatedReports(s.deactivatedReports || [])
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const allSettings = { 
        repoPath: repoPathVal, 
        defaultModel: model, 
        checkInFrequency: checkInFreq, 
        feedbackReminderDays: feedbackDays, 
        staleActionDays, 
        sprintLengthWeeks: sprintLength, 
        endOfWeekDay, 
        snippetDay,
        sprintStartDate, 
        aiCustomInstructions: customInstructions, 
        githubOrgName,
        userName: userNameVal,
        userGithub: userGithubVal,
        ...(githubOrgToken ? { githubOrgToken } : {})
      }
      if (repoPathVal !== savedRepoPath && repoPathVal.trim()) {
        try {
          await window.api.saveSettings(allSettings)
          await window.api.getReports()
          setRepoPathError('')
        } catch {
          setRepoPathError('Invalid repo path — no reports found at that location')
          await window.api.saveSettings({ repoPath: savedRepoPath, defaultModel: savedModel, checkInFrequency: savedCheckInFreq, feedbackReminderDays: savedFeedbackDays, staleActionDays: savedStaleActionDays, sprintLengthWeeks: savedSprintLength, endOfWeekDay: savedEndOfWeekDay, snippetDay: savedSnippetDay, sprintStartDate: savedSprintStartDate, aiCustomInstructions: savedCustomInstructions, githubOrgName: savedGithubOrgName, userName: savedUserName, userGithub: savedUserGithub })
          setSaving(false)
          return
        }
      } else {
        await window.api.saveSettings(allSettings)
      }
      if (githubOrgToken) {
        setHasGithubOrgToken(true)
      }
      setSavedRepoPath(repoPathVal)
      setSavedModel(model)
      setSavedCheckInFreq(checkInFreq)
      setSavedFeedbackDays(feedbackDays)
      setSavedStaleActionDays(staleActionDays)
      setSavedSprintLength(sprintLength)
      setSavedEndOfWeekDay(endOfWeekDay)
      setSavedSnippetDay(snippetDay)
      setSavedSprintStartDate(sprintStartDate)
      setSavedCustomInstructions(customInstructions)
      setSavedGithubOrgName(githubOrgName)
      setSavedUserName(userNameVal)
      setSavedUserGithub(userGithubVal)
      setGithubOrgToken('')
      setSavedGithubOrgToken('')
      setSaved(true)
      toast.success('Settings saved')
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Failed to save settings:', e)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }
  saveRef.current = handleSave

  const handleClearCaches = async () => {
    try {
      await window.api.clearCaches()
      toast.success('All caches cleared')
    } catch (e) {
      console.error('Failed to clear caches:', e)
      toast.error('Failed to clear caches')
    }
  }

  const handleReactivate = async (reportName: string) => {
    try {
      const next = deactivatedReports.filter(n => n !== reportName)
      await window.api.saveSettings({ deactivatedReports: next })
      setDeactivatedReports(next)
      toast.success(`${reportName} reactivated`)
    } catch {
      toast.error('Failed to reactivate report')
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
        <div className="space-y-2">
          <div className="skeleton h-8 w-32 rounded" />
          <div className="skeleton h-4 w-64 rounded" />
        </div>
        {[1,2,3].map(i => (
          <div key={i} className="space-y-4">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
              <div className="skeleton h-10 w-full rounded-lg" />
              <div className="skeleton h-10 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`max-w-2xl mx-auto space-y-8 animate-fade-in ${isDirty ? 'pb-24' : ''}`}>
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-brand" aria-hidden="true" />
          Settings
        </h1>
        <p className="text-sm text-zinc-500 mt-1">Tweak the knobs. Turn the dials. Make it yours.</p>
      </div>

      {/* Getting started callout — shown when GitHub org is not configured */}
      {!loading && !githubOrgName && !hasGithubOrgToken && (
        <div className="bg-brand/5 border border-brand/20 rounded-xl p-5 space-y-3 animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="w-5 h-5 text-brand-light" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-zinc-200">Set up team activity tracking</h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Connect your GitHub organization to see your team's PR and issue activity in the Today view. You'll need your org name and a Personal Access Token with read access to your org's repos.
              </p>
              <div className="flex items-center gap-1.5 pt-1 text-xs text-brand-light">
                <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Configure in the GitHub Organization section below</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Account
        </h2>
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center">
                <User className="w-5 h-5 text-zinc-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">@{user}</p>
                <p className="text-xs text-zinc-500">Connected via GitHub</p>
              </div>
            </div>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sign out"
        message="Are you sure you want to sign out? You will need to authenticate with GitHub again to use the app."
        confirmLabel="Sign out"
        variant="danger"
        onConfirm={() => {
          setShowLogoutConfirm(false)
          logout()
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* Your Identity */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Your Identity
        </h2>
        <div className={`${cardClass} space-y-4`}>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                Your name
              </span>
            </div>
            <input
              type="text"
              value={userNameVal}
              onChange={(e) => setUserNameVal(e.target.value)}
              placeholder="e.g. Jane Smith"
              aria-label="Your name"
              className={textFieldClass}
            />
            <p className="text-xs text-zinc-600 mt-2">
              Used to identify you in meeting transcripts and AI prompts.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <GitHubMark className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                GitHub username
              </span>
            </div>
            <input
              type="text"
              value={userGithubVal}
              onChange={(e) => setUserGithubVal(e.target.value)}
              placeholder="e.g. janesmith"
              aria-label="Your GitHub username"
              className={textFieldClass}
            />
            <p className="text-xs text-zinc-600 mt-2">
              Used to match your activity in meeting action items.
            </p>
          </div>
        </div>
      </section>

      {/* Repository */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Repository
        </h2>
        <div className={`${cardClass} space-y-4`}>
          <div className="flex items-center gap-2 mb-1">
            <FolderGit2 className="w-4 h-4 text-zinc-400" aria-hidden="true" />
            <span className="text-sm font-medium text-zinc-300">
              Local repo path
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={repoPathVal}
              onChange={(e) => { setRepoPathVal(e.target.value); setRepoPathError('') }}
              aria-label="Local repo path"
              className={`${fieldClass} flex-1 px-3 font-mono`}
            />
            <button
              onClick={async () => {
                const result = await window.api.showOpenDialog({ properties: ['openDirectory'], title: 'Select repo folder' })
                if (result) setRepoPathVal(result)
              }}
              className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-transparent hover:bg-surface-raised/70 border border-border/70 rounded-lg transition-colors whitespace-nowrap"
            >
              Browse...
            </button>
          </div>

          {repoPathError && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-danger">{repoPathError}</p>
              <button
                onClick={async () => {
                  const result = await window.api.showOpenDialog({ properties: ['openDirectory'], title: 'Select repo folder' })
                  if (result) { setRepoPathVal(result); setRepoPathError('') }
                }}
                className="text-xs text-brand-light hover:text-brand transition-colors underline underline-offset-2"
              >
                Pick a folder
              </button>
            </div>
          )}

          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-300">Clear all caches</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Use this if search or report data looks stale after external file edits.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearCaches}
                className="px-3 py-2 text-sm text-zinc-300 bg-transparent hover:bg-surface-raised/70 border border-border/70 rounded-lg transition-colors whitespace-nowrap"
              >
                Clear all caches
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* AI Model */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          AI Model
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-zinc-400" aria-hidden="true" />
            <span className="text-sm font-medium text-zinc-300">
              Default model for AI features
            </span>
          </div>
          <div className="relative">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="Default AI model"
              className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
          </div>
          <p className="text-xs text-zinc-600">
            Uses your GitHub Copilot subscription. Model availability depends on your plan.
          </p>
        </div>
      </section>

      {/* AI Custom Instructions */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          AI Custom Instructions
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-zinc-400" aria-hidden="true" />
            <span className="text-sm font-medium text-zinc-300">
              Custom instructions for all AI prompts
            </span>
          </div>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() } }}
            placeholder="e.g. Always use bullet points. Focus on actionable feedback. Keep summaries under 500 words."
            aria-label="Custom instructions for AI"
            rows={4}
            className="w-full px-4 py-3 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand transition-colors"
          />
          <p className="text-xs text-zinc-600">
            These instructions are included in every AI prompt (check-ins, reviews, prep, chat, etc.).
          </p>
        </div>
      </section>

      {/* AI Prompts (view-only) */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          AI Prompts
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <ScrollText className="w-4 h-4 text-zinc-400" aria-hidden="true" />
            <span className="text-sm font-medium text-zinc-300">
              What the AI sees for each action
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROMPT_TEMPLATES.map(pt => (
              <button
                key={pt.id}
                onClick={() => setActivePromptTab(pt.id)}
                className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                  activePromptTab === pt.id
                    ? 'bg-brand/15 text-brand-light border-brand/30'
                    : 'bg-surface-raised text-zinc-500 border-border hover:text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>
          {PROMPT_TEMPLATES.filter(pt => pt.id === activePromptTab).map(pt => (
            <div key={pt.id} className="space-y-2">
              <p className="text-xs text-zinc-500">{pt.description}</p>
              <pre className="w-full bg-surface-raised border border-border rounded-lg px-4 py-3 text-[11px] text-zinc-400 font-mono whitespace-pre-wrap overflow-y-auto max-h-[400px] leading-relaxed">
                {pt.template}
              </pre>
            </div>
          ))}
          <p className="text-xs text-zinc-600">
            Read-only. Values in {'{braces}'} are filled in at runtime with your data.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            GitHub Organization
          </h2>
          {!githubOrgName && !hasGithubOrgToken && (
            <span className="text-[10px] font-medium text-brand-light bg-brand/15 px-2 py-0.5 rounded-full">Not configured</span>
          )}
        </div>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <GitHubMark className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                Organization name
              </span>
            </div>
            <input
              type="text"
              value={githubOrgName}
              onChange={(e) => setGithubOrgName(e.target.value)}
              placeholder="e.g. github, vercel, my-org"
              aria-label="GitHub Organization name"
              className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <GitHubMark className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                <span className="text-sm font-medium text-zinc-300">
                  Personal Access Token (PAT)
                </span>
              </div>
              {hasGithubOrgToken && (
                <span className="text-xs text-success flex items-center gap-1">
                  <Check className="w-3 h-3" /> Token configured
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showOrgToken ? "text" : "password"}
                value={githubOrgToken}
                onChange={(e) => setGithubOrgToken(e.target.value)}
                placeholder={hasGithubOrgToken ? "Enter new token to replace existing" : "ghp_..."}
                aria-label="GitHub Personal Access Token"
                className="w-full pl-4 pr-10 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-brand transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowOrgToken(!showOrgToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label={showOrgToken ? "Hide token" : "Show token"}
              >
                {showOrgToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Used to show team PR/issue activity in the Today view. Stored locally, only sent to the GitHub API.
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              <strong className="text-zinc-500">Fine-grained:</strong> read-only access to Organization → Members and your org's repos.{' '}
              <strong className="text-zinc-500">Classic:</strong> <code className="bg-surface-raised px-1 rounded">read:org</code> + <code className="bg-surface-raised px-1 rounded">repo</code> scopes.
            </p>
          </div>
        </div>
      </section>

      {/* Management cadence */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Management cadence
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                Check-in frequency
              </span>
            </div>
            <div className="relative">
              <select
                value={checkInFreq}
                onChange={(e) => setCheckInFreq(e.target.value as CheckInFrequency)}
                aria-label="Check-in frequency"
                className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              >
                <option value="monthly">Monthly (first week of each month)</option>
                <option value="bimonthly">Every other month</option>
                <option value="quarterly">Quarterly</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              How often the dashboard reminds you to write performance check-ins.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                Feedback reminder threshold
              </span>
            </div>
            <div className="relative">
              <select
                value={feedbackDays}
                onChange={(e) => setFeedbackDays(Number(e.target.value))}
                aria-label="Feedback reminder threshold in days"
                className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days (default)</option>
                <option value={21}>21 days</option>
                <option value={30}>30 days</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Fridays will remind you to log feedback for anyone who hasn't received any in this many days.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                Stale action item threshold
              </span>
            </div>
            <div className="relative">
              <select
                value={staleActionDays}
                onChange={(e) => setStaleActionDays(Number(e.target.value))}
                aria-label="Stale action item threshold in days"
                className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              >
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days (default)</option>
                <option value={10}>10 days</option>
                <option value={14}>14 days</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Action items open longer than this are flagged as stale in the Today view.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                Sprint length
              </span>
            </div>
            <div className="relative">
              <select
                value={sprintLength}
                onChange={(e) => setSprintLength(Number(e.target.value))}
                aria-label="Sprint length in weeks"
                className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              >
                <option value={1}>1 week</option>
                <option value={2}>2 weeks (default)</option>
                <option value={3}>3 weeks</option>
                <option value={4}>4 weeks</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Sprint cadence for sprint-start and sprint-end prompts in the Today view.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                Sprint start date
              </span>
            </div>
            <input
              type="date"
              value={sprintStartDate}
              onChange={(e) => setSprintStartDate(e.target.value)}
              aria-label="Sprint start date"
              className="w-full px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors [color-scheme:dark]"
            />
            <p className="text-xs text-zinc-600 mt-2">
              The date your current sprint started. Used to calculate sprint boundaries and show sprint-start/end prompts.
              {!sprintStartDate && ' Set this to enable sprint cadence items in the Today view.'}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                End-of-week day
              </span>
            </div>
            <div className="relative">
              <select
                value={endOfWeekDay}
                onChange={(e) => setEndOfWeekDay(e.target.value as DayOfWeek)}
                aria-label="End-of-week day for weekly reflection"
                className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              >
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday (default)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Which day triggers the weekly reflection prompts and feedback reminders.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              <span className="text-sm font-medium text-zinc-300">
                Weekly snippet day
              </span>
            </div>
            <div className="relative">
              <select
                value={snippetDay}
                onChange={(e) => setSnippetDay(e.target.value as DayOfWeek)}
                aria-label="Day to write weekly snippet"
                className="w-full appearance-none px-4 py-2.5 bg-surface-raised border border-border rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand transition-colors"
              >
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday (default)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" aria-hidden="true" />
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Which day triggers the weekly snippet prompt — the status update you share with your manager.
            </p>
          </div>
        </div>
      </section>

      {/* Deactivated reports */}
      {deactivatedReports.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Deactivated reports
          </h2>
          <div className={cardClass}>
            <p className="text-xs text-zinc-500 mb-3">
              These reports are hidden from the sidebar and Today page. Their data is preserved.
            </p>
            <div className="space-y-2">
              {deactivatedReports.map(name => (
                <div key={name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-950/50 border border-border/50">
                  <span className="text-sm text-zinc-300">{name}</span>
                  <button
                    onClick={() => handleReactivate(name)}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs text-brand-light bg-brand/10 hover:bg-brand/20 rounded-lg transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    Reactivate
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* About */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          About
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5">
          <p className="text-sm text-zinc-400">
            <strong className="text-zinc-200">Manager-inator</strong> v{__APP_VERSION__}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            AI-powered performance management for engineering managers.
            Uses the GitHub Copilot SDK for AI features and your GitHub repo
            as the source of truth.
          </p>
        </div>
      </section>

      {/* Fixed save bar */}
      {isDirty && (
        <div className={`fixed bottom-0 left-64 right-0 z-10 px-8 py-4 bg-zinc-950/90 backdrop-blur-md border-t border-border shadow-2xl ${saved ? 'animate-success-pop' : 'animate-fade-in'}`}>
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-300">You have unsaved changes</p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" aria-hidden="true" />
                  Save changes
                </>
              )}
            </button>
          </div>
        </div>
      )}

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
    </div>
  )
}
