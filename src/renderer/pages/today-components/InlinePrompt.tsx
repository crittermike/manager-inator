import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '../../components/common/Toast'
import { useAI } from '../../hooks/useAI'
import { format } from 'date-fns'
import type { PromptType } from './types'
import type { TeamMemberActivity, TeamActionItem, ReportStatus } from '../../../shared/types'
import { Save, Sparkles, Loader2, Target, Pencil, Trash2, Check, X, FolderOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]

function getWeekNumber() {
  const now = new Date()
  const year = now.getFullYear()
  return {
    year,
    weekNum: Math.ceil(((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7)
  }
}

function getWeeklyPath(type: 'priorities' | 'reflection') {
  const { year, weekNum } = getWeekNumber()
  return `weekly-log/${year}-W${String(weekNum).padStart(2, '0')}-${type}.md`
}

function formatTeamActivityForPrompt(teamActivity: TeamMemberActivity[]): string {
  const sections: string[] = []
  for (const member of teamActivity) {
    if (member.error || member.items.length === 0) continue
    const prs = member.items.filter(i => i.type === 'pr')
    const issues = member.items.filter(i => i.type === 'issue')
    const discussions = member.items.filter(i => i.type === 'discussion')
    const lines = [`**${member.displayName}** (@${member.githubUsername}): ${prs.length} PRs, ${issues.length} issues, ${discussions.length} discussions`]
    const merged = prs.filter(p => p.state === 'merged')
    if (merged.length > 0) lines.push('  Merged: ' + merged.slice(0, 5).map(p => p.title).join(', '))
    const openPRs = prs.filter(p => p.state === 'open')
    if (openPRs.length > 0) lines.push('  Open PRs: ' + openPRs.slice(0, 5).map(p => p.title).join(', '))
    const withReviews = prs.filter(p => p.reviewComments?.length)
    if (withReviews.length > 0) {
      lines.push('  Code reviews: ' + withReviews.slice(0, 3).map(p => {
        const rc = p.reviewComments![0]
        return `${p.title} (${rc.reviewState}: "${rc.body.slice(0, 80)}")`
      }).join('; '))
    }
    sections.push(lines.join('\n'))
  }
  return sections.length > 0 ? sections.join('\n\n') : ''
}

function formatTeamContext(reports: ReportStatus[]): string {
  if (reports.length === 0) return ''
  return reports.map(r => {
    const parts = [`${r.displayName}: ${r.status}`]
    if (r.lastOneOnOne) parts.push(`last 1:1 ${r.lastOneOnOne}`)
    if (r.openActionItems > 0) parts.push(`${r.openActionItems} open actions`)
    if (r.meetingDay) parts.push(`meets ${r.meetingDay}`)
    return parts.join(', ')
  }).join('\n')
}

function formatActionItems(actions: TeamActionItem[]): string {
  if (actions.length === 0) return ''
  return actions.slice(0, 20).map(a =>
    `- [${a.completed ? 'x' : ' '}] ${a.displayName}: ${a.text}`
  ).join('\n')
}

function getMonthlyPath(slug: string) {
  return `weekly-log/${format(new Date(), 'yyyy-MM')}-${slug}.md`
}

function getQuarterlyPath(slug: string) {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) + 1
  return `weekly-log/${now.getFullYear()}-Q${q}-${slug}.md`
}

function getSemiAnnualPath(slug: string) {
  const now = new Date()
  const h = now.getMonth() < 6 ? 'H1' : 'H2'
  return `weekly-log/${now.getFullYear()}-${h}-${slug}.md`
}

interface PromptConfig {
  placeholder: string
  savePath: () => string
  commitMsg: () => string
  header: () => string
  aiAction: string
}

const promptConfig: Record<PromptType, PromptConfig> = {
  'weekly-priorities': {
    placeholder: 'What are your top priorities this week? What must get done?',
    savePath: () => getWeeklyPath('priorities'),
    commitMsg: () => `Save weekly priorities for ${format(new Date(), 'yyyy-MM-dd')}`,
    header: () => `# Weekly Priorities — ${format(new Date(), 'yyyy-MM-dd')}`,
    aiAction: 'prompt-fill-weekly-priorities'
  },
  'sprint-goal': {
    placeholder: 'What does success look like for this sprint? What are the key deliverables?',
    savePath: () => `weekly-log/sprint-goal-${format(new Date(), 'yyyy-MM-dd')}.md`,
    commitMsg: () => `Save sprint goal for ${format(new Date(), 'yyyy-MM-dd')}`,
    header: () => `# Sprint Goal — ${format(new Date(), 'yyyy-MM-dd')}`,
    aiAction: 'sprint-goal'
  },
  'weekly-reflection': {
    placeholder: 'What shipped this week? What\'s at risk? What did you learn?',
    savePath: () => getWeeklyPath('reflection'),
    commitMsg: () => `Save weekly reflection for ${format(new Date(), 'yyyy-MM-dd')}`,
    header: () => `# Weekly Reflection — ${format(new Date(), 'yyyy-MM-dd')}`,
    aiAction: 'weekly-reflection'
  },
  'skip-level-prep': {
    placeholder: 'What do you want to discuss with your manager? Key updates, blockers, asks?',
    savePath: () => getMonthlyPath('skip-level-prep'),
    commitMsg: () => `Save skip-level prep for ${format(new Date(), 'yyyy-MM')}`,
    header: () => `# Skip-Level 1:1 Prep — ${format(new Date(), 'MMMM yyyy')}`,
    aiAction: 'skip-level-prep'
  },
  'quarterly-okr': {
    placeholder: 'What are the key objectives and results for this quarter?',
    savePath: () => getQuarterlyPath('okr-draft'),
    commitMsg: () => `Save OKR draft for ${format(new Date(), 'yyyy-MM')}`,
    header: () => {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3) + 1
      return `# OKR Draft — Q${q} ${now.getFullYear()}`
    },
    aiAction: 'quarterly-okr'
  },
  'team-health-check': {
    placeholder: 'For each person on your team, consider: Belonging, Identity, Control, Equity, Predictability, Significance (BICEPS). Who needs attention?',
    savePath: () => getQuarterlyPath('team-health'),
    commitMsg: () => `Save team health check for ${format(new Date(), 'yyyy-MM')}`,
    header: () => {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3) + 1
      return `# Team Health Check — Q${q} ${now.getFullYear()}`
    },
    aiAction: 'team-health-check'
  },
  'sprint-retro': {
    placeholder: 'What went well? What didn\'t? What should change next sprint?',
    savePath: () => `weekly-log/sprint-retro-${format(new Date(), 'yyyy-MM-dd')}.md`,
    commitMsg: () => `Save sprint retro for ${format(new Date(), 'yyyy-MM-dd')}`,
    header: () => `# Sprint Retro — ${format(new Date(), 'yyyy-MM-dd')}`,
    aiAction: 'sprint-retro'
  },
  'personal-retro': {
    placeholder: 'What kind of manager have you been? What patterns do you see? What would you change?',
    savePath: () => getSemiAnnualPath('personal-retro'),
    commitMsg: () => `Save personal management retro for ${format(new Date(), 'yyyy-MM')}`,
    header: () => {
      const now = new Date()
      const h = now.getMonth() < 6 ? 'H1' : 'H2'
      return `# Personal Management Retro — ${h} ${now.getFullYear()}`
    },
    aiAction: 'personal-retro'
  },
  'hiring-review': {
    placeholder: 'If you lost someone tomorrow, what would hurt most? Where are the gaps? What roles would you need?',
    savePath: () => getQuarterlyPath('hiring-review'),
    commitMsg: () => `Save hiring review for ${format(new Date(), 'yyyy-MM')}`,
    header: () => {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3) + 1
      return `# Hiring & Risk Review — Q${q} ${now.getFullYear()}`
    },
    aiAction: 'hiring-review'
  },
  'one-on-one-format-check': {
    placeholder: 'For each report, how is the 1:1 working? What would you ask them to change? What would you change?',
    savePath: () => getSemiAnnualPath('1on1-format-check'),
    commitMsg: () => `Save 1:1 format check for ${format(new Date(), 'yyyy-MM')}`,
    header: () => {
      const now = new Date()
      const h = now.getMonth() < 6 ? 'H1' : 'H2'
      return `# 1:1 Format Check — ${h} ${now.getFullYear()}`
    },
    aiAction: 'one-on-one-format-check'
  }
}

export function InlinePrompt({
  promptType,
  onDone,
  onCancel,
  teamActivity = [],
  reports = [],
  teamActions = []
}: {
  promptType: PromptType
  onDone: () => void
  onCancel: () => void
  teamActivity?: TeamMemberActivity[]
  reports?: ReportStatus[]
  teamActions?: TeamActionItem[]
}) {
  const toast = useToast()
  const { streaming, generate, cancel } = useAI()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [weeklyGoals, setWeeklyGoals] = useState<string[] | null>(null)
  const [phase, setPhase] = useState<'loading' | 'editing' | 'review'>('loading')
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')
  const [deleting, setDeleting] = useState(false)
  const mountedRef = useRef(true)

  const config = promptConfig[promptType]

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Load existing content if available
  useEffect(() => {
    const path = config.savePath()
    window.api.getFileContent(path)
      .then(content => {
        if (!mountedRef.current) return
        if (content && content.trim()) {
          setText(content)
          setPhase('review')
        } else {
          setPhase('editing')
        }
      })
      .catch(() => {
        if (mountedRef.current) setPhase('editing')
      })
  }, [config])

  useEffect(() => {
    if (promptType !== 'weekly-reflection') return
    window.api.getFileContent(getWeeklyPath('priorities'))
      .then(content => {
        const lines = content.split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => l.replace(/^-\s*/, '').trim())
        if (lines.length > 0) setWeeklyGoals(lines)
      })
      .catch(() => {})
  }, [promptType])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (editing) {
          setEditing(false)
          setEditDraft('')
        } else if (streaming) {
          cancel()
        } else {
          onCancel()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel, streaming, cancel, editing])

  const handleSuggest = useCallback(async () => {
    setSuggesting(true)
    try {
      const activityText = formatTeamActivityForPrompt(teamActivity)
      const teamContext = formatTeamContext(reports)
      const actionItemsText = formatActionItems(teamActions)

      const context: Record<string, unknown> = {
        promptType,
        teamContext: teamContext || undefined,
        actionItems: actionItemsText || undefined,
        githubActivity: activityText || undefined
      }

      if (promptType === 'weekly-reflection' && weeklyGoals) {
        context.weeklyGoals = weeklyGoals.map(g => `- ${g}`).join('\n')
      }

      const result = await generate(config.aiAction, context)
      if (result) setText(result)
    } catch {
      toast.error('AI suggestion failed')
    } finally {
      setSuggesting(false)
    }
  }, [promptType, teamActivity, reports, teamActions, weeklyGoals, generate, config.aiAction, toast])

  const handleSave = useCallback(async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      const content = text.trim().startsWith('#') ? `${text.trim()}\n` : `${config.header()}\n\n${text.trim()}\n`
      await window.api.commitFile(config.savePath(), content, config.commitMsg())
      toast.success('Saved')
      setPhase('review')
      setEditing(false)
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }, [text, config, toast])

  const handleSaveEdit = useCallback(async () => {
    if (!editDraft.trim()) return
    setSaving(true)
    try {
      await window.api.commitFile(config.savePath(), editDraft.trim() + '\n', config.commitMsg())
      setText(editDraft.trim() + '\n')
      setEditing(false)
      toast.success('Updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }, [editDraft, config, toast])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await window.api.deleteFile(config.savePath())
      toast.success('Deleted')
      onDone()
    } catch {
      toast.error('Failed to delete')
    } finally {
      setDeleting(false)
    }
  }, [config, toast, onDone])

  const handleStartEdit = useCallback(() => {
    setEditDraft(text)
    setEditing(true)
  }, [text])

  const handleRegenerate = useCallback(() => {
    setText('')
    setPhase('editing')
    setEditing(false)
  }, [])

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-3 py-4 px-1">
        <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
        <span className="text-sm text-zinc-500">Loading...</span>
      </div>
    )
  }

  // Review phase: show rendered content with edit/regenerate/delete actions
  if (phase === 'review' && !editing) {
    return (
      <div className="space-y-3 py-4 px-1">
        <div className="prose-dark text-sm max-h-64 overflow-y-auto rounded-lg bg-surface-raised/50 p-3">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{text}</ReactMarkdown>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={handleRegenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Regenerate
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400/70 hover:text-red-400 bg-surface-raised hover:bg-red-500/10 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button onClick={onCancel} className="ml-auto px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            Close
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
          <FolderOpen className="w-3 h-3" />
          Saved to {config.savePath()}
        </div>
      </div>
    )
  }

  // Review phase + editing: show textarea for editing existing content
  if (phase === 'review' && editing) {
    return (
      <div className="space-y-3 py-4 px-1">
        <textarea
          value={editDraft}
          onChange={e => setEditDraft(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSaveEdit() } }}
          className="w-full min-h-[16rem] bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 font-mono focus:outline-none focus:border-brand/40 transition-colors resize-y"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveEdit}
            disabled={saving || !editDraft.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => { setEditing(false); setEditDraft('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised hover:bg-surface-overlay rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Editing phase: new content (no existing file)
  return (
    <div className="space-y-3 py-4 px-1">
      {promptType === 'weekly-reflection' && weeklyGoals && (
        <div className="bg-surface-raised/50 border border-border/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5 text-brand-light" />
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">This week's goals</span>
          </div>
          <ul className="space-y-1">
            {weeklyGoals.map((goal, i) => (
              <li key={i} className="text-sm text-zinc-300 pl-1">• {goal}</li>
            ))}
          </ul>
        </div>
      )}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() } }}
        placeholder={config.placeholder}
        className="w-full h-28 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleSuggest}
          disabled={suggesting || streaming}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-brand/10 text-brand-light hover:bg-brand/20 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
        >
          {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {suggesting ? 'Thinking...' : 'AI draft'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
        <FolderOpen className="w-3 h-3" />
        Will save to {config.savePath()} — find it later in your weekly-log folder
      </div>
    </div>
  )
}
