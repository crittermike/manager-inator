import { describe, it, expect } from 'vitest'
import { buildMeetingAttendees, shouldRecordAttendees } from '../../src/renderer/utils/captureAttendees'

describe('buildMeetingAttendees', () => {
  it('puts the current user first when set', () => {
    expect(buildMeetingAttendees('Mike', ['Jennifer'])).toEqual(['Mike', 'Jennifer'])
  })

  it('omits the current user when not set', () => {
    expect(buildMeetingAttendees('', ['Jennifer'])).toEqual(['Jennifer'])
    expect(buildMeetingAttendees(null, ['Jennifer'])).toEqual(['Jennifer'])
    expect(buildMeetingAttendees(undefined, ['Jennifer'])).toEqual(['Jennifer'])
  })

  it('deduplicates names case-insensitively, preserving the first occurrence casing', () => {
    expect(buildMeetingAttendees('Mike', ['mike', 'Jennifer', 'JENNIFER'])).toEqual(['Mike', 'Jennifer'])
  })

  it('trims whitespace and ignores blank names', () => {
    expect(buildMeetingAttendees('  Mike  ', ['  ', '\tJennifer\n', ''])).toEqual(['Mike', 'Jennifer'])
  })

  it('handles a missing people_mentioned list', () => {
    expect(buildMeetingAttendees('Mike', null)).toEqual(['Mike'])
    expect(buildMeetingAttendees('Mike', undefined)).toEqual(['Mike'])
  })

  it('returns an empty list when there are no attendees at all', () => {
    expect(buildMeetingAttendees('', [])).toEqual([])
  })
})

describe('shouldRecordAttendees', () => {
  it('records attendees when the AI classifies as a meeting', () => {
    expect(shouldRecordAttendees('meeting', '')).toBe(true)
  })

  it('records attendees when the source hint is meeting (even if AI disagrees)', () => {
    expect(shouldRecordAttendees('other', 'meeting')).toBe(true)
  })

  it('does not record attendees for non-meeting sources', () => {
    expect(shouldRecordAttendees('slack', '')).toBe(false)
    expect(shouldRecordAttendees('feedback', 'feedback')).toBe(false)
    expect(shouldRecordAttendees(null, null)).toBe(false)
  })
})
