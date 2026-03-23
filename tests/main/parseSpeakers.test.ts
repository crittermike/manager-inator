import { describe, it, expect } from 'vitest'
import { parseSpeakers } from '../../src/main/github'

describe('parseSpeakers', () => {
  it('returns empty array for content without frontmatter', () => {
    expect(parseSpeakers('# Meeting notes\n\nSome content')).toEqual([])
  })

  it('returns empty array for frontmatter without speakers', () => {
    const content = `---
title: Team standup
---

# Meeting notes`
    expect(parseSpeakers(content)).toEqual([])
  })

  it('parses a single speaker', () => {
    const content = `---
speakers:
  - Mike Crittenden
---`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden'])
  })

  it('parses multiple speakers', () => {
    const content = `---
speakers:
  - Mike Crittenden
  - Nic Daantos
  - Jennifer Smith
---`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Nic Daantos', 'Jennifer Smith'])
  })

  it('strips parenthetical suffixes from speaker names', () => {
    const content = `---
speakers:
  - Mike Crittenden (VP Engineering)
  - Nic Daantos (Senior Engineer)
---`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Nic Daantos'])
  })

  it('handles speakers with extra whitespace', () => {
    const content = `---
speakers:
  -   Mike Crittenden   
  - Nic Daantos
---`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Nic Daantos'])
  })

  it('returns empty array for empty string', () => {
    expect(parseSpeakers('')).toEqual([])
  })

  it('handles frontmatter with other fields around speakers', () => {
    const content = `---
title: Weekly sync
speakers:
  - Mike Crittenden
  - Tara Jones
date: 2026-03-11
---

# Notes`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Tara Jones'])
  })
})
