import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
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
    userName: 'Mike Crittenden',
    userGithub: '',
  }),
  setToken: vi.fn(),
  getToken: () => 'fake-token',
  saveSettings: vi.fn(),
  getSettingsForRenderer: vi.fn(),
}))

import { listPlans, getPlan, createPlan, savePlan, deletePlan, __test } from '../../src/main/plans'
import { clearAllCaches } from '../../src/main/github'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plans-test-'))
  _testRepoPath = tmpDir
  clearAllCaches()
})

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('plans storage', () => {
  it('createPlan writes to plans/<slug>.json with normalized fields', async () => {
    const plan = await createPlan('FY26 Roadmap')
    expect(plan.slug).toBe('fy26-roadmap')
    expect(plan.iterations).toEqual([])
    expect(plan.people).toEqual([])
    expect(plan.projects).toEqual([])
    expect(plan.assignments).toEqual([])
    expect(existsSync(join(tmpDir, 'plans', 'fy26-roadmap.json'))).toBe(true)
  })

  it('createPlan disambiguates slugs when name collides', async () => {
    const a = await createPlan('My Plan')
    const b = await createPlan('My Plan')
    expect(a.slug).toBe('my-plan')
    expect(b.slug).toBe('my-plan-2')
  })

  it('createPlan with empty name uses fallback', async () => {
    const p = await createPlan('   ')
    expect(p.name).toBe('Untitled plan')
    expect(p.slug).toBe('untitled-plan')
  })

  it('getPlan returns null for missing plan', async () => {
    expect(await getPlan('nope')).toBeNull()
  })

  it('listPlans returns summaries sorted by updatedAt desc', async () => {
    const a = await createPlan('Alpha')
    await new Promise(r => setTimeout(r, 10))
    const b = await createPlan('Beta')
    const list = listPlans()
    expect(list.map(p => p.slug)).toEqual([b.slug, a.slug])
  })

  it('savePlan persists changes and updates updatedAt', async () => {
    const p = await createPlan('Plan X')
    const before = p.updatedAt
    await new Promise(r => setTimeout(r, 5))
    await savePlan({
      ...p,
      iterations: [{ id: 'it1', columns: [{ id: 'c1', label: 'Wk 1' }] }],
      people: [{ id: 'pe1', name: 'Steve' }],
      projects: [{ id: 'pr1', name: 'Foo', color: 'amber', estWeeks: 3 }],
      assignments: [{ personId: 'pe1', columnId: 'c1', projectId: 'pr1' }],
    })
    const reloaded = await getPlan(p.slug)
    expect(reloaded?.iterations).toHaveLength(1)
    expect(reloaded?.assignments).toHaveLength(1)
    expect(reloaded?.updatedAt > before).toBe(true)
  })

  it('savePlan strips assignments referencing nonexistent ids', async () => {
    const p = await createPlan('Cleanup')
    await savePlan({
      ...p,
      iterations: [{ id: 'it1', columns: [{ id: 'c1', label: 'Wk 1' }] }],
      people: [{ id: 'pe1', name: 'Steve' }],
      projects: [{ id: 'pr1', name: 'Foo', color: 'amber', estWeeks: 1 }],
      assignments: [
        { personId: 'pe1', columnId: 'c1', projectId: 'pr1' }, // valid
        { personId: 'pe1', columnId: 'GONE', projectId: 'pr1' }, // bad column
        { personId: 'GONE', columnId: 'c1', projectId: 'pr1' }, // bad person
        { personId: 'pe1', columnId: 'c1', projectId: 'GONE' }, // bad project
      ],
    })
    const reloaded = await getPlan(p.slug)
    expect(reloaded?.assignments).toEqual([
      { personId: 'pe1', columnId: 'c1', projectId: 'pr1' },
    ])
  })

  it('deletePlan removes the file', async () => {
    const p = await createPlan('Doomed')
    expect(existsSync(join(tmpDir, 'plans', `${p.slug}.json`))).toBe(true)
    await deletePlan(p.slug)
    expect(existsSync(join(tmpDir, 'plans', `${p.slug}.json`))).toBe(false)
    expect(await getPlan(p.slug)).toBeNull()
  })

  it('deletePlan no-ops for missing plan', async () => {
    await expect(deletePlan('nope')).resolves.toBeUndefined()
  })

  it('savePlan throws if slug is missing', async () => {
    await expect(savePlan({
      slug: '',
      name: 'x',
      iterations: [], people: [], projects: [], assignments: [],
      createdAt: '', updatedAt: '',
    })).rejects.toThrow(/slug/i)
  })

  it('getPlan tolerates malformed JSON by returning null', async () => {
    mkdirSync(join(tmpDir, 'plans'), { recursive: true })
    writeFileSync(join(tmpDir, 'plans', 'bad.json'), '{not json')
    expect(await getPlan('bad')).toBeNull()
  })

  it('getPlan tolerates plans missing array fields', async () => {
    mkdirSync(join(tmpDir, 'plans'), { recursive: true })
    writeFileSync(join(tmpDir, 'plans', 'partial.json'), JSON.stringify({
      slug: 'partial',
      name: 'Partial',
      createdAt: '',
      updatedAt: '',
    }))
    const p = await getPlan('partial')
    expect(p?.iterations).toEqual([])
    expect(p?.people).toEqual([])
    expect(p?.projects).toEqual([])
    expect(p?.assignments).toEqual([])
  })

  it('slugify produces ASCII-only kebab slugs', () => {
    expect(__test.slugify('My Plan!')).toBe('my-plan')
    expect(__test.slugify('  Hello   World  ')).toBe('hello-world')
    expect(__test.slugify('Cafe (FY26)')).toBe('cafe-fy26')
  })
})
