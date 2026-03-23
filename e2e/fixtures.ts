import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { ipcMainInvokeHandler, ipcRendererInvoke } from 'electron-playwright-helpers'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * Electron test fixtures with isolated userDataDir per worker
 * Based on production patterns from slayzone and electron-playwright-helpers
 */

export interface ElectronFixtures {
  /** ElectronApplication instance with isolated userDataDir */
  electronApp: ElectronApplication
  /** Main window page */
  page: Page
  /** Path to isolated userDataDir for this test worker */
  userDataDir: string
  /** Helper to pre-seed electron-store data before launch */
  preSeedStore: (data: Record<string, unknown>) => void
  /** Helper to invoke IPC handlers from tests */
  invokeIPC: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
}

export const test = base.extend<ElectronFixtures>({
  // Worker-scoped userDataDir - created once per worker, cleaned up after all tests
  userDataDir: [async ({ }, use, workerInfo) => {
    const tmpDir = join(
      tmpdir(),
      `manager-inator-e2e-${workerInfo.workerIndex}-${process.pid}-${Date.now()}`
    )
    
    // Create the temp directory
    mkdirSync(tmpDir, { recursive: true })
    console.log(`[Fixture] Created userDataDir: ${tmpDir}`)
    
    await use(tmpDir)
    
    // Cleanup after all tests in this worker complete
    try {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true })
        console.log(`[Fixture] Cleaned up userDataDir: ${tmpDir}`)
      }
    } catch (err) {
      console.warn(`[Fixture] Failed to clean up ${tmpDir}:`, err)
    }
  }, { scope: 'worker' }],

  // Pre-seed helper - must be called BEFORE electronApp is created
  preSeedStore: async ({ userDataDir }, use) => {
    const seedFn = (data: Record<string, unknown>) => {
      // electron-store path: <userDataDir>/config.json
      const storePath = join(userDataDir, 'config.json')
      const storeDir = join(userDataDir)
      
      mkdirSync(storeDir, { recursive: true })
      writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8')
      console.log(`[Fixture] Pre-seeded store at ${storePath}`)
    }
    
    await use(seedFn)
  },

  // Worker-scoped Electron app - launched once per worker, reused across tests
  electronApp: [async ({ userDataDir }, use, workerInfo) => {
    console.log(`[Fixture] Launching Electron app for worker ${workerInfo.workerIndex}`)
    
    const app = await electron.launch({
      args: [
        resolve(__dirname, '../out/main/index.mjs')
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Pass userDataDir to Electron app
        ELECTRON_USER_DATA: userDataDir
      },
      timeout: 30_000,
      // Use custom userDataDir for test isolation
      executablePath: undefined, // Use default Electron binary
      // recordVideo option if needed for debugging
      // recordVideo: { dir: join(userDataDir, 'videos') }
    })
    
    // Wait for app to be ready
    await app.firstWindow()
    console.log(`[Fixture] Electron app ready for worker ${workerInfo.workerIndex}`)
    
    await use(app)
    
    // Cleanup
    console.log(`[Fixture] Closing Electron app for worker ${workerInfo.workerIndex}`)
    await Promise.race([
      app.close(),
      new Promise(resolve => setTimeout(resolve, 5000))
    ])
  }, { scope: 'worker' }],

  // Test-scoped page - gets the main window for each test
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    // Wait for React to fully render
    await page.waitForLoadState('load')
    await use(page)
  },

  // Helper to invoke IPC handlers from tests
  invokeIPC: async ({ electronApp }, use) => {
    const invoke = async <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
      return ipcMainInvokeHandler(electronApp, channel, ...args) as Promise<T>
    }
    await use(invoke)
  }
})

export { expect } from '@playwright/test'
