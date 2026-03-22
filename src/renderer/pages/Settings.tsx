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
  MessageSquare
} from 'lucide-react'

export function Settings() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const [repoPathVal, setRepoPathVal] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [checkInFreq, setCheckInFreq] = useState<CheckInFrequency>('monthly')
  const [feedbackDays, setFeedbackDays] = useState(14)
  const [sprintLength, setSprintLength] = useState(2)
  const [endOfWeekDay, setEndOfWeekDay] = useState<DayOfWeek>('friday')
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
  const [savedSprintLength, setSavedSprintLength] = useState(2)
  const [savedEndOfWeekDay, setSavedEndOfWeekDay] = useState<DayOfWeek>('friday')
  const [savedSprintStartDate, setSavedSprintStartDate] = useState('')
  const [savedCustomInstructions, setSavedCustomInstructions] = useState('')
  const [repoPathError, setRepoPathError] = useState('')

  const isDirty = repoPathVal !== savedRepoPath || model !== savedModel || checkInFreq !== savedCheckInFreq || feedbackDays !== savedFeedbackDays || sprintLength !== savedSprintLength || endOfWeekDay !== savedEndOfWeekDay || sprintStartDate !== savedSprintStartDate || customInstructions !== savedCustomInstructions
  const { blockerState, proceed, reset: resetBlocker } = useUnsavedChanges(isDirty)
  const saveRef = useRef<() => void>(() => {})

  useKeyboardShortcut({ key: 's', handler: useCallback(() => saveRef.current(), []), enabled: isDirty && !saving })

  useEffect(() => {
    window.api.getSettings()
      .then((s: { repoPath?: string; defaultModel?: string; checkInFrequency?: CheckInFrequency; feedbackReminderDays?: number; sprintLengthWeeks?: number; endOfWeekDay?: DayOfWeek; sprintStartDate?: string; aiCustomInstructions?: string }) => {
        const rp = s.repoPath || ''
        const m = s.defaultModel || DEFAULT_MODEL
        const cif = s.checkInFrequency || 'monthly'
        const frd = s.feedbackReminderDays ?? 14
        const sl = s.sprintLengthWeeks ?? 2
        const eow = s.endOfWeekDay || 'friday'
        const ssd = s.sprintStartDate || ''
        const ci = s.aiCustomInstructions || ''
        setRepoPathVal(rp)
        setModel(m)
        setCheckInFreq(cif)
        setFeedbackDays(frd)
        setSprintLength(sl)
        setEndOfWeekDay(eow)
        setSprintStartDate(ssd)
        setCustomInstructions(ci)
        setSavedRepoPath(rp)
        setSavedModel(m)
        setSavedCheckInFreq(cif)
        setSavedFeedbackDays(frd)
        setSavedSprintLength(sl)
        setSavedEndOfWeekDay(eow)
        setSavedSprintStartDate(ssd)
        setSavedCustomInstructions(ci)
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
      const allSettings = { repoPath: repoPathVal, defaultModel: model, checkInFrequency: checkInFreq, feedbackReminderDays: feedbackDays, sprintLengthWeeks: sprintLength, endOfWeekDay, sprintStartDate, aiCustomInstructions: customInstructions }
      if (repoPathVal !== savedRepoPath && repoPathVal.trim()) {
        try {
          await window.api.saveSettings(allSettings)
          await window.api.getReports()
          setRepoPathError('')
        } catch {
          setRepoPathError('Invalid repo path — no reports found at that location')
          await window.api.saveSettings({ repoPath: savedRepoPath, defaultModel: savedModel, checkInFrequency: savedCheckInFreq, feedbackReminderDays: savedFeedbackDays, sprintLengthWeeks: savedSprintLength, endOfWeekDay: savedEndOfWeekDay, sprintStartDate: savedSprintStartDate, aiCustomInstructions: savedCustomInstructions })
          setSaving(false)
          return
        }
      } else {
        await window.api.saveSettings(allSettings)
      }
      setSavedRepoPath(repoPathVal)
      setSavedModel(model)
      setSavedCheckInFreq(checkInFreq)
      setSavedFeedbackDays(feedbackDays)
      setSavedSprintLength(sprintLength)
      setSavedEndOfWeekDay(endOfWeekDay)
      setSavedSprintStartDate(sprintStartDate)
      setSavedCustomInstructions(customInstructions)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-zinc-400" aria-hidden="true" />
          Settings
        </h1>
      </div>

      {/* Account */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Account
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5">
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

      {/* Repository */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
          Repository
        </h2>
        <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
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
              className="flex-1 px-3 py-2 bg-surface-raised border border-border rounded-lg text-sm text-zinc-100 font-mono focus:outline-none focus:border-brand transition-colors"
            />
            <button
              onClick={async () => {
                const result = await window.api.showOpenDialog({ properties: ['openDirectory'], title: 'Select repo folder' })
                if (result) setRepoPathVal(result)
              }}
              className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay border border-border rounded-lg transition-colors whitespace-nowrap"
            >
              Browse...
            </button>
          </div>

          {repoPathError && (
            <p className="text-xs text-danger">{repoPathError}</p>
          )}
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
        </div>
      </section>

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

      {/* Sticky save bar */}
      {isDirty && (
        <div className="sticky bottom-0 -mx-8 px-8 py-4 bg-zinc-950/90 backdrop-blur-sm border-t border-border animate-slide-down">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <p className="text-xs text-zinc-500">You have unsaved changes</p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        message="You have unsaved settings changes. Leave anyway?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={proceed}
        onCancel={resetBlocker}
      />
    </div>
  )
}
