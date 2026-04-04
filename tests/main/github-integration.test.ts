import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createFixtureRepo, createMinimalFixtureRepo, type FixtureRepo } from '../helpers/fixtures'
import { join } from 'path'
import { writeFileSync } from 'fs'

// Module-level variable captured by the vi.mock closure by reference.
// Updating this variable changes what getSettings().repoPath returns.
let _testRepoPath = ''

vi.mock('../../src/main/store', () => ({
  getSettings: () => ({
    repoPath: _testRepoPath,
    repoOwner: '',
    repoName: '',
    githubToken: 'fake',
    defaultModel: 'gpt-4.1',
    aiCustomInstructions: '',
    userName: 'Mike Crittenden',
    userGithub: ''
  }),
  setToken: vi.fn(),
  getToken: () => 'fake-token',
  saveSettings: vi.fn(),
  getSettingsForRenderer: vi.fn()
}))

import {
  createReport,
  getReports,
  getReportData,
  getReportProfile,
  listContexts,
  listPeople,
  getPersonContexts,
  findPersonByName,
  searchContent,
  getTeamOverview,
  getTeamActionItems,
  getImpactLog,
  getSettingsOptions,
  getFileContent,
  fileExists,
  clearAllCaches,
  getTodayBootstrap,
  preWarmCaches,
  isPrewarmComplete
} from '../../src/main/github'

function setRepoPath(p: string) {
  _testRepoPath = p
}

describe('github.ts integration tests', () => {
  let fixture: FixtureRepo

  beforeAll(() => {
    fixture = createFixtureRepo()
    setRepoPath(fixture.dir)
  })

  afterAll(() => {
    fixture.cleanup()
  })

  beforeEach(() => {
    clearAllCaches()
  })

  describe('getReports', () => {
    it('returns directories that have profile.md', () => {
      const reports = getReports()
      expect(reports).toContain('alice')
      expect(reports).toContain('bob')
    })

    it('excludes _template directory', () => {
      const reports = getReports()
      expect(reports).not.toContain('_template')
    })

    it('excludes directories without profile.md', () => {
      const { mkdirSync } = require('fs')
      const { join } = require('path')
      mkdirSync(join(fixture.dir, 'reports', 'empty-report'), { recursive: true })
      clearAllCaches()
      const reports = getReports()
      expect(reports).not.toContain('empty-report')
    })

    it('excludes hidden directories', () => {
      const { mkdirSync, writeFileSync } = require('fs')
      const { join } = require('path')
      mkdirSync(join(fixture.dir, 'reports', '.hidden'), { recursive: true })
      writeFileSync(join(fixture.dir, 'reports', '.hidden', 'profile.md'), '# Hidden')
      clearAllCaches()
      const reports = getReports()
      expect(reports).not.toContain('.hidden')
    })
  })

  describe('getReportData', () => {
    it('returns full report data for alice', () => {
      const data = getReportData('alice')
      expect(data.name).toBe('alice')
      expect(data.profile.displayName).toBe('Alice Smith')
      expect(data.profile.role).toBe('Senior Engineer')
      expect(data.profile.team).toBe('Platform')
      expect(data.profile.github).toBe('alicesmith')
    })

    it('includes check-ins', () => {
      const data = getReportData('alice')
      expect(data.checkIns.length).toBe(2)
      expect(data.checkIns[0].date).toBe('2026-01')
      expect(data.checkIns[1].date).toBe('2026-02')
    })

    it('includes feedback entries', () => {
      const data = getReportData('alice')
      expect(data.feedback.length).toBe(2)
      expect(data.feedback[0].type).toBe('positive')
      expect(data.feedback[1].type).toBe('constructive')
    })

    it('includes action items from meeting summaries', () => {
      const data = getReportData('alice')
      const openItems = data.actionItems.filter(i => !i.completed)
      const completedItems = data.actionItems.filter(i => i.completed)
      expect(openItems.length).toBeGreaterThanOrEqual(2)
      expect(completedItems.length).toBeGreaterThanOrEqual(1)
    })

    it('includes reviews', () => {
      const data = getReportData('alice')
      expect(data.reviews.length).toBe(1)
      expect(data.reviews[0].period).toBe('2025-H2')
      expect(data.reviews[0].content).toContain('Performance Review')
    })

    it('includes job expectations', () => {
      const data = getReportData('alice')
      expect(data.jobExpectations).toContain('Senior Engineer Expectations')
    })

    it('works for minimal report (bob)', () => {
      const data = getReportData('bob')
      expect(data.name).toBe('bob')
      expect(data.profile.role).toBe('Software Engineer')
      expect(data.checkIns.length).toBe(0)
      expect(data.feedback.length).toBe(0)
    })

    it('caches results on second call', () => {
      getReportData('alice')
      const t0 = performance.now()
      getReportData('alice')
      const elapsed = performance.now() - t0
      expect(elapsed).toBeLessThan(5) // cached should be <1ms
    })
  })

  describe('getReportProfile', () => {
    it('parses profile fields correctly', () => {
      const profile = getReportProfile('alice')
      expect(profile.displayName).toBe('Alice Smith')
      expect(profile.meetingDay).toBe('Tuesday')
      expect(profile.location).toBe('San Francisco')
      expect(profile.timezone).toBe('America/Los_Angeles')
      expect(profile.manager).toBe('Mike')
    })

    it('parses communication preferences', () => {
      const profile = getReportProfile('alice')
      expect(profile.communicationPreferences['Preferred channel']).toBe('Slack DM')
      expect(profile.communicationPreferences['Meeting style']).toBe('Agenda-driven')
    })

    it('parses about section', () => {
      const profile = getReportProfile('alice')
      expect(profile.about).toContain('strong technical leader')
    })
  })

  describe('listContexts', () => {
    it('returns all context files', () => {
      const contexts = listContexts()
      expect(contexts.length).toBe(4)
    })

    it('sorts context entries by date descending', () => {
      const contexts = listContexts()
      for (let i = 1; i < contexts.length; i++) {
        expect(contexts[i - 1].date >= contexts[i].date).toBe(true)
      }
    })

    it('extracts title from YAML frontmatter', () => {
      const contexts = listContexts()
      const alice11 = contexts.find(m => m.filename === '2026-03-11-alice-1-1.md')
      expect(alice11?.title).toBe('Alice 1:1')
    })

    it('preserves source metadata for context entries', () => {
      const contexts = listContexts()
      const alice11 = contexts.find(m => m.filename === '2026-03-11-alice-1-1.md')
      expect(alice11?.source).toBe('meeting')
    })

    it('derives title from filename when no frontmatter', () => {
      const contexts = listContexts()
      const alice04 = contexts.find(m => m.filename === '2026-03-04-alice-1-1.md')
      expect(alice04?.title).toBe('Alice 1-1')
    })
  })

  describe('listPeople', () => {
    it('returns all people from people/ directory', () => {
      const people = listPeople()
      expect(people.length).toBe(2)
      const names = people.map(p => p.name)
      expect(names).toContain('Alice Smith')
      expect(names).toContain('Bob Jones')
    })

    it('parses YAML frontmatter fields', () => {
      const people = listPeople()
      const alice = people.find(p => p.name === 'Alice Smith')!
      expect(alice.role).toBe('Senior Engineer')
      expect(alice.github).toBe('alicesmith')
      expect(alice.location).toBe('San Francisco')
      expect(alice.relationship).toBe('Direct Report')
    })

    it('parses aliases', () => {
      const people = listPeople()
      const alice = people.find(p => p.name === 'Alice Smith')!
      expect(alice.aliases).toContain('Ali')

      const bob = people.find(p => p.name === 'Bob Jones')!
      expect(bob.aliases).toContain('Bobby')
      expect(bob.aliases).toContain('Robert')
    })

    it('counts meetings per person', () => {
      const people = listPeople()
      const alice = people.find(p => p.name === 'Alice Smith')!
      // alice-1-1 x2 + team-standup (speaker match) = 3
      expect(alice.meetingCount).toBeGreaterThanOrEqual(2)

      const bob = people.find(p => p.name === 'Bob Jones')!
      // bob-1-1 + team-standup (speaker match) = 2
      expect(bob.meetingCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('searchContent', () => {
    it('finds meetings by title', () => {
      const results = searchContent('alice 1:1')
      expect(results.length).toBeGreaterThanOrEqual(1)
      const meetingResult = results.find(r => r.directory === 'contexts')
      expect(meetingResult).toBeDefined()
      expect(meetingResult?.source).toBe('meeting')
    })

    it('includes context source metadata on context matches', () => {
      const results = searchContent('standup')
      const contextResult = results.find(r => r.directory === 'contexts')
      expect(contextResult).toBeDefined()
      expect(contextResult?.source).toBeDefined()
    })

    it('refreshes cached context source after an external file edit', () => {
      const target = join(fixture.dir, 'contexts', '2026-03-11-alice-1-1.md')

      const initial = searchContent('alice 1:1')
      expect(initial.find(r => r.filename === '2026-03-11-alice-1-1.md')?.source).toBe('meeting')

      writeFileSync(target, `---
date: 2026-03-11
source: other
title: Alice 1:1
people:
  - alice-smith
speakers:
  - Mike Crittenden
  - Alice Smith
---

# Alice 1:1 - March 11

## Topics
- Platform migration status
- Q2 planning
`, 'utf-8')

      const refreshed = searchContent('alice 1:1')
      expect(refreshed.find(r => r.filename === '2026-03-11-alice-1-1.md')?.source).toBe('other')
      expect(listContexts().find(r => r.filename === '2026-03-11-alice-1-1.md')?.source).toBe('other')

      writeFileSync(target, `---
date: 2026-03-11
source: meeting
title: Alice 1:1
people:
  - alice-smith
speakers:
  - Mike Crittenden
  - Alice Smith
---

# Alice 1:1 - March 11

## Topics
- Platform migration status
- Q2 planning

## Action Items
- [ ] **Alice**: Update migration docs by Friday
- [ ] **Mike**: Schedule skip-level with Alice's team
- [x] **Alice**: Send Q1 metrics summary
`, 'utf-8')
    })

    it('finds reports by name', () => {
      const results = searchContent('alice')
      expect(results.length).toBeGreaterThanOrEqual(1)
      const reportResult = results.find(r => r.directory === 'reports')
      expect(reportResult).toBeDefined()
    })

    it('finds people by name and role', () => {
      const results = searchContent('Senior Engineer')
      const peopleResult = results.find(r => r.directory === 'people')
      expect(peopleResult).toBeDefined()
    })

    it('returns empty array for empty query', () => {
      expect(searchContent('')).toEqual([])
      expect(searchContent('   ')).toEqual([])
    })

    it('is case-insensitive', () => {
      const upper = searchContent('ALICE')
      const lower = searchContent('alice')
      expect(upper.length).toBe(lower.length)
    })

    it('includes snippet with context', () => {
      const results = searchContent('standup')
      const hit = results[0]
      expect(hit).toBeDefined()
      expect(hit.snippet.length).toBeGreaterThan(0)
    })

    it('finds people by alias', () => {
      const results = searchContent('Bobby')
      const peopleResult = results.find(r => r.directory === 'people')
      expect(peopleResult).toBeDefined()
    })
  })

  describe('getTeamOverview', () => {
    it('returns overview for all reports', () => {
      const overview = getTeamOverview()
      expect(overview.reports.length).toBe(2)
    })

    it('includes correct display names', () => {
      const overview = getTeamOverview()
      const names = overview.reports.map(r => r.displayName)
      expect(names).toContain('Alice Smith')
      expect(names).toContain('Bob Jones')
    })

    it('includes lastUpdated timestamp', () => {
      const overview = getTeamOverview()
      expect(overview.lastUpdated).toBeTruthy()
      expect(new Date(overview.lastUpdated).getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('calculates feedback counts', () => {
      const overview = getTeamOverview()
      const alice = overview.reports.find(r => r.name === 'alice')!
      expect(alice.feedbackCount).toBe(2)

      const bob = overview.reports.find(r => r.name === 'bob')!
      expect(bob.feedbackCount).toBe(0)
    })

    it('caches overview on second call', () => {
      getTeamOverview()
      const t0 = performance.now()
      getTeamOverview()
      const elapsed = performance.now() - t0
      expect(elapsed).toBeLessThan(5)
    })
  })

  describe('cache behavior', () => {
    it('clearAllCaches forces data reload', () => {
      const first = getTeamOverview()
      clearAllCaches()
      const second = getTeamOverview()
      expect(second.lastUpdated).not.toBe(first.lastUpdated)
    })

    it('contexts cache persists across calls', () => {
      listContexts()
      const t0 = performance.now()
      listContexts()
      const elapsed = performance.now() - t0
      expect(elapsed).toBeLessThan(5)
    })

    it('people cache persists across calls', () => {
      listPeople()
      const t0 = performance.now()
      listPeople()
      const elapsed = performance.now() - t0
      expect(elapsed).toBeLessThan(5)
    })

    it('clearAllCaches invalidates all caches', () => {
      listContexts()
      listPeople()
      getTeamOverview()
      getReportData('alice')

      clearAllCaches()

      const overview1 = getTeamOverview()
      clearAllCaches()
      const overview2 = getTeamOverview()
      expect(overview2.lastUpdated).not.toBe(overview1.lastUpdated)
    })
  })

  describe('safePath traversal protection', () => {
    it('allows reading files within repo', () => {
      const content = getFileContent('settings.md')
      expect(content).toContain('Roles')
    })

    it('blocks path traversal with ../', () => {
      expect(() => getFileContent('../../../etc/passwd')).toThrow('Path traversal blocked')
    })

    it('blocks absolute path escape', () => {
      expect(() => getFileContent('/etc/passwd')).toThrow()
    })

    it('fileExists returns true for existing files', () => {
      expect(fileExists('settings.md')).toBe(true)
    })

    it('fileExists returns false for non-existent files', () => {
      expect(fileExists('nonexistent.md')).toBe(false)
    })
  })

  describe('getPersonContexts', () => {
    it('returns meetings for a person by filename match', () => {
      const meetings = getPersonContexts('alice-smith')
      const filenames = meetings.map(m => m.filename)
      expect(filenames).toContain('2026-03-11-alice-1-1.md')
      expect(filenames).toContain('2026-03-04-alice-1-1.md')
    })

    it('includes speaker-matched meetings', () => {
      const meetings = getPersonContexts('alice-smith')
      const filenames = meetings.map(m => m.filename)
      expect(filenames).toContain('2026-03-12-team-standup.md')
    })

    it('sorts by date descending', () => {
      const meetings = getPersonContexts('alice-smith')
      for (let i = 1; i < meetings.length; i++) {
        expect(meetings[i - 1].date >= meetings[i].date).toBe(true)
      }
    })
  })

  describe('findPersonByName', () => {
    it('finds person by exact name', () => {
      expect(findPersonByName('Alice Smith')).toBe('alice')
    })

    it('finds person by alias', () => {
      expect(findPersonByName('Ali')).toBe('alice')
      expect(findPersonByName('Bobby')).toBe('bob')
    })

    it('does not match by first name alone', () => {
      expect(findPersonByName('Alice')).toBeNull()
      expect(findPersonByName('Bob')).toBeNull()
    })

    it('returns null for unknown person', () => {
      expect(findPersonByName('Charlie Unknown')).toBeNull()
    })

    it('strips parenthetical suffixes', () => {
      expect(findPersonByName('Alice Smith (Senior Engineer)')).toBe('alice')
    })

    it('does not confuse people who share a first name', async () => {
      await createReport('Aaron Cathcart')
      await createReport('Aaron Waggener')
      clearAllCaches()

      expect(findPersonByName('Aaron Cathcart')).toBe('aaron-cathcart')
      expect(findPersonByName('Aaron Waggener')).toBe('aaron-waggener')
      expect(findPersonByName('Aaron')).toBeNull()
    })
  })

  describe('getSettingsOptions', () => {
    it('parses roles from settings.md', () => {
      const opts = getSettingsOptions()
      expect(opts.roles).toContain('Software Engineer')
      expect(opts.roles).toContain('Senior Engineer')
      expect(opts.roles).toContain('Staff Engineer')
      expect(opts.roles).toContain('Engineering Manager')
    })

    it('parses relationships from settings.md', () => {
      const opts = getSettingsOptions()
      expect(opts.relationships).toContain('Direct Report')
      expect(opts.relationships).toContain('Skip-Level')
      expect(opts.relationships).toContain('Peer')
      expect(opts.relationships).toContain('Stakeholder')
    })
  })

  describe('getImpactLog', () => {
    it('returns impact log content', () => {
      const log = getImpactLog()
      expect(log).toContain('Impact Log')
      expect(log).toContain('Team Process Improvement')
      expect(log).toContain('Mentorship')
    })

    it('returns default content when no impact log exists', () => {
      const minFixture = createMinimalFixtureRepo()
      setRepoPath(minFixture.dir)
      clearAllCaches()

      const log = getImpactLog()
      expect(log).toContain('No entries yet')

      setRepoPath(fixture.dir)
      clearAllCaches()
      minFixture.cleanup()
    })
  })

  describe('getTeamActionItems', () => {
    it('returns action items from all reports', () => {
      const items = getTeamActionItems()
      expect(items.length).toBeGreaterThanOrEqual(1)
    })

    it('includes reportName and displayName', () => {
      const items = getTeamActionItems()
      const aliceItem = items.find(i => i.reportName === 'alice')
      if (aliceItem) {
        expect(aliceItem.displayName).toBe('Alice Smith')
      }
    })
  })

  describe('edge cases', () => {
    it('handles missing contexts directory gracefully', () => {
      const minFixture = createMinimalFixtureRepo()
      const { rmSync } = require('fs')
      const { join } = require('path')
      rmSync(join(minFixture.dir, 'contexts'), { recursive: true, force: true })
      setRepoPath(minFixture.dir)
      clearAllCaches()

      const contexts = listContexts()
      expect(contexts).toEqual([])

      setRepoPath(fixture.dir)
      clearAllCaches()
      minFixture.cleanup()
    })

    it('handles missing people directory gracefully', () => {
      const minFixture = createMinimalFixtureRepo()
      const { rmSync } = require('fs')
      const { join } = require('path')
      rmSync(join(minFixture.dir, 'people'), { recursive: true, force: true })
      setRepoPath(minFixture.dir)
      clearAllCaches()

      const people = listPeople()
      // With no people dir, direct reports still appear via report profile merge
      expect(people.length).toBeGreaterThanOrEqual(1)
      expect(people[0].name).toBe('Alice')
      expect(people[0].relationship).toBe('Direct Report')

      setRepoPath(fixture.dir)
      clearAllCaches()
      minFixture.cleanup()
    })
  })

  describe('performance benchmarks', () => {
    it('cold getTodayBootstrap completes under 500ms', () => {
      clearAllCaches()
      const t0 = performance.now()
      const result = getTodayBootstrap()
      const elapsed = performance.now() - t0
      expect(result.contexts.length).toBeGreaterThan(0)
      expect(result.teamActionItems.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(500)
    })

    it('cached getTodayBootstrap completes under 10ms', () => {
      getTodayBootstrap()
      const t0 = performance.now()
      const result = getTodayBootstrap()
      const elapsed = performance.now() - t0
      expect(result.contexts.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(10)
    })

    it('cold getTeamOverview completes under 500ms', () => {
      clearAllCaches()
      const t0 = performance.now()
      const result = getTeamOverview()
      const elapsed = performance.now() - t0
      expect(result.reports.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(500)
    })

    it('cached getTeamOverview completes under 5ms', () => {
      getTeamOverview()
      const t0 = performance.now()
      const result = getTeamOverview()
      const elapsed = performance.now() - t0
      expect(result.reports.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(5)
    })

    it('cached getReportData completes under 5ms', () => {
      getReportData('alice')
      const t0 = performance.now()
      const result = getReportData('alice')
      const elapsed = performance.now() - t0
      expect(result.profile.name).toBeTruthy()
      expect(elapsed).toBeLessThan(5)
    })

    it('cached listPeople completes under 5ms', () => {
      listPeople()
      const t0 = performance.now()
      const result = listPeople()
      const elapsed = performance.now() - t0
      expect(result.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(5)
    })

    it('preWarmCaches completes under 1000ms', async () => {
      clearAllCaches()
      const t0 = performance.now()
      await preWarmCaches()
      const elapsed = performance.now() - t0
      expect(elapsed).toBeLessThan(1000)
    })

    it('marks prewarm complete when repo path is missing', async () => {
      setRepoPath(`${fixture.dir}-missing`)
      clearAllCaches()

      await preWarmCaches()

      expect(isPrewarmComplete()).toBe(true)

      setRepoPath(fixture.dir)
      clearAllCaches()
    })
  })
})
