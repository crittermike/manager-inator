import { describe, it, expect, vi, afterEach } from 'vitest'
import { getTimeGroup } from '../../src/renderer/pages/ReportDetail'

describe('getTimeGroup', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function withFixedDate(dateStr: string, fn: () => void) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(dateStr + 'T12:00:00'))
    fn()
    vi.useRealTimers()
  }

  describe('basic grouping', () => {
    it('returns "Today" for today\'s date', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-04-05')).toBe('Today')
      })
    })

    it('returns "Yesterday" for yesterday', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-04-04')).toBe('Yesterday')
      })
    })

    it('returns "This week" for 2 days ago', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-04-03')).toBe('This week')
      })
    })

    it('returns "This week" for 7 days ago (boundary)', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-03-29')).toBe('This week')
      })
    })

    it('returns "This month" for 8 days ago', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-03-28')).toBe('This month')
      })
    })

    it('returns "This month" for 30 days ago (boundary)', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-03-06')).toBe('This month')
      })
    })

    it('returns "Last 3 months" for 31 days ago', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-03-05')).toBe('Last 3 months')
      })
    })

    it('returns "Last 3 months" for 90 days ago (boundary)', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-01-05')).toBe('Last 3 months')
      })
    })

    it('returns "Older" for 91 days ago', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-01-04')).toBe('Older')
      })
    })

    it('returns "Older" for a very old date', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2020-01-01')).toBe('Older')
      })
    })
  })

  describe('future dates', () => {
    it('returns "Upcoming" for tomorrow', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2026-04-06')).toBe('Upcoming')
      })
    })

    it('returns "Upcoming" for a date far in the future', () => {
      withFixedDate('2026-04-05', () => {
        expect(getTimeGroup('2030-12-31')).toBe('Upcoming')
      })
    })
  })

  describe('invalid inputs', () => {
    it('returns "Older" for empty string', () => {
      expect(getTimeGroup('')).toBe('Older')
    })

    it('returns "Older" for non-date string', () => {
      expect(getTimeGroup('not-a-date')).toBe('Older')
    })

    it('returns "Older" for ISO datetime format', () => {
      expect(getTimeGroup('2026-04-05T12:00:00Z')).toBe('Older')
    })

    it('returns "Older" for partial date', () => {
      expect(getTimeGroup('2026-04')).toBe('Older')
    })

    it('returns "Older" for date with slashes', () => {
      expect(getTimeGroup('2026/04/05')).toBe('Older')
    })

    it('returns "Older" for date with extra text', () => {
      expect(getTimeGroup('2026-04-05 meeting')).toBe('Older')
    })
  })

  describe('month/year boundaries', () => {
    it('handles month boundary correctly', () => {
      withFixedDate('2026-03-01', () => {
        expect(getTimeGroup('2026-02-28')).toBe('Yesterday')
      })
    })

    it('handles year boundary correctly', () => {
      withFixedDate('2026-01-01', () => {
        expect(getTimeGroup('2025-12-31')).toBe('Yesterday')
      })
    })

    it('handles leap year boundary', () => {
      withFixedDate('2024-03-01', () => {
        expect(getTimeGroup('2024-02-29')).toBe('Yesterday')
      })
    })
  })

  describe('DST safety', () => {
    it('handles spring-forward date correctly (March)', () => {
      // 2025-03-09 is US spring-forward — local day is 23h, so naive ms-diff would undercount
      withFixedDate('2025-03-10', () => {
        expect(getTimeGroup('2025-03-09')).toBe('Yesterday')
        expect(getTimeGroup('2025-03-10')).toBe('Today')
        expect(getTimeGroup('2025-03-08')).toBe('This week')
      })
    })

    it('handles fall-back date correctly (November)', () => {
      // 2025-11-02 is US fall-back — local day is 25h, so naive ms-diff would overcount
      withFixedDate('2025-11-03', () => {
        expect(getTimeGroup('2025-11-02')).toBe('Yesterday')
        expect(getTimeGroup('2025-11-03')).toBe('Today')
        expect(getTimeGroup('2025-11-01')).toBe('This week')
      })
    })
  })
})
