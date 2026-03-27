import { ipcMain, BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { getAuthStatus, startAuth, pollAuth, logout } from './auth'
import {
  getReports,
  getReportProfile,
  getReportData,
  getTeamOverview,
  getFileContent,
  getFilesContentBulk,
  commitFile,
  commitAiModifiedFiles,
  deleteFile,
  listMeetings,
  listPeople,
  getPersonMeetings,
  findPersonByName,
  getImpactLog,
  getSettingsOptions,
  saveMeetingTitle,
  saveMeetingSpeakers,
  toggleActionItem,
  getTeamActionItems,
  getTodayBootstrap,
  searchContent,
  clearAllCaches,
  cancelPendingCommits,
  preWarmCaches,
  isPrewarmComplete,
  safeSend
} from './github'
import { getSettings, getSettingsForRenderer, saveSettings, setGithubOrgToken, setToken } from './store'
import { aiGenerate, aiCancel } from './copilot'
import { getTeamActivity } from './github-activity'

/** Wrap an IPC handler so any thrown error is forwarded as a descriptive Error to the renderer */
function safeHandle(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[IPC] ${channel} failed:`, message)
      throw new Error(`${channel}: ${message}`)
    }
  })
}

export function setupIpcHandlers(): void {
  // ── Auth ──
  safeHandle('auth:status', () => getAuthStatus())
  safeHandle('auth:start', () => startAuth())
  safeHandle('auth:poll', () => pollAuth())
  safeHandle('auth:logout', () => logout())

  // ── Settings ──
  safeHandle('settings:get', () => getSettingsForRenderer())
  safeHandle('settings:save', (_e, settings) => {
    const raw = settings as Record<string, unknown>

    if ('githubOrgToken' in raw) {
      const tokenVal = raw['githubOrgToken']
      setGithubOrgToken(typeof tokenVal === 'string' && tokenVal.trim() ? tokenVal.trim() : null)
    }

    const repoPathChanging = 'repoPath' in raw && raw['repoPath'] !== getSettings().repoPath

    const ALLOWED_KEYS = ['repoPath', 'repoOwner', 'repoName', 'defaultModel', 'checkInFrequency', 'feedbackReminderDays', 'sprintLengthWeeks', 'endOfWeekDay', 'sprintStartDate', 'staleActionDays', 'aiCustomInstructions', 'disabledPractices', 'snoozedPractices', 'customPractices', 'practiceCompletions', 'snoozedActionItems', 'practiceSchedules', 'ptoReports', 'githubOrgName'] as const
    const sanitized: Record<string, unknown> = {}
    for (const key of ALLOWED_KEYS) {
      if (key in raw) sanitized[key] = raw[key]
    }
    const result = saveSettings(sanitized as Parameters<typeof saveSettings>[0])

    if (repoPathChanging) {
      cancelPendingCommits()
      clearAllCaches()
    }

    return result
  })

  // ── GitHub data ──
  safeHandle('github:reports', () => getReports())
  safeHandle('github:profile', (_e, name) => getReportProfile(name as string))
  safeHandle('github:report-data', (_e, name) => getReportData(name as string))
  safeHandle('github:team-overview', () => getTeamOverview())
  safeHandle('github:file-content', (_e, path) => getFileContent(path as string))
  safeHandle('github:get-files-bulk', (_e, paths) => getFilesContentBulk(paths as string[]))
  safeHandle('github:commit-file', (_e, path, content, message) =>
    commitFile(path as string, content as string, message as string)
  )
  safeHandle('github:delete-file', (_e, path) => deleteFile(path as string))
  safeHandle('github:list-meetings', () => listMeetings())
  safeHandle('github:list-people', () => listPeople())
  safeHandle('github:person-meetings', (_e, slug) => getPersonMeetings(slug as string))
  safeHandle('github:find-person', (_e, name) => findPersonByName(name as string))
  safeHandle('github:impact-log', () => getImpactLog())
  safeHandle('github:settings-options', () => getSettingsOptions())
  safeHandle('github:save-meeting-title', (_e, filename, title) => saveMeetingTitle(filename as string, title as string))
  safeHandle('github:save-meeting-speakers', (_e, filename, speakers) => saveMeetingSpeakers(filename as string, speakers as string[]))
  safeHandle('github:toggle-action-item', (_e, sourceFile, lineNumber) => toggleActionItem(sourceFile as string, lineNumber as number))
  safeHandle('github:team-action-items', () => getTeamActionItems())
  safeHandle('github:today-bootstrap', () => getTodayBootstrap())
  safeHandle('github:search-content', (_e, query) => searchContent(query as string))
  safeHandle('github:clear-caches', () => clearAllCaches())
  safeHandle('github:prewarm-status', () => isPrewarmComplete())
  safeHandle('github:team-activity', () => getTeamActivity())

  // ── AI with streaming ──
  safeHandle('ai:generate', async (event, action, context, requestId) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window')

    const rid = (requestId as string) || randomUUID()
    const result = await aiGenerate(action as string, context as Record<string, unknown>, (chunk) => {
      safeSend(win, 'ai:chunk', { requestId: rid, chunk })
    }, rid, (toolName, args) => {
      safeSend(win, 'ai:tool-status', { requestId: rid, toolName, args })
    })

    if (result.modifiedFiles.length > 0) {
      commitAiModifiedFiles(result.modifiedFiles)
      safeSend(win, 'ai:files-changed', { requestId: rid, files: result.modifiedFiles })
    }

    return result.content
  })

  safeHandle('ai:cancel', (_e, requestId) => aiCancel(requestId as string | undefined))

  // ── Electron dialogs ──
  safeHandle('dialog:open', async (_e, options) => {
    const opts = options as { properties: string[]; title?: string }
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: opts.properties as Array<'openFile' | 'openDirectory' | 'multiSelections'>,
      title: opts.title
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── Test-only IPC handlers for E2E setup ──
  if (process.env['ELECTRON_USER_DATA']) {
    safeHandle('test:set-token', (_e, token) => setToken(token as string))
    safeHandle('test:save-settings', (_e, settings) => saveSettings(settings as Parameters<typeof saveSettings>[0]))
    safeHandle('test:clear-caches', () => clearAllCaches())
    safeHandle('test:pre-warm-caches', () => preWarmCaches())
  }
}
