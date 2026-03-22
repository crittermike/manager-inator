import { useState } from 'react'
import { useToast } from '../../components/common/Toast'
import { format } from 'date-fns'
import type { PromptType } from './types'
import { Save } from 'lucide-react'

const promptConfig: Record<PromptType, { placeholder: string; savePath: () => string; commitMsg: () => string }> = {
  'weekly-priorities': {
    placeholder: 'What are your top priorities this week? What must get done?',
    savePath: () => {
      const now = new Date()
      const year = now.getFullYear()
      const weekNum = Math.ceil(((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7)
      return `weekly-log/${year}-W${String(weekNum).padStart(2, '0')}-priorities.md`
    },
    commitMsg: () => `Save weekly priorities for ${format(new Date(), 'yyyy-MM-dd')}`
  },
  'sprint-goal': {
    placeholder: 'What does success look like for this sprint? What are the key deliverables?',
    savePath: () => `weekly-log/sprint-goal-${format(new Date(), 'yyyy-MM-dd')}.md`,
    commitMsg: () => `Save sprint goal for ${format(new Date(), 'yyyy-MM-dd')}`
  },
  'weekly-reflection': {
    placeholder: 'What shipped this week? What\'s at risk? What did you learn?',
    savePath: () => {
      const now = new Date()
      const year = now.getFullYear()
      const weekNum = Math.ceil(((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7)
      return `weekly-log/${year}-W${String(weekNum).padStart(2, '0')}-reflection.md`
    },
    commitMsg: () => `Save weekly reflection for ${format(new Date(), 'yyyy-MM-dd')}`
  }
}

export function InlinePrompt({
  promptType,
  onDone,
  onCancel
}: {
  promptType: PromptType
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const config = promptConfig[promptType]

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
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={config.placeholder}
        className="w-full h-28 bg-surface-raised border border-border rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-y focus:outline-none focus:border-brand/40 transition-colors"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!text.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand hover:bg-brand-dark text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
