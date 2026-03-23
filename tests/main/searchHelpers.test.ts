import { describe, it, expect } from 'vitest'
import {
  extractSnippet,
  titleCase,
  deriveMeetingTitleFromContent,
  deriveReportTitle,
  yamlEscapeValue,
  filenameMatchesPerson,
  speakerMatchesPerson,
  formatMeetingTitle
} from '../../src/main/github'

describe('extractSnippet', () => {
  it('extracts a snippet around a match', () => {
    const content = 'The quick brown fox jumps over the lazy dog and then rests by the fire.'
    const result = extractSnippet(content, 16, 3)
    expect(result).toContain('fox')
  })

  it('no prefix ellipsis when match is at the start', () => {
    const content = 'hello world'
    const result = extractSnippet(content, 0, 5)
    expect(result.startsWith('…')).toBe(false)
    expect(result).toContain('hello')
  })

  it('no suffix ellipsis when match extends to the end', () => {
    const content = 'short text'
    const result = extractSnippet(content, 0, 10)
    expect(result.endsWith('…')).toBe(false)
  })

  it('collapses whitespace in snippet', () => {
    const content = 'hello    world\n\nnext line'
    const result = extractSnippet(content, 0, 5)
    expect(result).toContain('hello world')
  })
})

describe('titleCase', () => {
  it('capitalizes each word', () => {
    expect(titleCase('hello world')).toBe('Hello World')
  })

  it('handles single word', () => {
    expect(titleCase('hello')).toBe('Hello')
  })

  it('handles empty string', () => {
    expect(titleCase('')).toBe('')
  })

  it('handles extra whitespace', () => {
    expect(titleCase('  hello   world  ')).toBe('Hello World')
  })
})

describe('deriveMeetingTitleFromContent', () => {
  it('extracts title from YAML frontmatter', () => {
    const content = `---
title: Nic 1-1
speakers:
  - Mike
---
# Meeting notes`
    expect(deriveMeetingTitleFromContent('2026-03-11-nic-1-1.md', content)).toBe('Nic 1-1')
  })

  it('falls back to slug from filename when no frontmatter', () => {
    expect(deriveMeetingTitleFromContent('2026-03-11-nic-1-1.md', '# Some content')).toBe('Nic 1-1')
  })

  it('falls back to slug from filename when no date prefix', () => {
    expect(deriveMeetingTitleFromContent('random-meeting.md', '# Some content')).toBe('Random Meeting')
  })

  it('handles file with date but no slug', () => {
    expect(deriveMeetingTitleFromContent('2026-03-11.md', '# Notes')).toBe('2026 03 11')
  })
})

describe('formatMeetingTitle', () => {
  it('title-cases words', () => {
    expect(formatMeetingTitle('nic 1 1')).toBe('Nic 1-1')
  })

  it('normalizes "1 1" to "1-1"', () => {
    expect(formatMeetingTitle('team 1 1 sync')).toBe('Team 1-1 Sync')
  })

  it('handles already title-cased input', () => {
    expect(formatMeetingTitle('Nic 1-1')).toBe('Nic 1-1')
  })

  it('handles plain text', () => {
    expect(formatMeetingTitle('weekly standup')).toBe('Weekly Standup')
  })
})

describe('deriveReportTitle', () => {
  it('returns capitalized report name for root path', () => {
    expect(deriveReportTitle('nic')).toBe('Nic')
  })

  it('joins nested path with em-dash', () => {
    expect(deriveReportTitle('nic/check-ins/monthly/2026-03.md')).toBe('Nic — Check Ins / Monthly / 2026 03')
  })

  it('special-cases feedback/log', () => {
    expect(deriveReportTitle('jennifer/feedback/log.md')).toBe('Jennifer — Feedback Log')
  })

  it('handles hyphens and underscores in name', () => {
    expect(deriveReportTitle('nic-daantos')).toBe('Nic Daantos')
  })
})

describe('yamlEscapeValue', () => {
  it('returns plain text as-is when safe', () => {
    expect(yamlEscapeValue('Simple title')).toBe('Simple title')
  })

  it('wraps value in quotes when it contains colon', () => {
    expect(yamlEscapeValue('Title: with colon')).toBe('"Title: with colon"')
  })

  it('wraps value in quotes when it contains hash', () => {
    expect(yamlEscapeValue('Meeting #5')).toBe('"Meeting #5"')
  })

  it('returns value with internal double quotes as-is when no special yaml chars', () => {
    expect(yamlEscapeValue('He said "hello"')).toBe('He said "hello"')
  })

  it('strips newlines', () => {
    const result = yamlEscapeValue('line one\nline two')
    expect(result).not.toContain('\n')
  })

  it('wraps values starting with quotes', () => {
    expect(yamlEscapeValue('"quoted value"')).toMatch(/^"/)
  })
})

describe('filenameMatchesPerson', () => {
  it('matches exact slug', () => {
    expect(filenameMatchesPerson('nic-daantos', 'nic-daantos')).toBe(true)
  })

  it('matches slug as prefix', () => {
    expect(filenameMatchesPerson('nic-daantos-1-1', 'nic-daantos')).toBe(true)
  })

  it('matches slug as suffix', () => {
    expect(filenameMatchesPerson('1-1-nic-daantos', 'nic-daantos')).toBe(true)
  })

  it('matches by first name segment', () => {
    expect(filenameMatchesPerson('nic-1-1', 'nic-daantos')).toBe(true)
  })

  it('does not match unrelated slugs', () => {
    expect(filenameMatchesPerson('team-standup', 'nic-daantos')).toBe(false)
  })
})

describe('speakerMatchesPerson', () => {
  it('matches by full name', () => {
    expect(speakerMatchesPerson(['Nic Daantos'], 'Nic Daantos', [])).toBe(true)
  })

  it('matches by first name', () => {
    expect(speakerMatchesPerson(['Nic'], 'Nic Daantos', [])).toBe(true)
  })

  it('matches by alias', () => {
    expect(speakerMatchesPerson(['Nick'], 'Nic Daantos', ['Nick'])).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(speakerMatchesPerson(['NIC DAANTOS'], 'Nic Daantos', [])).toBe(true)
  })

  it('does not match unrelated speakers', () => {
    expect(speakerMatchesPerson(['Jennifer Smith'], 'Nic Daantos', [])).toBe(false)
  })

  it('matches when person appears among multiple speakers', () => {
    expect(speakerMatchesPerson(
      ['Mike Crittenden', 'Nic Daantos', 'Tara Jones'],
      'Nic Daantos',
      []
    )).toBe(true)
  })
})
