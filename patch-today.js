const fs = require('fs')
let content = fs.readFileSync('src/renderer/pages/Today.tsx', 'utf8')

const regex = /section: doneIds\.has\(\`overdue-checkin-\$\{r\.name\}\`\) \? 'done' : 'overdue',/;
const replacement = "section: doneIds.has(`overdue-checkin-${r.name}`) ? 'done' : (now.getDate() === 1 ? 'this-week' : 'overdue'),";

if (regex.test(content)) {
  content = content.replace(regex, replacement)
  fs.writeFileSync('src/renderer/pages/Today.tsx', content)
  console.log("Patched Today.tsx overdue logic")
} else {
  console.log("Regex not found in Today.tsx")
}
