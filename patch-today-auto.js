const fs = require('fs')
let content = fs.readFileSync('src/renderer/pages/Today.tsx', 'utf8')

// First, add the logic to computeTimelineItems
const regex = /const isCheckInWeek = isFirstWeek && \([\s\S]*?includes\(month\)\)\n\s+\)\n\s+if \(isCheckInWeek\) \{\n\s+for \(const r of reports\) \{\n\s+if \(!r\.lastCheckIn \|\| r\.lastCheckIn < currentMonth\) \{[\s\S]*?\}\n\s+\}\n\s+\}/;

const replacement = `const isCheckInMonth = (
    cadence.checkInFrequency === 'monthly' ||
    (cadence.checkInFrequency === 'bimonthly' && month % 2 === 0) ||
    (cadence.checkInFrequency === 'quarterly' && [0, 3, 6, 9].includes(month))
  )
  const isCheckInWeek = isFirstWeek && isCheckInMonth
  const isLastDayOfMonth = new Date(now.getFullYear(), month + 1, 0).getDate() === now.getDate()

  if (isCheckInWeek) {
    for (const r of reports) {
      if (!r.lastCheckIn || r.lastCheckIn < currentMonth) {
        items.push({
          id: \`overdue-checkin-\${r.name}\`,
          section: doneIds.has(\`overdue-checkin-\${r.name}\`) ? 'done' : (now.getDate() === 1 ? 'this-week' : 'overdue'),
          title: \`Monthly check-in due for \${r.displayName}\`,
          subtitle: r.lastCheckIn ? \`Last check-in: \${r.lastCheckIn}\` : 'No check-in on file',
          reportName: r.name,
          route: \`/report/\${r.name}?filter=checkin\`,
          actionLabel: 'Write check-in',
          actionType: 'navigate'
        })
      }
    }
  }

  if (isCheckInMonth && isLastDayOfMonth) {
    for (const r of reports) {
      const genKey = \`auto-checkin-\${currentMonth}-\${r.name}\`
      const isGen = localStorage.getItem(genKey) === 'true'
      if (isGen || r.lastCheckIn === currentMonth) {
        items.push({
          id: \`generated-checkin-\${r.name}\`,
          section: 'done',
          title: \`Generated check-in for \${r.displayName}\`,
          subtitle: 'Saved today',
          reportName: r.name,
          route: \`/report/\${r.name}?filter=checkin\`,
          actionLabel: 'View',
          actionType: 'navigate'
        })
      } else if (!r.lastCheckIn || r.lastCheckIn < currentMonth) {
        items.push({
          id: \`generating-checkin-\${r.name}\`,
          section: 'this-week',
          title: \`Auto-generating check-in for \${r.displayName}...\`,
          subtitle: 'Running in background',
          reportName: r.name
        })
      }
    }
  }`;

if (regex.test(content)) {
  content = content.replace(regex, replacement)
  fs.writeFileSync('src/renderer/pages/Today.tsx', content)
  console.log("Patched computeTimelineItems for checkin")
} else {
  console.log("Regex not found in Today computeTimelineItems")
}

