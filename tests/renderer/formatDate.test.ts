import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatDate } from '../../src/renderer/utils/formatDate'

describe('formatDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns relative time for dates within 14 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-20')
    expect(result).toMatch(/3 days ago/)
  })

  it('returns relative time for yesterday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-22')
    expect(result).toMatch(/1 day ago/)
  })

  it('returns formatted date for dates older than 14 days (same year)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-01-15')
    expect(result).toBe('Jan 15')
  })

  it('includes year for dates in a different year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2025-06-10')
    expect(result).toBe('Jun 10, 2025')
  })

  it('returns original string for invalid date', () => {
    const result = formatDate('not-a-date')
    expect(result).toBe('not-a-date')
  })

  it('returns original string for empty string', () => {
    const result = formatDate('')
    expect(result).toBe('')
  })

  it('handles today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-23')
    expect(result).toMatch(/less than|minute|hour|ago/)
  })

  it('handles exactly 14 days ago (boundary)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-09')
    expect(result).toBe('Mar 9')
  })

  it('handles 13 days ago (just inside relative window)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-10')
    expect(result).toMatch(/13 days ago/)
  })
})
