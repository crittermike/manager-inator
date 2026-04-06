import { app, Tray, BrowserWindow, Menu, nativeImage, screen, ipcMain } from 'electron'
import { join } from 'path'
import { getMainWindow, ensureWindowAndSend } from './windowState'
import { getResourcePathCandidates } from './resourcePaths'

let tray: Tray | null = null
let captureWindow: BrowserWindow | null = null

function loadTrayIcon() {
  for (const iconPath of getResourcePathCandidates('trayTemplate.png')) {
    const raw = nativeImage.createFromPath(iconPath)
    if (raw.isEmpty()) continue

    const icon = raw.resize({ width: 16, height: 16 })
    icon.setTemplateImage(true)
    return icon
  }

  return null
}

export function createTray(): void {
  const icon = loadTrayIcon()
  if (!icon) {
    console.error('Failed to load tray icon from any known resource path', getResourcePathCandidates('trayTemplate.png'))
    return
  }

  tray = new Tray(icon)
  tray.setToolTip('Manager-inator')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Manager-inator',
      click: () => {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        } else {
          app.emit('activate')
        }
      }
    },
    {
      label: 'Quick Capture',
      accelerator: 'CmdOrCtrl+Shift+C',
      click: () => toggleCaptureWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit Manager-inator',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    toggleCaptureWindow()
  })

  ipcMain.handle('tray-capture:submit', (_e, content: string) => {
    hideCaptureWindow()
    ensureWindowAndSend('app:tray-capture', content)
  })

  ipcMain.handle('tray-capture:close', () => {
    hideCaptureWindow()
  })
}

function createCaptureWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 280,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    movable: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    void win.loadURL(`${devUrl}/capture.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/capture.html'))
  }

  win.on('blur', () => {
    if (!tray) {
      hideCaptureWindow()
      return
    }

    const trayBounds = tray.getBounds()
    const cursorPos = screen.getCursorScreenPoint()
    const isCursorOnTray =
      cursorPos.x >= trayBounds.x &&
      cursorPos.x <= trayBounds.x + trayBounds.width &&
      cursorPos.y >= trayBounds.y &&
      cursorPos.y <= trayBounds.y + trayBounds.height

    if (!isCursorOnTray) {
      hideCaptureWindow()
    }
  })

  return win
}

function toggleCaptureWindow(): void {
  if (captureWindow && !captureWindow.isDestroyed() && captureWindow.isVisible()) {
    hideCaptureWindow()
    return
  }
  showCaptureWindow()
}

function showCaptureWindow(): void {
  if (!captureWindow || captureWindow.isDestroyed()) {
    captureWindow = createCaptureWindow()
  }

  // Center on the active display
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { workArea } = display
  const windowBounds = captureWindow.getBounds()
  const x = Math.round(workArea.x + (workArea.width - windowBounds.width) / 2)
  const y = Math.round(workArea.y + (workArea.height - windowBounds.height) / 3)

  captureWindow.setPosition(x, y, false)
  captureWindow.show()
  captureWindow.focus()
}

function hideCaptureWindow(): void {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.hide()
    captureWindow.webContents.send('tray-capture:reset')
  }
}

export function destroyTray(): void {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.destroy()
    captureWindow = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
}
