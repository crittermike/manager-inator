import { ipcMain, BrowserWindow } from 'electron'
import { getAuthStatus, startAuth, pollAuth, logout } from './auth'
import {
  getReports,
  getReportProfile,
  getReportData,
  getTeamOverview,
  getFileContent,
  commitFile,
  listMeetings,
  listPeople,
  getPersonMeetings,
  findPersonByName,
  getImpactLog,
  getSettingsOptions,
  saveMeetingTitle,
  toggleActionItem
} from './github'
import { getSettings, saveSettings } from './store'
import { aiGenerate, aiCancel } from './copilot'

export function setupIpcHandlers(): void {
  // ── Auth ──
  ipcMain.handle('auth:status', () => getAuthStatus())
  ipcMain.handle('auth:start', () => startAuth())
  ipcMain.handle('auth:poll', () => pollAuth())
  ipcMain.handle('auth:logout', () => logout())

  // ── Settings ──
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:save', (_e, settings) => saveSettings(settings))

  // ── GitHub data ──
  ipcMain.handle('github:reports', () => getReports())
  ipcMain.handle('github:profile', (_e, name) => getReportProfile(name))
  ipcMain.handle('github:report-data', (_e, name) => getReportData(name))
  ipcMain.handle('github:team-overview', () => getTeamOverview())
  ipcMain.handle('github:file-content', (_e, path) => getFileContent(path))
  ipcMain.handle('github:commit-file', (_e, path, content, message) =>
    commitFile(path, content, message)
  )
  ipcMain.handle('github:list-meetings', () => listMeetings())
  ipcMain.handle('github:list-people', () => listPeople())
  ipcMain.handle('github:person-meetings', (_e, slug) => getPersonMeetings(slug))
  ipcMain.handle('github:find-person', (_e, name) => findPersonByName(name))
  ipcMain.handle('github:impact-log', () => getImpactLog())
  ipcMain.handle('github:settings-options', () => getSettingsOptions())
  ipcMain.handle('github:save-meeting-title', (_e, filename, title) => saveMeetingTitle(filename, title))
  ipcMain.handle('github:toggle-action-item', (_e, sourceFile, sourceLine) => toggleActionItem(sourceFile, sourceLine))

  // ── AI with streaming ──
  ipcMain.handle('ai:generate', async (event, action, context) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window')

    const result = await aiGenerate(action, context, (chunk) => {
      // Stream chunks to renderer
      win.webContents.send('ai:chunk', chunk)
    })

    return result
  })

  ipcMain.handle('ai:cancel', () => aiCancel())

  // ── Backfill meeting summaries ──
  ipcMain.handle('ai:backfill-summaries', async (event, meetingFilenames: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const results: { filename: string; success: boolean; error?: string }[] = []

    for (const filename of meetingFilenames) {
      try {
        // Read the transcript
        const transcript = await getFileContent(`meetings/${filename}`)

        // Extract title and date from filename
        const name = filename.replace('.md', '')
        const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
        const date = dateMatch?.[1] || name
        const title = dateMatch?.[2]?.replace(/-/g, ' ') || name

        // Get report names for context
        const reportNames = await getReports()
        const profiles = await Promise.all(
          reportNames.map(async (n) => {
            try {
              const p = await getReportProfile(n)
              return p.displayName
            } catch { return n }
          })
        )

        win?.webContents.send('ai:backfill-progress', { filename, status: 'generating' })

        // Generate summary with speakers
        const summary = await aiGenerate('summarize-meeting', {
          meetingTitle: title,
          date,
          reportNames: profiles.join(', '),
          transcript
        }, () => {})

        // Save summary file
        const summaryFilename = filename.replace('.md', '-summary.md')
        await commitFile(
          `meetings/${summaryFilename}`,
          summary,
          `Add meeting summary with speakers: ${title} on ${date}`
        )

        results.push({ filename, success: true })
        win?.webContents.send('ai:backfill-progress', { filename, status: 'done' })
      } catch (err) {
        console.error(`[Backfill] Failed for ${filename}:`, (err as Error).message)
        results.push({ filename, success: false, error: (err as Error).message })
        win?.webContents.send('ai:backfill-progress', { filename, status: 'error', error: (err as Error).message })
      }
    }

    return results
  })
}
