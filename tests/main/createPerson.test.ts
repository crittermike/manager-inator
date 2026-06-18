import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
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
    aiCustomInstructions: '',
  }),
  setToken: vi.fn(),
  getToken: () => 'fake-token',
  saveSettings: vi.fn(),
  getSettingsForRenderer: vi.fn(),
}))

import {
  initializeRepo,
  createReport,
  createPerson,
  listPeople,
  clearAllCaches,
} from '../../src/main/github'

describe('createPerson', () => {
  let repoDir: string

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'mi-create-person-'))
    initializeRepo(repoDir)
    _testRepoPath = repoDir
    clearAllCaches()
  })

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }) } catch {}
  })

  it('creates a people/<slug>.md with default Peer Manager relationship', async () => {
    const slug = await createPerson('Sam Patel')
    expect(slug).toBe('sam-patel')

    const path = join(repoDir, 'people', 'sam-patel.md')
    expect(existsSync(path)).toBe(true)
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('name: Sam Patel')
    expect(content).toContain('slug: sam-patel')
    expect(content).toContain('relationship: Peer Manager')
    expect(content).toContain('# Sam Patel')
  })

  it('honors provided relationship and other fields', async () => {
    await createPerson('Jordan Lee', {
      relationship: 'Stakeholder',
      role: 'PM',
      github: 'jlee',
      location: 'NYC',
      aliases: ['JL', 'Jordy'],
    })
    const content = readFileSync(join(repoDir, 'people', 'jordan-lee.md'), 'utf-8')
    expect(content).toContain('relationship: Stakeholder')
    expect(content).toContain('role: PM')
    expect(content).toContain('github: jlee')
    expect(content).toContain('location: NYC')
    expect(content).toContain('aliases: JL, Jordy')
  })

  it('rejects collision with an existing report slug', async () => {
    await createReport('Alice Smith')
    clearAllCaches()
    await expect(createPerson('Alice Smith')).rejects.toThrow(/direct report/i)
  })

  it('rejects collision with an existing person', async () => {
    await createPerson('Pat Kim')
    await expect(createPerson('Pat Kim')).rejects.toThrow(/already exists/i)
  })

  it('rejects empty or invalid names', async () => {
    await expect(createPerson('')).rejects.toThrow()
    await expect(createPerson('   ')).rejects.toThrow()
    await expect(createPerson('!!!')).rejects.toThrow(/invalid/i)
  })

  it('is visible to listPeople after creation', async () => {
    await createPerson('Riley Stone', { relationship: 'Mentor' })
    clearAllCaches()
    const people = listPeople()
    const found = people.find(p => p.slug === 'riley-stone')
    expect(found).toBeDefined()
    expect(found?.relationship).toBe('Mentor')
  })
})
