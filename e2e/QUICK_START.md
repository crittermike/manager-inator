# E2E Testing Quick Start

Get started with E2E tests in 5 minutes.

## Prerequisites

✅ Already installed:
- `electron-playwright-helpers` package
- Playwright test fixtures in `e2e/fixtures.ts`
- Test helpers in `e2e/test-helpers.ts`
- Example tests in `e2e/authenticated.spec.ts`

## Run Tests

### 1. Build the app first
```bash
npm run build
```

### 2. Run all E2E tests
```bash
npm run test:e2e
```

### 3. Run specific test file
```bash
npx playwright test e2e/authenticated.spec.ts
```

### 4. Run with UI (see the app window)
```bash
npx playwright test --headed e2e/authenticated.spec.ts
```

### 5. Debug mode (step through)
```bash
npx playwright test --debug e2e/authenticated.spec.ts
```

## Write Your First Test

### Option 1: Simple unauthenticated test

```typescript
// e2e/my-test.spec.ts
import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'path'

test('app launches and shows auth screen', async () => {
  const app = await electron.launch({
    args: [resolve(__dirname, '../out/main/index.mjs')]
  })
  
  const page = await app.firstWindow()
  await page.waitForLoadState('load')
  
  // Should show auth screen
  await expect(page.locator('h1:has-text("Manager-inator")')).toBeVisible()
  
  await app.close()
})
```

### Option 2: Authenticated test with IPC

```typescript
// e2e/my-auth-test.spec.ts
import { test, expect } from './fixtures'
import { createMockDataRepo, createAuthenticatedStoreSeed } from './test-helpers'
import { join } from 'path'
import { execSync } from 'child_process'

test.describe('My Feature', () => {
  test.beforeAll(async ({ userDataDir, preSeedStore }) => {
    // Create mock data
    const repoPath = join(userDataDir, 'test-repo')
    createMockDataRepo(repoPath, {
      reports: [{ name: 'alice', displayName: 'Alice' }]
    })
    
    // Git init
    execSync('git init', { cwd: repoPath, stdio: 'ignore' })
    execSync('git config user.email "test@test.com"', { cwd: repoPath })
    execSync('git config user.name "Test"', { cwd: repoPath })
    execSync('git add .', { cwd: repoPath, stdio: 'ignore' })
    execSync('git commit -m "Init"', { cwd: repoPath, stdio: 'ignore' })
    
    // Pre-seed auth
    preSeedStore(createAuthenticatedStoreSeed({ repoPath }))
  })

  test('loads reports via IPC', async ({ invokeIPC }) => {
    const reports = await invokeIPC<string[]>('github:reports')
    expect(reports).toContain('alice')
  })
})
```

## Common Test Patterns

### Test IPC handler
```typescript
test('loads settings', async ({ invokeIPC }) => {
  const settings = await invokeIPC('settings:get')
  expect(settings.hasToken).toBe(true)
})
```

### Test DOM element
```typescript
test('shows welcome message', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('Welcome')
})
```

### Test navigation
```typescript
test('navigates to settings', async ({ page }) => {
  await page.click('a[href="#/settings"]')
  await expect(page.locator('h2')).toHaveText('Settings')
})
```

### Test form submission
```typescript
test('saves settings', async ({ page, invokeIPC }) => {
  await page.fill('input[name="model"]', 'gpt-4o')
  await page.click('button:has-text("Save")')
  
  const settings = await invokeIPC('settings:get')
  expect(settings.defaultModel).toBe('gpt-4o')
})
```

### Test file commit
```typescript
test('commits file', async ({ invokeIPC, userDataDir }) => {
  const repoPath = join(userDataDir, 'test-repo')
  
  await invokeIPC('github:commit-file', 
    'test.md', 
    '# Test', 
    'Add test file'
  )
  
  // Verify git commit
  const log = execSync('git log --oneline -1', { 
    cwd: repoPath,
    encoding: 'utf-8'
  })
  expect(log).toContain('Add test file')
})
```

## Debugging Tips

### See console logs
```bash
# Logs go to terminal when running with --headed
npx playwright test --headed
```

### Check userDataDir
```typescript
test('debug userDataDir', async ({ userDataDir }) => {
  console.log('userDataDir:', userDataDir)
  // Look for: /var/folders/.../manager-inator-e2e-0-...
})
```

### Take screenshot on failure
```typescript
test('my test', async ({ page }) => {
  try {
    // Test code...
  } catch (err) {
    await page.screenshot({ path: `failure-${Date.now()}.png` })
    throw err
  }
})
```

### Inspect store data
```typescript
import { readFileSync } from 'fs'

test('check store', async ({ userDataDir }) => {
  const store = readFileSync(
    join(userDataDir, 'config.json'), 
    'utf-8'
  )
  console.log('Store:', JSON.parse(store))
})
```

## Performance Tips

### ✅ Use worker-scoped fixtures
Already configured in `e2e/fixtures.ts` - the app launches once per worker, not per test.

### ✅ Use IPC instead of DOM
```typescript
// Fast (10-50ms)
const data = await invokeIPC('github:reports')

// Slow (500-2000ms)
await page.click('button')
await page.waitForSelector('.results')
const data = await page.textContent('.results')
```

### ✅ Pre-seed instead of UI interaction
```typescript
// Fast (immediate)
preSeedStore({ githubToken: 'mock' })

// Slow (5-10s)
await page.click('button:has-text("Connect")')
await page.fill('input[name="code"]', 'ABC-123')
await page.click('button:has-text("Submit")')
```

## Troubleshooting

### Test fails with "context has been closed"
This is an Electron 27+ timing issue. The fixtures already handle this with retry logic from `electron-playwright-helpers`.

### Test can't find element
```typescript
// Add explicit wait
await page.locator('.my-element').waitFor({ 
  state: 'visible', 
  timeout: 10_000 
})
```

### App doesn't launch
```bash
# Make sure you built first
npm run build

# Check the built files exist
ls -la out/main/index.mjs
```

### Git commands fail in tests
```typescript
// Make sure you initialized git
execSync('git init', { cwd: repoPath })
execSync('git config user.email "test@test.com"', { cwd: repoPath })
execSync('git config user.name "Test"', { cwd: repoPath })
```

### Store not seeding correctly
```typescript
// Must call preSeedStore in beforeAll, BEFORE electronApp fixture runs
test.beforeAll(async ({ preSeedStore }) => {
  preSeedStore({ /* data */ })
})

// ❌ This won't work (too late)
test('bad', async ({ electronApp, preSeedStore }) => {
  preSeedStore({ /* data */ }) // App already launched!
})
```

## Next Steps

1. **Read the full guide**: `e2e/README.md` for comprehensive patterns
2. **Study the example**: `e2e/authenticated.spec.ts` shows all techniques
3. **Check the summary**: `e2e/IMPLEMENTATION_SUMMARY.md` for architecture overview
4. **Write more tests**: Follow the patterns above to expand coverage

## Need Help?

- Full documentation: `e2e/README.md`
- Implementation details: `e2e/IMPLEMENTATION_SUMMARY.md`
- Playwright docs: https://playwright.dev/docs/api/class-electron
- electron-playwright-helpers: https://github.com/spaceagetv/electron-playwright-helpers

---

**Ready to test!** Start with simple IPC tests, then expand to full UI workflows.
