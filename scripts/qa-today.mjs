#!/usr/bin/env node
/**
 * Manual QA script for Today page flows.
 * Prerequisite: npm run build (production build must exist in out/)
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'out', 'renderer')

if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  console.error('Build not found. Run: npm run build')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  let filePath = path.join(outDir, req.url === '/' ? 'index.html' : req.url)
  if (!fs.existsSync(filePath)) filePath = path.join(outDir, 'index.html')
  const ext = path.extname(filePath)
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' })
  res.end(fs.readFileSync(filePath))
})

await new Promise(r => server.listen(0, r))
const port = server.address().port

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { console.log('  ✅ ' + name); passed++ }
  else { console.log('  ❌ ' + name); failed++ }
}

const FIXED_NOW = new Date('2026-03-23T10:00:00').getTime() // Monday
const base = `http://localhost:${port}`

await page.addInitScript((fixedNow) => {
  // Freeze time for deterministic cadence.
  const RealDate = Date
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixedNow)
      else super(...args)
    }
    static now() { return fixedNow }
  }
  MockDate.UTC = RealDate.UTC
  MockDate.parse = RealDate.parse
  // @ts-ignore
  MockDate.prototype = RealDate.prototype
  // @ts-ignore
  window.Date = MockDate

  const noop = () => () => {}
  const todayKey = new RealDate(fixedNow).toISOString().slice(0, 10)

  // Seed Done state so "Done today" section exists (collapsed by default).
  localStorage.setItem(`today-done-${todayKey}`, JSON.stringify([
    'inbox-2026-03-21-team-standup.md'
  ]))

  // Capture side-effects for assertions.
  // @ts-ignore
  window.__qaCalls = { saveSettings: [], commitFile: [], aiGenerate: [], toggleActionItem: [] }

  // @ts-ignore
  window.api = {
    // Auth/setup gate
    getAuthStatus: () => Promise.resolve({ authenticated: true }),
    getSettings: () => Promise.resolve({
      hasToken: true,
      repoPath: '/tmp/test',
      repoOwner: 't',
      repoName: 't',
      defaultModel: 'gpt-4.1',
      checkInFrequency: 'monthly',
      feedbackReminderDays: 14,
      sprintLengthWeeks: 2,
      endOfWeekDay: 'monday',
      sprintStartDate: '',
      staleActionDays: 5,
      aiCustomInstructions: '',
      disabledPractices: [],
      snoozedPractices: {},
      customPractices: [],
      practiceCompletions: {},
      snoozedActionItems: {}
    }),
    saveSettings: (patch) => {
      // @ts-ignore
      window.__qaCalls.saveSettings.push(patch)
      return Promise.resolve()
    },

    // Data
    getTeamOverview: () => Promise.resolve({
      reports: [
        {
          name: 'nic-daantos',
          displayName: 'Nic Daantos',
          meetingDay: 'Tuesday',
          lastOneOnOne: '2026-03-01',
          daysGap: 22,
          openActionItems: 2,
          status: 'ok',
          lastCheckIn: '2026-03',
          lastFeedback: '2026-02-20'
        }
      ],
      attentionItems: [],
      lastUpdated: new RealDate(fixedNow).toISOString()
    }),
    clearCaches: () => Promise.resolve(),

    listMeetings: () => Promise.resolve([
      { date: '2026-03-22', title: 'Nic 1-1', filename: '2026-03-22-nic-1-1.md', processed: false },
      { date: '2026-03-21', title: 'Team standup', filename: '2026-03-21-team-standup.md', processed: false },
    ]),

    getTeamActionItems: () => Promise.resolve([
      {
        text: 'Follow up on deployment issue',
        owner: 'me',
        completed: false,
        sourceFile: 'meetings/2026-03-01-nic-1-1.md',
        sourceLine: '- [ ] Follow up on deployment issue',
        sourceLineNumber: 12,
        reportName: 'nic-daantos',
        displayName: 'Nic Daantos'
      }
    ]),

    getReportData: () => Promise.resolve({
      profile: { name: 'nic-daantos', displayName: 'Nic Daantos', role: 'Engineer', meetingDay: 'Tuesday' },
      checkIns: [],
      summaries: [{ date: '2026-03-01', content: '...', keyTopics: ['Latency', 'Scope'], actionItems: [], sentiment: 'neutral' }],
      transcripts: [{ date: '2026-03-01', content: '...' }],
      actionItems: [{ text: 'Follow up on deployment issue', owner: 'me', completed: false, sourceFile: 'meetings/2026-03-01-nic-1-1.md', sourceLine: '- [ ] Follow up', sourceLineNumber: 12 }],
      feedback: [{ date: '2026-02-20', type: 'positive', source: '1:1', context: '', content: 'Nic handled the incident calmly.' }],
      reviews: [],
      jobExpectations: ''
    }),

    getFileContent: (p) => {
      if (String(p).includes('meetings/2026-03-22-nic-1-1.md')) return Promise.resolve('Raw transcript for Nic 1-1')
      if (String(p).includes('meetings/2026-03-21-team-standup.md')) return Promise.resolve('Raw transcript for standup')
      if (String(p).includes('meetings/2026-03-01-nic-1-1.md')) return Promise.resolve('# Summary\n\nPrior notes')
      if (String(p).includes('reports/nic-daantos/feedback/log.md')) return Promise.resolve('# Feedback log\n')
      return Promise.resolve('# File\n')
    },
    getImpactLog: () => Promise.resolve('# Impact log\n'),

    commitFile: (p, content, msg) => {
      // @ts-ignore
      window.__qaCalls.commitFile.push({ path: p, content, msg })
      return Promise.resolve()
    },

    toggleActionItem: (sourceFile, sourceLine) => {
      // @ts-ignore
      window.__qaCalls.toggleActionItem.push({ sourceFile, sourceLine })
      return Promise.resolve(true)
    },

    // AI
    aiGenerate: (action, context, onChunk) => {
      // @ts-ignore
      window.__qaCalls.aiGenerate.push({ action, context })
      const text =
        action === 'summarize-meeting'
          ? '# Summary\n\nDiscussed priorities.'
          : action === 'extract-action-items'
            ? '- [ ] Send follow-up email\n- [ ] Schedule check-in'
            : action === 'extract-feedback'
              ? 'Nic Daantos — positive: Clear communication under pressure.'
              : action === 'extract-impact'
                ? '- Unblocked release by aligning stakeholders.'
                : action === 'prep-one-on-one'
                  ? '# Prep\n\n- [ ] Ask about workload\n- [ ] Review action items'
                  : 'OK'
      if (typeof onChunk === 'function') {
        onChunk(text.slice(0, Math.min(20, text.length)))
        onChunk(text)
      }
      return Promise.resolve(text)
    },
    aiCancel: () => Promise.resolve(),

    // Misc required by shell + other pages
    onBackfillProgress: noop,
    onPushStatus: noop,
    onAiToolStatus: noop,
    onNavigate: noop,
    preWarmCaches: () => Promise.resolve(),
    startAuth: () => Promise.resolve(),
    pollAuth: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    getReports: () => Promise.resolve(['nic-daantos']),
    getReportProfile: () => Promise.resolve({ name: 'Nic Daantos', displayName: 'Nic Daantos', role: 'Engineer', meetingDay: 'Tuesday' }),
    listPeople: () => Promise.resolve([]),
    searchContent: () => Promise.resolve([]),
    getSettingsOptions: () => Promise.resolve({ roles: [], relationships: [] }),
    saveMeetingTitle: () => Promise.resolve(),
    cancelBackfill: () => Promise.resolve(),
    backfillSummaries: () => Promise.resolve(),
    showOpenDialog: () => Promise.resolve({ filePaths: [] }),
    getPersonMeetings: () => Promise.resolve([]),
    findPersonByName: () => Promise.resolve(null),
  }
}, FIXED_NOW)

console.log('=== TODAY: APP LOAD ===')
await page.goto(base)
await page.waitForTimeout(2500)
const bodyText = await page.evaluate(() => document.body.innerText)
check('Nav: Today visible', bodyText.includes('Today'))
check('Nav: Playbook visible', bodyText.includes('Playbook'))
check('Nav: Search visible', bodyText.includes('Search'))
check('Sidebar: Direct Reports shown', bodyText.includes('Nic Daantos'))

console.log('\n=== TODAY: SECTION ORDER + DEFAULT COLLAPSE ===')
await page.goto(`${base}/#/`)
await page.waitForTimeout(1500)

const sectionOrder = await page.evaluate(() => {
  const containers = Array.from(document.querySelectorAll('div.border-l-\\[3px\\]'))
  return containers
    .map(c => c.querySelector('button')?.innerText?.trim() || '')
    .filter(Boolean)
})

const idx = (label) => sectionOrder.findIndex(t => t.includes(label))
check('Sections include Weekly Reflection', idx('Weekly Reflection') >= 0)
check('Sections include Overdue', idx('Overdue') >= 0)
check('Sections include Before your next 1:1', idx('Before your next 1:1') >= 0)
check('Sections include Inbox', idx('Inbox') >= 0)
check('Sections include Coming up', idx('Coming up') >= 0)
check('Sections include Done today', idx('Done today') >= 0)
check('Section order matches spec',
  idx('Weekly Reflection') < idx('Overdue') &&
  idx('Overdue') < idx('Before your next 1:1') &&
  idx('Before your next 1:1') < idx('Inbox') &&
  idx('Inbox') < idx('Coming up') &&
  idx('Coming up') < idx('Done today')
)

const comingUpHasBody = await page.locator('div.border-l-\\[3px\\]:has(button:has-text("Coming up")) div.border-t').count()
const doneHasBody = await page.locator('div.border-l-\\[3px\\]:has(button:has-text("Done today")) div.border-t').count()
check('Coming up collapsed by default', comingUpHasBody === 0)
check('Done today collapsed by default', doneHasBody === 0)

console.log('\n=== TODAY: COMING UP → VIEW IN PLAYBOOK ===')
await page.locator('div.border-l-\\[3px\\]:has(button:has-text("Coming up")) > button').click()
await page.waitForTimeout(600)
check('Coming up expands', await page.locator('div.border-l-\\[3px\\]:has(button:has-text("Coming up")) div.border-t').count() === 1)

// Click any "View in Playbook" button within coming up.
const clickedPlaybook = await page.evaluate(() => {
  const section = Array.from(document.querySelectorAll('div.border-l-\\[3px\\]')).find(d => d.textContent?.includes('Coming up'))
  if (!section) return false
  const btn = section.querySelector('button[aria-label="View in Playbook"]')
  if (!btn) return false
  ;(btn).click()
  return true
})
check('Found and clicked View in Playbook', clickedPlaybook)
await page.waitForTimeout(1500)
await page.waitForTimeout(300)
check('Navigated to Playbook', page.url().includes('/#/playbook') || (await page.evaluate(() => document.body.innerText)).includes('Next 3 months'))

// Back to Today
await page.goto(`${base}/#/`)
await page.waitForTimeout(1200)

console.log('\n=== TODAY: INBOX PROCESS INLINE ===')
// Find and click the first Process button.
const clickedProcess = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'))
  const btn = buttons.find(b => b.textContent?.trim() === 'Process')
  if (!btn) return false
  btn.click()
  return true
})
check('Clicked Process button', clickedProcess)

await page.waitForSelector('text=Approve & save', { timeout: 20000 })
check('Inline processor shows review action', await page.locator('text=Approve & save').count() > 0)
check('Inline processor shows Summary section', await page.locator('text=Summary').count() > 0)
check('Inline processor shows Action items section', await page.locator('text=Action items').count() > 0)
check('Inline processor shows Feedback section', await page.locator('text=Feedback').count() > 0)

await page.locator('text=Approve & save').first().click()
await page.waitForTimeout(1500)

const commitsAfterProcess = await page.evaluate(() => {
  // @ts-ignore
  return window.__qaCalls.commitFile || []
})
check('Processing triggers at least 1 commitFile call', commitsAfterProcess.length >= 1)
check('Processing commits meeting file', commitsAfterProcess.some(c => String(c.path).includes('meetings/2026-03-22-nic-1-1.md')))

console.log('\n=== TODAY: PREP 1:1 INLINE + SAVE ===')
// Expand first prep item.
const clickedPrep = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'))
  const btn = buttons.find(b => b.textContent?.trim() === 'Pre-prep' || b.textContent?.trim() === 'Prep')
  if (!btn) return false
  btn.click()
  return true
})
check('Clicked Prep/Pre-prep', clickedPrep)

await page.waitForSelector('text=Generate prep notes', { timeout: 15000 })
await page.locator('text=Generate prep notes').click()
await page.waitForSelector('text=Save prep', { timeout: 20000 })
await page.locator('text=Save prep').click()
await page.waitForTimeout(1500)

const commitsAfterPrep = await page.evaluate(() => {
  // @ts-ignore
  return window.__qaCalls.commitFile || []
})
check('Prep triggers commitFile to reports/.../prep', commitsAfterPrep.some(c => String(c.path).includes('reports/nic-daantos/prep/2026-03-23.md')))

console.log('\n=== TODAY: WEEKLY REFLECTION PROMPT SAVE ===')
// Weekly Reflection should already be visible (endOfWeekDay is monday, fixed date is Monday).

// Click the Week-in-review row to expand inline prompt.
const openedPrompt = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('div.cursor-pointer, button'))
    .find(e => e.textContent?.includes('Week-in-review') || e.textContent?.includes('Weekly reflection'))
  if (!el) return false
  el.click()
  return true
})
check('Opened Week-in-review item', openedPrompt)

await page.waitForSelector('textarea', { timeout: 20000 })
await page.fill('textarea', 'Shipped X. Risk: Y. Learned: Z.')
await page.locator('text=Save').first().click()
await page.waitForTimeout(1500)

const commitsAfterPrompt = await page.evaluate(() => {
  // @ts-ignore
  return window.__qaCalls.commitFile || []
})
check('Prompt save commits weekly-log reflection', commitsAfterPrompt.some(c => String(c.path).includes('weekly-log/') && String(c.path).includes('reflection.md')))

console.log('\n=== TODAY: DONE SECTION EXPANDS ===')
// Done collapsed by default already checked. Now expand and ensure done item appears.
await page.locator('div.border-l-\\[3px\\]:has(button:has-text("Done today")) > button').click()
await page.waitForTimeout(500)
check('Done section expands', await page.locator('div.border-l-\\[3px\\]:has(button:has-text("Done today")) div.border-t').count() === 1)
check('Done item becomes visible', (await page.evaluate(() => document.body.innerText)).includes('Team standup'))

console.log('\n=== RESULTS ===')
console.log(`Passed: ${passed}/${passed + failed}`)
console.log(`Failed: ${failed}`)
console.log(failed === 0 ? 'ALL TESTS PASS ✅' : 'SOME TESTS FAILED ❌')

await browser.close()
server.close()
process.exit(failed > 0 ? 1 : 0)
