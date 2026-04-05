import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { globSync } from 'glob'

describe('decorative icon aria-hidden coverage', () => {
  const rendererDir = resolve(__dirname, '../../src/renderer')
  const rendererFiles = globSync('**/*.tsx', { cwd: rendererDir })

  // Regex: self-closing PascalCase components with className containing w-N sizing
  // (the Lucide icon usage pattern). Excludes lowercase elements and non-self-closing.
  const iconPattern = /<([A-Z][a-zA-Z0-9]+)\s+className=(?:"[^"]*"|{`[^`]*`})[^/]*\/>/g

  const dynamicComponents = new Set(['Component', 'Icon'])

  it('all Lucide icons in renderer have aria-hidden="true"', () => {
    const violations: { file: string; line: number; element: string }[] = []

    for (const file of rendererFiles) {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        let match
        iconPattern.lastIndex = 0
        while ((match = iconPattern.exec(lines[i])) !== null) {
          const fullMatch = match[0]
          if (dynamicComponents.has(match[1])) continue
          if (!/w-[\d.]/.test(fullMatch)) continue

          if (!fullMatch.includes('aria-hidden="true"')) {
            violations.push({
              file,
              line: i + 1,
              element: fullMatch.length > 100 ? fullMatch.substring(0, 100) + '...' : fullMatch,
            })
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} — ${v.element}`)
        .join('\n')
      expect.fail(
        `Found ${violations.length} Lucide icon(s) without aria-hidden="true":\n${report}`
      )
    }
  })

  it('detects a meaningful number of icons with aria-hidden (sanity check)', () => {
    let iconCount = 0

    for (const file of rendererFiles) {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      const matches = content.match(/aria-hidden="true"\s*\/>/g)
      if (matches) iconCount += matches.length
    }

    expect(iconCount).toBeGreaterThan(250)
  })

  it('no icons use aria-hidden="false"', () => {
    const violations: { file: string; line: number }[] = []

    for (const file of rendererFiles) {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('aria-hidden="false"')) {
          violations.push({ file, line: i + 1 })
        }
      }
    }

    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}:${v.line}`).join('\n')
      expect.fail(`Found aria-hidden="false" in:\n${report}`)
    }
  })
})
