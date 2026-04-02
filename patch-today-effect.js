const fs = require('fs')
let content = fs.readFileSync('src/renderer/pages/Today.tsx', 'utf8')

const effectStr = `
  useEffect(() => {
    if (!overview || !settings) return
    const now = new Date()
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    if (now.getDate() !== lastDayOfMonth) return

    const month = now.getMonth()
    const monthStr = \`\${now.getFullYear()}-\${String(month + 1).padStart(2, '0')}\`
    const isCheckInMonth =
      cadence.checkInFrequency === 'monthly' ||
      (cadence.checkInFrequency === 'bimonthly' && month % 2 === 0) ||
      (cadence.checkInFrequency === 'quarterly' && [0, 3, 6, 9].includes(month))

    if (!isCheckInMonth) return

    const runGeneration = async () => {
      let generatedAny = false
      for (const r of overview.reports) {
        if (!r.lastCheckIn || r.lastCheckIn < monthStr) {
          const genKey = \`auto-checkin-\${monthStr}-\${r.name}\`
          if (localStorage.getItem(genKey) === 'true') continue

          try {
            const reportData = await window.api.getReportData(r.name)
            const { getCheckInContext } = await import('../utils/checkin')
            const { context } = await getCheckInContext(reportData, r.name, now)
            
            const rid = crypto.randomUUID()
            const result = await window.api.aiGenerate('generate-checkin', context, () => {}, rid)
            if (result) {
              await window.api.commitFile(
                \`reports/\${r.name}/check-ins/monthly/\${monthStr}.md\`,
                result,
                \`Auto-save \${r.displayName} check-in for \${context.monthName}\`
              )
              localStorage.setItem(genKey, 'true')
              generatedAny = true
            }
          } catch (e) {
            console.error('Failed to auto-generate checkin for', r.name, e)
          }
        }
      }
      if (generatedAny) refresh()
    }
    
    runGeneration()
  }, [overview, settings, cadence, refresh])
`

content = content.replace(/(export function Today\(\) \{[\s\S]*?const \[prepExistsMap, setPrepExistsMap\] = useState<Record<string, boolean>>\(\{\}\)\n)/, "$1" + effectStr)

fs.writeFileSync('src/renderer/pages/Today.tsx', content)
console.log("Patched Today.tsx useEffect")
