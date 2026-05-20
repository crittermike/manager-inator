import { app, BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getIsQuitting(): boolean {
  return isQuitting
}

export function setIsQuitting(value: boolean): void {
  isQuitting = value
}

/**
 * Ensure a window exists and is fully loaded, then send an IPC message.
 * - If no window exists, emits 'activate' to create one and waits for it.
 * - If the window's webContents is still loading, waits for 'did-finish-load'.
 */
export function ensureWindowAndSend(channel: string, data?: unknown): void {
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0]

  if (win && !win.isDestroyed()) {
    sendWhenReady(win, channel, data)
    return
  }

  // No window — listen for the next one to be created, then send
  const onCreated = (_e: Electron.Event, newWin: BrowserWindow): void => {
    clearTimeout(cleanupTimer)
    app.removeListener('browser-window-created', onCreated)
    sendWhenReady(newWin, channel, data)
  }
  app.on('browser-window-created', onCreated)

  // Safety: remove listener if window creation never happens (e.g. app is quitting)
  const cleanupTimer = setTimeout(() => {
    app.removeListener('browser-window-created', onCreated)
  }, 10_000)

  app.emit('activate')
}

function sendWhenReady(win: BrowserWindow, channel: string, data?: unknown): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.send(channel, data)
    })
  } else {
    win.webContents.send(channel, data)
  }
}
