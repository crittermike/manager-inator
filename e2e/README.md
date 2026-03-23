# E2E Testing Guide

Production-quality Playwright E2E testing patterns for Electron apps, based on research from:
- [electron-playwright-helpers](https://github.com/spaceagetv/electron-playwright-helpers) (production helper library)
- [slayzone](https://github.com/debuglebowski/slayzone) (real-world Electron app with sophisticated fixtures)
- [Official Playwright Electron docs](https://playwright.dev/docs/api/class-electron)

## Architecture

```
e2e/
├── fixtures.ts              # Playwright test fixtures with userDataDir isolation
├── test-helpers.ts          # Helper functions for test data setup
├── authenticated.spec.ts    # Example authenticated tests
├── app.spec.ts             # Basic unauthenticated tests
└── README.md               # This file
```

## Key Patterns

### 1. **Test Isolation with userDataDir**

Each Playwright worker gets its own isolated `userDataDir` to prevent test interference:

```typescript
const tmpDir = join(
  tmpdir(),
  `manager-inator-e2e-${workerInfo.workerIndex}-${process.pid}-${Date.now()}`
)
app.setPath('userData', tmpDir)
```

**Benefits:**
- No shared state between tests
- Parallel execution safe
- Clean slate for each worker
- Automatic cleanup

**Implementation:** `src/main/index.ts` reads `ELECTRON_USER_DATA` env var and calls `app.setPath('userData', ...)` before app initialization.

---

### 2. **Pre-seeding electron-store**

Bypass OAuth and authentication flows by writing store data before app launch:

```typescript
// In test setup
preSeedStore({
  githubToken: 'mock_test_token',
  repoPath: '/path/to/test/repo',
  defaultModel: 'gpt-4.1'
})
```

**How it works:**
1. `preSeedStore` writes JSON to `<userDataDir>/config.json` **before** `electronApp` launches
2. When electron-store initializes, it reads the pre-seeded data
3. App thinks it's authenticated and configured

**Caveat:** Your electron-store encryption key must match (`manager-inator-v1`). For tests, we pre-seed before encryption happens.

---

### 3. **Fixture Data Directories**

Create mock data repositories for testing:

```typescript
const mockRepoPath = join(userDataDir, 'mock-data-repo')

createMockDataRepo(mockRepoPath, {
  reports: [
    { name: 'alice-smith', displayName: 'Alice Smith', role: 'Senior Engineer' }
  ],
  meetings: [
    { filename: '2026-03-17-alice-1-1.md', title: 'Alice 1:1', date: '2026-03-17' }
  ]
})

// Initialize as git repo
execSync('git init', { cwd: mockRepoPath })
execSync('git add .', { cwd: mockRepoPath })
execSync('git commit -m "Initial data"', { cwd: mockRepoPath })
```

**Why git init?** The app assumes the data directory is a git repository and runs git commands. Tests need this too.

---

### 4. **IPC Testing**

Test main process logic directly via IPC (faster and more reliable than DOM):

```typescript
// Direct IPC invocation
const reports = await invokeIPC<string[]>('github:reports')
expect(reports).toContain('alice-smith')

// Compare to DOM testing (slower, flakier)
await page.click('button:has-text("Load Reports")')
await page.waitForSelector('.report-item')
const text = await page.textContent('.report-item')
expect(text).toContain('alice-smith')
```

**Benefits:**
- 5-10x faster than DOM interaction
- No render timing issues
- Tests business logic, not UI quirks
- Easier to debug

**Use DOM testing for:**
- Actual user workflows
- Visual verification
- Integration between UI and IPC

---

### 5. **Worker-scoped Fixtures**

Reuse the same Electron app across tests in a worker (massive speedup):

```typescript
export const test = base.extend<ElectronFixtures>({
  electronApp: [async ({ userDataDir }, use) => {
    const app = await electron.launch({ /* ... */ })
    await use(app) // Shared across tests in this worker
    await app.close()
  }, { scope: 'worker' }] // ← Key: worker scope
})
```

**Performance impact:**
- Cold launch: ~2-5 seconds per test
- Worker-scoped: ~2-5 seconds for entire test file

**Trade-off:** Tests share app instance, so state pollution is possible. Use `test.beforeEach` to reset state if needed.

---

### 6. **Handling Flaky Context Errors (Electron 27+)**

Electron 27+ has timing issues with Playwright's `evaluate()`:

```typescript
// ❌ Flaky
await page.evaluate(() => window.myAPI.doThing())

// ✅ Reliable (use retry helper from electron-playwright-helpers)
import { retry } from 'electron-playwright-helpers'

await retry(
  () => page.evaluate(() => window.myAPI.doThing()),
  { timeout: 5000, pollInterval: 200 }
)
```

**Default retry config:**
- Timeout: 5000ms
- Poll interval: 200ms
- Retries on: `['context or browser has been closed']`

**Our fixture already uses this** for `invokeIPC`.

---

## Running Tests

### Build and run all tests
```bash
npm run test:e2e
```

### Run specific test file
```bash
npx playwright test e2e/authenticated.spec.ts
```

### Run with UI (headed mode)
```bash
npx playwright test --headed
```

### Debug mode
```bash
npx playwright test --debug
```

### Run with trace (for debugging failures)
```bash
npx playwright test --trace on
```

---

## Test Structure

### Basic Test (Unauthenticated)

```typescript
import { test, expect, _electron as electron } from '@playwright/test'

test('app launches', async () => {
  const app = await electron.launch({ args: ['./out/main/index.mjs'] })
  const page = await app.firstWindow()
  await expect(page.locator('h1')).toBeVisible()
  await app.close()
})
```

### Authenticated Test (Full Fixture)

```typescript
import { test, expect } from './fixtures'
import { createMockDataRepo, createAuthenticatedStoreSeed } from './test-helpers'

test.describe('Authenticated', () => {
  test.beforeAll(async ({ userDataDir, preSeedStore }) => {
    const repoPath = join(userDataDir, 'test-repo')
    createMockDataRepo(repoPath, { /* data */ })
    preSeedStore(createAuthenticatedStoreSeed({ repoPath }))
  })

  test('loads team data', async ({ invokeIPC }) => {
    const team = await invokeIPC('github:team-overview')
    expect(team.reports).toHaveLength(2)
  })
})
```

---

## Common Patterns

### Wait for Element with Retry
```typescript
import { waitForElement } from './test-helpers'

await waitForElement(page, '.report-list', { timeout: 5000, retries: 3 })
```

### Test IPC Streaming
```typescript
const chunks: string[] = []
page.on('console', msg => {
  if (msg.text().startsWith('[AI Chunk]')) {
    chunks.push(msg.text())
  }
})

await invokeIPC('ai:generate', 'summarize-meeting', { transcript: '...' })
await page.waitForTimeout(1000) // Wait for streaming
expect(chunks.length).toBeGreaterThan(0)
```

### Reset State Between Tests
```typescript
test.beforeEach(async ({ invokeIPC }) => {
  await invokeIPC('github:clear-caches')
})
```

### Capture Console Logs
```typescript
const logs: string[] = []
page.on('console', msg => logs.push(msg.text()))

// Run test...

const errors = logs.filter(l => l.includes('ERROR'))
expect(errors).toHaveLength(0)
```

---

## Debugging Tips

### 1. **Check userDataDir location**
```typescript
console.log('[Test] userDataDir:', userDataDir)
// Output: /var/folders/.../manager-inator-e2e-0-12345-1234567890
```

### 2. **Verify store seeding**
```typescript
import { readFileSync } from 'fs'
const storePath = join(userDataDir, 'config.json')
console.log('[Test] Store data:', readFileSync(storePath, 'utf-8'))
```

### 3. **Inspect main process logs**
Electron logs go to stdout. Run with `--headed` to see them:
```bash
npx playwright test --headed e2e/authenticated.spec.ts
```

### 4. **Take screenshots on failure**
```typescript
test('my test', async ({ page }) => {
  try {
    // Test logic...
  } catch (err) {
    await page.screenshot({ path: 'test-failure.png' })
    throw err
  }
})
```

### 5. **Use Playwright trace viewer**
```bash
npx playwright test --trace on
npx playwright show-trace trace.zip
```

---

## Performance Benchmarks

| Pattern | Cold Launch | Warm (Worker-scoped) | Speedup |
|---------|-------------|----------------------|---------|
| Basic test | 2-5s per test | N/A | 1x |
| Worker fixture | 2-5s first test | ~50-200ms per test | 10-50x |
| IPC testing | ~100-500ms | ~10-50ms | 5-10x |
| DOM testing | ~500-2000ms | ~100-500ms | 2-5x |

**Recommendation:** Use worker-scoped fixtures + IPC testing for maximum speed.

---

## Next Steps

### 1. **Add more authenticated tests**
- Navigation flows (Today → Report Detail → Search)
- Data display verification (meeting lists, action items)
- Settings management (update model, change cadence)

### 2. **Add IPC-driven tests**
- Test file commits (check git log after commit)
- Test cache invalidation (write file, verify cache cleared)
- Test AI streaming (capture chunks, verify complete response)

### 3. **Add UI workflow tests**
- Transcript processing (paste → AI → review → save)
- Action item toggling (click checkbox, verify IPC call)
- 1:1 prep generation (expand, generate, save)

### 4. **Add visual regression tests**
- Screenshot comparison for key pages
- Theme consistency checks
- Responsive layout verification

### 5. **CI Integration**
Update `.github/workflows` to run E2E tests on PRs.

---

## Gotchas and Limitations

### ❌ **Don't do this:**
```typescript
// Pre-seed after app launch (too late!)
test('bad example', async ({ electronApp, preSeedStore }) => {
  preSeedStore({ token: 'xyz' }) // ← Already launched, won't work
})
```

### ✅ **Do this:**
```typescript
test.beforeAll(async ({ preSeedStore }) => {
  preSeedStore({ token: 'xyz' }) // ← Before electronApp fixture runs
})
```

### ❌ **Don't mock network calls in Electron main process**
Electron's main process doesn't use the same fetch as renderer. Use test tokens or real (sandboxed) API calls.

### ✅ **Do use fixture data**
Create real git repos with real files. The app's logic depends on filesystem structure.

### ❌ **Don't share state across tests**
```typescript
let sharedData: any // ← Bad, pollutes tests
test('one', async () => { sharedData = await invokeIPC(...) })
test('two', async () => { expect(sharedData).toBe(...) }) // Flaky!
```

### ✅ **Do reload data in each test**
```typescript
test('one', async ({ invokeIPC }) => {
  const data = await invokeIPC('github:reports')
  expect(data).toContain('alice')
})
```

---

## References

- [electron-playwright-helpers](https://github.com/spaceagetv/electron-playwright-helpers) - Production helper library
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron) - Official docs
- [slayzone fixtures](https://github.com/debuglebowski/slayzone/blob/main/packages/apps/app/e2e/fixtures/electron.ts) - Real-world example
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing) - Official Electron docs

---

**Ready to expand the test suite!** Start with `authenticated.spec.ts` as a template.
