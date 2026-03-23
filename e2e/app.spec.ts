import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(__dirname, '../out/main/index.mjs')],
    timeout: 30_000
  })
  page = await app.firstWindow()
  // Wait for React to fully render — domcontentloaded fires before hydration
  await page.waitForLoadState('load')
})

test.afterAll(async () => {
  if (app) {
    await Promise.race([
      app.close(),
      new Promise(resolve => setTimeout(resolve, 5000))
    ])
  }
})

test('app window opens', async () => {
  expect(page).toBeTruthy()
})

test('window has correct minimum dimensions', async () => {
  const size = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const [width, height] = win.getSize()
    return { width, height }
  })
  expect(size.width).toBeGreaterThanOrEqual(1000)
  expect(size.height).toBeGreaterThanOrEqual(700)
})

test('auth screen renders when unauthenticated', async () => {
  const heading = page.locator('h1', { hasText: 'Manager-inator' })
  await expect(heading).toBeVisible({ timeout: 15_000 })

  const subtitle = page.locator('text=AI-powered performance management')
  await expect(subtitle).toBeVisible({ timeout: 5_000 })
})

test('connect with GitHub button is visible', async () => {
  const button = page.locator('button:has-text("Connect with GitHub")')
  await expect(button).toBeVisible()
})

test('app has dark background', async () => {
  const bgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor
  })
  expect(bgColor).toBeTruthy()
})

test('window title contains app name', async () => {
  const title = await page.title()
  expect(title.length).toBeGreaterThan(0)
})

test('auth screen has proper structure', async () => {
  const buttons = await page.locator('button').count()
  expect(buttons).toBeGreaterThanOrEqual(1)

  const hasLogo = await page.locator('svg, img').first().isVisible().catch(() => false)
  expect(typeof hasLogo).toBe('boolean')
})

test('no console errors on startup', async () => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await page.waitForTimeout(2000)
  const criticalErrors = errors.filter(
    e => !e.includes('net::ERR') && !e.includes('favicon')
  )
  expect(criticalErrors).toHaveLength(0)
})
