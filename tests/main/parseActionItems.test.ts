import { describe, it, expect } from 'vitest'
import { parseActionItems } from '../../src/main/github'

describe('parseActionItems', () => {
  it('returns empty array for empty input', () => {
    expect(parseActionItems('')).toEqual([])
  })

  it('returns empty array for content with no checkboxes', () => {
    expect(parseActionItems('Just some text\nWith no items')).toEqual([])
  })

  it('parses an unchecked action item', () => {
    const content = '- [ ] Do the thing'
    const result = parseActionItems(content)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      text: 'Do the thing',
      owner: 'Unknown',
      completed: false,
      sourceLineNumber: 0
    })
  })

  it('parses a checked action item (lowercase x)', () => {
    const content = '- [x] Done thing'
    const result = parseActionItems(content)
    expect(result).toHaveLength(1)
    expect(result[0].completed).toBe(true)
  })

  it('parses a checked action item (uppercase X)', () => {
    const content = '- [X] Done thing'
    const result = parseActionItems(content)
    expect(result).toHaveLength(1)
    expect(result[0].completed).toBe(true)
  })

  it('extracts bold owner from item text', () => {
    const content = '- [ ] **Mike**: Schedule the meeting'
    const result = parseActionItems(content)
    expect(result).toHaveLength(1)
    expect(result[0].owner).toBe('Mike')
    expect(result[0].text).toBe('Schedule the meeting')
  })

  it('extracts owner without colon', () => {
    const content = '- [ ] **Nic** Follow up on the PR'
    const result = parseActionItems(content)
    expect(result).toHaveLength(1)
    expect(result[0].owner).toBe('Nic')
    expect(result[0].text).toBe('Follow up on the PR')
  })

  it('tracks correct line numbers', () => {
    const content = `# Action items

- [ ] First item
- [x] Second item
- [ ] Third item`

    const result = parseActionItems(content)
    expect(result).toHaveLength(3)
    expect(result[0].sourceLineNumber).toBe(2)
    expect(result[1].sourceLineNumber).toBe(3)
    expect(result[2].sourceLineNumber).toBe(4)
  })

  it('preserves source file path', () => {
    const content = '- [ ] Do something'
    const result = parseActionItems(content, 'meetings/2026-03-11-nic-1-1.md')
    expect(result[0].sourceFile).toBe('meetings/2026-03-11-nic-1-1.md')
  })

  it('preserves the original source line text', () => {
    const content = '- [ ] **Mike**: Do something important'
    const result = parseActionItems(content)
    expect(result[0].sourceLine).toBe('- [ ] **Mike**: Do something important')
  })

  it('parses multiple items mixed with other content', () => {
    const content = `## Overview

Some meeting notes here.

## Action items
- [ ] **Mike**: Review the design doc
- [ ] **Nic**: Update the API schema
- [x] **Tara**: Deploy to staging

## Follow-up
Some more text`

    const result = parseActionItems(content)
    expect(result).toHaveLength(3)
    expect(result[0].owner).toBe('Mike')
    expect(result[1].owner).toBe('Nic')
    expect(result[2].owner).toBe('Tara')
    expect(result[2].completed).toBe(true)
  })

  it('ignores regular bullet points (no checkbox)', () => {
    const content = `- Regular bullet
- [ ] Actual action item
- Another regular bullet`

    const result = parseActionItems(content)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Actual action item')
  })
})
