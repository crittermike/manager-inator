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
    { file: 'hooks/useData.ts', pattern: 'Failed to load settings' },
    { file: 'pages/today-components/InlinePrep.tsx', pattern: 'Failed to save prep' },
    { file: 'pages/today-components/InlinePrep.tsx', pattern: 'Cross-meeting mentions unavailable' },
    { file: 'pages/today-components/InlinePrep.tsx', pattern: 'GitHub activity fetch unavailable' },
    { file: 'pages/today-components/InlinePrep.tsx', pattern: 'Failed to generate prep' },
    { file: 'pages/today-components/InlinePrep.tsx', pattern: 'Failed to delete prep' },
    { file: 'pages/Settings.tsx', pattern: 'Repo path validation failed' },
    { file: 'pages/Settings.tsx', pattern: 'Failed to reactivate report' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Cross-meeting mentions unavailable' },
    { file: 'pages/ReportDetail.tsx', pattern: 'GitHub activity fetch is non-critical' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to auto-save prep' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to auto-save check-in' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to generate check-in' },
    { file: 'pages/ReportDetail.tsx', pattern: 'GitHub activity for review is non-critical' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to generate review' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to update feedback' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to delete feedback' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to undo action item' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to update PTO status' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to save PTO status' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to deactivate report' },
    { file: 'pages/ReportDetail.tsx', pattern: 'AI rewrite failed' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Feedback log file may not exist' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to save review' },
    { file: 'pages/ReportDetail.tsx', pattern: 'Failed to toggle prep checkbox' },
    { file: 'pages/Today.tsx', pattern: 'Failed to parse localStorage done IDs' },
    { file: 'pages/Today.tsx', pattern: 'Failed to parse activity summary from localStorage' },
    { file: 'pages/Today.tsx', pattern: 'Recent team context unavailable' },
    { file: 'pages/PersonDetail.tsx', pattern: 'Failed to save profile' },
    { file: 'pages/today-components/InlineActions.tsx', pattern: 'Failed to toggle action item' },
    { file: 'pages/ImpactLog.tsx', pattern: 'Impact log not found, using default' },
    { file: 'pages/today-components/InlineFeedback.tsx', pattern: 'AI rewrite failed' },
    { file: 'pages/today-components/InlineFeedback.tsx', pattern: 'Feedback log file may not exist' },
    { file: 'pages/MyProfile.tsx', pattern: 'Impact log not found, using default' },
    { file: 'pages/MyProfile.tsx', pattern: 'Failed to load weekly log entries' },
    { file: 'pages/MyProfile.tsx', pattern: 'Failed to load weekly log entry' },
    { file: 'pages/MyProfile.tsx', pattern: 'Failed to save weekly log entry' },
    { file: 'pages/AuthScreen.tsx', pattern: 'Auth polling error' },
    { file: 'pages/SetupScreen.tsx', pattern: 'Token validation failed' },
    { file: 'hooks/useChatSessions.tsx', pattern: 'Failed to parse chat sessions from localStorage' },
    { file: 'hooks/useChatSessions.tsx', pattern: 'Chat AI response failed' },
    { file: 'components/common/AIFloatingPanel.tsx', pattern: 'Activity context unavailable' },
    { file: 'components/common/CaptureSession.tsx', pattern: 'Feedback log file may not exist' },
    { file: 'components/common/CaptureSession.tsx', pattern: 'Impact log file may not exist' },
    { file: 'components/common/CaptureSession.tsx', pattern: 'Failed to load open action items' },
    { file: 'components/common/CaptureSession.tsx', pattern: 'Failed to parse AI classification JSON' },
    { file: 'components/common/CaptureSession.tsx', pattern: 'Failed to load file for editing' },
    { file: 'components/common/CaptureSession.tsx', pattern: 'Failed to save changes' },
    { file: 'components/common/CaptureSession.tsx', pattern: 'Failed to delete context' },
    { file: 'utils/checkin.ts', pattern: 'Monthly GitHub activity unavailable' },
    { file: 'utils/checkin.ts', pattern: 'Content enrichment unavailable' },
    { file: 'pages/today-components/InlinePrompt.tsx', pattern: 'AI suggestion failed' },
    { file: 'pages/today-components/InlinePrompt.tsx', pattern: 'Failed to save edit' },
    { file: 'pages/today-components/InlinePrompt.tsx', pattern: 'Failed to delete' },
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
      /\.catch\(\s*\(\s*\)\s*=>\s*\{/g,       // .catch(() => {
      /\.catch\(\s*_\s*=>\s*\{/g,              // .catch(_ => {
      /\bcatch\s*\([^)]*\)\s*\{\s*\}/g,        // catch (e) { }
      /\bcatch\s*\{\s*\}/g,                     // catch { }
      /\bcatch\s*\{[^}]*\/\*[^*]*\*\/\s*\}/g,  // catch { /* comment */ }
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
