#!/usr/bin/env node
/**
 * Manual QA script for Search page flows.
 * Requires: npm install --save-dev playwright && npx playwright install chromium
 * Run: node scripts/qa-search.mjs
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

await page.addInitScript(() => {
  const noop = () => () => {}
  window.api = {
    getAuthStatus: () => Promise.resolve({ authenticated: true }),
    getSettings: () => Promise.resolve({
      hasToken: true, repoPath: '/tmp/test', repoOwner: 't', repoName: 't',
      defaultModel: 'gpt-4.1', checkInFrequency: 'monthly', feedbackReminderDays: 14,
      sprintLengthWeeks: 2, endOfWeekDay: 'Friday', sprintStartDate: '2026-01-06',
      staleActionDays: 7, aiCustomInstructions: '',
      disabledPractices: [], snoozedPractices: {}, customPractices: [],
      practiceCompletions: {}, snoozedActionItems: {}
    }),
    saveSettings: () => Promise.resolve(),
    getReports: () => Promise.resolve(['nic-daantos']),
    getReportProfile: () => Promise.resolve({ name: 'Nic Daantos', displayName: 'Nic Daantos', role: 'Engineer', meetingDay: 'Tuesday' }),
    getReportData: () => Promise.resolve({ profile: { name: 'Nic Daantos' }, checkIns: [], summaries: [], transcripts: [], actionItems: [], feedback: [], reviews: [], jobExpectations: '' }),
    getTeamOverview: () => Promise.resolve({
      reports: [{ name: 'nic-daantos', displayName: 'Nic Daantos', meetingDay: 'Tuesday', lastOneOnOne: '2026-03-18', daysGap: 5, openActionItems: 2, status: 'ok', lastCheckIn: '2026-03-01', lastFeedback: '2026-03-10' }],
      attentionItems: [], lastUpdated: new Date().toISOString()
    }),
    listMeetings: () => Promise.resolve([
      { date: '2026-03-20', title: 'Nic 1-1', filename: '2026-03-20-nic-1-1.md', processed: true },
      { date: '2026-03-18', title: 'Team standup', filename: '2026-03-18-team-standup.md', processed: true }
    ]),
    listPeople: () => Promise.resolve([
      { name: 'Nic Daantos', slug: 'nic-daantos', aliases: ['Nick'], meetingCount: 5, role: 'Software Engineer', github: 'nicdaantos', location: 'North Carolina', relationship: 'Direct Report' },
      { name: 'Jane Smith', slug: 'jane-smith', aliases: [], meetingCount: 2, role: 'Designer', location: 'CA', relationship: 'Peer' },
      { name: 'Bob External', slug: 'bob-external', aliases: [], meetingCount: 1, role: 'PM', location: 'NY', relationship: '' }
    ]),
    searchContent: (q) => {
      const results = []
      if (q.toLowerCase().includes('jane')) {
        results.push({ filename: 'jane-smith.md', directory: 'people', title: 'Jane Smith profile', snippet: 'Design lead on Project X', date: '' })
      }
      if (q.toLowerCase().includes('priorities') || q.toLowerCase().includes('week')) {
        results.push({ filename: '2026-W12-priorities.md', directory: 'notes', title: 'Priorities', snippet: 'Ship the new search feature this week', date: '2026' })
      }
      if (q.toLowerCase().includes('bob')) {
        results.push({ filename: 'bob-external.md', directory: 'people', title: 'Bob External profile', snippet: 'PM at partner company', date: '' })
      }
      return Promise.resolve(results)
    },
    getFileContent: (p) => {
      if (p.includes('weekly-log')) return Promise.resolve('# Weekly Priorities\n\n- Ship search feature\n- Fix auth bugs')
      return Promise.resolve('# Meeting Notes\n\nSome content here')
    },
    getTeamActionItems: () => Promise.resolve([]),
    getImpactLog: () => Promise.resolve(''),
    getSettingsOptions: () => Promise.resolve({ roles: [], relationships: [] }),
    saveMeetingTitle: () => Promise.resolve(),
    toggleActionItem: () => Promise.resolve(true),
    commitFile: () => Promise.resolve(),
    clearCaches: () => Promise.resolve(),
    getPersonContexts: () => Promise.resolve([]),
    findPersonByName: () => Promise.resolve(null),
    backfillSummaries: () => Promise.resolve(),
    cancelBackfill: () => Promise.resolve(),
    onBackfillProgress: noop, onPushStatus: noop, onAiToolStatus: noop, onNavigate: noop,
    preWarmCaches: () => Promise.resolve(),
    startAuth: () => Promise.resolve(), pollAuth: () => Promise.resolve(), logout: () => Promise.resolve(),
    aiGenerate: () => Promise.resolve(''), aiCancel: () => Promise.resolve(),
    showOpenDialog: () => Promise.resolve({ filePaths: [] })
  }
})

let passed = 0
let failed = 0
function check(name, condition) {
  if (condition) { console.log('  \u2705 ' + name); passed++ }
  else { console.log('  \u274c ' + name); failed++ }
}

const base = `http://localhost:${port}`

await page.goto(base)
await page.waitForTimeout(3000)
const bodyText = await page.evaluate(() => document.body.innerText)
console.log('=== APP INITIAL STATE ===')
check('App loads without errors', !bodyText.includes('Error'))
check('Nav: Today visible', bodyText.includes('Today'))
check('Nav: Playbook visible', bodyText.includes('Playbook'))
check('Nav: Search visible', bodyText.includes('Search'))
check('Nav: No Team item', !bodyText.match(/\bTeam\b.*\n/))
check('Sidebar: Direct Reports shown', bodyText.includes('Nic Daantos'))

console.log('\n=== FLOW 1: Search Page ===')
await page.goto(`${base}/#/search`)
await page.waitForTimeout(1500)
const searchInput = await page.$('input[placeholder*="Search"]')
check('Search input exists', !!searchInput)
await searchInput.fill('Jane')
await page.waitForTimeout(500)
const afterJane = await page.evaluate(() => document.body.innerText)
check('Jane Smith found in results', afterJane.includes('Jane Smith'))

console.log('\n=== FLOW 2: ?q= Param Prefill ===')
await page.goto(`${base}/#/search?q=Bob%20External`)
await page.waitForTimeout(1500)
const qVal = await page.evaluate(() => document.querySelector('input[placeholder*="Search"]')?.value)
check('Search prefilled with Bob External', qVal === 'Bob External')
const bobResults = await page.evaluate(() => document.body.innerText)
check('Bob results shown', bobResults.includes('Bob External'))

console.log('\n=== FLOW 3: ?q= Param Update (existing query) ===')
await page.goto(`${base}/#/search`)
await page.waitForTimeout(1000)
const input3 = await page.$('input[placeholder*="Search"]')
await input3.fill('something random')
await page.waitForTimeout(300)
await page.goto(`${base}/#/search?q=Jane%20Smith`)
await page.waitForTimeout(1500)
const qVal3 = await page.evaluate(() => document.querySelector('input[placeholder*="Search"]')?.value)
check('Query updated from old to Jane Smith', qVal3 === 'Jane Smith')

console.log('\n=== FLOW 4: ?meeting= Inline Viewer ===')
await page.goto(`${base}/#/search?meeting=2026-03-20-nic-1-1.md`)
await page.waitForTimeout(2000)
const hasCloseBtn = await page.evaluate(() => !!document.querySelector('button[aria-label="Close"]'))
check('Inline meeting viewer opens', hasCloseBtn)
const viewerText = await page.evaluate(() => document.body.innerText)
check('Meeting title visible', viewerText.includes('Nic'))

console.log('\n=== FLOW 5: People Content Click \u2192 In-Place Update ===')
await page.goto(`${base}/#/search`)
await page.waitForTimeout(1000)
const input5 = await page.$('input[placeholder*="Search"]')
await input5.fill('Jane')
await page.waitForTimeout(500)
const clicked5 = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'))
  const contentBtn = buttons.find(b => b.textContent?.includes('content') && b.textContent?.includes('Jane'))
  if (contentBtn) { contentBtn.click(); return true }
  return false
})
check('Found and clicked Jane content result', clicked5)
await page.waitForTimeout(500)
check('Still on search page', page.url().includes(String(port)))
const inputVal5 = await page.evaluate(() => document.querySelector('input[placeholder*="Search"]')?.value)
check('Query updated to jane smith', inputVal5?.toLowerCase().includes('jane'))

console.log('\n=== FLOW 6: Notes Search ===')
await page.goto(`${base}/#/search`)
await page.waitForTimeout(1000)
const input6 = await page.$('input[placeholder*="Search"]')
await input6.fill('priorities')
await page.waitForTimeout(500)
const notesResults = await page.evaluate(() => document.body.innerText)
check('Priorities note found in search', notesResults.includes('Priorities'))
check('Note snippet visible', notesResults.includes('Ship the new search'))

console.log('\n=== FLOW 7: Notes Click \u2192 Inline Viewer ===')
const clickedNote = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'))
  const noteBtn = buttons.find(b => b.textContent?.includes('Priorities') && b.textContent?.includes('content'))
  if (noteBtn) { noteBtn.click(); return true }
  return false
})
check('Found and clicked Priorities note', clickedNote)
await page.waitForTimeout(1500)
const noteViewer = await page.evaluate(() => !!document.querySelector('button[aria-label="Close"]'))
check('Note opens in inline viewer', noteViewer)

console.log('\n=== RESULTS ===')
console.log(`Passed: ${passed}/${passed + failed}`)
console.log(`Failed: ${failed}`)
console.log(failed === 0 ? 'ALL TESTS PASS \u2705' : 'SOME TESTS FAILED \u274c')

await browser.close()
server.close()
process.exit(failed > 0 ? 1 : 0)
