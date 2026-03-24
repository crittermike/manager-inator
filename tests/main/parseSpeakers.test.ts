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

  it('parses inline **Attendees:** line with comma-separated names', () => {
    const content = `# Team Planning — 2026-01-05

**Attendees:** Mike Crittenden, Jennifer Ramirez, Tara Kintner, Steve Richert

## Board Review`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Jennifer Ramirez', 'Tara Kintner', 'Steve Richert'])
  })

  it('parses **Attendees**: with colon outside bold', () => {
    const content = `# Interview — 2026-03-10

**Attendees**: Mike Crittenden, Siman Shrestha
**Type**: Hiring interview`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Siman Shrestha'])
  })

  it('strips parenthetical suffixes from inline attendees', () => {
    const content = `# Meeting

**Attendees:** Catu Berretta (designer), Steve Richert, Mike Crittenden`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Catu Berretta', 'Steve Richert', 'Mike Crittenden'])
  })

  it('parses ## Attendees heading with bullet list', () => {
    const content = `---
speakers:
  - Me
  - Nic Daantos
---

# Meeting summary: Nic 1-1

## Attendees
- Me
- Nic Daantos

## Overview
Some content here`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Me', 'Nic Daantos'])
  })

  it('parses ## Attendees bullet list when no YAML frontmatter', () => {
    const content = `# Town Hall

## Attendees
- Vlad
- Joe
- Sean McCullough

## Overview
Content here`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Vlad', 'Joe', 'Sean McCullough'])
  })

  it('strips parenthetical suffixes from ## Attendees bullet list', () => {
    const content = `# Town Hall

## Attendees
- Vlad (VP Engineering)
- Joe (Host / Chief of Staff)
- Sean (Model Fitness)

## Overview`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Vlad', 'Joe', 'Sean'])
  })

  it('prefers YAML frontmatter speakers over markdown attendees', () => {
    const content = `---
speakers:
  - Mike Crittenden
  - Steve Richert
---

# Meeting

**Attendees:** Mike Crittenden, Steve Richert, Jennifer Ramirez

## Notes`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Steve Richert'])
  })

  it('falls back to inline **Attendees** when YAML has no speakers field', () => {
    const content = `---
title: Team standup
---

# Meeting

**Attendees:** Mike Crittenden, Jennifer Ramirez

## Notes`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Jennifer Ramirez'])
  })

  it('handles - **Attendees**: prefix with dash', () => {
    const content = `# Meeting

- **Attendees**: Mike Crittenden, Ashwin Mohan

## Notes`
    const result = parseSpeakers(content)
    expect(result).toEqual(['Mike Crittenden', 'Ashwin Mohan'])
  })
})
