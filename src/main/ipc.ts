import { ipcMain, BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'crypto'
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
  toggleActionItem,
  getTeamActionItems,
  getTeamPriorities,
  saveReportPriorities,
  clearAllCaches,
  safeSend
} from './github'
import { getSettingsForRenderer, saveSettings } from './store'
import { aiGenerate, aiCancel } from './copilot'

let _backfillAborted = false
let _activeBackfillRequestId: string | null = null

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
    const ALLOWED_KEYS = ['repoPath', 'repoOwner', 'repoName', 'defaultModel', 'checkInFrequency', 'feedbackReminderDays', 'aiCustomInstructions'] as const
    const sanitized: Record<string, unknown> = {}
    for (const key of ALLOWED_KEYS) {
      if (key in raw) sanitized[key] = raw[key]
    }
    return saveSettings(sanitized as Parameters<typeof saveSettings>[0])
  })

  // ── GitHub data ──
  safeHandle('github:reports', () => getReports())
  safeHandle('github:profile', (_e, name) => getReportProfile(name as string))
  safeHandle('github:report-data', (_e, name) => getReportData(name as string))
  safeHandle('github:team-overview', () => getTeamOverview())
  safeHandle('github:file-content', (_e, path) => getFileContent(path as string))
  safeHandle('github:commit-file', (_e, path, content, message) =>
    commitFile(path as string, content as string, message as string)
  )
  safeHandle('github:list-meetings', () => listMeetings())
  safeHandle('github:list-people', () => listPeople())
  safeHandle('github:person-meetings', (_e, slug) => getPersonMeetings(slug as string))
  safeHandle('github:find-person', (_e, name) => findPersonByName(name as string))
  safeHandle('github:impact-log', () => getImpactLog())
  safeHandle('github:settings-options', () => getSettingsOptions())
  safeHandle('github:save-meeting-title', (_e, filename, title) => saveMeetingTitle(filename as string, title as string))
  safeHandle('github:toggle-action-item', (_e, sourceFile, lineNumber) => toggleActionItem(sourceFile as string, lineNumber as number))
  safeHandle('github:team-action-items', () => getTeamActionItems())
  safeHandle('github:team-priorities', () => getTeamPriorities())
  safeHandle('github:save-report-priorities', (_e, reportName, content) => saveReportPriorities(reportName as string, content as string))
  safeHandle('github:clear-caches', () => clearAllCaches())

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

    return result
  })

  safeHandle('ai:cancel', (_e, requestId) => aiCancel(requestId as string | undefined))

  safeHandle('ai:cancel-backfill', async () => {
    _backfillAborted = true
    if (_activeBackfillRequestId) {
      await aiCancel(_activeBackfillRequestId)
    }
  })

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

  // ── Backfill meeting summaries ──
  safeHandle('ai:backfill-summaries', async (event, meetingFilenames) => {
    const filenames = meetingFilenames as string[]
    const win = BrowserWindow.fromWebContents(event.sender)
    const results: { filename: string; success: boolean; error?: string }[] = []
    _backfillAborted = false

    for (const filename of filenames) {
      if (_backfillAborted) break
      try {
        const transcript = getFileContent(`meetings/${filename}`)

        const name = filename.replace('.md', '')
        const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})-?(.*)/)
        const date = dateMatch?.[1] || name
        const title = dateMatch?.[2]?.replace(/-/g, ' ') || name

        const reportNames = getReports()
        const profiles = reportNames.map((n) => {
          try {
            const p = getReportProfile(n)
            return p.displayName
          } catch { return n }
        })

        safeSend(win, 'ai:backfill-progress', { filename, status: 'generating' })

        const backfillRequestId = randomUUID()
        _activeBackfillRequestId = backfillRequestId
        const summary = await aiGenerate('summarize-meeting', {
          meetingTitle: title,
          date,
          reportNames: profiles.join(', '),
          transcript
        }, () => {}, backfillRequestId)
        _activeBackfillRequestId = null

        if (_backfillAborted) {
          results.push({ filename, success: false, error: 'Cancelled' })
          safeSend(win, 'ai:backfill-progress', { filename, status: 'cancelled' })
          break
        }

        await commitFile(
          `meetings/${filename}`,
          summary,
          `Add meeting summary with speakers: ${title} on ${date}`
        )

        results.push({ filename, success: true })
        safeSend(win, 'ai:backfill-progress', { filename, status: 'done' })
      } catch (err) {
        _activeBackfillRequestId = null
        if (_backfillAborted) {
          results.push({ filename, success: false, error: 'Cancelled' })
          safeSend(win, 'ai:backfill-progress', { filename, status: 'cancelled' })
          break
        }
        console.error(`[Backfill] Failed for ${filename}:`, (err as Error).message)
        results.push({ filename, success: false, error: (err as Error).message })
        safeSend(win, 'ai:backfill-progress', { filename, status: 'error', error: (err as Error).message })
      }
    }

    return results
  })
}
