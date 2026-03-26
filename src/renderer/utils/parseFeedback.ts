/**
 * Parse AI-generated feedback blob into per-person entries.
 *
 * Expected format (new):
 *   <!-- FEEDBACK: PersonName -->
 *   **Type:** positive
 *   [content]
 *   <!-- END FEEDBACK -->
 *
 * Legacy fallback: `### Name — type` headings
 */

export interface ParsedFeedbackEntry {
  reportName: string
  type: 'positive' | 'constructive' | 'mixed'
  content: string
}

const FEEDBACK_BLOCK_RE = /<!-- FEEDBACK:\s*(.+?)\s*-->([\s\S]*?)<!-- END FEEDBACK -->/g
const TYPE_RE = /\*\*Type:\*\*\s*(positive|constructive|mixed)/i
const LEGACY_HEADING_RE = /^### (.+?)\s*[—–-]\s*(positive|constructive|mixed)\s*$/gim

export function parseFeedbackByPerson(feedbackBlob: string): ParsedFeedbackEntry[] {
  const entries: ParsedFeedbackEntry[] = []

  let match: RegExpExecArray | null
  FEEDBACK_BLOCK_RE.lastIndex = 0
  while ((match = FEEDBACK_BLOCK_RE.exec(feedbackBlob)) !== null) {
    const reportName = match[1].trim()
    const body = match[2].trim()

    const typeMatch = body.match(TYPE_RE)
    const type = (typeMatch?.[1]?.toLowerCase() as ParsedFeedbackEntry['type']) ?? 'mixed'
    const content = body.replace(TYPE_RE, '').trim()

    if (content) {
      entries.push({ reportName, type, content })
    }
  }

  if (entries.length > 0) return entries

  // Legacy fallback: `### Name — type` heading-delimited sections
  LEGACY_HEADING_RE.lastIndex = 0
  const headings: { name: string; type: ParsedFeedbackEntry['type']; index: number; fullMatch: string }[] = []
  while ((match = LEGACY_HEADING_RE.exec(feedbackBlob)) !== null) {
    headings.push({
      name: match[1].trim(),
      type: match[2].toLowerCase() as ParsedFeedbackEntry['type'],
      index: match.index,
      fullMatch: match[0],
    })
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index + headings[i].fullMatch.length
    const end = i + 1 < headings.length ? headings[i + 1].index : feedbackBlob.length
    const content = feedbackBlob.slice(start, end).trim().replace(/^>\s*/gm, '').trim()

    if (content) {
      entries.push({
        reportName: headings[i].name,
        type: headings[i].type,
        content,
      })
    }
  }

  return entries
}

/**
 * Match parsed feedback entry to a report via displayName.
 * Cascade: exact → case-insensitive → first-name prefix.
 */
export function matchFeedbackToReport<T extends { name: string; displayName: string }>(
  entry: ParsedFeedbackEntry,
  reports: T[],
): T | undefined {
  const exact = reports.find(r => r.displayName === entry.reportName)
  if (exact) return exact

  const lower = entry.reportName.toLowerCase()
  const caseInsensitive = reports.find(r => r.displayName.toLowerCase() === lower)
  if (caseInsensitive) return caseInsensitive

  return reports.find(r =>
    r.displayName.toLowerCase().startsWith(lower + ' ') ||
    r.displayName.toLowerCase() === lower
  )
}
