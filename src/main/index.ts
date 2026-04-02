import { app, BrowserWindow, Menu, session, shell } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { setupIpcHandlers } from './ipc'
import { preWarmCaches, flushPendingCommitsAsync } from './github'
import { stopClient } from './copilot'
import { buildAppMenu } from './menu'
import { getResourcePath } from './resourcePaths'
import { createTray, destroyTray } from './tray'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts'
import { getMainWindow, setMainWindow, getIsQuitting, setIsQuitting, ensureWindowAndSend } from './windowState'

// Support custom userDataDir for test isolation
if (process.env['ELECTRON_USER_DATA']) {
  app.setPath('userData', process.env['ELECTRON_USER_DATA'])
}

app.setName('Manager-inator')

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

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:update-ready', info.version)
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message)
  })

  // Check for updates 5s after launch, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Manager-inator',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#09090b',
    icon: getResourcePath('icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  setMainWindow(win)

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl && url.startsWith(rendererUrl)) return
    event.preventDefault()
    openExternalSafe(url)
  })

  win.on('close', (e) => {
    if (!getIsQuitting() && process.platform === 'darwin') {
      e.preventDefault()
      win.hide()
      return
    }
    setMainWindow(null)
  })

  // Log renderer errors
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('Failed to load:', code, desc)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.webContents.on('console-message', (_e, _level, message) => {
      console.log('[Renderer]', message)
    })
  }

  // Dev: load from vite server; Prod: load built files
  if (process.env['ELECTRON_RENDERER_URL']) {
    console.log('Loading dev URL:', process.env['ELECTRON_RENDERER_URL'])
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('before-quit', () => {
  setIsQuitting(true)
})

app.whenReady().then(() => {
  if (!process.env['ELECTRON_RENDERER_URL']) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://github.com https://avatars.githubusercontent.com; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
          ]
        }
      })
    })
  }

  setupIpcHandlers()

  app.setAboutPanelOptions({
    applicationName: 'Manager-inator',
    applicationVersion: app.getVersion(),
    copyright: 'Manager-inator',
    iconPath: getResourcePath('icon.png')
  })

  buildAppMenu()
  createWindow()
  createTray()
  registerGlobalShortcuts()
  setupAutoUpdater()

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([
      {
        label: 'New Capture',
        click: () => ensureWindowAndSend('app:open-capture')
      }
    ]))
  }

  // Pre-warm caches after window is shown so first navigation is instant
  setTimeout(() => preWarmCaches((message) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:loading-progress', { message })
    }
  }), 500)

  app.on('activate', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.show()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const QUIT_TIMEOUT_MS = 5000

app.on('will-quit', (e) => {
  e.preventDefault()
  unregisterGlobalShortcuts()
  destroyTray()

  const forceQuit = setTimeout(() => {
    stopClient()
    app.exit(0)
  }, QUIT_TIMEOUT_MS)

  flushPendingCommitsAsync().finally(() => {
    clearTimeout(forceQuit)
    stopClient()
    app.exit(0)
  })
})
