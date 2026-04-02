const fs = require('fs')
let content = fs.readFileSync('src/renderer/pages/ReportDetail.tsx', 'utf8')

const regex = /const now = new Date\(\)[\s\S]*?githubActivity: githubActivityText\n\s+\}\)\n\s+\} catch \{\n\s+if \(!mountedRef\.current\) return\n\s+\}/

const newCode = `try {
      const { getCheckInContext } = await import('../utils/checkin')
      const { context } = await getCheckInContext(report, name)
      await generate('generate-checkin', context)
    } catch {
      if (!mountedRef.current) return
    }`

content = content.replace(regex, newCode)
fs.writeFileSync('src/renderer/pages/ReportDetail.tsx', content)
