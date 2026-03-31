import { app, Tray, BrowserWindow, Menu, nativeImage, screen, ipcMain } from 'electron'
import { join } from 'path'
import { getMainWindow, ensureWindowAndSend } from './windowState'

let tray: Tray | null = null
let captureWindow: BrowserWindow | null = null

export function createTray(): void {
  const iconPath = join(__dirname, '../../resources/trayTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)

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
      accelerator: 'CmdOrCtrl+Shift+N',
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
  if (!tray) return

  if (!captureWindow || captureWindow.isDestroyed()) {
    captureWindow = createCaptureWindow()
  }

  const trayBounds = tray.getBounds()
  const windowBounds = captureWindow.getBounds()
  const display = screen.getDisplayMatching(trayBounds)
  const { workArea } = display

  const trayCenterX = trayBounds.x + trayBounds.width / 2
  let x = Math.round(trayCenterX - windowBounds.width / 2)
  const y = trayBounds.y + trayBounds.height + 4

  const maxX = workArea.x + workArea.width - windowBounds.width
  x = Math.max(workArea.x, Math.min(x, maxX))

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
