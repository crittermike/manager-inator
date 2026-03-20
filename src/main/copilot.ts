import { getToken, getRepoConfig, getSettings } from './store'

// Copilot SDK integration for AI-powered features
// The SDK communicates with the Copilot backend for LLM inference

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

let activeAbortController: AbortController | null = null

export async function aiGenerate(
  action: string,
  context: Record<string, unknown>,
  onChunk: StreamCallback
): Promise<string> {
  activeAbortController = new AbortController()

  const messages = buildMessages(action, context)
  let fullResponse = ''

  try {
    // Use the Copilot SDK for inference
    // Falls back to direct API if SDK not available
    fullResponse = await streamFromCopilot(messages, onChunk, activeAbortController.signal)
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return fullResponse
    }
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

  // Add custom instructions if available
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

    case 'extract-action-items':
      messages.push({
        role: 'user',
        content: `Extract action items from this 1:1 transcript for ${context.reportName}.

Return as a markdown checkbox list:
- [ ] **Owner**: Action description

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
${context.goals ? `Current goals:\n${context.goals}` : ''}
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
      // Add conversation history if provided
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

async function streamFromCopilot(
  messages: CopilotMessage[],
  onChunk: StreamCallback,
  signal: AbortSignal
): Promise<string> {
  // Use GitHub Copilot API for chat completions
  // This uses the user's Copilot subscription via their GitHub token
  const token = getToken()
  if (!token) throw new Error('Not authenticated')

  // Get a Copilot token by exchanging the GitHub token
  const tokenRes = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    signal
  })

  if (!tokenRes.ok) {
    // Fallback: use the models API endpoint
    return streamFromModelsApi(messages, onChunk, signal, token)
  }

  const tokenData = await tokenRes.json()
  const copilotToken = tokenData.token

  const settings = getSettings()
  const model = settings.defaultModel || 'claude-sonnet-4.5'

  const res = await fetch(
    'https://api.githubcopilot.com/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${copilotToken}`,
        'Content-Type': 'application/json',
        'Copilot-Integration-Id': 'manager-inator-app'
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.3
      }),
      signal
    }
  )

  return processStream(res, onChunk)
}

async function streamFromModelsApi(
  messages: CopilotMessage[],
  onChunk: StreamCallback,
  signal: AbortSignal,
  token: string
): Promise<string> {
  const settings = getSettings()
  const model = settings.defaultModel || 'claude-sonnet-4.5'

  const res = await fetch(
    'https://models.github.ai/inference/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.3
      }),
      signal
    }
  )

  return processStream(res, onChunk)
}

async function processStream(
  res: Response,
  onChunk: StreamCallback
): Promise<string> {
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`AI request failed: ${res.status} ${error}`)
  }

  let fullResponse = ''
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6))
          const delta = data.choices?.[0]?.delta?.content
          if (delta) {
            fullResponse += delta
            onChunk(delta)
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  return fullResponse
}
