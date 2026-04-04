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
  initializeRepo: (repoDir: string) => ipcRenderer.invoke('github:initialize-repo', repoDir),
  isGitRepo: (path: string) => ipcRenderer.invoke('github:is-git-repo', path),
  createReport: (displayName: string, fields?: Record<string, string>) => ipcRenderer.invoke('github:create-report', displayName, fields),
  getReportProfile: (name: string) => ipcRenderer.invoke('github:profile', name),
  getReportData: (name: string) => ipcRenderer.invoke('github:report-data', name),
  getTeamOverview: () => ipcRenderer.invoke('github:team-overview'),
  getFileContent: (path: string) => ipcRenderer.invoke('github:file-content', path),
  getFileBase64: (path: string) => ipcRenderer.invoke('github:file-base64', path),
  getFilesContentBulk: (paths: string[]) => ipcRenderer.invoke('github:get-files-bulk', paths),
  commitFile: (path: string, content: string, message: string) =>
    ipcRenderer.invoke('github:commit-file', path, content, message),
  commitBinaryFile: (path: string, base64Data: string, message: string) =>
    ipcRenderer.invoke('github:commit-binary', path, base64Data, message),
  validateGithubToken: (token: string) => ipcRenderer.invoke('github:validate-token', token),
  deleteFile: (path: string) => ipcRenderer.invoke('github:delete-file', path),
  listContexts: () => ipcRenderer.invoke('github:list-contexts'),
  listPeople: () => ipcRenderer.invoke('github:list-people'),
  searchContent: (query: string) => ipcRenderer.invoke('github:search-content', query),
  getPersonContexts: (slug: string) => ipcRenderer.invoke('github:person-meetings', slug),
  findPersonByName: (name: string) => ipcRenderer.invoke('github:find-person', name),
  getImpactLog: () => ipcRenderer.invoke('github:impact-log'),
  listWeeklyLog: () => ipcRenderer.invoke('github:weekly-log'),
  getSettingsOptions: () => ipcRenderer.invoke('github:settings-options'),
  saveMeetingTitle: (filename: string, title: string) =>
    ipcRenderer.invoke('github:save-meeting-title', filename, title),
  saveMeetingSpeakers: (filename: string, speakers: string[]) =>
    ipcRenderer.invoke('github:save-meeting-speakers', filename, speakers),
  addPersonToContext: (contextFilename: string, personSlug: string) =>
    ipcRenderer.invoke('github:add-person-to-context', contextFilename, personSlug),
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
  getPrewarmProgress: () => ipcRenderer.invoke('github:prewarm-progress'),
  getTeamActivity: () => ipcRenderer.invoke('github:team-activity'),
  getRecentTeamContext: (days: number) => ipcRenderer.invoke('github:recent-team-context', days),
  getMonthlyActivity: (reportName: string, year: number, month: number) =>
    ipcRenderer.invoke('github:monthly-activity', reportName, year, month),
  fetchActivityForPerson: (reportName: string, startDate: string, endDate: string) =>
    ipcRenderer.invoke('github:fetch-person-activity', reportName, startDate, endDate),
  saveActivitySnapshot: (reportName: string, startDate: string, endDate: string) =>
    ipcRenderer.invoke('github:save-activity-snapshot', reportName, startDate, endDate),
  updateFeedbackEntry: (reportName: string, entryIndex: number, newContent: string, newType: string) =>
    ipcRenderer.invoke('github:update-feedback', reportName, entryIndex, newContent, newType),
  deleteFeedbackEntry: (reportName: string, entryIndex: number) =>
    ipcRenderer.invoke('github:delete-feedback', reportName, entryIndex),
  onLoadingProgress: (cb: (data: { message: string }) => void) => {
    const handler = (_event: unknown, data: { message: string }) => cb(data)
    ipcRenderer.on('app:loading-progress', handler)
    return () => ipcRenderer.removeListener('app:loading-progress', handler)
  },
  onUpdateReady: (cb: (version: string) => void) => {
    const handler = (_event: unknown, version: string) => cb(version)
    ipcRenderer.on('app:update-ready', handler)
    return () => ipcRenderer.removeListener('app:update-ready', handler)
  },
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  startPrewarm: () => ipcRenderer.invoke('app:start-prewarm'),
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
  onDataFilesChanged: (cb: (data: { paths: string[] }) => void) => {
    const handler = (_event: unknown, data: { paths: string[] }) => cb(data)
    ipcRenderer.on('data:files-changed', handler)
    return () => ipcRenderer.removeListener('data:files-changed', handler)
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
    ipcRenderer.invoke('dialog:open', options),

  debugTestOrgToken: () => ipcRenderer.invoke('debug:test-org-token'),

  onNavigate: (cb: (route: string) => void) => {
    const handler = (_event: unknown, route: string) => cb(route)
    ipcRenderer.on('app:navigate', handler)
    return () => ipcRenderer.removeListener('app:navigate', handler)
  },
  onOpenCapture: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('app:open-capture', handler)
    return () => ipcRenderer.removeListener('app:open-capture', handler)
  },
  onTrayCapture: (cb: (content: string) => void) => {
    const handler = (_event: unknown, content: string) => cb(content)
    ipcRenderer.on('app:tray-capture', handler)
    return () => ipcRenderer.removeListener('app:tray-capture', handler)
  },
  trayCaptureSubmit: (content: string) => ipcRenderer.invoke('tray-capture:submit', content),
  trayCaptureClose: () => ipcRenderer.invoke('tray-capture:close'),
  onTrayCaptureReset: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('tray-capture:reset', handler)
    return () => ipcRenderer.removeListener('tray-capture:reset', handler)
  }
})
