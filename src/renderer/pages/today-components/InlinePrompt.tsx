import { useState, useEffect } from 'react'
import { useToast } from '../../components/common/Toast'
import { useAI } from '../../hooks/useAI'
import { format } from 'date-fns'
import type { PromptType } from './types'
import type { TeamMemberActivity, TeamActionItem, ReportStatus } from '../../../shared/types'
import { Save, Sparkles, Loader2, Target } from 'lucide-react'

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

const promptConfig: Record<PromptType, { placeholder: string; savePath: () => string; commitMsg: () => string }> = {
  'weekly-priorities': {
    placeholder: 'What are your top priorities this week? What must get done?',
    savePath: () => getWeeklyPath('priorities'),
    commitMsg: () => `Save weekly priorities for ${format(new Date(), 'yyyy-MM-dd')}`
  },
  'sprint-goal': {
    placeholder: 'What does success look like for this sprint? What are the key deliverables?',
    savePath: () => `weekly-log/sprint-goal-${format(new Date(), 'yyyy-MM-dd')}.md`,
    commitMsg: () => `Save sprint goal for ${format(new Date(), 'yyyy-MM-dd')}`
  },
  'weekly-reflection': {
    placeholder: 'What shipped this week? What\'s at risk? What did you learn?',
    savePath: () => getWeeklyPath('reflection'),
    commitMsg: () => `Save weekly reflection for ${format(new Date(), 'yyyy-MM-dd')}`
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
        if (streaming) cancel()
        onCancel()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel, streaming, cancel])

  const config = promptConfig[promptType]

  const handleSuggest = async () => {
    setSuggesting(true)
    try {
      const activityText = formatTeamActivityForPrompt(teamActivity)
      const teamContext = formatTeamContext(reports)
      const actionItemsText = formatActionItems(teamActions)

      const action = promptType === 'weekly-reflection' ? 'weekly-reflection' : 'prompt-fill-weekly-priorities'
      const context: Record<string, unknown> = {
        promptType,
        teamContext: teamContext || undefined,
        actionItems: actionItemsText || undefined,
        githubActivity: activityText || undefined
      }

      if (promptType === 'weekly-reflection' && weeklyGoals) {
        context.weeklyGoals = weeklyGoals.map(g => `- ${g}`).join('\n')
      }

      const result = await generate(action, context)
      if (result) setText(result)
    } catch {
      toast.error('AI suggestion failed')
    } finally {
      setSuggesting(false)
    }
  }

  const handleSave = async () => {
    if (!text.trim()) return
    setSaving(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const header = promptType === 'weekly-priorities'
      ? `# Weekly Priorities — ${today}`
      : promptType === 'sprint-goal'
      ? `# Sprint Goal — ${today}`
      : `# Weekly Reflection — ${today}`

    try {
      await window.api.commitFile(
        config.savePath(),
        `${header}\n\n${text.trim()}\n`,
        config.commitMsg()
      )
      toast.success('Saved')
      onDone()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

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
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-brand-light hover:text-white hover:bg-brand/15 rounded-lg transition-all active:scale-[0.97] disabled:opacity-50"
        >
          {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {suggesting ? 'Thinking...' : 'AI suggest'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
