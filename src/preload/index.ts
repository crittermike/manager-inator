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
  commitFile: (path: string, content: string, message: string) =>
    ipcRenderer.invoke('github:commit-file', path, content, message),
  listMeetings: () => ipcRenderer.invoke('github:list-meetings'),
  listPeople: () => ipcRenderer.invoke('github:list-people'),
  getPersonMeetings: (slug: string) => ipcRenderer.invoke('github:person-meetings', slug),
  findPersonByName: (name: string) => ipcRenderer.invoke('github:find-person', name),
  getImpactLog: () => ipcRenderer.invoke('github:impact-log'),
  getSettingsOptions: () => ipcRenderer.invoke('github:settings-options'),
  saveMeetingTitle: (filename: string, title: string) =>
    ipcRenderer.invoke('github:save-meeting-title', filename, title),
  toggleActionItem: (sourceFile: string, lineNumber: number) =>
    ipcRenderer.invoke('github:toggle-action-item', sourceFile, lineNumber),
  getTeamActionItems: () => ipcRenderer.invoke('github:team-action-items'),
  getTeamPriorities: () => ipcRenderer.invoke('github:team-priorities'),
  saveReportPriorities: (reportName: string, content: string) =>
    ipcRenderer.invoke('github:save-report-priorities', reportName, content),
  clearCaches: () => ipcRenderer.invoke('github:clear-caches'),
  backfillSummaries: (filenames: string[]) => ipcRenderer.invoke('ai:backfill-summaries', filenames),
  onBackfillProgress: (cb: (data: { filename: string; status: string }) => void) => {
    const handler = (_event: unknown, data: { filename: string; status: string }) => cb(data)
    ipcRenderer.on('ai:backfill-progress', handler)
    return () => ipcRenderer.removeListener('ai:backfill-progress', handler)
  },
  onPushStatus: (cb: (data: { success: boolean; error?: string }) => void) => {
    const handler = (_event: unknown, data: { success: boolean; error?: string }) => cb(data)
    ipcRenderer.on('github:push-status', handler)
    return () => ipcRenderer.removeListener('github:push-status', handler)
  },
  cancelBackfill: () => ipcRenderer.invoke('ai:cancel-backfill'),

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
