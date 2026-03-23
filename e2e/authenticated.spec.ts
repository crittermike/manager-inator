import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve, join } from 'path'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import { ipcMainInvokeHandler } from 'electron-playwright-helpers'

let app: ElectronApplication
let page: Page
let fixtureDir: string

function createTestDataRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'manager-inator-e2e-data-'))

  mkdirSync(join(dir, 'reports', 'alice-smith', 'check-ins', 'monthly'), { recursive: true })
  mkdirSync(join(dir, 'reports', 'alice-smith', 'feedback'), { recursive: true })
  mkdirSync(join(dir, 'reports', 'alice-smith', 'reviews'), { recursive: true })
  mkdirSync(join(dir, 'reports', 'bob-jones'), { recursive: true })
  mkdirSync(join(dir, 'meetings'), { recursive: true })
  mkdirSync(join(dir, 'transcripts', 'raw'), { recursive: true })
  mkdirSync(join(dir, 'transcripts', 'processed'), { recursive: true })
  mkdirSync(join(dir, 'people'), { recursive: true })

  writeFileSync(join(dir, 'reports', 'alice-smith', 'profile.md'), `# Alice Smith

| Field | Value |
|-------|-------|
| **Role** | Senior Engineer |
| **Team** | Platform |
| **GitHub** | @alicesmith |
| **Start Date** | 2023-01-15 |
| **Meeting Day** | Tuesday |
| **Location** | San Francisco |
`)

  writeFileSync(join(dir, 'reports', 'alice-smith', 'feedback', 'log.md'), `# Feedback Log

## 2026-01-15 - Positive

**Source**: Peer review

> Great work on the migration.
`)

  writeFileSync(join(dir, 'reports', 'bob-jones', 'profile.md'), `# Bob Jones

| Field | Value |
|-------|-------|
| **Role** | Software Engineer |
| **Team** | Frontend |
| **GitHub** | @bobjones |
| **Meeting Day** | Thursday |
`)

  writeFileSync(join(dir, 'meetings', '2026-03-17-alice-1-1.md'), `---
title: Alice 1:1
speakers:
  - Mike Crittenden
  - Alice Smith
---

# Alice 1:1 - March 17

## Topics
- Platform migration status

## Action Items
- [ ] **Alice**: Update migration docs
- [x] **Mike**: Review the design doc
`)

  writeFileSync(join(dir, 'meetings', '2026-03-19-bob-1-1.md'), `---
title: Bob 1:1
speakers:
  - Mike Crittenden
  - Bob Jones
---

# Bob 1:1 - March 19

Sprint retro discussion.
`)

  writeFileSync(join(dir, 'people', 'alice-smith.md'), `---
name: Alice Smith
slug: alice-smith
role: Senior Engineer
github: alicesmith
relationship: Direct Report
---

# Alice Smith
`)

  writeFileSync(join(dir, 'people', 'bob-jones.md'), `---
name: Bob Jones
slug: bob-jones
role: Software Engineer
github: bobjones
relationship: Direct Report
---

# Bob Jones
`)

  writeFileSync(join(dir, 'settings.md'), `# Settings

## Roles
- Software Engineer
- Senior Engineer

## Relationships
- Direct Report
- Peer
`)

  writeFileSync(join(dir, 'mike-impact-log.md'), `# Impact Log

## 2026-03-10 - Team process improvement

Introduced async standups.
`)

  execSync('git init', { cwd: dir, stdio: 'ignore' })
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' })
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' })
  execSync('git add -A', { cwd: dir, stdio: 'ignore' })
  execSync('git -c commit.gpgsign=false commit -m "Initial data"', { cwd: dir, stdio: 'ignore' })

  return dir
}

test.beforeAll(async () => {
  fixtureDir = createTestDataRepo()

  app = await electron.launch({
    args: [resolve(__dirname, '../out/main/index.mjs')],
    env: {
      ...process.env,
      ELECTRON_USER_DATA: mkdtempSync(join(tmpdir(), 'manager-inator-e2e-userdata-'))
    },
    timeout: 30_000
  })

  page = await app.firstWindow()
  await page.waitForLoadState('load')

  await ipcMainInvokeHandler(app, 'test:set-token', 'fake-test-token-for-e2e')
  await ipcMainInvokeHandler(app, 'test:save-settings', { repoPath: fixtureDir })
  await ipcMainInvokeHandler(app, 'test:clear-caches')
  await ipcMainInvokeHandler(app, 'test:pre-warm-caches')

  await page.reload()
  await page.waitForLoadState('load')
  // Wait for sidebar nav to render (deterministic signal that app is ready)
  await expect(page.locator('button', { hasText: /Today/i })).toBeVisible({ timeout: 15_000 })
})

test.afterAll(async () => {
  if (app) {
    await Promise.race([
      app.close(),
      new Promise(r => setTimeout(r, 5000))
    ])
  }
  try { rmSync(fixtureDir, { recursive: true, force: true }) } catch {}
})

test.describe('Authenticated App - Navigation', () => {
  test('does not show auth screen when authenticated', async () => {
    const authButton = page.locator('button:has-text("Connect with GitHub")')
    await expect(authButton).not.toBeVisible({ timeout: 5000 })
  })

  test('shows sidebar with navigation items', async () => {
    const sidebar = page.locator('nav, [role="navigation"], aside').first()
    await expect(sidebar).toBeVisible({ timeout: 10_000 })
  })

  test('shows direct reports in sidebar', async () => {
    const aliceLink = page.locator('a, button, [role="link"]', { hasText: /Alice/i })
    await expect(aliceLink.first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Authenticated App - Today Page', () => {
  test('Today page renders content', async () => {
    const todayButton = page.locator('button', { hasText: /Today/i })
    await expect(todayButton).toBeVisible({ timeout: 5000 })
    await todayButton.click()
    await expect(page.locator('button', { hasText: /Today/i })).toBeVisible({ timeout: 5000 })

    const body = await page.locator('#root').textContent()
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(10)
  })
})

test.describe('Authenticated App - Report Detail', () => {
  test('navigates to Alice report page', async () => {
    const aliceButton = page.locator('button', { hasText: /Alice/i }).first()
    await expect(aliceButton).toBeVisible({ timeout: 10_000 })
    await aliceButton.click()

    await expect(page.locator('#root')).toContainText('Alice', { timeout: 10_000 })
  })

  test('shows Alice profile information', async () => {
    await expect(page.locator('body')).toContainText('Senior Engineer', { timeout: 5000 })
  })

  test('shows meeting history for Alice', async () => {
    const pageContent = await page.locator('body').textContent()
    expect(pageContent).toMatch(/1.1|1:1|one.on.one/i)
  })
})

test.describe('Authenticated App - Search', () => {
  test('navigates to search page', async () => {
    const searchButton = page.locator('button', { hasText: /Search/i })
    await expect(searchButton).toBeVisible({ timeout: 5000 })
    await searchButton.click()

    const searchInput = page.locator('input[placeholder*="earch"]')
    await expect(searchInput).toBeVisible({ timeout: 5000 })
  })

  test('search returns results for known content', async () => {
    const searchInput = page.locator('input[placeholder*="earch"]')
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('migration')

    await expect(page.locator('body')).toContainText('migration', { timeout: 5000 })
  })
})

test.describe('Authenticated App - Settings', () => {
  test('navigates to settings page', async () => {
    const settingsButton = page.locator('button[aria-label="Settings"]')
    await expect(settingsButton).toBeVisible({ timeout: 5000 })
    await settingsButton.click()

    await expect(page.locator('body')).toContainText(/Repository/i, { timeout: 5000 })
  })

  test('shows repo path in settings', async () => {
    await expect(page.locator('body')).toContainText(/repo/i, { timeout: 5000 })
  })
})

test.describe('Authenticated App - IPC Integration', () => {
  test('github:reports returns fixture reports', async () => {
    const reports = await ipcMainInvokeHandler(app, 'github:reports')

    expect(reports).toContain('alice-smith')
    expect(reports).toContain('bob-jones')
  })

  test('github:list-meetings returns fixture meetings', async () => {
    const meetings = await ipcMainInvokeHandler(app, 'github:list-meetings') as any[]

    expect(meetings.length).toBe(2)
    expect(meetings.map((m: any) => m.filename)).toContain('2026-03-17-alice-1-1.md')
    expect(meetings.map((m: any) => m.filename)).toContain('2026-03-19-bob-1-1.md')
  })

  test('github:team-overview returns valid data', async () => {
    const overview = await ipcMainInvokeHandler(app, 'github:team-overview') as any

    expect(overview.reports.length).toBe(2)
    expect(overview.reports.map((r: any) => r.name)).toContain('alice-smith')
  })

  test('settings:get returns seeded settings', async () => {
    const settings = await ipcMainInvokeHandler(app, 'settings:get') as any

    expect(settings.hasToken).toBe(true)
    expect(settings.repoPath).toContain('manager-inator-e2e-data')
  })
})
