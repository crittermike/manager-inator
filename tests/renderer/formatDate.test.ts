import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatDate } from '../../src/renderer/utils/formatDate'

describe('formatDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns relative time for dates within 7 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-20')
    expect(result).toBe('3 days ago')
  })

  it('returns Yesterday for yesterday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-22')
    expect(result).toBe('Yesterday')
  })

  it('returns formatted date for dates older than 4 weeks (same year)', () => {
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

  it('returns Today for today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-23')
    expect(result).toBe('Today')
  })

  it('returns Last week for 7-13 days ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-13')
    expect(result).toBe('Last week')
  })

  it('returns 2 weeks ago for 14-20 days ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-03-09')
    expect(result).toBe('2 weeks ago')
  })

  it('returns 3 weeks ago for 21-27 days ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T12:00:00'))

    const result = formatDate('2026-03-01')
    expect(result).toBe('3 weeks ago')
  })

  it('returns formatted date for 28+ days ago', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-23T00:00:00'))

    const result = formatDate('2026-02-20')
    expect(result).toBe('Feb 20')
  })
})
