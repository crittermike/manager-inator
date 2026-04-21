import { describe, it, expect } from 'vitest'
import { defaultIterationColumnLabels, nextIterationLabels, nextUnusedColor, PLAN_COLOR_PALETTE } from '../../src/renderer/utils/planColors'

describe('planColors', () => {
  describe('nextUnusedColor', () => {
    it('returns first palette color when nothing is used', () => {
      expect(nextUnusedColor([])).toBe(PLAN_COLOR_PALETTE[0])
    })
    it('skips already-used colors', () => {
      expect(nextUnusedColor(['amber', 'yellow'])).toBe('green')
    })
    it('wraps around when palette is exhausted', () => {
      const result = nextUnusedColor([...PLAN_COLOR_PALETTE])
      expect(PLAN_COLOR_PALETTE).toContain(result)
    })
  })

  describe('defaultIterationColumnLabels', () => {
    it('returns the requested number of labels', () => {
      expect(defaultIterationColumnLabels(new Date('2026-01-01'), 3)).toHaveLength(3)
    })
    it('produces Mon-Fri ranges starting on the next Monday', () => {
      // Jan 1 2026 is a Thursday → next Mon is Jan 5
      const labels = defaultIterationColumnLabels(new Date('2026-01-01'), 2)
      expect(labels[0]).toBe('Jan 5-9')
      expect(labels[1]).toBe('Jan 12-16')
    })
    it('handles month boundary in a single label', () => {
      // Jan 26 2026 is a Monday → Jan 26-30, then Feb 2-6
      const labels = defaultIterationColumnLabels(new Date('2026-01-26'), 2)
      expect(labels[0]).toBe('Jan 26-30')
      expect(labels[1]).toBe('Feb 2-6')
    })
  })

  describe('nextIterationLabels', () => {
    it('continues from the end of the previous iteration', () => {
      const labels = nextIterationLabels(['Jan 5-9', 'Jan 12-16'], 2)
      // After Jan 16 (Fri), advance 3d → Jan 19 (Mon)
      expect(labels[0]).toBe('Jan 19-23')
      expect(labels[1]).toBe('Jan 26-30')
    })
    it('falls back to today if no previous labels', () => {
      const labels = nextIterationLabels([], 2)
      expect(labels).toHaveLength(2)
      expect(labels[0]).toMatch(/^[A-Z][a-z]+ \d+-/)
    })
  })
})
