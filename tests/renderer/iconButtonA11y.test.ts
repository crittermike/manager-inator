import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { globSync } from 'glob'

describe('icon-only button aria-label coverage', () => {
  const rendererDir = resolve(__dirname, '../../src/renderer')
  const rendererFiles = globSync('**/*.tsx', { cwd: rendererDir })

  const filesToCheck = [
    { file: 'pages/Chat.tsx', label: 'Clear search' },
    { file: 'components/common/CaptureSession.tsx', label: 'aria-label="Dismiss"' },
    { file: 'components/common/CapturePanel.tsx', label: 'aria-label="Minimize"' },
    { file: 'components/common/CapturePanel.tsx', label: 'aria-label="Close capture panel"' },
    { file: 'components/common/CapturePanel.tsx', label: 'Remove image' },
    { file: 'pages/ContextDetail.tsx', label: 'aria-label="Save attendees"' },
    { file: 'pages/ContextDetail.tsx', label: 'aria-label="Cancel editing attendees"' },
    { file: 'pages/ContextDetail.tsx', label: 'Create page for' },
    { file: 'pages/Playbook.tsx', label: 'aria-label="Edit practice"' },
    { file: 'pages/Playbook.tsx', label: 'aria-label="Snooze practice"' },
    { file: 'pages/Playbook.tsx', label: 'aria-label="Delete practice"' },
    { file: 'pages/Playbook.tsx', label: 'Enable practice' },
    { file: 'pages/ReportDetail.tsx', label: 'Close PTO modal' },
    { file: 'pages/Today.tsx', label: 'aria-label="Open on GitHub"' },
  ]

  for (const { file, label } of filesToCheck) {
    it(`${file} contains aria-label for "${label}"`, () => {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      expect(content).toContain(label)
    })
  }

  it('all icon-only buttons in renderer have aria-label or title', () => {
    const buttonPattern = /<button[^>]*>\s*<[A-Z]\w+\s+className="w-[\d.]+ h-[\d.]+"/g
    const ariaOrTitlePattern = /aria-label=|title=/
    const violations: { file: string; line: number; snippet: string }[] = []

    for (const file of rendererFiles) {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('<button') && !line.includes('aria-label') && !line.includes('title=')) {
          const nextLine = (lines[i + 1] || '').trim()
          const nextNextLine = (lines[i + 2] || '').trim()
          const hasIconChild = /^<[A-Z]\w+\s+className="w-/.test(nextLine)
          const iconOnly = hasIconChild && /^<[A-Z]\w+[^/]*\/>\s*$/.test(nextLine)
          const closesImmediately = nextNextLine.startsWith('</button>')
          const hasOnlyIcon = iconOnly && closesImmediately

          if (hasOnlyIcon) {
            const context = lines.slice(Math.max(0, i - 2), i + 4).join('\n')
            if (!ariaOrTitlePattern.test(context)) {
              violations.push({ file, line: i + 1, snippet: line.substring(0, 80) })
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations.map(v => `  ${v.file}:${v.line} — ${v.snippet}`).join('\n')
      expect.fail(`Found ${violations.length} icon-only button(s) without aria-label or title:\n${report}`)
    }
  })
})
