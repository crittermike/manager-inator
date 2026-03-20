import { ipcMain, BrowserWindow } from 'electron'
import { getAuthStatus, startAuth, pollAuth, logout } from './auth'
import {
  getReports,
  getReportProfile,
  getReportData,
  getTeamOverview,
  getFileContent,
  commitFile
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
}
