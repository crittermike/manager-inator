import { describe, it, expect } from 'vitest'
import { parseFeedbackLog } from '../../src/main/github'

describe('parseFeedbackLog', () => {
  it('returns empty array for empty input', () => {
    expect(parseFeedbackLog('')).toEqual([])
  })

  it('returns empty array for content with no date headers', () => {
    expect(parseFeedbackLog('# Feedback Log\n\nSome intro text')).toEqual([])
  })

  it('parses a single positive feedback entry', () => {
    const content = `## 2026-01-15 — Positive feedback

**Source**: Direct observation
**Context**: Sprint demo

> Delivered a polished demo of the new search feature`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      date: '2026-01-15',
      type: 'positive',
      source: 'Direct observation',
      context: 'Sprint demo'
    })
    expect(result[0].content).toContain('Delivered a polished demo')
  })

  it('parses constructive feedback', () => {
    const content = `### 2026-02-10 — Constructive feedback

**Source**: Code review

> Needs to improve test coverage on PRs`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('constructive')
  })

  it('parses observation type', () => {
    const content = `## 2026-03-01 — Observation

**Source**: Team meeting

> Noticed they were quieter than usual during planning`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('observation')
  })

  it('parses mixed type', () => {
    const content = `## 2026-03-01 — Mixed feedback

**Source**: 1:1

> Good progress on technical skills but communication needs work`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('mixed')
  })

  it('defaults to positive for unrecognized type', () => {
    const content = `## 2026-03-01 — Praise

**Source**: Peer review

> Helped the team unblock a critical issue`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('positive')
  })

  it('handles date in brackets (link-style)', () => {
    const content = `## [2026-01-20] — Positive feedback

**Source**: Standup

> Proactively picked up a bug nobody else noticed`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-01-20')
  })

  it('handles en-dash and em-dash separators', () => {
    const enDash = `## 2026-01-15 – Positive feedback\n\n> Good work`
    const emDash = `## 2026-01-15 — Constructive feedback\n\n> Needs improvement`
    const hyphen = `## 2026-01-15 - Observation\n\n> Noticed something`

    expect(parseFeedbackLog(enDash)[0].date).toBe('2026-01-15')
    expect(parseFeedbackLog(emDash)[0].type).toBe('constructive')
    expect(parseFeedbackLog(hyphen)[0].type).toBe('observation')
  })

  it('parses multiple entries', () => {
    const content = `# Feedback Log

## 2026-01-10 — Positive feedback

**Source**: Demo

> Great presentation

## 2026-01-20 — Constructive feedback

**Source**: Code review

> Missing error handling

### 2026-02-01 — Observation

**Source**: Team meeting

> Very engaged during planning`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(3)
    expect(result[0].date).toBe('2026-01-10')
    expect(result[1].date).toBe('2026-01-20')
    expect(result[2].date).toBe('2026-02-01')
    expect(result[0].type).toBe('positive')
    expect(result[1].type).toBe('constructive')
    expect(result[2].type).toBe('observation')
  })

  it('handles emoji in the type text (regression test)', () => {
    // The old parser broke on multi-byte emoji characters in header text.
    // The fix anchors on the date pattern instead.
    const content = `## 2026-01-15 — 👍 Positive feedback

**Source**: Peer

> Helped unblock deployment`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-01-15')
    // Type defaults to positive because the raw text contains "positive"
    // even with the emoji prefix
    expect(result[0].type).toBe('positive')
  })

  it('handles entries without Source or Context fields', () => {
    const content = `## 2026-03-15 — Positive feedback

> Just a standalone quote without metadata`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('')
    expect(result[0].context).toBeUndefined()
    expect(result[0].content).toContain('standalone quote')
  })

  it('handles multi-line blockquotes', () => {
    const content = `## 2026-01-15 — Positive feedback

**Source**: Review

> First line of feedback
> Second line of feedback
> Third line of feedback`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].content).toContain('First line')
    expect(result[0].content).toContain('Second line')
    expect(result[0].content).toContain('Third line')
  })

  it('falls back to block content when no blockquote', () => {
    const content = `## 2026-01-15 — Positive feedback

**Source**: Observation

Just some plain text without a blockquote marker.`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    // When there's no blockquote, content falls back to block.trim()
    expect(result[0].content.length).toBeGreaterThan(0)
  })

  it('handles ## and ### headers mixed in the same file', () => {
    const content = `# Feedback Log

## 2026-01-10 — Positive feedback

> Entry A

### 2026-01-20 — Constructive feedback

> Entry B

## 2026-02-01 — Mixed feedback

> Entry C`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(3)
  })

  it('skips blocks that do not contain a date', () => {
    const content = `## Introduction

This is not a feedback entry.

## 2026-01-15 — Positive feedback

> Real entry

## Summary section

Just a summary.`

    const result = parseFeedbackLog(content)
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-01-15')
  })
})
