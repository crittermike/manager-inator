/**
 * Build the deduplicated list of attendees for a captured meeting.
 *
 * The current user (manager) is always included first when known, then any
 * names supplied as the actual attendees of the meeting (NOT
 * `people_mentioned` — those are people discussed, not necessarily present).
 * Names are compared case-insensitively for dedup; the first-seen casing is
 * preserved.
 *
 * Callers typically construct the `attendees` argument as the union of:
 *   - deterministic speakers parsed from the transcript content
 *   - the AI's `attendees` field from `classify-content`
 *
 * `people_mentioned` MUST NOT be passed in here. Passing mentioned-only people
 * causes them to be incorrectly listed as meeting speakers, which then
 * associates the meeting with their report stream in the UI.
 */
export function buildMeetingAttendees(
  currentUserName: string | undefined | null,
  attendees: string[] | undefined | null,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const name = (raw || '').trim()
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(name)
  }

  if (currentUserName) add(currentUserName)
  for (const p of attendees || []) add(p)

  return out
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
