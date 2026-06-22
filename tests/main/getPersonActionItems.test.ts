import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
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
    userName: 'Mike Manager',
  }),
  setToken: vi.fn(),
  getToken: () => 'fake-token',
  saveSettings: vi.fn(),
  getSettingsForRenderer: vi.fn(),
}))

import {
  initializeRepo,
  getPersonActionItems,
  toggleActionItem,
  clearAllCaches,
} from '../../src/main/github'

describe('getPersonActionItems', () => {
  let repoDir: string

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'mi-person-actions-'))
    initializeRepo(repoDir)
    _testRepoPath = repoDir
    clearAllCaches()
    // Set up people directory with rayta
    mkdirSync(join(repoDir, 'people'), { recursive: true })
    writeFileSync(join(repoDir, 'people', 'rayta.md'), `---
name: Rayta Singh
slug: rayta
relationship: Cross-functional Partner
---

# Rayta Singh
`)
    mkdirSync(join(repoDir, 'contexts'), { recursive: true })
  })

  afterEach(() => {
    try { rmSync(repoDir, { recursive: true, force: true }) } catch {}
  })

  function writeContext(filename: string, body: string) {
    writeFileSync(join(repoDir, 'contexts', filename), body)
    clearAllCaches()
  }

  it('returns action items from contexts that reference the person', () => {
    writeContext('2026-04-15-rayta-sync.md', `---
title: Sync with Rayta
date: 2026-04-15
source: meeting
people:
  - rayta
speakers:
  - Mike Manager
  - Rayta Singh
---

# Sync with Rayta

## Summary

We talked about the integration project.

## Action items

- [ ] **Mike**: Send Rayta the API spec by Friday
- [ ] **Rayta**: Review the architecture doc
- [x] **Mike**: Set up next sync meeting
`)
    const items = getPersonActionItems('rayta')
    expect(items).toHaveLength(3)
    expect(items.map(i => i.text)).toEqual(
      expect.arrayContaining([
        'Send Rayta the API spec by Friday',
        'Review the architecture doc',
        'Set up next sync meeting',
      ])
    )
  })

  it('preserves owner and completion state regardless of who owns the item', () => {
    writeContext('2026-04-15-rayta-sync.md', `---
title: Sync
date: 2026-04-15
source: meeting
people:
  - rayta
---

## Action items

- [ ] **Mike**: Owe Rayta the API spec
- [x] **Rayta**: Already done thing
`)
    const items = getPersonActionItems('rayta')
    const mike = items.find(i => i.text === 'Owe Rayta the API spec')
    const rayta = items.find(i => i.text === 'Already done thing')
    expect(mike?.owner).toBe('Mike')
    expect(mike?.completed).toBe(false)
    expect(rayta?.owner).toBe('Rayta')
    expect(rayta?.completed).toBe(true)
  })

  it('aggregates across multiple contexts', () => {
    writeContext('2026-04-10-rayta-1.md', `---
title: First sync
date: 2026-04-10
source: meeting
people:
  - rayta
---

## Action items

- [ ] **Mike**: Item from first meeting
`)
    writeContext('2026-04-15-rayta-2.md', `---
title: Second sync
date: 2026-04-15
source: meeting
people:
  - rayta
---

## Action items

- [ ] **Mike**: Item from second meeting
`)
    const items = getPersonActionItems('rayta')
    expect(items).toHaveLength(2)
  })

  it('returns empty array for a person with no contexts', () => {
    expect(getPersonActionItems('nonexistent')).toEqual([])
  })

  it('attaches sourceFile and sourceLineNumber so the items are toggleable', () => {
    writeContext('2026-04-15-rayta.md', `---
title: Sync
date: 2026-04-15
source: meeting
people:
  - rayta
---

## Action items

- [ ] **Mike**: Toggle me
`)
    const [item] = getPersonActionItems('rayta')
    expect(item.sourceFile).toBe('contexts/2026-04-15-rayta.md')
    expect(item.sourceLineNumber).toBeTypeOf('number')
  })

  it('reflects fresh data after toggleActionItem (cache invalidation)', async () => {
    writeContext('2026-04-15-rayta.md', `---
title: Sync
date: 2026-04-15
source: meeting
people:
  - rayta
---

## Action items

- [ ] **Mike**: Send the doc
`)
    const before = getPersonActionItems('rayta')
    expect(before[0].completed).toBe(false)

    await toggleActionItem(before[0].sourceFile!, before[0].sourceLineNumber!)

    const after = getPersonActionItems('rayta')
    expect(after).toHaveLength(1)
    expect(after[0].completed).toBe(true)

    // And the underlying file actually changed
    const raw = readFileSync(join(repoDir, 'contexts', '2026-04-15-rayta.md'), 'utf-8')
    expect(raw).toContain('- [x] **Mike**: Send the doc')
  })
})
