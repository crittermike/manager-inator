import { app, BrowserWindow, Menu, shell } from 'electron'
import { ensureWindowAndSend } from './windowState'

export function buildAppMenu(): void {
  const appName = app.name || 'Manager-inator'

  const template: Electron.MenuItemConstructorOptions[] = [
    // ── Application menu ──
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => ensureWindowAndSend('app:navigate', '/settings')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },

    // ── File menu ──
    {
      label: 'File',
      submenu: [
        {
          label: 'New Capture',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => ensureWindowAndSend('app:open-capture')
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },

    // ── Edit menu ──
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.webContents.send('find:toggle')
          }
        }
      ]
    },

    // ── View menu ──
    {
      label: 'View',
      submenu: [
        {
          label: 'Today',
          accelerator: 'CmdOrCtrl+1',
          click: () => ensureWindowAndSend('app:navigate', '/')
        },
        {
          label: 'Playbook',
          accelerator: 'CmdOrCtrl+2',
          click: () => ensureWindowAndSend('app:navigate', '/playbook')
        },
        {
          label: 'Chat',
          accelerator: 'CmdOrCtrl+3',
          click: () => ensureWindowAndSend('app:navigate', '/chat')
        },
        {
          label: 'Search',
          accelerator: 'CmdOrCtrl+4',
          click: () => ensureWindowAndSend('app:navigate', '/search')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // ── Window menu ──
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },

    // ── Help menu ──
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => ensureWindowAndSend('app:navigate', '?shortcuts')
        },
        { type: 'separator' },
        {
          label: 'GitHub Repository',
          click: () => shell.openExternal('https://github.com/manager-inator/manager-inator')
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
