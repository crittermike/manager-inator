import { app, globalShortcut, BrowserWindow } from 'electron'
import { getMainWindow } from './windowState'

export function registerGlobalShortcuts(): void {
  const registered = globalShortcut.register('CommandOrControl+Shift+M', () => {
    const win = getMainWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) {
      app.emit('activate')
      return
    }

    if (win.isVisible() && win.isFocused() && !win.isMinimized()) {
      win.hide()
    } else {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  if (!registered) {
    console.warn('[Shortcuts] Failed to register Cmd+Shift+M — another app may be using it')
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}
