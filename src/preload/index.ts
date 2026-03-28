import { contextBridge, ipcRenderer } from 'electron'

// Expose safe IPC methods to the renderer
contextBridge.exposeInMainWorld('api', {
  // Auth
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  startAuth: () => ipcRenderer.invoke('auth:start'),
  pollAuth: () => ipcRenderer.invoke('auth:poll'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:save', settings),

  // GitHub data
  getReports: () => ipcRenderer.invoke('github:reports'),
  getReportProfile: (name: string) => ipcRenderer.invoke('github:profile', name),
  getReportData: (name: string) => ipcRenderer.invoke('github:report-data', name),
  getTeamOverview: () => ipcRenderer.invoke('github:team-overview'),
  getFileContent: (path: string) => ipcRenderer.invoke('github:file-content', path),
  getFilesContentBulk: (paths: string[]) => ipcRenderer.invoke('github:get-files-bulk', paths),
  commitFile: (path: string, content: string, message: string) =>
    ipcRenderer.invoke('github:commit-file', path, content, message),
  deleteFile: (path: string) => ipcRenderer.invoke('github:delete-file', path),
  listMeetings: () => ipcRenderer.invoke('github:list-meetings'),
  listPeople: () => ipcRenderer.invoke('github:list-people'),
  searchContent: (query: string) => ipcRenderer.invoke('github:search-content', query),
  getPersonMeetings: (slug: string) => ipcRenderer.invoke('github:person-meetings', slug),
  findPersonByName: (name: string) => ipcRenderer.invoke('github:find-person', name),
  getImpactLog: () => ipcRenderer.invoke('github:impact-log'),
  getSettingsOptions: () => ipcRenderer.invoke('github:settings-options'),
  saveMeetingTitle: (filename: string, title: string) =>
    ipcRenderer.invoke('github:save-meeting-title', filename, title),
  saveMeetingSpeakers: (filename: string, speakers: string[]) =>
    ipcRenderer.invoke('github:save-meeting-speakers', filename, speakers),
  toggleActionItem: (sourceFile: string, lineNumber: number) =>
    ipcRenderer.invoke('github:toggle-action-item', sourceFile, lineNumber),
  resolveAndToggleActionItem: (reportName: string, prepText: string) =>
    ipcRenderer.invoke('github:resolve-toggle-action-item', reportName, prepText),
  getOpenActionItemsForPeople: (slugs: string[]) =>
    ipcRenderer.invoke('github:open-action-items-for-people', slugs),
  getTeamActionItems: () => ipcRenderer.invoke('github:team-action-items'),
  getTodayBootstrap: () => ipcRenderer.invoke('github:today-bootstrap'),
  clearCaches: () => ipcRenderer.invoke('github:clear-caches'),
  getPrewarmStatus: () => ipcRenderer.invoke('github:prewarm-status'),
  getTeamActivity: () => ipcRenderer.invoke('github:team-activity'),
  getRecentTeamContext: (days: number) => ipcRenderer.invoke('github:recent-team-context', days),
  getMonthlyActivity: (reportName: string, year: number, month: number) =>
    ipcRenderer.invoke('github:monthly-activity', reportName, year, month),
  updateFeedbackEntry: (reportName: string, entryIndex: number, newContent: string, newType: string) =>
    ipcRenderer.invoke('github:update-feedback', reportName, entryIndex, newContent, newType),
  deleteFeedbackEntry: (reportName: string, entryIndex: number) =>
    ipcRenderer.invoke('github:delete-feedback', reportName, entryIndex),
  onLoadingProgress: (cb: (data: { message: string }) => void) => {
    const handler = (_event: unknown, data: { message: string }) => cb(data)
    ipcRenderer.on('app:loading-progress', handler)
    return () => ipcRenderer.removeListener('app:loading-progress', handler)
  },
  onPushStatus: (cb: (data: { success: boolean; error?: string }) => void) => {
    const handler = (_event: unknown, data: { success: boolean; error?: string }) => cb(data)
    ipcRenderer.on('github:push-status', handler)
    return () => ipcRenderer.removeListener('github:push-status', handler)
  },
  onAiToolStatus: (cb: (data: { requestId: string; toolName: string; args: Record<string, unknown> }) => void) => {
    const handler = (_event: unknown, data: { requestId: string; toolName: string; args: Record<string, unknown> }) => cb(data)
    ipcRenderer.on('ai:tool-status', handler)
    return () => ipcRenderer.removeListener('ai:tool-status', handler)
  },
  onAiStreamReset: (cb: (data: { requestId: string }) => void) => {
    const handler = (_event: unknown, data: { requestId: string }) => cb(data)
    ipcRenderer.on('ai:stream-reset', handler)
    return () => ipcRenderer.removeListener('ai:stream-reset', handler)
  },
  onAiFilesChanged: (cb: (data: { requestId: string; files: string[] }) => void) => {
    const handler = (_event: unknown, data: { requestId: string; files: string[] }) => cb(data)
    ipcRenderer.on('ai:files-changed', handler)
    return () => ipcRenderer.removeListener('ai:files-changed', handler)
  },

  // AI
  aiGenerate: async (
    action: string,
    context: Record<string, unknown>,
    onChunk: (chunk: string) => void,
    requestId: string
  ): Promise<string> => {
    const handler = (_event: unknown, data: { requestId: string; chunk: string }) => {
      if (data.requestId === requestId) onChunk(data.chunk)
    }
    ipcRenderer.on('ai:chunk', handler)

    try {
      const result = await ipcRenderer.invoke('ai:generate', action, context, requestId)
      return result
    } finally {
      ipcRenderer.removeListener('ai:chunk', handler)
    }
  },
  aiCancel: (requestId?: string) => ipcRenderer.invoke('ai:cancel', requestId),

  showOpenDialog: (options: { properties: string[]; title?: string }) =>
    ipcRenderer.invoke('dialog:open', options)
})
