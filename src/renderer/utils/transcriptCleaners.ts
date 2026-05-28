/**
 * Convert VTT and SRT meeting transcripts into clean, readable markdown.
 *
 * Output format:
 *   **Speaker A:** First chunk of speech merged from consecutive cues.
 *
 *   **Speaker B:** Reply.
 *
 * If no speakers can be parsed, the cleaned text is emitted as plain paragraphs.
 */

interface Cue {
  speaker: string | null
  text: string
}

const TIMESTAMP_LINE = /^\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{2,3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{2,3}/
const SRT_INDEX_LINE = /^\s*\d+\s*$/
const VOICE_TAG = /<v\s+([^>]+?)>([\s\S]*?)(?:<\/v>|$)/gi
const HTML_TAG = /<[^>]+>/g
const VTT_NOTE_BLOCK = /^NOTE\b[\s\S]*?(?=\n\s*\n|$)/m

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripHtml(s: string): string {
  return decodeHtmlEntities(s.replace(HTML_TAG, '')).replace(/\s+/g, ' ').trim()
}

function extractSpeakerFromVoiceTag(payload: string): { speaker: string | null; text: string } {
  // Try matching <v Speaker>text</v> (or unclosed). If multiple voice tags appear
  // in a single cue, the first speaker is used and the rest are concatenated.
  const matches = [...payload.matchAll(VOICE_TAG)]
  if (matches.length === 0) {
    return { speaker: null, text: stripHtml(payload) }
  }
  const speaker = matches[0][1].trim() || null
  const text = matches.map(m => stripHtml(m[2] || '')).filter(Boolean).join(' ')
  return { speaker, text }
}

function extractInlineSpeakerPrefix(text: string): { speaker: string | null; text: string } {
  // Match "Name: text" (not "URL:" / time-like). Speaker name must be 1-4 capitalized words.
  const match = text.match(/^([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})\s*:\s+(.+)$/)
  if (match) return { speaker: match[1].trim(), text: match[2].trim() }
  return { speaker: null, text }
}

function parseVtt(raw: string): Cue[] {
  // Strip NOTE blocks
  let body = raw.replace(/^WEBVTT[^\n]*\n/i, '')
  // remove all NOTE blocks
  while (true) {
    const m = body.match(VTT_NOTE_BLOCK)
    if (!m) break
    body = body.slice(0, m.index!) + body.slice(m.index! + m[0].length)
  }

  const blocks = body.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const cues: Cue[] = []

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trimEnd())
    let timestampIdx = lines.findIndex(l => TIMESTAMP_LINE.test(l))
    if (timestampIdx === -1) continue
    const payloadLines = lines.slice(timestampIdx + 1)
    const payload = payloadLines.join('\n').trim()
    if (!payload) continue
    const { speaker, text } = extractSpeakerFromVoiceTag(payload)
    if (text) cues.push({ speaker, text })
  }

  return cues
}

function parseSrt(raw: string): Cue[] {
  const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const cues: Cue[] = []

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trimEnd())
    let i = 0
    if (i < lines.length && SRT_INDEX_LINE.test(lines[i])) i++
    if (i >= lines.length || !TIMESTAMP_LINE.test(lines[i])) continue
    i++
    const payload = lines.slice(i).join('\n').trim()
    if (!payload) continue
    const cleaned = stripHtml(payload)
    const { speaker, text } = extractInlineSpeakerPrefix(cleaned)
    if (text) cues.push({ speaker, text })
  }

  return cues
}

function mergeAdjacentSameSpeaker(cues: Cue[]): Cue[] {
  const out: Cue[] = []
  for (const c of cues) {
    const prev = out[out.length - 1]
    if (prev && prev.speaker && c.speaker && prev.speaker === c.speaker) {
      prev.text = `${prev.text} ${c.text}`.replace(/\s+/g, ' ').trim()
    } else {
      out.push({ ...c })
    }
  }
  return out
}

function formatCues(cues: Cue[]): string {
  if (cues.length === 0) return ''
  const anySpeaker = cues.some(c => c.speaker)
  if (!anySpeaker) {
    return cues.map(c => c.text).join('\n\n').trim()
  }
  return cues
    .map(c => (c.speaker ? `**${c.speaker}:** ${c.text}` : c.text))
    .join('\n\n')
    .trim()
}

/**
 * Clean a captured transcript file based on its filename extension.
 * Falls through to the original raw text for unrecognized extensions.
 */
export function cleanTranscript(filename: string | undefined, raw: string): string {
  if (!filename) return raw
  const lower = filename.toLowerCase()
  let cues: Cue[]
  if (lower.endsWith('.vtt')) {
    cues = parseVtt(raw)
  } else if (lower.endsWith('.srt')) {
    cues = parseSrt(raw)
  } else {
    return raw
  }
  const merged = mergeAdjacentSameSpeaker(cues)
  const formatted = formatCues(merged)
  return formatted || raw.trim()
}

export const __test = { parseVtt, parseSrt, mergeAdjacentSameSpeaker, extractSpeakerFromVoiceTag, extractInlineSpeakerPrefix }

// Section/field labels that may appear in `**Label:**` form inside captured
// markdown but are NOT speaker names. Lowercased for case-insensitive matching.
const SPEAKER_BLOCKLIST = new Set([
  'summary',
  'attendees',
  'attendee',
  'action items',
  'action item',
  'feedback',
  'notes',
  'context',
  'key context',
  'raw content',
  'type',
  'source',
  'date',
  'title',
  'tags',
  'overview',
  'agenda',
  'next steps',
  'decisions',
  'topic',
  'topics',
  'pr',
  'issue',
  'link',
  'tldr',
  'tl;dr',
  'tl dr',
])

// A plausible person name: 1-4 whitespace-separated tokens, each starting with
// a letter and containing only letters, apostrophes, hyphens, or periods.
const NAME_TOKEN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'.\-]*$/

function looksLikePersonName(raw: string): boolean {
  const name = raw.trim()
  if (!name) return false
  if (SPEAKER_BLOCKLIST.has(name.toLowerCase())) return false
  const tokens = name.split(/\s+/)
  if (tokens.length < 1 || tokens.length > 4) return false
  return tokens.every(t => NAME_TOKEN.test(t))
}

/**
 * Extract a deduplicated list of speakers from content that already contains
 * `**Speaker:**` prefixes at the start of paragraphs (the format produced by
 * `cleanTranscript` for VTT/SRT inputs, and the convention used by some
 * meeting note tools).
 *
 * Recognizes both `**Name:**` and `**Name**:` forms. Skips obvious section
 * labels via a small blocklist (Summary, Attendees, Action items, etc.) and
 * tokens that don't look like a person name. Dedup is case-insensitive but the
 * first-seen casing is preserved.
 *
 * Returns `[]` when no speaker prefixes are detected — callers can then fall
 * back to other sources (AI attendees, manual entry, etc.).
 */
export function extractSpeakersFromCleanedTranscript(content: string): string[] {
  if (!content) return []
  // Match `**Name:**` or `**Name**:` at the start of a line. The optional
  // leading characters allow for list markers like `- **Name:**` too.
  const pattern = /^[\s>*\-]*\*\*([^*:\n]{1,80})(?::\*\*|\*\*\s*:)/gm
  const seen = new Set<string>()
  const out: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const raw = match[1].trim().replace(/\s+/g, ' ')
    if (!looksLikePersonName(raw)) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(raw)
  }
  return out
}
