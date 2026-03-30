import { vi } from 'vitest'

vi.mock('electron-store', () => {
  const mockStore = new Map<string, unknown>()
  return {
    default: class MockElectronStore {
      private defaults: Record<string, unknown>
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        this.defaults = opts?.defaults || {}
      }
      get(key: string) {
        return mockStore.has(key) ? mockStore.get(key) : this.defaults[key]
      }
      set(key: string, value: unknown) {
        mockStore.set(key, value)
      }
      clear() {
        mockStore.clear()
      }
    }
  }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: () => null,
    getFocusedWindow: () => null
  },
  shell: {
    openExternal: vi.fn(() => Promise.resolve())
  },
  ipcMain: {
    handle: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn()
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString())
  }
}))
