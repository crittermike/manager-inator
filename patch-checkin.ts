const fs = require('fs')
let content = fs.readFileSync('src/renderer/utils/checkin.ts', 'utf8')
content = content.replace('feedback: report.feedback.map(f => `${f.date}: ${f.content}`).join(\'\\n---\\n\'),',
`feedback: report.feedback.map(f => \`\${f.date}: \${f.content}\`).join('\\n---\\n'),
    actionItems: report.actionItems.filter(a => !a.completed).slice(0, 20).map(a => \`- \${a.text}\`).join('\\n'),
    contextNotes: report.contextNotes.length > 0
      ? report.contextNotes.map(n => \`### \${n.date} (\${n.source})\\n\${n.summary}\\n\\n\${n.content}\`).join('\\n\\n---\\n\\n')
      : undefined,`)
fs.writeFileSync('src/renderer/utils/checkin.ts', content)
