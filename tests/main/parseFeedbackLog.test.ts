import { describe, it, expect } from 'vitest'
import { parseFeedbackLog, serializeFeedbackLog } from '../../src/main/github'

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

describe('serializeFeedbackLog', () => {
  it('returns empty string for empty array', () => {
    expect(serializeFeedbackLog([])).toBe('')
  })

  it('serializes a single entry with all fields', () => {
    const result = serializeFeedbackLog([{
      date: '2026-01-15',
      type: 'positive',
      source: 'Direct observation',
      context: 'Sprint demo',
      content: 'Great presentation skills'
    }])
    expect(result).toBe(
      '### 2026-01-15\n**Type:** positive\n**Source:** Direct observation\n**Context:** Sprint demo\n\nGreat presentation skills\n'
    )
  })

  it('serializes entry without source or context', () => {
    const result = serializeFeedbackLog([{
      date: '2026-03-01',
      type: 'constructive',
      source: '',
      content: 'Needs improvement on tests'
    }])
    expect(result).toBe(
      '### 2026-03-01\n**Type:** constructive\n\nNeeds improvement on tests\n'
    )
  })

  it('serializes multiple entries with --- separators', () => {
    const result = serializeFeedbackLog([
      { date: '2026-01-10', type: 'positive', source: 'Demo', content: 'Great work' },
      { date: '2026-01-20', type: 'constructive', source: '', content: 'Missing tests' }
    ])
    expect(result).toContain('### 2026-01-10')
    expect(result).toContain('### 2026-01-20')
    expect(result).toContain('\n---\n\n')
  })

  it('round-trips canonical format entries', () => {
    const canonical = `### 2026-03-15\n**Type:** positive\n**Source:** meeting (captured)\n\nDid a great job on the feature.\n\n---\n\n### 2026-03-10\n**Type:** mixed\n\nGood technical skills but needs to communicate more.\n`
    const parsed = parseFeedbackLog(canonical)
    const reserialized = serializeFeedbackLog(parsed)
    const reparsed = parseFeedbackLog(reserialized)
    expect(reparsed).toHaveLength(2)
    expect(reparsed[0].date).toBe(parsed[0].date)
    expect(reparsed[0].type).toBe(parsed[0].type)
    expect(reparsed[0].content).toBe(parsed[0].content)
    expect(reparsed[0].source).toBe(parsed[0].source)
    expect(reparsed[1].date).toBe(parsed[1].date)
    expect(reparsed[1].type).toBe(parsed[1].type)
    expect(reparsed[1].content).toBe(parsed[1].content)
  })

  it('round-trips legacy format entries (normalizes to canonical)', () => {
    const legacy = `## 2026-01-15 — Positive feedback\n\n**Source**: Direct observation\n\n> Delivered a polished demo`
    const parsed = parseFeedbackLog(legacy)
    const reserialized = serializeFeedbackLog(parsed)
    const reparsed = parseFeedbackLog(reserialized)
    expect(reparsed).toHaveLength(1)
    expect(reparsed[0].date).toBe('2026-01-15')
    expect(reparsed[0].type).toBe('positive')
    expect(reparsed[0].content).toContain('Delivered a polished demo')
    expect(reparsed[0].source).toBe('Direct observation')
  })

  it('preserves multi-line content through round-trip', () => {
    const entries = [{
      date: '2026-02-01',
      type: 'positive' as const,
      source: 'Review',
      content: 'First line of feedback\nSecond line of feedback\nThird line of feedback'
    }]
    const serialized = serializeFeedbackLog(entries)
    const parsed = parseFeedbackLog(serialized)
    expect(parsed[0].content).toBe(entries[0].content)
  })

  it('handles entry with context field', () => {
    const entries = [{
      date: '2026-01-20',
      type: 'mixed' as const,
      source: '1:1',
      context: 'https://github.com/org/repo/pull/123',
      content: 'Good progress but communication needs work'
    }]
    const serialized = serializeFeedbackLog(entries)
    expect(serialized).toContain('**Context:** https://github.com/org/repo/pull/123')
    const parsed = parseFeedbackLog(serialized)
    expect(parsed[0].context).toBe('https://github.com/org/repo/pull/123')
  })
})
