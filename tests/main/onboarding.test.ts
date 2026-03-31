import { describe, it, expect, afterAll, beforeEach, vi, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

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
  initializeRepo,
  createReport,
  getReports,
  listPeople,
  listMeetings,
  getTeamOverview,
  getReportData,
  searchContent,
  getTeamActionItems,
  clearAllCaches,
  getFileContent
} from '../../src/main/github'

function setRepoPath(p: string) {
  _testRepoPath = p
}

// ── initializeRepo ──

describe('initializeRepo', () => {
  const tempDirs: string[] = []

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'mi-init-test-'))
    tempDirs.push(dir)
    return dir
  }

  afterAll(() => {
    for (const d of tempDirs) {
      try { rmSync(d, { recursive: true, force: true }) } catch {}
    }
  })

  it('creates all required directories', () => {
    const dir = makeTempDir()
    initializeRepo(dir)

    expect(existsSync(join(dir, 'reports'))).toBe(true)
    expect(existsSync(join(dir, 'meetings'))).toBe(true)
    expect(existsSync(join(dir, 'transcripts', 'processed'))).toBe(true)
    expect(existsSync(join(dir, 'people'))).toBe(true)
  })

  it('initializes a git repository', () => {
    const dir = makeTempDir()
    initializeRepo(dir)

    expect(existsSync(join(dir, '.git'))).toBe(true)
  })

  it('is idempotent — safe to call twice', () => {
    const dir = makeTempDir()
    initializeRepo(dir)
    initializeRepo(dir)

    expect(existsSync(join(dir, 'reports'))).toBe(true)
    expect(existsSync(join(dir, '.git'))).toBe(true)
  })

  it('does not re-init git if .git already exists', () => {
    const dir = makeTempDir()
    mkdirSync(join(dir, '.git'), { recursive: true })
    writeFileSync(join(dir, '.git', 'marker'), 'existing')

    initializeRepo(dir)

    expect(readFileSync(join(dir, '.git', 'marker'), 'utf-8')).toBe('existing')
  })

  it('creates directories inside an empty parent', () => {
    const parent = makeTempDir()
    const nested = join(parent, 'my-data-repo')
    mkdirSync(nested)
    initializeRepo(nested)

    expect(existsSync(join(nested, 'reports'))).toBe(true)
    expect(existsSync(join(nested, 'people'))).toBe(true)
  })
})

// ── createReport ──

describe('createReport', () => {
  let repoDir: string

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'mi-create-test-'))
    initializeRepo(repoDir)
    setRepoPath(repoDir)
    clearAllCaches()
  })

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }) } catch {}
  })

  it('creates a report profile.md with correct frontmatter', async () => {
    const slug = await createReport('Alice Smith')
    expect(slug).toBe('alice-smith')

    const profilePath = join(repoDir, 'reports', 'alice-smith', 'profile.md')
    expect(existsSync(profilePath)).toBe(true)

    const content = readFileSync(profilePath, 'utf-8')
    expect(content).toContain('name: alice-smith')
    expect(content).toContain('displayName: Alice Smith')
  })

  it('creates a people profile with Direct Report relationship', async () => {
    await createReport('Bob Jones')

    const peoplePath = join(repoDir, 'people', 'bob-jones.md')
    expect(existsSync(peoplePath)).toBe(true)

    const content = readFileSync(peoplePath, 'utf-8')
    expect(content).toContain('name: Bob Jones')
    expect(content).toContain('slug: bob-jones')
    expect(content).toContain('relationship: Direct Report')
    expect(content).toContain('# Bob Jones')
  })

  it('generates correct slug from display name', async () => {
    expect(await createReport('Jane Doe')).toBe('jane-doe')
    expect(await createReport('Mike O\'Brien')).toBe('mike-obrien')
    expect(await createReport('María García')).toBe('mara-garca')
  })

  it('rejects empty or invalid names', async () => {
    await expect(createReport('')).rejects.toThrow('Invalid name')
    await expect(createReport('!!!')).rejects.toThrow('Invalid name')
    await expect(createReport('   ')).rejects.toThrow('Invalid name')
  })

  it('rejects duplicate report names', async () => {
    await createReport('Alice Smith')
    clearAllCaches()
    await expect(createReport('Alice Smith')).rejects.toThrow('already exists')
  })

  it('is visible to getReports after creation', async () => {
    await createReport('New Person')
    clearAllCaches()

    const reports = getReports()
    expect(reports).toContain('new-person')
  })

  it('is visible to listPeople after creation', async () => {
    await createReport('Chris Lee')
    clearAllCaches()

    const people = listPeople()
    const chris = people.find(p => p.slug === 'chris-lee')
    expect(chris).toBeDefined()
    expect(chris!.name).toBe('Chris Lee')
    expect(chris!.relationship).toBe('Direct Report')
  })

  it('does not overwrite existing people file', async () => {
    const peoplePath = join(repoDir, 'people', 'existing-person.md')
    writeFileSync(peoplePath, '---\nname: Existing Person\nslug: existing-person\ncustom: true\n---\n# Custom\n')

    await createReport('Existing Person')

    const content = readFileSync(peoplePath, 'utf-8')
    expect(content).toContain('custom: true')
  })

  it('report profile has empty fields for user to fill in', async () => {
    await createReport('Test User')

    const profilePath = join(repoDir, 'reports', 'test-user', 'profile.md')
    const content = readFileSync(profilePath, 'utf-8')

    expect(content).toContain('role: ')
    expect(content).toContain('team: ')
    expect(content).toContain('github: ')
    expect(content).toContain('meetingDay: ')
    expect(content).toContain('location: ')
  })

  it('populates profile fields when provided', async () => {
    await createReport('Alice Fields', {
      role: 'Senior Engineer',
      team: 'Platform',
      github: 'alicefields',
      meetingDay: 'Tuesday',
      location: 'San Francisco',
      startDate: '2024-01-15'
    })

    const profilePath = join(repoDir, 'reports', 'alice-fields', 'profile.md')
    const content = readFileSync(profilePath, 'utf-8')

    expect(content).toContain('role: Senior Engineer')
    expect(content).toContain('team: Platform')
    expect(content).toContain('github: alicefields')
    expect(content).toContain('meetingDay: Tuesday')
    expect(content).toContain('location: San Francisco')
    expect(content).toContain('startDate: 2024-01-15')
  })

  it('populates people profile fields when provided', async () => {
    await createReport('Bob Fields', {
      role: 'Staff Engineer',
      github: 'bobfields',
      location: 'New York'
    })

    const peoplePath = join(repoDir, 'people', 'bob-fields.md')
    const content = readFileSync(peoplePath, 'utf-8')

    expect(content).toContain('role: Staff Engineer')
    expect(content).toContain('github: bobfields')
    expect(content).toContain('location: New York')
    expect(content).toContain('relationship: Direct Report')
  })

  it('handles partial fields without error', async () => {
    await createReport('Partial Fields', { role: 'IC', meetingDay: 'Friday' })

    const profilePath = join(repoDir, 'reports', 'partial-fields', 'profile.md')
    const content = readFileSync(profilePath, 'utf-8')

    expect(content).toContain('role: IC')
    expect(content).toContain('meetingDay: Friday')
    expect(content).toContain('team: \n')
    expect(content).toContain('github: \n')
  })

  it('handles empty fields object same as no fields', async () => {
    await createReport('Empty Fields', {})

    const profilePath = join(repoDir, 'reports', 'empty-fields', 'profile.md')
    const content = readFileSync(profilePath, 'utf-8')

    expect(content).toContain('role: \n')
    expect(content).toContain('team: \n')
  })
})

// ── Empty repo behavior ──

describe('empty repo behavior', () => {
  let emptyDir: string

  beforeEach(() => {
    emptyDir = mkdtempSync(join(tmpdir(), 'mi-empty-test-'))
    initializeRepo(emptyDir)
    setRepoPath(emptyDir)
    clearAllCaches()
  })

  afterEach(() => {
    try { rmSync(emptyDir, { recursive: true, force: true }) } catch {}
  })

  it('getReports returns empty array on fresh repo', () => {
    expect(getReports()).toEqual([])
  })

  it('listPeople returns empty array on fresh repo', () => {
    expect(listPeople()).toEqual([])
  })

  it('listMeetings returns empty array on fresh repo', () => {
    expect(listMeetings()).toEqual([])
  })

  it('getTeamOverview returns zero reports on fresh repo', () => {
    const overview = getTeamOverview()
    expect(overview.reports).toEqual([])
    expect(overview.attentionItems).toEqual([])
  })

  it('getTeamActionItems returns empty on fresh repo', () => {
    expect(getTeamActionItems()).toEqual([])
  })

  it('searchContent returns empty on fresh repo', () => {
    expect(searchContent('anything')).toEqual([])
  })

  it('getReportData works after adding first report', async () => {
    await createReport('First Report')
    clearAllCaches()

    const data = getReportData('first-report')
    expect(data.name).toBe('first-report')
    expect(data.profile.displayName).toBe('First Report')
    expect(data.checkIns).toEqual([])
    expect(data.feedback).toEqual([])
    expect(data.actionItems).toEqual([])
    expect(data.transcripts).toEqual([])
    expect(data.reviews).toEqual([])
  })

  it('getTeamOverview works after adding first report', async () => {
    await createReport('Solo Manager')
    clearAllCaches()

    const overview = getTeamOverview()
    expect(overview.reports.length).toBe(1)
    expect(overview.reports[0].displayName).toBe('Solo Manager')
  })

  it('searchContent finds newly created reports', async () => {
    await createReport('Searchable Person')
    clearAllCaches()

    const results = searchContent('Searchable')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('multiple reports can be added sequentially', async () => {
    await createReport('Alice Smith')
    await createReport('Bob Jones')
    await createReport('Chris Lee')
    clearAllCaches()

    const reports = getReports()
    expect(reports).toContain('alice-smith')
    expect(reports).toContain('bob-jones')
    expect(reports).toContain('chris-lee')
    expect(reports.length).toBe(3)

    const people = listPeople()
    expect(people.length).toBe(3)
  })
})
