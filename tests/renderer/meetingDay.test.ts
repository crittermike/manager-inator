import { describe, it, expect } from 'vitest'
import { matchesMeetingDay, parseMeetingDays } from '../../src/renderer/utils/meetingDay'

describe('parseMeetingDays', () => {
  it('returns empty array for undefined', () => {
    expect(parseMeetingDays(undefined)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseMeetingDays('')).toEqual([])
  })

  it('parses a single day', () => {
    expect(parseMeetingDays('Tuesday')).toEqual(['tuesday'])
  })

  it('parses multiple days separated by slash', () => {
    expect(parseMeetingDays('Tuesday/Thursday')).toEqual(['tuesday', 'thursday'])
  })

  it('trims whitespace around days', () => {
    expect(parseMeetingDays('Tuesday / Thursday')).toEqual(['tuesday', 'thursday'])
  })

  it('lowercases all days', () => {
    expect(parseMeetingDays('MONDAY')).toEqual(['monday'])
  })

  it('filters empty segments', () => {
    expect(parseMeetingDays('Monday/')).toEqual(['monday'])
  })
})

describe('matchesMeetingDay', () => {
  it('returns false for undefined meetingDay', () => {
    expect(matchesMeetingDay(undefined, 'Tuesday')).toBe(false)
  })

  it('returns false for empty meetingDay', () => {
    expect(matchesMeetingDay('', 'Tuesday')).toBe(false)
  })

  it('matches single day (case-insensitive)', () => {
    expect(matchesMeetingDay('Tuesday', 'tuesday')).toBe(true)
    expect(matchesMeetingDay('tuesday', 'Tuesday')).toBe(true)
    expect(matchesMeetingDay('TUESDAY', 'tuesday')).toBe(true)
  })

  it('matches when day is one of multiple slash-separated days', () => {
    expect(matchesMeetingDay('Tuesday/Thursday', 'thursday')).toBe(true)
    expect(matchesMeetingDay('Tuesday/Thursday', 'tuesday')).toBe(true)
  })

  it('does not match a day not in the list', () => {
    expect(matchesMeetingDay('Tuesday/Thursday', 'wednesday')).toBe(false)
  })

  it('handles whitespace around slash-separated days', () => {
    expect(matchesMeetingDay('Tuesday / Thursday', 'thursday')).toBe(true)
  })
})
