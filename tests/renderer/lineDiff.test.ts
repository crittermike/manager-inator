import { describe, it, expect } from 'vitest'
import { lineDiff, hasChanges } from '../../src/renderer/utils/lineDiff'

describe('lineDiff', () => {
  it('returns all equal ops for identical text', () => {
    const result = lineDiff('a\nb\nc', 'a\nb\nc')
    expect(result.every(d => d.op === 'equal')).toBe(true)
    expect(result.map(d => d.text)).toEqual(['a', 'b', 'c'])
  })

  it('detects pure additions at the end', () => {
    const result = lineDiff('a\nb', 'a\nb\nc')
    expect(result).toEqual([
      { op: 'equal', text: 'a' },
      { op: 'equal', text: 'b' },
      { op: 'add', text: 'c' },
    ])
  })

  it('detects pure removals', () => {
    const result = lineDiff('a\nb\nc', 'a\nc')
    expect(result.find(d => d.op === 'remove')?.text).toBe('b')
    expect(result.filter(d => d.op === 'equal').map(d => d.text)).toEqual(['a', 'c'])
  })

  it('detects mid-line changes as remove + add', () => {
    const result = lineDiff('a\nold\nc', 'a\nnew\nc')
    expect(result.some(d => d.op === 'remove' && d.text === 'old')).toBe(true)
    expect(result.some(d => d.op === 'add' && d.text === 'new')).toBe(true)
  })

  it('handles fully different text', () => {
    const result = lineDiff('a\nb', 'c\nd')
    const removes = result.filter(d => d.op === 'remove').map(d => d.text)
    const adds = result.filter(d => d.op === 'add').map(d => d.text)
    expect(removes).toEqual(['a', 'b'])
    expect(adds).toEqual(['c', 'd'])
  })

  it('handles empty before', () => {
    const result = lineDiff('', 'a\nb')
    expect(result.filter(d => d.op === 'add').map(d => d.text)).toEqual(['a', 'b'])
  })

  it('handles empty after', () => {
    const result = lineDiff('a\nb', '')
    expect(result.filter(d => d.op === 'remove').map(d => d.text)).toEqual(['a', 'b'])
  })
})

describe('hasChanges', () => {
  it('returns false for identical strings', () => {
    expect(hasChanges('abc', 'abc')).toBe(false)
  })

  it('returns true for any difference', () => {
    expect(hasChanges('abc', 'abcd')).toBe(true)
    expect(hasChanges('abc', 'abc ')).toBe(true)
  })
})
