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
  window.__qaCalls = { commitFile: [], aiGenerate: [], toggleActionItem: [] }
  window.api = {
    getAuthStatus: () => Promise.resolve({ authenticated: true }),
    getSettings: () => Promise.resolve({
      hasToken: true, repoPath: '/tmp/test', repoOwner: 't', repoName: 't',
      defaultModel: 'gpt-4.1', checkInFrequency: 'monthly', feedbackReminderDays: 14,
      sprintLengthWeeks: 2, endOfWeekDay: 'friday', sprintStartDate: '2026-01-05',
      staleActionDays: 5, aiCustomInstructions: '',
      disabledPractices: [], snoozedPractices: {}, customPractices: [],
      practiceCompletions: {}, snoozedActionItems: {}
    }),
    saveSettings: () => Promise.resolve(),
    getReports: () => Promise.resolve(['nic-daantos']),
    getReportProfile: () => Promise.resolve({ name: 'Nic Daantos', displayName: 'Nic Daantos', role: 'Engineer', meetingDay: 'Tuesday', github: 'nicdaantos', location: 'North Carolina', timezone: 'ET' }),
    getTeamOverview: () => Promise.resolve({
      reports: [{ name: 'nic-daantos', displayName: 'Nic Daantos', meetingDay: 'Tuesday', lastOneOnOne: '2026-03-18', daysGap: 5, openActionItems: 2, status: 'ok', lastCheckIn: '2026-03', lastFeedback: '2026-03-10' }],
      attentionItems: [], lastUpdated: new Date().toISOString()
    }),
    listMeetings: () => Promise.resolve([
      { date: '2026-03-18', title: 'Nic 1-1', filename: '2026-03-18-nic-1-1.md', processed: true },
      { date: '2026-03-11', title: 'Nic 1-1', filename: '2026-03-11-nic-1-1.md', processed: true }
    ]),
    getTeamActionItems: () => Promise.resolve([]),
    getTeamPriorities: () => Promise.resolve([]),
    clearCaches: () => Promise.resolve(),
    getReportData: (name) => Promise.resolve({
      profile: { name: 'nic-daantos', displayName: 'Nic Daantos', role: 'Software Engineer', meetingDay: 'Tuesday', github: 'nicdaantos', location: 'North Carolina', timezone: 'ET' },
      checkIns: [{ date: '2026-03-01', content: 'Monthly check-in content', accomplishments: 'Shipped feature X', concerns: '' }],
      summaries: [
        { date: '2026-03-18', content: 'Discussed sprint progress', keyTopics: ['Sprint', 'Velocity'], actionItems: [{ text: 'Review PR #42', owner: 'Nic', completed: false }], sentiment: 'positive' },
        { date: '2026-03-11', content: 'Discussed roadmap', keyTopics: ['Roadmap'], actionItems: [], sentiment: 'neutral' }
      ],
      transcripts: [{ date: '2026-03-18', content: '...' }],
      actionItems: [
        { text: 'Review PR #42', owner: 'Nic', completed: false, sourceFile: 'meetings/2026-03-18-nic-1-1.md', sourceLine: '- [ ] Review PR #42', sourceLineNumber: 5 },
        { text: 'Update docs', owner: 'Nic', completed: true, sourceFile: 'meetings/2026-03-11-nic-1-1.md', sourceLine: '- [x] Update docs', sourceLineNumber: 8 }
      ],
      feedback: [
        { date: '2026-03-10', type: 'positive', source: '1:1', context: '', content: 'Nic handled the incident response really well.' },
        { date: '2026-02-15', type: 'constructive', source: 'observation', context: '', content: 'Could improve PR descriptions.' }
      ],
      reviews: [],
      jobExpectations: 'Deliver features on time, mentor juniors.'
    }),
    getFileContent: (p) => {
      if (p.includes('feedback/log.md')) return Promise.resolve('# Feedback Log\n\n### 2026-03-10 — Positive\n**Source:** 1:1\n**Context:**\n> Nic handled the incident well.\n')
      return Promise.resolve('# Meeting Notes\n\nSome content')
    },
    getImpactLog: () => Promise.resolve(''),
    commitFile: (p, content, msg) => { window.__qaCalls.commitFile.push({ path: p, content, msg }); return Promise.resolve() },
    toggleActionItem: (sf, sl) => { window.__qaCalls.toggleActionItem.push({ sf, sl }); return Promise.resolve(true) },
    aiGenerate: (action, context, onChunk) => {
      window.__qaCalls.aiGenerate.push({ action, context })
      const text = action === 'prep-one-on-one' ? '# Prep\n\n- [ ] Ask about workload' : action === 'generate-checkin' ? '# Check-in\n\nGood month.' : 'OK'
      if (typeof onChunk === 'function') { onChunk(text) }
      return Promise.resolve(text)
    },
    aiCancel: () => Promise.resolve(),
    listPeople: () => Promise.resolve([]),
    searchContent: () => Promise.resolve([]),
    getSettingsOptions: () => Promise.resolve({ roles: [], relationships: [] }),
    saveMeetingTitle: () => Promise.resolve(),
    saveReportPriorities: () => Promise.resolve(),
    cancelBackfill: () => Promise.resolve(),
    backfillSummaries: () => Promise.resolve(),
    getPersonMeetings: () => Promise.resolve([]),
    findPersonByName: () => Promise.resolve(null),
    showOpenDialog: () => Promise.resolve({ filePaths: [] }),
    onBackfillProgress: noop, onPushStatus: noop, onAiToolStatus: noop, onNavigate: noop,
    preWarmCaches: () => Promise.resolve(),
    startAuth: () => Promise.resolve(), pollAuth: () => Promise.resolve(), logout: () => Promise.resolve(),
  }
})

const base = `http://localhost:${port}`

console.log('=== PERSON VIEW: PAGE LOAD ===')
await page.goto(`${base}/#/report/nic-daantos`)
await page.waitForTimeout(2500)
const bodyText = await page.evaluate(() => document.body.innerText)
check('Person page loads', bodyText.includes('Nic Daantos'))
check('Role visible', bodyText.includes('Software Engineer') || bodyText.includes('Engineer'))
check('GitHub handle visible', bodyText.includes('nicdaantos'))
check('Location visible', bodyText.includes('North Carolina'))
check('Timezone visible', bodyText.includes('ET'))

console.log('\n=== PERSON VIEW: KEY FACTS BAR ===')
// Key fact labels use CSS uppercase, so innerText returns LAST 1:1, NEXT 1:1, etc.
check('Last 1:1 metric visible', bodyText.includes('LAST 1:1') || bodyText.includes('Last 1:1'))
check('Next 1:1 metric visible', bodyText.includes('NEXT 1:1') || bodyText.includes('Next 1:1'))
check('Open actions metric visible', bodyText.includes('OPEN ACTIONS') || bodyText.includes('Open actions'))
check('No health indicator dot', !(await page.evaluate(() => {
  const dots = document.querySelectorAll('[class*="rounded-full"][class*="bg-green"], [class*="rounded-full"][class*="bg-yellow"], [class*="rounded-full"][class*="bg-red"]')
  return Array.from(dots).some(d => d.getBoundingClientRect().width < 20 && d.getBoundingClientRect().height < 20)
})))

console.log('\n=== PERSON VIEW: UNIFIED STREAM ===')
// Meeting entries show as "1:1 meeting — <date>" with keyTopics as preview (e.g. "Sprint, Velocity")
check('Meeting summary visible', bodyText.includes('1:1 meeting') || bodyText.includes('Sprint'))
check('Feedback entry visible', bodyText.includes('incident'))
check('Action item visible', bodyText.includes('Review PR'))
check('Check-in visible', bodyText.includes('check-in') || bodyText.includes('Check-in'))

console.log('\n=== PERSON VIEW: FILTER TAGS ===')
const filterTags = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'))
  return buttons.map(b => b.textContent?.trim()).filter(t => t && (t.includes('All') || t.includes('1:1') || t.includes('Feedback') || t.includes('Action') || t.includes('Check-in')))
})
check('Filter tags exist', filterTags.length >= 3)
check('All filter visible', filterTags.some(t => t.includes('All')))
check('Feedback filter visible', filterTags.some(t => t.includes('Feedback')))
check('Actions filter visible', filterTags.some(t => t.includes('Action')))

console.log('\n=== PERSON VIEW: FILTER PRESELECT ===')
await page.goto(`${base}/#/report/nic-daantos?filter=feedback`)
await page.waitForTimeout(2000)
const feedbackBody = await page.evaluate(() => document.body.innerText)
check('?filter=feedback preselects feedback', feedbackBody.includes('incident'))

console.log('\n=== PERSON VIEW: QUICK ACTIONS ===')
const quickActions = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'))
  return btns.map(b => b.textContent?.trim()).filter(t => t && (t.includes('Prep') || t.includes('Check-in') || t.includes('Feedback') || t.includes('Review')))
})
check('Quick actions visible', quickActions.length >= 2)

console.log('\n=== PERSON VIEW: OPEN ACTIONS PINNED ===')
await page.goto(`${base}/#/report/nic-daantos?filter=feedback`)
await page.waitForTimeout(2000)
const pinnedActionVisible = await page.evaluate(() => {
  return document.body.innerText.includes('Review PR')
})
check('Open action pinned even with feedback filter', pinnedActionVisible)

console.log('\n=== RESULTS ===')
console.log(`Passed: ${passed}/${passed + failed}`)
console.log(`Failed: ${failed}`)
console.log(failed === 0 ? 'ALL TESTS PASS ✅' : 'SOME TESTS FAILED ❌')

await browser.close()
server.close()
process.exit(failed > 0 ? 1 : 0)
