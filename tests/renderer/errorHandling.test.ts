import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { globSync } from 'glob'

describe('silent error swallowing prevention', () => {
  const rendererDir = resolve(__dirname, '../../src/renderer')

  const rendererFiles = globSync('**/*.{ts,tsx}', { cwd: rendererDir })

  it('no renderer files contain .catch(() => {})', () => {
    const violations: string[] = []
    for (const file of rendererFiles) {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      if (content.includes('.catch(() => {})')) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })

  it('no renderer files contain .catch(() => { })', () => {
    const violations: string[] = []
    for (const file of rendererFiles) {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      if (/\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(content)) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })

  const filesToCheck = [
    { file: 'pages/PersonDetail.tsx', pattern: 'Failed to load settings options' },
    { file: 'App.tsx', pattern: 'Failed to start prewarm' },
    { file: 'App.tsx', pattern: 'Failed to get prewarm progress' },
    { file: 'pages/Search.tsx', pattern: 'Failed to load contexts' },
    { file: 'pages/Search.tsx', pattern: 'Failed to load people' },
    { file: 'components/common/CommandPalette.tsx', pattern: 'Failed to load people for command palette' },
    { file: 'components/layout/AddReportModal.tsx', pattern: 'Failed to load role options' },
    { file: 'components/common/CaptureSession.tsx', pattern: 'Failed to resolve action item' },
    { file: 'pages/today-components/InlinePrompt.tsx', pattern: 'Failed to load weekly priorities' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to toggle action item' },
    { file: 'pages/Today.tsx', pattern: 'Failed to load today bootstrap' },
    { file: 'pages/Today.tsx', pattern: 'Failed to check prep files' },
    { file: 'pages/Today.tsx', pattern: 'Failed to save activity snapshot' },
    { file: 'pages/Today.tsx', pattern: 'Failed to save snoozed action items' },
    { file: 'pages/Today.tsx', pattern: 'Failed to refresh today bootstrap' },
    { file: 'pages/Search.tsx', pattern: 'Failed to search content' },
    { file: 'pages/Settings.tsx', pattern: 'Failed to load settings' },
    { file: 'pages/today-components/InlinePrompt.tsx', pattern: 'No existing content found' },
    { file: 'App.tsx', pattern: 'Failed to load settings' },
    { file: 'pages/today-components/InlinePrep.tsx', pattern: 'No existing prep file' },
    { file: 'pages/today-components/InlinePrep.tsx', pattern: 'Failed to load report data' },
    { file: 'hooks/useData.ts', pattern: 'File content not available' },
  ]

  for (const { file, pattern } of filesToCheck) {
    it(`${file} logs "${pattern}" on API failure`, () => {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      expect(content).toContain(pattern)
    })
  }

  it('no renderer files have catch blocks that silently swallow errors', () => {
    const violations: string[] = []
    const patterns = [
      /\.catch\(\s*\(\s*\)\s*=>\s*\{/g,
      /\.catch\(\s*_\s*=>\s*\{/g,
      /\bcatch\s*\([^)]*\)\s*\{\s*\}/g,
    ]
    for (const file of rendererFiles) {
      const content = readFileSync(join(rendererDir, file), 'utf-8')
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          violations.push(file)
          break
        }
        pattern.lastIndex = 0
      }
    }
    expect(violations).toEqual([])
  })
})
