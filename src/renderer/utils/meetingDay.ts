export function matchesMeetingDay(meetingDay: string | undefined, dayName: string): boolean {
  if (!meetingDay) return false
  return meetingDay
    .toLowerCase()
    .split('/')
    .some(d => d.trim() === dayName.toLowerCase())
}

export function parseMeetingDays(meetingDay: string | undefined): string[] {
  if (!meetingDay) return []
  return meetingDay
    .toLowerCase()
    .split('/')
    .map(d => d.trim())
    .filter(Boolean)
}
