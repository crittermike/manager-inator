import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'path'
import { setupIpcHandlers } from './ipc'
import { preWarmCaches, flushPendingCommitsAsync } from './github'
import { stopClient } from './copilot'

// Support custom userDataDir for test isolation
if (process.env['ELECTRON_USER_DATA']) {
  app.setPath('userData', process.env['ELECTRON_USER_DATA'])
}

app.setName('Manager-inator')

let mainWindow: BrowserWindow | null = null

const ALLOWED_SCHEMES = ['https:', 'http:', 'mailto:']

function isSafeUrl(url: string): boolean {
  try {
    return ALLOWED_SCHEMES.includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function openExternalSafe(url: string): void {
  if (isSafeUrl(url)) shell.openExternal(url)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Manager-inator',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#09090b',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl && url.startsWith(rendererUrl)) return
    event.preventDefault()
    openExternalSafe(url)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('Failed to load:', code, desc)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log('[Renderer]', message)
    })
  }

  // Dev: load from vite server; Prod: load built files
  if (process.env['ELECTRON_RENDERER_URL']) {
    console.log('Loading dev URL:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (!process.env['ELECTRON_RENDERER_URL']) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
          ]
        }
      })
    })
  }

  setupIpcHandlers()
  createWindow()

  // Pre-warm caches after window is shown so first navigation is instant
  setTimeout(() => preWarmCaches((message) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:loading-progress', { message })
    }
  }), 500)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', (e) => {
  e.preventDefault()
  flushPendingCommitsAsync().finally(() => {
    stopClient()
    app.exit(0)
  })
})
