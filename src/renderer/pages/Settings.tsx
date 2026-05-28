import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
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
  UserPlus,
  RefreshCw,
  ExternalLink,
  Loader2,
  Webhook,
  Copy
} from 'lucide-react'
import { PROMPT_TEMPLATES } from '../../shared/prompts'
import { GitHubMark } from '../components/common/GitHubMark'
import type { CaptureWebhookStatus } from '../../shared/types'

const cardClass = 'bg-surface rounded-2xl border border-border/80 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.18)]'
const fieldClass = 'w-full px-4 py-2.5 bg-zinc-950/70 shadow-inner shadow-black/20 border border-border/80 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15 transition-all'
const textFieldClass = `${fieldClass} placeholder-zinc-600`

export function Settings() {
  useDocumentTitle('Settings')
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
  const [tokenWarning, setTokenWarning] = useState('')
  const [repoPathError, setRepoPathError] = useState('')
  const [activePromptTab, setActivePromptTab] = useState(PROMPT_TEMPLATES[0].id)
  const [userNameVal, setUserNameVal] = useState('')
  const [savedUserName, setSavedUserName] = useState('')
  const [userGithubVal, setUserGithubVal] = useState('')
  const [savedUserGithub, setSavedUserGithub] = useState('')
  const [deactivatedReports, setDeactivatedReports] = useState<string[]>([])
  const [userManager, setUserManager] = useState('')
  const [userSkipLevel, setUserSkipLevel] = useState('')
  const [syncing, setSyncing] = useState(false)

  const isDirty = repoPathVal !== savedRepoPath || model !== savedModel || checkInFreq !== savedCheckInFreq || feedbackDays !== savedFeedbackDays || staleActionDays !== savedStaleActionDays || sprintLength !== savedSprintLength || endOfWeekDay !== savedEndOfWeekDay || snippetDay !== savedSnippetDay || sprintStartDate !== savedSprintStartDate || customInstructions !== savedCustomInstructions || githubOrgName !== savedGithubOrgName || githubOrgToken !== savedGithubOrgToken || userNameVal !== savedUserName || userGithubVal !== savedUserGithub
  const { blockerState, proceed, reset: resetBlocker } = useUnsavedChanges(isDirty)
  const saveRef = useRef<() => void>(() => {})

  useKeyboardShortcut({ key: 's', handler: useCallback(() => saveRef.current(), []), enabled: isDirty && !saving })

  useEffect(() => {
    window.api.getSettings()
      .then((s: { repoPath?: string; defaultModel?: string; checkInFrequency?: CheckInFrequency; feedbackReminderDays?: number; staleActionDays?: number; sprintLengthWeeks?: number; endOfWeekDay?: DayOfWeek; snippetDay?: DayOfWeek; sprintStartDate?: string; aiCustomInstructions?: string; githubOrgName?: string; hasGithubOrgToken?: boolean; userName?: string; userGithub?: string; deactivatedReports?: string[]; userManager?: string; userSkipLevel?: string }) => {
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
        setUserManager(s.userManager || '')
        setUserSkipLevel(s.userSkipLevel || '')
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load settings:', err)
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setTokenWarning('')
    try {
      // Validate new token before saving
      if (githubOrgToken.trim()) {
        try {
          const valid = await window.api.validateGithubToken(githubOrgToken.trim())
          if (!valid) {
            setTokenWarning('Token could not be validated — it may not have the required permissions. Saved anyway; you can update it later.')
          }
        } catch (e) {
          console.debug('Token validation failed (network/IPC issue):', e)
        }
      }
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
        } catch (e) {
          console.error('Repo path validation failed:', e)
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

  const handleSyncTeam = async () => {
    if (!user || syncing) return
    setSyncing(true)
    try {
      const settings = await window.api.getSettings()
      if (!settings.hasGithubOrgToken) {
        toast.error('No org token configured. Add a PAT in the GitHub Organization section.')
        return
      }
      // We need the actual token for the API call — use a special IPC
      const result = await window.api.detectTeam(user, '')
      if (!result) {
        toast.error('Could not detect team. Your token may not have access to github/thehub.')
        return
      }
      // Update user info
      const userSettings: Record<string, string> = { userName: result.user.name }
      if (result.user.manager) {
        userSettings.userManager = `${result.user.manager.name} (@${result.user.manager.github})`
      }
      if (result.user.skipLevel) {
        userSettings.userSkipLevel = `${result.user.skipLevel.name} (@${result.user.skipLevel.github})`
      }
      await window.api.saveSettings(userSettings)
      setUserNameVal(result.user.name)
      setSavedUserName(result.user.name)
      setUserManager(userSettings.userManager || '')
      setUserSkipLevel(userSettings.userSkipLevel || '')

      // Create reports for new direct reports
      const existing = await window.api.getReports()
      let added = 0
      for (const report of result.directReports) {
        const slug = report.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '')
        if (existing.includes(slug)) continue
        await window.api.createReport(report.name, {
          role: report.title,
          github: report.github,
          location: report.location
        })
        added++
      }

      if (added > 0) {
        toast.success(`Synced! Added ${added} new report${added !== 1 ? 's' : ''}.`)
      } else {
        toast.success(`Team is up to date. ${result.directReports.length} reports found.`)
      }
    } catch (e) {
      console.error('Team sync failed:', e)
      toast.error('Failed to sync team')
    } finally {
      setSyncing(false)
    }
  }

  const handleReactivate = async (reportName: string) => {
    try {
      const next = deactivatedReports.filter(n => n !== reportName)
      await window.api.saveSettings({ deactivatedReports: next })
      setDeactivatedReports(next)
      toast.success(`${reportName} reactivated`)
    } catch (e) {
      console.error('Failed to reactivate report:', e)
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Your Identity
          </h2>
          <button
            onClick={handleSyncTeam}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs text-brand-light hover:text-brand transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {syncing ? 'Syncing...' : 'Sync from org'}
          </button>
        </div>
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

          {(userManager || userSkipLevel) && (
            <div className="pt-2 border-t border-border/50 flex gap-6">
              {userManager && (
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Manager</p>
                  <p className="text-sm text-zinc-300">{userManager}</p>
                </div>
              )}
              {userSkipLevel && (
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Skip-level</p>
                  <p className="text-sm text-zinc-300">{userSkipLevel}</p>
                </div>
              )}
            </div>
          )}
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
                const result = await window.api.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Select repo folder' })
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
                  const result = await window.api.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Select repo folder' })
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
                  <Check className="w-3 h-3" aria-hidden="true" /> Token configured
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
                {showOrgToken ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
            <div className="mt-2.5 space-y-1.5 text-xs text-zinc-500">
              <p>This token lets the app read your team's activity (PRs, issues, discussions). It is stored locally, encrypted on disk, and never sent anywhere except the GitHub API.</p>
              <p className="text-zinc-600">
                <strong className="text-zinc-500">Create a fine-grained PAT under your organization</strong> (not your personal account) with <strong className="text-zinc-500">read-only</strong> access to:
              </p>
              <ul className="list-disc list-inside text-zinc-600 space-y-0.5 pl-1">
                <li>Contents</li>
                <li>Discussions</li>
                <li>Issues</li>
                <li>Pull requests</li>
              </ul>
            </div>
            <a
              href={githubOrgName.trim()
                ? `https://github.com/organizations/${githubOrgName.trim()}/settings/personal-access-tokens/new`
                : 'https://github.com/settings/tokens?type=beta'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs text-brand-light hover:text-brand transition-colors"
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              Create a fine-grained token {githubOrgName.trim() ? `for ${githubOrgName.trim()}` : 'on GitHub'}
            </a>
            {tokenWarning && <p className="text-xs text-amber-400 mt-2">{tokenWarning}</p>}
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

      {/* Local Capture Webhook */}
      <CaptureWebhookSection toast={toast} />

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
          </p>
          <a
            href="https://github.com/crittermike/manager-inator"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 text-xs text-brand-light hover:text-brand transition-colors"
          >
            github.com/crittermike/manager-inator
          </a>
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

interface ToastApi {
  success: (msg: string) => void
  error: (msg: string) => void
  warning?: (msg: string, title?: string) => void
}

function CaptureWebhookSection({ toast }: { toast: ToastApi }) {
  const [status, setStatus] = useState<CaptureWebhookStatus | null>(null)
  const [portInput, setPortInput] = useState('')
  const [savingPort, setSavingPort] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    let mounted = true
    window.api.getWebhookStatus().then((s) => {
      if (!mounted) return
      setStatus(s)
      setPortInput(String(s.port))
    }).catch((err) => {
      console.error('[Webhook] Failed to load status:', err)
    })
    return () => { mounted = false }
  }, [])

  const handleToggle = useCallback(async () => {
    if (!status || toggling) return
    setToggling(true)
    try {
      const next = await window.api.setWebhookEnabled(!status.enabled)
      setStatus(next)
      if (next.enabled && next.error) {
        toast.error(next.error)
      } else if (next.enabled && next.running) {
        toast.success(`Capture webhook running on port ${next.port}`)
      } else if (!next.enabled) {
        toast.success('Capture webhook disabled')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setToggling(false)
    }
  }, [status, toggling, toast])

  const handlePortSave = useCallback(async () => {
    const portNum = parseInt(portInput, 10)
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('Port must be between 1 and 65535')
      return
    }
    setSavingPort(true)
    try {
      const next = await window.api.setWebhookPort(portNum)
      setStatus(next)
      if (next.error) toast.error(next.error)
      else toast.success(`Port saved (${next.port})`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingPort(false)
    }
  }, [portInput, toast])

  const copyUrl = useCallback(() => {
    if (!status) return
    navigator.clipboard.writeText(status.url).then(() => {
      toast.success('URL copied')
    }).catch((err) => {
      console.error('[Webhook] Clipboard write failed:', err)
      toast.error('Failed to copy URL')
    })
  }, [status, toast])

  if (!status) return null

  const portChanged = String(status.port) !== portInput
  const exampleCurl = `curl -X POST ${status.url} \\\n  -H 'Content-Type: application/json' \\\n  -d '{"title":"Standup","transcript":"..."}'`

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
        <Webhook className="w-4 h-4" aria-hidden="true" />
        Local Capture Webhook
      </h2>
      <div className={cardClass + ' space-y-4'}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-zinc-200 font-medium">
              Receive captures from other apps on this machine
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Exposes a localhost-only HTTP endpoint that external tools (e.g. transcription apps) can POST to. Bound to <code className="text-zinc-400">127.0.0.1</code> only — not reachable from the network.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={status.enabled}
            disabled={toggling}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              status.enabled ? 'bg-brand' : 'bg-zinc-700'
            } disabled:opacity-50`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                status.enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex h-2 w-2 rounded-full ${
            status.running ? 'bg-emerald-500' : status.enabled ? 'bg-amber-500' : 'bg-zinc-600'
          }`} />
          <span className="text-zinc-400">
            {status.running ? `Running on port ${status.port}` : status.enabled ? 'Enabled but not running' : 'Disabled'}
          </span>
          {status.error && (
            <span className="text-rose-400 ml-2">— {status.error}</span>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">Port</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={65535}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              className={`${textFieldClass} max-w-[140px]`}
            />
            <button
              type="button"
              disabled={!portChanged || savingPort}
              onClick={handlePortSave}
              className="px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingPort ? 'Saving…' : 'Save port'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">Endpoint URL</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={status.url}
              className={`${textFieldClass} font-mono text-xs flex-1`}
            />
            <button
              type="button"
              onClick={copyUrl}
              className="px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              Copy
            </button>
          </div>
        </div>

        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer hover:text-zinc-200 transition-colors">
            How to send a capture
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <p className="font-medium text-zinc-300 mb-1">Example (curl):</p>
              <pre className="bg-zinc-950/70 border border-border/80 rounded-lg p-3 text-[11px] overflow-x-auto whitespace-pre">{exampleCurl}</pre>
            </div>
            <div>
              <p className="font-medium text-zinc-300 mb-1">Accepted JSON fields:</p>
              <ul className="list-disc list-inside space-y-1 text-zinc-500">
                <li><code className="text-zinc-300">content</code> / <code>transcript</code> / <code>text</code> / <code>body</code> / <code>message</code> / <code>markdown</code> — the content (one is required)</li>
                <li><code className="text-zinc-300">title</code> — optional; prepended as a heading</li>
                <li><code className="text-zinc-300">sourceHint</code> / <code>source</code> / <code>type</code> — one of <code>meeting</code>, <code>slack</code>, <code>github</code>, <code>email</code>, <code>feedback</code>, <code>other</code>. Auto-detected if omitted. Sending <code>transcript</code> implies <code>meeting</code>.</li>
                <li><code className="text-zinc-300">fileName</code> — optional; <code>.vtt</code>/<code>.srt</code> filenames trigger transcript cleanup</li>
                <li><code className="text-zinc-300">speakers</code> — optional array of names</li>
              </ul>
            </div>
            <p className="text-zinc-500">
              Also accepts <code>text/plain</code> bodies with <code>?source=...</code> as a query param. Returns <code>202</code> on success. <code>GET /health</code> returns <code>{'{ ok: true }'}</code>.
            </p>
          </div>
        </details>
      </div>
    </section>
  )
}
