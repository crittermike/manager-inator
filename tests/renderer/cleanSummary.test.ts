import { describe, it, expect } from 'vitest'
import { cleanSummaryContent } from '../../src/renderer/utils/cleanSummary'

describe('cleanSummaryContent', () => {
  it('strips YAML frontmatter', () => {
    const input = `---
title: Weekly Sync
speakers:
  - Alice
  - Bob
---

## Summary

Good discussion.`
    expect(cleanSummaryContent(input)).toBe('## Summary\n\nGood discussion.')
  })

  it('strips AI preamble "Here\'s your meeting summary:"', () => {
    const input = "Here's your meeting summary:\n\n## Key Points\n- Item 1"
    expect(cleanSummaryContent(input)).toBe('## Key Points\n- Item 1')
  })

  it('strips AI preamble "Here is the summary:"', () => {
    const input = "Here is the summary:\n\n## Topics\n- Topic A"
    expect(cleanSummaryContent(input)).toBe('## Topics\n- Topic A')
  })

  it('strips AI preamble "Here is your summary:"', () => {
    const input = "Here is your summary:\n\nContent here"
    expect(cleanSummaryContent(input)).toBe('Content here')
  })

  it('strips stray leading horizontal rule', () => {
    const input = "---\n\n## Notes\nSome notes."
    expect(cleanSummaryContent(input)).toBe('## Notes\nSome notes.')
  })

  it('strips bold speaker list', () => {
    const input = `**speakers:**
- Alice Johnson
- Bob Smith

## Discussion
We talked about priorities.`
    expect(cleanSummaryContent(input)).toBe('## Discussion\nWe talked about priorities.')
  })

  it('strips Attendees section', () => {
    const input = `## Attendees
- Alice
- Bob
- Carol

## Summary
Great meeting.`
    expect(cleanSummaryContent(input)).toBe('## Summary\nGreat meeting.')
  })

  it('strips multiple artifacts in sequence', () => {
    const input = `---
title: Test
---

Here's your meeting summary:

**speakers:**
- Alice

## Attendees
- Alice
- Bob

## Key Points
- Important thing`
    const result = cleanSummaryContent(input)
    expect(result).toBe('## Key Points\n- Important thing')
  })

  it('returns clean content unchanged', () => {
    const input = '## Meeting Notes\n\n- Action item 1\n- Action item 2'
    expect(cleanSummaryContent(input)).toBe(input)
  })

  it('handles empty string', () => {
    expect(cleanSummaryContent('')).toBe('')
  })

  it('handles content that is only frontmatter', () => {
    const input = '---\ntitle: Empty\n---'
    expect(cleanSummaryContent(input)).toBe('')
  })

  it('is case-insensitive for AI preamble', () => {
    const input = "HERE IS YOUR MEETING SUMMARY:\n\nContent"
    expect(cleanSummaryContent(input)).toBe('Content')
  })

  it('strips speakers list with asterisk bullets', () => {
    const input = `**Speakers:**
* Alice Johnson
* Bob Smith

## Notes
Content here.`
    expect(cleanSummaryContent(input)).toBe('## Notes\nContent here.')
  })
})
