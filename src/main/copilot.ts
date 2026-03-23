import { CopilotClient, approveAll } from '@github/copilot-sdk'
import { getSettings } from './store'
import { spawn } from 'child_process'

const isDev = !!process.env['ELECTRON_RENDERER_URL']
function debugLog(...args: unknown[]): void {
  if (isDev) console.log(...args)
}

const SYSTEM_PROMPT = `You are an AI assistant for Manager-inator, an engineering management tool.
You help managers with performance management tasks: writing check-ins, summarizing 1:1s,
tracking action items, giving feedback, and preparing for meetings.

WRITING RULES (apply to ALL generated content):
- Never use em dashes (—). Use commas, periods, colons, or restructure the sentence.
- Never use "not just X, it was Y" pattern.
- Always use sentence case for headings. Never Title Case.
- Casual, direct tone. Short sentences. Conversational.
- No filler. Skip "Great work!" or "I'd like to highlight..." Just state what happened.
- Behavior-anchored feedback. Cite specific PRs, issues, meetings, decisions.

NAME CORRECTIONS (always apply):
- "Nick" → "Nic"
- "gas" / "Gas" → "GHAS" (GitHub Advanced Security)
- "Akash" → "Aakash"
- "Chanakia" / "Chinakia" → "Chanakya"
- "Katu" → "Catu"
- Tara uses they/them pronouns`

const AI_REQUEST_TIMEOUT_MS = 120_000
const CHAT_REQUEST_TIMEOUT_MS = 300_000

// Copilot SDK tool-call formats to strip from streamed text:
//   <tool_call>...</tool_call>  or  <tool_calls>...</tool_calls>   (XML)
//   <tool_call [ {"tool_call_id": ...} ]                           (bracket JSON, no closing tag)
//   <tool_result>...</tool_result>                                  (tool output)
const TOOL_XML_REGEX = /<\/?tool_(?:call|result)s?(?:\s[^>]*)?>[\s\S]*?<\/tool_(?:call|result)s?>\s*/g
const TOOL_BRACKET_REGEX = /<tool_(?:call|result)s?\s*\[[\s\S]*?\]\s*/g
const TOOL_RESULT_TAG_REGEX = /<tool_(?:call|result)s?[^>]*>[\s\S]*?<\/tool_(?:call|result)s?>\s*/g
const PARTIAL_TOOL_REGEX = /<tool_(?:call|result)s?[\s\S]*$/

function stripToolCalls(text: string): { clean: string; hasPartial: boolean } {
  let stripped = text
  stripped = stripped.replace(TOOL_XML_REGEX, '')
  stripped = stripped.replace(TOOL_BRACKET_REGEX, '')
  stripped = stripped.replace(TOOL_RESULT_TAG_REGEX, '')
  const hasPartial = PARTIAL_TOOL_REGEX.test(stripped)
  const clean = hasPartial ? stripped.replace(PARTIAL_TOOL_REGEX, '') : stripped
  return { clean: clean.trim(), hasPartial }
}

type StreamCallback = (chunk: string) => void
type ToolStatusCallback = (toolName: string, args: Record<string, unknown>) => void

interface CopilotMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

let client: CopilotClient | null = null

type CopilotSession = Awaited<ReturnType<CopilotClient['createSession']>>
const activeSessions = new Map<string, { session: CopilotSession; cancelled: boolean }>()

async function getClient(): Promise<CopilotClient> {
  if (!client) {
    let cliPath: string | undefined
    try {
      cliPath = await new Promise<string>((resolve, reject) => {
        const child = spawn('which', ['copilot'], { stdio: ['ignore', 'pipe', 'ignore'] })
        let out = ''
        child.stdout.on('data', (d: Buffer) => { out += d.toString() })
        child.on('error', reject)
        child.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error('not found')))
      })
    } catch {
      // Try common paths
      const fs = await import('fs')
      for (const p of [`${process.env.HOME}/.local/bin/copilot`, '/usr/local/bin/copilot', '/opt/homebrew/bin/copilot']) {
        try { fs.statSync(p); cliPath = p; break } catch { /* next */ }
      }
    }

    debugLog('[Copilot SDK] CLI path:', cliPath || 'auto-detect')
    client = new CopilotClient({
      ...(cliPath ? { cliPath } : {}),
      useLoggedInUser: true,
      autoStart: false
    } as ConstructorParameters<typeof CopilotClient>[0])
    await client.start()
    debugLog('[Copilot SDK] Client started')
  }
  return client
}

export async function aiGenerate(
  action: string,
  context: Record<string, unknown>,
  onChunk: StreamCallback,
  requestId: string,
  onToolStatus?: ToolStatusCallback
): Promise<string> {
  const entry = { session: null as unknown as CopilotSession, cancelled: false }
  let unsubscribe: (() => void) | null = null
  const messages = buildMessages(action, context)
  let fullResponse = ''
  const isChat = action === 'chat'
  let lastSentLength = 0

  try {
    const c = await getClient()
    const settings = getSettings()
    const model = settings.defaultModel || 'claude-sonnet-4-5'
    debugLog('[Copilot SDK] Model:', model, 'Action:', action)

    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
    const userMessage = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n')

    const session = await c.createSession({
      model,
      streaming: true,
      ...(isChat
        ? {
            availableTools: ['read_file', 'list_directory'],
            workingDirectory: settings.repoPath,
            systemMessage: systemMessages
              ? { mode: 'append' as const, content: systemMessages }
              : undefined
          }
        : {
            availableTools: [],
            systemMessage: systemMessages
              ? { mode: 'replace' as const, content: systemMessages }
              : undefined
          }),
      onPermissionRequest: approveAll
    })
    entry.session = session
    activeSessions.set(requestId, entry)

    unsubscribe = session.on((event: { type: string; data: Record<string, unknown> }) => {
      if (entry.cancelled) return
      debugLog('[Copilot SDK] Event:', event.type, 'keys:', Object.keys(event.data || {}))
      if (event.type === 'assistant.message_delta') {
        const delta = (event.data as { deltaContent?: string }).deltaContent
        if (delta) {
          fullResponse += delta
          if (isChat) {
            const { clean } = stripToolCalls(fullResponse)
            if (clean.length > lastSentLength) {
              onChunk(clean.slice(lastSentLength))
              lastSentLength = clean.length
            }
          } else {
            onChunk(delta)
          }
        }
      } else if (event.type === 'assistant.message') {
        const content = (event.data as { content?: string }).content
        if (content && !fullResponse) {
          fullResponse = content
          if (isChat) {
            const { clean } = stripToolCalls(fullResponse)
            onChunk(clean)
            lastSentLength = clean.length
          } else {
            onChunk(content)
          }
        }
      } else if (event.type === 'tool.execution_start' && onToolStatus) {
        const data = event.data as { toolName?: string; arguments?: Record<string, unknown> }
        if (data.toolName) {
          onToolStatus(data.toolName, data.arguments || {})
        }
      }
      if (!fullResponse && event.data && event.type.startsWith('assistant.')) {
        const possibleContent = (event.data as Record<string, unknown>).content ||
          (event.data as Record<string, unknown>).text ||
          (event.data as Record<string, unknown>).message
        if (typeof possibleContent === 'string' && possibleContent.length > 10) {
          fullResponse = possibleContent
          onChunk(possibleContent)
        }
      }
    })

    debugLog('[Copilot SDK] Sending message...')
    const timeout = isChat ? CHAT_REQUEST_TIMEOUT_MS : AI_REQUEST_TIMEOUT_MS
    const response = await Promise.race([
      session.sendAndWait({ prompt: userMessage }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timed out')), timeout)
      )
    ])
    debugLog('[Copilot SDK] sendAndWait returned:', typeof response)

    // Extract content from sendAndWait return value
    let returnContent = ''
    if (response) {
      if (typeof response === 'string') {
        returnContent = response
      } else if (typeof response === 'object') {
        const r = response as Record<string, unknown>
        returnContent = ((r.content || r.text || r.message) as string) || ''
      }
    }

    // If sendAndWait returned content that streaming didn't capture (common in agent/tool mode),
    // use it as the full response and stream any new text to the renderer.
    // In chat/agent mode, fullResponse may be bloated with tool-call XML that gets stripped,
    // so compare against the clean text length, not the raw fullResponse length.
    if (returnContent) {
      const cleanSoFar = isChat ? stripToolCalls(fullResponse).clean : fullResponse
      if (!cleanSoFar || returnContent.length > cleanSoFar.length) {
        if (isChat) {
          // returnContent from sendAndWait is already clean (no tool XML)
          if (returnContent.length > lastSentLength) {
            onChunk(returnContent.slice(lastSentLength))
            lastSentLength = returnContent.length
          }
          // Rebuild fullResponse so final strip produces the right result
          fullResponse = returnContent
        } else {
          fullResponse = returnContent
        }
      }
    }
    debugLog('[Copilot SDK] Response complete:', fullResponse.length, 'chars')

  } catch (error) {
    if (entry.cancelled) {
      return isChat ? stripToolCalls(fullResponse).clean : fullResponse
    }
    console.error('[Copilot SDK] Error:', (error as Error).message, (error as Error).stack)
    throw error
  } finally {
    if (unsubscribe) try { unsubscribe() } catch {}
    if (entry.session) try { await entry.session.disconnect() } catch {}
    activeSessions.delete(requestId)
  }

  if (isChat) {
    fullResponse = stripToolCalls(fullResponse).clean
  }
  return fullResponse
}

export async function aiCancel(requestId?: string): Promise<void> {
  if (requestId) {
    const entry = activeSessions.get(requestId)
    if (entry) {
      entry.cancelled = true
      try { await entry.session.abort() } catch {}
    }
  } else {
    // Cancel all active sessions (fallback)
    for (const [, entry] of activeSessions) {
      entry.cancelled = true
      try { await entry.session.abort() } catch {}
    }
  }
}

export async function stopClient(): Promise<void> {
  if (client) {
    try { await client.stop() } catch {}
    client = null
  }
}

function buildMessages(
  action: string,
  context: Record<string, unknown>
): CopilotMessage[] {
  const messages: CopilotMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

  const settings = getSettings()
  if (settings.aiCustomInstructions) {
    messages.push({
      role: 'system',
      content: `Custom instructions from the manager:\n${settings.aiCustomInstructions}`
    })
  }

  switch (action) {
    case 'summarize-transcript':
      messages.push({
        role: 'user',
        content: `Summarize this 1:1 transcript for ${context.reportName}.

Use this exact markdown format with proper headings and bullet points:

# 1:1 Summary — ${context.date}
_Auto-generated summary of [transcript](../transcripts/${context.date}.md)_

## Meeting overview
[1-2 sentence context]

## Key discussion topics
- [bullet point per topic]

## Wins and accomplishments
- [specific wins]

## Challenges and concerns
- [challenges]

## Action items
- [ ] **Owner**: Action description (due date if mentioned)

## Sentiment check
[emotional/engagement tone]

## Follow-up needed
- [next steps]

TRANSCRIPT:
${context.transcript}`
      })
      break

    case 'summarize-meeting':
      messages.push({
        role: 'user',
        content: `Summarize this meeting transcript. My direct reports are: ${context.reportNames}.

Start the output with a YAML frontmatter block listing the speakers, then the markdown summary.

Use this EXACT format:

---
speakers:
  - Name One
  - Name Two
---

# Meeting summary: ${context.meetingTitle} — ${context.date}

## Overview
[2-3 sentence summary]

## Key topics discussed
- [bullet point per topic]

## Decisions made
- [any decisions]

## Action items
- [ ] **Owner**: Action description (due date if mentioned)

## Relevant notes for my reports
[anything noteworthy about specific direct reports]

Do NOT include a separate "Attendees" section — the speakers frontmatter already captures who was in the meeting.

TRANSCRIPT:
${context.transcript}`
      })
      break

    case 'extract-action-items':
      messages.push({
        role: 'user',
        content: `Extract action items from this transcript for ${context.reportName}.

Return as a markdown checkbox list:
- [ ] **Owner**: Action description

TRANSCRIPT:
${context.transcript}`
      })
      break

    case 'extract-feedback':
      messages.push({
        role: 'user',
        content: `Review this meeting transcript and extract any feedback (positive, constructive, or notable observations) about any of my direct reports: ${context.reportNames}.

For each piece of feedback, output markdown like:

### [Report name] — [positive/constructive]
> [specific observation with context]

If there's no relevant feedback for a person, skip them. Only include concrete, behavior-anchored observations. No generic praise.

TRANSCRIPT:
${context.transcript}`
      })
      break

    case 'extract-impact':
      messages.push({
        role: 'user',
        content: `Review this meeting transcript and extract any evidence of MY impact as a manager (Mike / crittermike). Look for:
- Decisions I made or influenced
- Problems I identified or solved
- People I coached, unblocked, or supported
- Process improvements I drove
- Cross-team coordination I facilitated
- Recognition I received from others

Format each item as a bullet point starting with a bold date and short title, like:
- **YYYY-MM-DD — Short title:** Description of the impact.

Only include concrete, specific items. Do NOT include any preamble like "Here's the impact..." — just the bullet list. If there's nothing notable, return "No manager impact items found in this transcript."

TRANSCRIPT:
${context.transcript}`
      })
      break

    case 'generate-checkin':
      messages.push({
        role: 'user',
        content: `Generate a monthly check-in for ${context.reportName} for ${context.month}.

Use this format:
# Monthly check-in: ${context.month}
_${context.displayName}, ${context.monthName}_

> ⚠️ This document is for manager's records only.

## Accomplishments
## Concerns
## Goal progress
## Areas for growth

Context data:
${context.about ? `About this person:\n${context.about}\n` : ''}
${context.jobExpectations ? `Job expectations for this role:\n${context.jobExpectations}\n` : ''}
${context.summaries ? `Recent 1:1 summaries:\n${context.summaries}` : 'No recent summaries available.'}
${context.checkInHistory ? `\nPrevious check-ins:\n${context.checkInHistory}` : ''}
${context.feedback ? `\nFeedback log:\n${context.feedback}` : ''}
${context.actionItems ? `\nAction items:\n${context.actionItems}` : ''}`
      })
      break

    case 'generate-review':
      messages.push({
        role: 'user',
        content: `Write a performance review for ${context.reportName} covering the period ${context.period}.
${context.displayName} is a ${context.role || 'team member'}.

Use this format:

# Performance review: ${context.displayName}
_Review period: ${context.period}_

## Summary
[2-3 sentence overall assessment. Be direct and specific.]

## Key accomplishments
- [Specific accomplishment with evidence from meetings, action items, or feedback]

## Strengths demonstrated
- [Observed strength with concrete examples from the review period]

## Areas for development
- [Specific area with actionable suggestions. Be constructive, not vague.]

## Notable contributions
- [Cross-team work, mentoring, process improvements, etc.]

## Looking ahead
[1-2 sentences on recommended focus for the next period.]

---

Base this review on the following data. Cite specific dates, topics, and outcomes where possible. Do NOT invent accomplishments. If data is thin, say so honestly and recommend gathering more signal.

${context.about ? `About this person:\n${context.about}\n` : ''}
${context.jobExpectations ? `Job expectations for this role:\n${context.jobExpectations}\n` : ''}
${context.pastReviews ? `Previous performance reviews:\n${context.pastReviews}\n` : ''}
${context.checkIns ? `Monthly check-ins from this period:\n${context.checkIns}\n` : 'No check-ins available for this period.\n'}
${context.summaries ? `1:1 meeting summaries:\n${context.summaries}\n` : 'No meeting summaries available.\n'}
${context.feedback ? `Feedback log:\n${context.feedback}\n` : 'No feedback logged.\n'}
${context.actionItems ? `Action items (completed and open):\n${context.actionItems}` : 'No action items available.'}`
      })
      break

    case 'prep-one-on-one':
      messages.push({
        role: 'user',
        content: `Prepare notes for my upcoming 1:1 with ${context.reportName}.

Return ONLY a markdown document with the sections below. Use checkbox syntax (- [ ]) for every action item and discussion topic so I can check them off during the meeting. Be specific and actionable.

## Carry-forward action items
List any unchecked action items from recent meetings as checkboxes:
- [ ] Owner: specific action item text

## Discussion topics
Based on recent activity, suggest topics as checkboxes:
- [ ] Topic description (why it matters)

## Quick context
Brief bullet points on what's been happening recently.

## Questions to ask
Specific questions as checkboxes:
- [ ] Question text

---

Context:
${context.about ? `About this person:\n${context.about}\n` : ''}
${context.jobExpectations ? `Job expectations for this role:\n${context.jobExpectations}\n` : ''}
${context.summaries ? `Recent 1:1 summaries:\n${context.summaries}` : 'No recent summaries available.'}

${context.actionItems ? `Open action items:\n${context.actionItems}` : 'No open action items.'}

${context.feedback ? `Recent feedback:\n${context.feedback}` : ''}

${context.crossMeetingMentions ? `Mentions of ${context.reportName} in other recent meetings (not their 1:1s). Use these to surface cross-team topics or things others said about them:\n${context.crossMeetingMentions}` : ''}`
      })
      break

    case 'chat': {
      // Give the agent a map of the data repo so it knows where to look
      messages.push({
        role: 'system',
        content: `You have read-only access to the manager's data repository via read_file and list_directory tools. Use them to look up specific information when answering questions.

DATA REPO STRUCTURE:
reports/{name}/              — One directory per direct report
  profile.md                 — Role, GitHub handle, meeting day, location, about section
  job-expectations.md        — Role expectations, competencies, performance criteria
  check-ins/monthly/YYYY-MM.md — Monthly performance check-ins
  feedback/log.md            — Feedback entries (append-only log)
  reviews/YYYY-HN.md         — Performance reviews (H1/H2)
  prep/YYYY-MM-DD.md         — 1:1 prep documents
  priorities.md              — Current weekly priorities/focus areas
meetings/                    — AI-generated meeting summaries with YAML speaker frontmatter
  YYYY-MM-DD-slug.md         — Each file is a summary (title + speakers in frontmatter, summary content in body)
transcripts/processed/       — Raw meeting transcripts
  YYYY-MM-DD-slug.txt        — Original unprocessed transcripts
people/                      — Profiles for anyone (not just direct reports)
  firstname-lastname.md      — Person profiles with YAML frontmatter (name, role, relationship, etc.)
mike-impact-log.md           — Manager's impact evidence log

TIPS:
- Start with list_directory to see what's available before reading specific files.
- Every file in meetings/ is a summary. Raw transcripts are in transcripts/processed/.
- Check-in files are in check-ins/monthly/ and named by YYYY-MM.
- When looking for info about a person, check both reports/{name}/ and people/{slug}.md.`
      })

      // SDK is single-turn (sendAndWait) — fold history into prompt text
      let chatPrompt = ''
      if (Array.isArray(context.history)) {
        const historyMessages = context.history as CopilotMessage[]
        if (historyMessages.length > 0) {
          chatPrompt += 'Previous conversation:\n'
          for (const msg of historyMessages) {
            chatPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n\n`
          }
          chatPrompt += '---\n\n'
        }
      }
      chatPrompt += context.message as string
      messages.push({ role: 'user', content: chatPrompt })
      break
    }

    default:
      messages.push({
        role: 'user',
        content: `${action}: ${JSON.stringify(context)}`
      })
  }

  return messages
}
