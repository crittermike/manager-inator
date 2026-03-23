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

type StreamCallback = (chunk: string) => void
type ToolStatusCallback = (toolName: string, args: Record<string, unknown>) => void

export interface CopilotMessage {
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
  const unsubscribers: (() => void)[] = []
  const messages = buildMessages(action, context)
  const isChat = action === 'chat'
  const timeout = isChat ? CHAT_REQUEST_TIMEOUT_MS : AI_REQUEST_TIMEOUT_MS

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

    if (isChat) {
      // ── Chat mode (agent with tools) ──
      let currentTurnText = ''
      let lastSentLength = 0
      let inToolPhase = false
      let hasStreamedAnyContent = false

      unsubscribers.push(session.on('assistant.message_delta', (event) => {
        if (entry.cancelled || inToolPhase) return
        const delta = event.data.deltaContent
        if (delta) {
          currentTurnText += delta
          if (currentTurnText.length > lastSentLength) {
            onChunk(currentTurnText.slice(lastSentLength))
            lastSentLength = currentTurnText.length
            hasStreamedAnyContent = true
          }
        }
      }))

      unsubscribers.push(session.on('assistant.turn_start', () => {
        if (entry.cancelled) return
        debugLog('[Copilot SDK] Turn started')
        // Insert a visual break between turns so text doesn't concatenate
        if (hasStreamedAnyContent) {
          onChunk('\n\n')
        }
        currentTurnText = ''
        lastSentLength = 0
        inToolPhase = false
      }))

      unsubscribers.push(session.on('tool.execution_start', (event) => {
        if (entry.cancelled) return
        debugLog('[Copilot SDK] Tool:', event.data.toolName, event.data.arguments)
        inToolPhase = true
        if (onToolStatus) {
          onToolStatus(event.data.toolName, (event.data.arguments as Record<string, unknown>) || {})
        }
      }))

      unsubscribers.push(session.on('tool.execution_complete', () => {
        if (entry.cancelled) return
        debugLog('[Copilot SDK] Tool complete')
        inToolPhase = false
      }))

      unsubscribers.push(session.on('session.error', (event) => {
        debugLog('[Copilot SDK] Session error:', event.data.errorType, event.data.message)
      }))

      debugLog('[Copilot SDK] Sending chat message...')
      const response = await session.sendAndWait({ prompt: userMessage }, timeout)

      const finalContent = response?.data?.content || ''
      debugLog('[Copilot SDK] Chat complete:', finalContent.length, 'chars')

      if (finalContent && finalContent.length > lastSentLength) {
        onChunk(finalContent.slice(lastSentLength))
      }

      return finalContent
    } else {
      // ── Non-chat mode (simple generation, no tools) ──
      let fullResponse = ''

      unsubscribers.push(session.on('assistant.message_delta', (event) => {
        if (entry.cancelled) return
        const delta = event.data.deltaContent
        if (delta) {
          fullResponse += delta
          onChunk(delta)
        }
      }))

      unsubscribers.push(session.on('session.error', (event) => {
        debugLog('[Copilot SDK] Session error:', event.data.errorType, event.data.message)
      }))

      debugLog('[Copilot SDK] Sending message...')
      const response = await session.sendAndWait({ prompt: userMessage }, timeout)

      // Use sendAndWait return if streaming didn't capture anything
      const returnContent = response?.data?.content || ''
      if (returnContent && !fullResponse) {
        fullResponse = returnContent
        onChunk(returnContent)
      }

      debugLog('[Copilot SDK] Response complete:', fullResponse.length, 'chars')
      return fullResponse
    }
  } catch (error) {
    if (entry.cancelled) {
      return ''
    }
    console.error('[Copilot SDK] Error:', (error as Error).message, (error as Error).stack)
    throw error
  } finally {
    for (const unsub of unsubscribers) { try { unsub() } catch {} }
    if (entry.session) try { await entry.session.disconnect() } catch {}
    activeSessions.delete(requestId)
  }
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

export function buildMessages(
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
        content: `You have access to the manager's data repository. You can read files, list directories, edit files, and create new files. Use these tools to look up specific information and to make changes when asked.

When editing or creating files, follow existing conventions (markdown with YAML frontmatter where appropriate). The repository is git-tracked, so all changes are reversible.

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
- Start with ls to see what's available before reading specific files.
- Every file in meetings/ is a summary. Raw transcripts are in transcripts/processed/.
- Check-in files are in check-ins/monthly/ and named by YYYY-MM.
- When looking for info about a person, check both reports/{name}/ and people/{slug}.md.
- When writing feedback to feedback/log.md, APPEND to the file (don't overwrite).
- For new meeting summaries, use the YYYY-MM-DD-slug.md naming convention.`
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

    case 'summarize-team-activity':
      messages.push({
        role: 'user',
        content: `Write a team PR/activity scan for my engineering team. Today is ${context.dateLabel}.

Write it as a quick-read briefing I can scan in 30 seconds. Cover each person who has activity. For each person, summarize what they're working on, highlight anything that needs my attention (stale PRs, PRs with no reviews, interesting side projects, etc.), and link to specific PRs/issues where relevant.

Use markdown. Use a bold name for each person (e.g. **Chanakya**). Use markdown links for PR/issue references (e.g. [PR title](url)). Keep descriptions short and conversational.

End with a **TL;DR** paragraph highlighting the 2-3 most important things I should pay attention to.

If someone has no activity, mention them briefly ("quiet day" or similar). If everyone is quiet, say so.

Do NOT use headings (#). Just bold names and body text. Keep the whole thing concise.

TEAM ACTIVITY DATA:
${context.activityData}`
      })
      break

    default:
      messages.push({
        role: 'user',
        content: `${action}: ${JSON.stringify(context)}`
      })
  }

  return messages
}
