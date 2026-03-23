import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createFixtureRepo, createMinimalFixtureRepo, type FixtureRepo } from '../helpers/fixtures'

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
    aiCustomInstructions: ''
  }),
  setToken: vi.fn(),
  getToken: () => 'fake-token',
  saveSettings: vi.fn(),
  getSettingsForRenderer: vi.fn()
}))

import {
  getReports,
  getReportData,
  getReportProfile,
  listMeetings,
  listRawTranscripts,
  listPeople,
  getPersonMeetings,
  findPersonByName,
  searchContent,
  getTeamOverview,
  getTeamActionItems,
  getTeamPriorities,
  getImpactLog,
  getSettingsOptions,
  getFileContent,
  fileExists,
  clearAllCaches
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
    })

    it('includes dashboard content', () => {
      const data = getReportData('alice')
      expect(data.dashboard).toContain('On Track')
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

  describe('listMeetings', () => {
    it('returns all meeting files', () => {
      const meetings = listMeetings()
      expect(meetings.length).toBe(4)
    })

    it('sorts meetings by date descending', () => {
      const meetings = listMeetings()
      for (let i = 1; i < meetings.length; i++) {
        expect(meetings[i - 1].date >= meetings[i].date).toBe(true)
      }
    })

    it('extracts title from YAML frontmatter', () => {
      const meetings = listMeetings()
      const alice11 = meetings.find(m => m.filename === '2026-03-11-alice-1-1.md')
      expect(alice11?.title).toBe('Alice 1:1')
    })

    it('derives title from filename when no frontmatter', () => {
      const meetings = listMeetings()
      const alice04 = meetings.find(m => m.filename === '2026-03-04-alice-1-1.md')
      expect(alice04?.title).toBe('Alice 1-1')
    })
  })

  describe('listRawTranscripts', () => {
    it('returns files from transcripts/raw/', () => {
      const transcripts = listRawTranscripts()
      expect(transcripts.length).toBe(2)
    })

    it('includes both .txt and .md files', () => {
      const transcripts = listRawTranscripts()
      const filenames = transcripts.map(t => t.filename)
      expect(filenames).toContain('2026-03-15-alice-1-1.txt')
      expect(filenames).toContain('2026-03-15-retro.md')
    })

    it('sorts by date descending', () => {
      const transcripts = listRawTranscripts()
      for (let i = 1; i < transcripts.length; i++) {
        expect(transcripts[i - 1].date >= transcripts[i].date).toBe(true)
      }
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
      const alice = people.find(p => p.slug === 'alice-smith')!
      expect(alice.role).toBe('Senior Engineer')
      expect(alice.github).toBe('alicesmith')
      expect(alice.location).toBe('San Francisco')
      expect(alice.relationship).toBe('Direct Report')
    })

    it('parses aliases', () => {
      const people = listPeople()
      const alice = people.find(p => p.slug === 'alice-smith')!
      expect(alice.aliases).toContain('Ali')

      const bob = people.find(p => p.slug === 'bob-jones')!
      expect(bob.aliases).toContain('Bobby')
      expect(bob.aliases).toContain('Robert')
    })

    it('counts meetings per person', () => {
      const people = listPeople()
      const alice = people.find(p => p.slug === 'alice-smith')!
      // alice-1-1 x2 + team-standup (speaker match) = 3
      expect(alice.meetingCount).toBeGreaterThanOrEqual(2)

      const bob = people.find(p => p.slug === 'bob-jones')!
      // bob-1-1 + team-standup (speaker match) = 2
      expect(bob.meetingCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('searchContent', () => {
    it('finds content in meeting files', () => {
      const results = searchContent('platform migration')
      expect(results.length).toBeGreaterThanOrEqual(1)
      const meetingResult = results.find(r => r.directory === 'meetings')
      expect(meetingResult).toBeDefined()
    })

    it('finds content in report files', () => {
      const results = searchContent('strong technical leader')
      expect(results.length).toBeGreaterThanOrEqual(1)
      const reportResult = results.find(r => r.directory === 'reports')
      expect(reportResult).toBeDefined()
    })

    it('finds content in people files', () => {
      const results = searchContent('Platform team')
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
      const results = searchContent('migration')
      const hit = results[0]
      expect(hit.snippet.length).toBeGreaterThan(0)
    })

    it('searches weekly-log files', () => {
      const results = searchContent('Q2 roadmap')
      const noteResult = results.find(r => r.directory === 'notes')
      expect(noteResult).toBeDefined()
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

    it('meetings cache persists across calls', () => {
      listMeetings()
      const t0 = performance.now()
      listMeetings()
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
      listMeetings()
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

  describe('getPersonMeetings', () => {
    it('returns meetings for a person by filename match', () => {
      const meetings = getPersonMeetings('alice-smith')
      const filenames = meetings.map(m => m.filename)
      expect(filenames).toContain('2026-03-11-alice-1-1.md')
      expect(filenames).toContain('2026-03-04-alice-1-1.md')
    })

    it('includes speaker-matched meetings', () => {
      const meetings = getPersonMeetings('alice-smith')
      const filenames = meetings.map(m => m.filename)
      expect(filenames).toContain('2026-03-12-team-standup.md')
    })

    it('sorts by date descending', () => {
      const meetings = getPersonMeetings('alice-smith')
      for (let i = 1; i < meetings.length; i++) {
        expect(meetings[i - 1].date >= meetings[i].date).toBe(true)
      }
    })
  })

  describe('findPersonByName', () => {
    it('finds person by exact name', () => {
      expect(findPersonByName('Alice Smith')).toBe('alice-smith')
    })

    it('finds person by alias', () => {
      expect(findPersonByName('Ali')).toBe('alice-smith')
      expect(findPersonByName('Bobby')).toBe('bob-jones')
    })

    it('finds person by first name', () => {
      expect(findPersonByName('Alice')).toBe('alice-smith')
      expect(findPersonByName('Bob')).toBe('bob-jones')
    })

    it('returns null for unknown person', () => {
      expect(findPersonByName('Charlie Unknown')).toBeNull()
    })

    it('strips parenthetical suffixes', () => {
      expect(findPersonByName('Alice Smith (Senior Engineer)')).toBe('alice-smith')
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

  describe('getTeamPriorities', () => {
    it('returns priorities for all reports', () => {
      const priorities = getTeamPriorities()
      expect(priorities.length).toBe(2)
      const names = priorities.map(p => p.reportName)
      expect(names).toContain('alice')
      expect(names).toContain('bob')
    })
  })

  describe('edge cases', () => {
    it('handles missing meetings directory gracefully', () => {
      const minFixture = createMinimalFixtureRepo()
      const { rmSync } = require('fs')
      const { join } = require('path')
      rmSync(join(minFixture.dir, 'meetings'), { recursive: true, force: true })
      setRepoPath(minFixture.dir)
      clearAllCaches()

      const meetings = listMeetings()
      expect(meetings).toEqual([])

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
      expect(people).toEqual([])

      setRepoPath(fixture.dir)
      clearAllCaches()
      minFixture.cleanup()
    })

    it('handles missing transcripts/raw directory gracefully', () => {
      const minFixture = createMinimalFixtureRepo()
      const { rmSync } = require('fs')
      const { join } = require('path')
      rmSync(join(minFixture.dir, 'transcripts'), { recursive: true, force: true })
      setRepoPath(minFixture.dir)
      clearAllCaches()

      const transcripts = listRawTranscripts()
      expect(transcripts).toEqual([])

      setRepoPath(fixture.dir)
      clearAllCaches()
      minFixture.cleanup()
    })
  })
})
