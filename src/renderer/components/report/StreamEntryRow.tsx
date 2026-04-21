import { memo, useCallback } from 'react'
import { FormattedDate } from '../common/FormattedDate'
import type { StreamEntry } from './StreamEntryCard'

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  context: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: '1:1' },
  feedback: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Feedback' },
  action: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Actions' },
  checkin: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Check-in' },
  review: { bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Review' },
  prep: { bg: 'bg-sky-500/10', text: 'text-sky-400', label: 'Prep' },
}

const SOURCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  meeting: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Meeting' },
  slack: { bg: 'bg-violet-500/10', text: 'text-violet-400', label: 'Slack' },
  github: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'GitHub' },
  email: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'Email' },
  other: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Note' },
}

interface Props {
  entry: StreamEntry
  selected: boolean
  onSelect: (id: string) => void
}

function StreamEntryRowImpl({ entry, selected, onSelect }: Props) {
  const style = entry.type === 'context' && entry.source
    ? SOURCE_STYLES[entry.source] || TYPE_STYLES['context']
    : TYPE_STYLES[entry.type] || TYPE_STYLES['context']

  const handleClick = useCallback(() => onSelect(entry.id), [onSelect, entry.id])
  const showDate = !entry.pinned && entry.type !== 'checkin' && entry.type !== 'review'

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={selected ? 'true' : undefined}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
        selected
          ? 'bg-brand/10 border-brand/40 shadow-md'
          : entry.pinned
            ? 'bg-surface border-brand/20 hover:border-zinc-500'
            : 'bg-surface border-border hover:border-zinc-500'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
          {style.label}
        </span>
        <span className="text-sm text-zinc-200 truncate flex-1 min-w-0">{entry.title}</span>
        {showDate && (
          <FormattedDate date={entry.date} className="text-[11px] text-zinc-600 shrink-0" />
        )}
      </div>
      {entry.preview && (
        <div className="mt-1 text-xs text-zinc-500 line-clamp-2 break-words">
          {entry.preview}
        </div>
      )}
    </button>
  )
}

export const StreamEntryRow = memo(StreamEntryRowImpl)
