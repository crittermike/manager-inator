const fs = require('fs')
let content = fs.readFileSync('src/renderer/pages/ReportDetail.tsx', 'utf8')

content = content.replace(
  /\{entry\.type === 'checkin' && <CheckinDetail entry=\{entry\} name=\{name\} \/>\}/,
  "{entry.type === 'checkin' && <CheckinDetail entry={entry} name={name} onSave={onSaveContent} />}"
)

fs.writeFileSync('src/renderer/pages/ReportDetail.tsx', content)
console.log("Patched StreamEntryCard CheckinDetail usage")
