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

type StreamCallback = (chunk: string) => void

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
  requestId: string
): Promise<string> {
  const entry = { session: null as unknown as CopilotSession, cancelled: false }
  let unsubscribe: (() => void) | null = null
  const messages = buildMessages(action, context)
  let fullResponse = ''

  try {
    const c = await getClient()
    const settings = getSettings()
    const model = settings.defaultModel || 'claude-sonnet-4-5'
    debugLog('[Copilot SDK] Model:', model)

    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
    const userMessage = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n')

    const session = await c.createSession({
      model,
      systemMessage: systemMessages ? { content: systemMessages } : undefined,
      onPermissionRequest: approveAll
    })
    entry.session = session
    activeSessions.set(requestId, entry)

    unsubscribe = session.on((event: { type: string; data: Record<string, unknown> }) => {
      if (entry.cancelled) return
      debugLog('[Copilot SDK] Event:', event.type)
      if (event.type === 'assistant.message_delta') {
        const delta = (event.data as { deltaContent?: string }).deltaContent
        if (delta) {
          fullResponse += delta
          onChunk(delta)
        }
      } else if (event.type === 'assistant.message') {
        const content = (event.data as { content?: string }).content
        if (content && !fullResponse) {
          fullResponse = content
          onChunk(content)
        }
      }
      if (!fullResponse && event.data) {
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
    const response = await Promise.race([
      session.sendAndWait({ prompt: userMessage }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timed out')), AI_REQUEST_TIMEOUT_MS)
      )
    ])
    debugLog('[Copilot SDK] sendAndWait returned:', typeof response)
    if (!fullResponse && response) {
      if (typeof response === 'string') {
        fullResponse = response
      } else if (typeof response === 'object') {
        const r = response as Record<string, unknown>
        const content = (r.content || r.text || r.message) as string | undefined
        if (content) fullResponse = content
      }
    }
    debugLog('[Copilot SDK] Response complete:', fullResponse.length, 'chars')

  } catch (error) {
    if (entry.cancelled) {
      return fullResponse
    }
    console.error('[Copilot SDK] Error:', (error as Error).message, (error as Error).stack)
    throw error
  } finally {
    if (unsubscribe) try { unsubscribe() } catch {}
    if (entry.session) try { await entry.session.disconnect() } catch {}
    activeSessions.delete(requestId)
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

  if (context.customInstructions) {
    messages.push({
      role: 'system',
      content: `Additional instructions for this person:\n${context.customInstructions}`
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
${context.summaries ? `Recent 1:1 summaries:\n${context.summaries}` : 'No recent summaries available.'}
${context.feedback ? `Feedback log:\n${context.feedback}` : ''}
${context.actionItems ? `Action items:\n${context.actionItems}` : ''}`
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
${context.summaries ? `Recent 1:1 summaries:\n${context.summaries}` : 'No recent summaries available.'}

${context.actionItems ? `Open action items:\n${context.actionItems}` : 'No open action items.'}

${context.feedback ? `Recent feedback:\n${context.feedback}` : ''}`
      })
      break

    case 'chat':
      messages.push({
        role: 'user',
        content: context.message as string
      })
      if (Array.isArray(context.history)) {
        const historyMessages = context.history as CopilotMessage[]
        messages.splice(1, 0, ...historyMessages)
      }
      break

    default:
      messages.push({
        role: 'user',
        content: `${action}: ${JSON.stringify(context)}`
      })
  }

  return messages
}
