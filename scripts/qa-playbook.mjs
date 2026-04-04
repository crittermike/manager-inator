#!/usr/bin/env node
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

await page.addInitScript(() => {
  const noop = () => () => {}
  window.__qaCalls = { saveSettings: [] }
  window.api = {
    getAuthStatus: () => Promise.resolve({ authenticated: true }),
    getSettings: () => Promise.resolve({
      hasToken: true, repoPath: '/tmp/test', repoOwner: 't', repoName: 't',
      defaultModel: 'gpt-4.1', checkInFrequency: 'monthly', feedbackReminderDays: 14,
      sprintLengthWeeks: 2, endOfWeekDay: 'friday', sprintStartDate: '2026-01-05',
      staleActionDays: 5, aiCustomInstructions: '',
      disabledPractices: [], snoozedPractices: {},
      customPractices: [
        { id: 'custom-1000', name: 'Weekly Team Lunch', description: 'Take team out', cadence: 'weekly', frequency: 'Every Friday', trigger: '', perReport: false }
      ],
      practiceCompletions: {}, snoozedActionItems: {}
    }),
    saveSettings: (patch) => { window.__qaCalls.saveSettings.push(patch); return Promise.resolve() },
    getReports: () => Promise.resolve(['nic-daantos']),
    getReportProfile: () => Promise.resolve({ name: 'Nic Daantos', displayName: 'Nic Daantos', role: 'Engineer', meetingDay: 'Tuesday' }),
    getTeamOverview: () => Promise.resolve({
      reports: [{ name: 'nic-daantos', displayName: 'Nic Daantos', meetingDay: 'Tuesday', lastOneOnOne: '2026-03-18', daysGap: 5, openActionItems: 1, status: 'ok', lastCheckIn: '2026-03', lastFeedback: '2026-03-10' }],
      attentionItems: [], lastUpdated: new Date().toISOString()
    }),
    listMeetings: () => Promise.resolve([]),
    getTeamActionItems: () => Promise.resolve([]),
    clearCaches: () => Promise.resolve(),
    getReportData: () => Promise.resolve({ profile: { name: 'Nic Daantos' }, checkIns: [], summaries: [], transcripts: [], actionItems: [], feedback: [], reviews: [], jobExpectations: '' }),
    getFileContent: () => Promise.resolve('# File\n'),
    getImpactLog: () => Promise.resolve(''),
    commitFile: () => Promise.resolve(),
    toggleActionItem: () => Promise.resolve(true),
    listPeople: () => Promise.resolve([]),
    searchContent: () => Promise.resolve([]),
    getSettingsOptions: () => Promise.resolve({ roles: [], relationships: [] }),
    saveMeetingTitle: () => Promise.resolve(),
    cancelBackfill: () => Promise.resolve(),
    backfillSummaries: () => Promise.resolve(),
    getPersonContexts: () => Promise.resolve([]),
    findPersonByName: () => Promise.resolve(null),
    aiGenerate: () => Promise.resolve(''), aiCancel: () => Promise.resolve(),
    showOpenDialog: () => Promise.resolve({ filePaths: [] }),
    onBackfillProgress: noop, onPushStatus: noop, onAiToolStatus: noop, onNavigate: noop,
    preWarmCaches: () => Promise.resolve(),
    startAuth: () => Promise.resolve(), pollAuth: () => Promise.resolve(), logout: () => Promise.resolve(),
  }
})

const base = `http://localhost:${port}`

console.log('=== PLAYBOOK: PAGE LOAD ===')
await page.goto(`${base}/#/playbook`)
await page.waitForTimeout(2500)
const bodyText = await page.evaluate(() => document.body.innerText)
check('Playbook page loads', bodyText.includes('NEXT 3 MONTHS') || bodyText.includes('Playbook'))
check('Timeline section visible', bodyText.includes('NEXT 3 MONTHS'))

console.log('\n=== PLAYBOOK: CADENCE GROUPS ===')
check('Daily cadence group', bodyText.includes('Daily'))
check('Weekly cadence group', bodyText.includes('Weekly'))
check('Sprint cadence group', bodyText.includes('Sprint') || bodyText.includes('Every Sprint'))
check('Monthly cadence group', bodyText.includes('Monthly'))
check('Quarterly cadence group', bodyText.includes('Quarterly'))
check('Semi-annual cadence group', bodyText.includes('Semi-annual') || bodyText.includes('Twice a Year'))

console.log('\n=== PLAYBOOK: PRACTICE LIST ===')
check('1:1 prep practice visible', bodyText.includes('1:1 prep'))
check('Set weekly priorities practice visible', bodyText.includes('Set weekly priorities') || bodyText.includes('Weekly priorities'))
check('Custom practice visible', bodyText.includes('Weekly Team Lunch'))

console.log('\n=== PLAYBOOK: DISABLE PRACTICE (toggle switch) ===')
// Disable is a toggle switch with title="Disable practice" or title="Enable practice", not a text button
const disableClicked = await page.evaluate(() => {
  // Find toggle buttons by title attribute
  const btns = Array.from(document.querySelectorAll('button[title="Disable practice"], button[title="Enable practice"]'))
  if (btns.length === 0) return false
  btns[0].click()
  return true
})
check('Found and clicked Disable toggle', disableClicked)
await page.waitForTimeout(500)
const disableCalls = await page.evaluate(() => window.__qaCalls.saveSettings.filter(c => c.disabledPractices))
check('Disable triggers saveSettings with disabledPractices', disableCalls.length > 0)

console.log('\n=== PLAYBOOK: SNOOZE PRACTICE ===')
// Snooze is an icon button with title="Snooze practice"
const snoozeClicked = await page.evaluate(() => {
  const btn = document.querySelector('button[title="Snooze practice"]')
  if (!btn) return false
  btn.click()
  return true
})
check('Found Snooze button', snoozeClicked)

if (snoozeClicked) {
  await page.waitForTimeout(300)
  const snoozeOption = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const btn = btns.find(b => b.textContent?.includes('1 week') || b.textContent?.includes('1 month'))
    if (!btn) return false
    btn.click()
    return true
  })
  check('Selected snooze duration', snoozeOption)
  await page.waitForTimeout(500)
  const snoozeCalls = await page.evaluate(() => window.__qaCalls.saveSettings.filter(c => c.snoozedPractices))
  check('Snooze triggers saveSettings with snoozedPractices', snoozeCalls.length > 0)
}

console.log('\n=== PLAYBOOK: ADD CUSTOM PRACTICE ===')
const addClicked = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'))
  const btn = btns.find(b => b.textContent?.includes('Add a practice'))
  if (!btn) return false
  btn.click()
  return true
})
check('Found and clicked Add a practice', addClicked)
await page.waitForTimeout(500)

if (addClicked) {
  const formVisible = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input')
    return inputs.length > 0
  })
  check('Add practice form visible', formVisible)
}

console.log('\n=== PLAYBOOK: DEEP LINK ===')
await page.goto(`${base}/#/playbook?practice=one-on-one-prep`)
await page.waitForTimeout(2000)
const highlightedText = await page.evaluate(() => document.body.innerText)
check('Deep link loads playbook', highlightedText.includes('1:1 prep') || highlightedText.includes('Playbook'))

console.log('\n=== RESULTS ===')
console.log(`Passed: ${passed}/${passed + failed}`)
console.log(`Failed: ${failed}`)
console.log(failed === 0 ? 'ALL TESTS PASS ✅' : 'SOME TESTS FAILED ❌')

await browser.close()
server.close()
process.exit(failed > 0 ? 1 : 0)
