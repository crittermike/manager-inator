const fs = require('fs')
let content = fs.readFileSync('src/renderer/pages/ReportDetail.tsx', 'utf8')

const regex = /const handleGenerateCheckIn = useCallback\(async \(\) => \{\n\s+if \(!report \|\| !name\) return\n\s+setShowAI\(true\)\n\s+setAiMode\('checkin'\)\n\s+setAiContent\(null\)\n\s+reset\(\)\n[\s\S]*?catch \{\n\s+if \(!mountedRef\.current\) return\n\s+\}\n\s+\}, \[report, name, generate, reset\]\)/;

const replacement = `const handleGenerateCheckIn = useCallback(async () => {
    if (!report || !name) return
    setShowAI(true)
    setAiMode('checkin')
    setAiContent(null)
    reset()

    try {
      const { getCheckInContext } = await import('../utils/checkin')
      const { context } = await getCheckInContext(report, name)
      await generate('generate-checkin', context)
    } catch {
      if (!mountedRef.current) return
    }
  }, [report, name, generate, reset])`;

if (regex.test(content)) {
  content = content.replace(regex, replacement)
  fs.writeFileSync('src/renderer/pages/ReportDetail.tsx', content)
  console.log("Patched successfully")
} else {
  console.log("Regex did not match")
}
