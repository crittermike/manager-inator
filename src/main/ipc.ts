import { ipcMain, BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { getAuthStatus, startAuth, pollAuth, logout } from './auth'
import {
  getReports,
  getReportProfile,
  initializeRepo,
  createReport,
  isGitRepo,
  getReportData,
  getTeamOverview,
  getFileContent,
  getFilesContentBulk,
  commitFile,
  commitAiModifiedFiles,
  deleteFile,
  listContexts,
  listPeople,
  getPersonMeetings,
  findPersonByName,
  getImpactLog,
  listWeeklyLog,
  getSettingsOptions,
  saveMeetingTitle,
  saveMeetingSpeakers,
  addPersonToContext,
  toggleActionItem,
  resolveAndToggleActionItem,
  getOpenActionItemsForPeople,
  getTeamActionItems,
  getTodayBootstrap,
  searchContent,
  clearAllCaches,
  cancelPendingCommits,
  preWarmCaches,
  isPrewarmComplete,
  getPrewarmProgress,
  safeSend,
  getRecentTeamContext,
  updateFeedbackEntry,
  deleteFeedbackEntry
} from './github'
import { getSettings, getSettingsForRenderer, saveSettings, setGithubOrgToken, setToken, getGithubOrgToken, getGithubOrgName } from './store'
import { aiGenerate, aiCancel } from './copilot'
import { getTeamActivity, getMonthlyActivityForPerson, fetchActivityForPerson, saveActivitySnapshot } from './github-activity'

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

    const ALLOWED_KEYS = ['repoPath', 'repoOwner', 'repoName', 'defaultModel', 'checkInFrequency', 'feedbackReminderDays', 'sprintLengthWeeks', 'endOfWeekDay', 'snippetDay', 'sprintStartDate', 'staleActionDays', 'aiCustomInstructions', 'disabledPractices', 'snoozedPractices', 'customPractices', 'practiceCompletions', 'snoozedActionItems', 'practiceSchedules', 'ptoReports', 'githubOrgName', 'userName', 'userGithub'] as const
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
  safeHandle('github:initialize-repo', (_e, repoDir) => initializeRepo(repoDir as string))
  safeHandle('github:is-git-repo', (_e, path) => isGitRepo(path as string))
  safeHandle('github:create-report', (_e, displayName, fields) => createReport(displayName as string, fields as Record<string, string> | undefined))
  safeHandle('github:profile', (_e, name) => getReportProfile(name as string))
  safeHandle('github:report-data', (_e, name) => getReportData(name as string))
  safeHandle('github:team-overview', () => getTeamOverview())
  safeHandle('github:file-content', (_e, path) => getFileContent(path as string))
  safeHandle('github:get-files-bulk', (_e, paths) => getFilesContentBulk(paths as string[]))
  safeHandle('github:commit-file', (_e, path, content, message) =>
    commitFile(path as string, content as string, message as string)
  )
  safeHandle('github:delete-file', (_e, path) => deleteFile(path as string))
  safeHandle('github:list-contexts', () => listContexts())
  safeHandle('github:list-people', () => listPeople())
  safeHandle('github:person-meetings', (_e, slug) => getPersonMeetings(slug as string))
  safeHandle('github:find-person', (_e, name) => findPersonByName(name as string))
  safeHandle('github:impact-log', () => getImpactLog())
  safeHandle('github:weekly-log', () => listWeeklyLog())
  safeHandle('github:settings-options', () => getSettingsOptions())
  safeHandle('github:save-meeting-title', (_e, filename, title) => saveMeetingTitle(filename as string, title as string))
  safeHandle('github:save-meeting-speakers', (_e, filename, speakers) => saveMeetingSpeakers(filename as string, speakers as string[]))
  safeHandle('github:add-person-to-context', (_e, filename, slug) => addPersonToContext(filename as string, slug as string))
  safeHandle('github:toggle-action-item', (_e, sourceFile, lineNumber) => toggleActionItem(sourceFile as string, lineNumber as number))
  safeHandle('github:resolve-toggle-action-item', (_e, reportName, prepText) => resolveAndToggleActionItem(reportName as string, prepText as string))
  safeHandle('github:open-action-items-for-people', (_e, slugs) => getOpenActionItemsForPeople(slugs as string[]))
  safeHandle('github:team-action-items', () => getTeamActionItems())
  safeHandle('github:today-bootstrap', () => getTodayBootstrap())
  safeHandle('github:search-content', (_e, query) => searchContent(query as string))
  safeHandle('github:clear-caches', () => clearAllCaches())
  safeHandle('github:prewarm-status', () => isPrewarmComplete())
  safeHandle('github:prewarm-progress', () => getPrewarmProgress())
  safeHandle('app:install-update', () => {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.quitAndInstall(false, true)
  })
  safeHandle('app:start-prewarm', async () => {
    await preWarmCaches((message) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('app:loading-progress', { message })
      }
    })
  })
  safeHandle('github:team-activity', () => getTeamActivity())
  safeHandle('github:recent-team-context', (_e, days) => getRecentTeamContext(days as number))
  safeHandle('github:monthly-activity', (_e, reportName, year, month) =>
    getMonthlyActivityForPerson(reportName as string, year as number, month as number)
  )
  safeHandle('github:fetch-person-activity', (_e, reportName, startDate, endDate) =>
    fetchActivityForPerson(reportName as string, startDate as string, endDate as string)
  )
  safeHandle('github:save-activity-snapshot', (_e, reportName, startDate, endDate) =>
    saveActivitySnapshot(reportName as string, startDate as string, endDate as string)
  )
  safeHandle('github:update-feedback', (_e, reportName, entryIndex, newContent, newType) =>
    updateFeedbackEntry(reportName as string, entryIndex as number, newContent as string, newType as 'positive' | 'constructive' | 'mixed' | 'observation')
  )
  safeHandle('github:delete-feedback', (_e, reportName, entryIndex) =>
    deleteFeedbackEntry(reportName as string, entryIndex as number)
  )

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

  // ── Debug: test org token against GitHub API ──
  safeHandle('debug:test-org-token', async () => {
    const token = getGithubOrgToken()
    const orgName = getGithubOrgName()

    if (!token) return { ok: false, error: 'No org token stored', tokenLength: 0, orgName }
    if (!orgName) return { ok: false, error: 'No org name stored', tokenLength: token.length, orgName: '' }

    const tokenPrefix = token.slice(0, 8) + '...'
    const tokenLength = token.length

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })

      const body = await response.json()
      const rateRemaining = response.headers.get('X-RateLimit-Remaining')
      const ssoHeader = response.headers.get('X-GitHub-SSO')
      const scopes = response.headers.get('X-OAuth-Scopes')

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        tokenPrefix,
        tokenLength,
        orgName,
        scopes,
        rateRemaining,
        ssoHeader,
        user: response.ok ? body.login : null,
        error: !response.ok ? (body.message || JSON.stringify(body)) : null
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        tokenPrefix,
        tokenLength,
        orgName
      }
    }
  })

  // ── Test-only IPC handlers for E2E setup ──
  if (process.env['ELECTRON_USER_DATA']) {
    safeHandle('test:set-token', (_e, token) => setToken(token as string))
    safeHandle('test:save-settings', (_e, settings) => saveSettings(settings as Parameters<typeof saveSettings>[0]))
    safeHandle('test:clear-caches', () => clearAllCaches())
    safeHandle('test:pre-warm-caches', () => preWarmCaches())
  }
}
