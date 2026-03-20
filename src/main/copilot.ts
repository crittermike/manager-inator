import { CopilotClient, approveAll } from '@github/copilot-sdk'
import { getSettings } from './store'
import { execSync } from 'child_process'

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

type StreamCallback = (chunk: string) => void

interface CopilotMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

let client: CopilotClient | null = null
let activeAbortController: AbortController | null = null

async function getClient(): Promise<CopilotClient> {
  if (!client) {
    let cliPath: string | undefined
    try {
      cliPath = execSync('which copilot', { encoding: 'utf-8' }).trim()
    } catch {
      // Try common paths
      const fs = await import('fs')
      for (const p of [`${process.env.HOME}/.local/bin/copilot`, '/usr/local/bin/copilot', '/opt/homebrew/bin/copilot']) {
        try { fs.statSync(p); cliPath = p; break } catch { /* next */ }
      }
    }

    console.log('[Copilot SDK] CLI path:', cliPath || 'auto-detect')
    client = new CopilotClient({
      ...(cliPath ? { cliPath } : {}),
      useLoggedInUser: true,
      autoStart: false
    } as ConstructorParameters<typeof CopilotClient>[0])
    await client.start()
    console.log('[Copilot SDK] Client started')
  }
  return client
}

export async function aiGenerate(
  action: string,
  context: Record<string, unknown>,
  onChunk: StreamCallback
): Promise<string> {
  activeAbortController = new AbortController()
  const messages = buildMessages(action, context)
  let fullResponse = ''

  try {
    const c = await getClient()
    const settings = getSettings()
    const model = settings.defaultModel || 'claude-sonnet-4-5'
    console.log('[Copilot SDK] Model:', model)

    const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
    const userMessage = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n')

    const session = await c.createSession({
      model,
      systemMessage: systemMessages || undefined,
      onPermissionRequest: approveAll
    })

    // Listen to all events for streaming
    session.on((event: { type: string; data: Record<string, unknown> }) => {
      console.log('[Copilot SDK] Event:', event.type)
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
    })

    console.log('[Copilot SDK] Sending message...')
    await session.sendAndWait({ prompt: userMessage })
    console.log('[Copilot SDK] Response complete:', fullResponse.length, 'chars')

  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return fullResponse
    }
    console.error('[Copilot SDK] Error:', (error as Error).message, (error as Error).stack)
    throw error
  } finally {
    activeAbortController = null
  }

  return fullResponse
}

export function aiCancel(): void {
  activeAbortController?.abort()
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
| Action | Owner | Due |
|--------|-------|-----|

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

Use this exact markdown format with proper headings and bullet points:

# Meeting summary: ${context.meetingTitle} — ${context.date}

## Overview
[2-3 sentence summary]

## Key topics discussed
- [bullet point per topic]

## Decisions made
- [any decisions]

## Action items
| Action | Owner | Due |
|--------|-------|-----|

## Relevant notes for my reports
[anything noteworthy about specific direct reports]

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

Format your response as well-structured markdown with clear headings and bullet points.

## Carry-forward action items
List any unchecked action items from recent meetings.

## Discussion topics
Based on recent activity, what should we discuss?

## Quick context
Brief notes on what's been happening.

## Questions to ask
Specific questions for this person.

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
