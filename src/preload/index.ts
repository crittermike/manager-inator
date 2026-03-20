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

  // AI
  aiGenerate: async (
    action: string,
    context: Record<string, unknown>,
    onChunk: (chunk: string) => void
  ) => {
    // Listen for streaming chunks
    const handler = (_event: unknown, chunk: string) => onChunk(chunk)
    ipcRenderer.on('ai:chunk', handler)

    try {
      const result = await ipcRenderer.invoke('ai:generate', action, context)
      return result
    } finally {
      ipcRenderer.removeListener('ai:chunk', handler)
    }
  },
  aiCancel: () => ipcRenderer.invoke('ai:cancel')
})
