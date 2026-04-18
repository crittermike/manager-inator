/**
 * Build the deduplicated list of attendees for a captured meeting.
 *
 * The current user (manager) is always included first when known, then any
 * people the AI extracted as meaningfully discussed. Names are compared
 * case-insensitively for de-duplication; the original casing is preserved.
 */
export function buildMeetingAttendees(
  currentUserName: string | undefined | null,
  peopleMentioned: string[] | undefined | null,
): string[] {
  const attendees: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const name = (raw || '').trim()
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    attendees.push(name)
  }

  if (currentUserName) add(currentUserName)
  for (const p of peopleMentioned || []) add(p)

  return attendees
}

/**
 * Returns true if a captured item should have a `speakers:` frontmatter field
 * tracking attendees. Currently we only do this for meetings.
 */
export function shouldRecordAttendees(
  classifiedSource: string | undefined | null,
  sourceHint: string | undefined | null,
): boolean {
  return classifiedSource === 'meeting' || sourceHint === 'meeting'
}
