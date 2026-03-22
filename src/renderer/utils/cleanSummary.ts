export function cleanSummaryContent(content: string): string {
  let cleaned = content
  cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n*/m, '').trim()          // YAML frontmatter
  cleaned = cleaned.replace(/^Here(?:'s| is) (?:your |the )?(?:meeting )?summary:?\s*\n*/i, '').trim() // AI preamble
  cleaned = cleaned.replace(/^---\n*/m, '').trim()                          // stray horizontal rule
  cleaned = cleaned.replace(/\*\*speakers:\*\*\n(?:[-*]\s+.+\n?)*/im, '').trim() // bold speaker list
  cleaned = cleaned.replace(/## Attendees\n(?:[-*]\s+.+\n?)*/m, '').trim()  // attendees section
  return cleaned
}
