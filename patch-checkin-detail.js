const fs = require('fs')
let content = fs.readFileSync('src/renderer/pages/ReportDetail.tsx', 'utf8')

const regex = /function CheckinDetail\(\{ entry, name \}: \{ entry: StreamEntry; name: string \}\) \{([\s\S]*?)return \(\s*<div className="space-y-2">([\s\S]*?)<\/div>\s*\)\s*\}/;

const replacement = `function CheckinDetail({ entry, name, onSave }: { entry: StreamEntry; name: string; onSave: (path: string, content: string) => Promise<void> }) {
  const c = entry.data as { date: string; accomplishments: string[] }
  const checkinPath = \`reports/\${name}/check-ins/monthly/\${c.date}.md\`
  const { content, loading } = useFileContent(checkinPath)
  const [isEditing, setIsEditing] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isEditing && content != null) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-zinc-300">Edit check-in</span>
          <button onClick={() => setIsEditing(false)} className="text-zinc-500 hover:text-zinc-300">Cancel</button>
        </div>
        <InlineEditor 
          initialContent={content} 
          onSave={async (newContent) => {
            await onSave(checkinPath, newContent)
            setIsEditing(false)
          }} 
        />
      </div>
    )
  }

  return (
    <div className="space-y-2 group">
      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity mb-2">
        <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-surface-raised rounded-lg transition-colors">
          <Pencil className="w-3 h-3" /> Edit
        </button>
      </div>
      {content ? (
        <div className="prose-dark text-sm max-h-96 overflow-y-auto pr-2">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{cleanSummaryContent(content)}</ReactMarkdown>
        </div>
      ) : c.accomplishments.length > 0 ? (
        <ul className="space-y-1">
          {c.accomplishments.slice(0, 5).map((a, i) => (
            <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
              <span className="text-zinc-600 mt-0.5">•</span>
              {a}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Unable to load check-in content.</p>
      )}
    </div>
  )
}`;

if (regex.test(content)) {
  content = content.replace(regex, replacement)
  fs.writeFileSync('src/renderer/pages/ReportDetail.tsx', content)
  console.log("Patched CheckinDetail successfully")
} else {
  console.log("Regex did not match")
}
