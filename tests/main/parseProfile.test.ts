import { describe, it, expect } from 'vitest'
import { parseProfile } from '../../src/main/github'

describe('parseProfile', () => {
  it('parses profile from YAML frontmatter format', () => {
    const content = `---
name: Nic Daantos
role: Senior Engineer
team: Platform
github: nicdaantos
startDate: 2024-01-15
meetingDay: Tuesday
location: North Carolina
timezone: Eastern
manager: mike
---

## About

Great engineer, always learning.

## Communication Preferences

- **Preferred channel**: Slack DM`

    const result = parseProfile(content, 'nic')
    expect(result.name).toBe('nic')
    expect(result.displayName).toBe('Nic Daantos')
    expect(result.role).toBe('Senior Engineer')
    expect(result.team).toBe('Platform')
    expect(result.github).toBe('nicdaantos')
    expect(result.startDate).toBe('2024-01-15')
    expect(result.meetingDay).toBe('Tuesday')
    expect(result.location).toBe('North Carolina')
    expect(result.timezone).toBe('Eastern')
    expect(result.manager).toBe('mike')
    expect(result.about).toBe('Great engineer, always learning.')
    expect(result.communicationPreferences).toEqual({ 'Preferred channel': 'Slack DM' })
  })

  it('uses fm.name as displayName over heading', () => {
    const content = `---
name: Jennifer Ramirez
role: Staff Engineer
---

# Jennifer`

    const result = parseProfile(content, 'jennifer')
    expect(result.displayName).toBe('Jennifer Ramirez')
  })

  it('strips @ from github in YAML frontmatter', () => {
    const content = `---
github: @nicdaantos
---`

    const result = parseProfile(content, 'nic')
    expect(result.github).toBe('nicdaantos')
  })

  it('strips @ from manager in YAML frontmatter', () => {
    const content = `---
manager: @crittermike
---`

    const result = parseProfile(content, 'test')
    expect(result.manager).toBe('crittermike')
  })

  it('parses profile from markdown table format (legacy)', () => {
    const content = `# Nic

| **Role** | Senior Engineer |
| **Team** | Platform |
| **GitHub** | @nicdaantos |
| **Start Date** | 2024-01-15 |
| **Meeting Day** | Tuesday |
| **Location** | North Carolina |

## About

Great engineer, always learning.`

    const result = parseProfile(content, 'nic')
    expect(result.name).toBe('nic')
    expect(result.displayName).toBe('Nic')
    expect(result.role).toBe('Senior Engineer')
    expect(result.team).toBe('Platform')
    expect(result.github).toBe('nicdaantos')
    expect(result.startDate).toBe('2024-01-15')
    expect(result.meetingDay).toBe('Tuesday')
    expect(result.location).toBe('North Carolina')
    expect(result.about).toBe('Great engineer, always learning.')
  })

  it('parses profile from inline format (legacy)', () => {
    const content = `# Jennifer

Role: Staff Engineer
Team: Infrastructure
GitHub: @jennifersmith
Start Date: 2023-06-01
Meeting Day: Wednesday
Location: Remote`

    const result = parseProfile(content, 'jennifer')
    expect(result.displayName).toBe('Jennifer')
    expect(result.role).toBe('Staff Engineer')
    expect(result.github).toBe('jennifersmith')
    expect(result.meetingDay).toBe('Wednesday')
  })

  it('strips "profile" from display name', () => {
    const content = '# Nic Profile\n\nRole: Engineer'
    const result = parseProfile(content, 'nic')
    expect(result.displayName).toBe('Nic')
  })

  it('falls back to capitalized name when no heading', () => {
    const content = 'Role: Engineer\nTeam: Platform'
    const result = parseProfile(content, 'nic')
    expect(result.displayName).toBe('Nic')
  })

  it('strips @ from GitHub handle', () => {
    const content = '| **GitHub** | @nicdaantos |'
    const result = parseProfile(content, 'nic')
    expect(result.github).toBe('nicdaantos')
  })

  it('returns empty strings for missing fields', () => {
    const content = '# Test\n\nJust a name, nothing else.'
    const result = parseProfile(content, 'test')
    expect(result.role).toBe('')
    expect(result.team).toBe('')
    expect(result.github).toBe('')
    expect(result.location).toBe('')
    expect(result.about).toBe('')
  })

  it('parses communication preferences', () => {
    const content = `# Tara

## Communication Preferences
- **Style**: Direct and concise
- **Feedback**: Prefers written feedback
- **Meeting**: Likes structured agendas`

    const result = parseProfile(content, 'tara')
    expect(result.communicationPreferences).toEqual({
      Style: 'Direct and concise',
      Feedback: 'Prefers written feedback',
      Meeting: 'Likes structured agendas'
    })
  })

  it('parses about section that ends at next heading', () => {
    const content = `# Nic

## About

Nic is a strong backend engineer.
Excels at system design.

## Communication Preferences
- **Style**: Casual`

    const result = parseProfile(content, 'nic')
    expect(result.about).toBe('Nic is a strong backend engineer.\nExcels at system design.')
  })

  it('parses timezone and manager fields', () => {
    const content = `# Nic

| **Timezone** | Eastern |
| **Manager** | Mike Crittenden |`

    const result = parseProfile(content, 'nic')
    expect(result.timezone).toBe('Eastern')
    expect(result.manager).toBe('Mike Crittenden')
  })

  it('handles "Time Zone" with space variant', () => {
    const content = 'Time Zone: Pacific'
    const result = parseProfile(content, 'test')
    expect(result.timezone).toBe('Pacific')
  })

  it('parses table with repeated field name in value', () => {
    // Table format sometimes has "Role: Senior Engineer" inside the cell
    const content = '| **Role** | Role: Staff Engineer |'
    const result = parseProfile(content, 'test')
    expect(result.role).toBe('Staff Engineer')
  })
})
