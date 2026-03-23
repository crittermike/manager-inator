const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.vtt', '.srt']
const SUBTITLE_EXTENSIONS = ['.vtt', '.srt']

const TIMESTAMP_LINE = /^\d{2}:\d{2}[:\.,]\d{2,3}\s*-->\s*\d{2}:\d{2}[:\.,]\d{2,3}/
const SRT_CUE_INDEX = /^\d+$/
const VTT_HEADER = /^WEBVTT/
const VTT_METADATA = /^(NOTE|STYLE|REGION)\b/
const VTT_CUE_SETTING = /^(align|position|size|line|vertical):/i
const HTML_TAGS = /<\/?[^>]+>/g

export function isSupportedTranscriptFile(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.some(ext => filename.endsWith(ext))
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot).toLowerCase() : ''
}

export function isSubtitleFile(filename: string): boolean {
  return SUBTITLE_EXTENSIONS.some(ext => filename.endsWith(ext))
}

export function stripSubtitleFormatting(text: string): string {
  const lines = text.split(/\r?\n/)
  const spoken: string[] = []
  let prevLine = ''

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (VTT_HEADER.test(line)) continue
    if (VTT_METADATA.test(line)) continue
    if (TIMESTAMP_LINE.test(line)) continue
    if (SRT_CUE_INDEX.test(line)) continue
    if (VTT_CUE_SETTING.test(line)) continue

    const cleaned = line.replace(HTML_TAGS, '').trim()
    if (!cleaned) continue
    if (cleaned === prevLine) continue

    spoken.push(cleaned)
    prevLine = cleaned
  }

  return spoken.join('\n')
}

export function readTranscriptFile(filename: string, rawText: string): string {
  if (isSubtitleFile(filename)) {
    return stripSubtitleFormatting(rawText)
  }
  return rawText
}

export function stripTranscriptExtension(filename: string): string {
  const ext = getExtension(filename)
  if (SUPPORTED_EXTENSIONS.includes(ext)) {
    return filename.slice(0, -ext.length)
  }
  return filename
}
