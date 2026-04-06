import { CopilotClient, approveAll } from '@github/copilot-sdk'
import { getSettings, getToken } from './store'
import { spawn } from 'child_process'
import { join } from 'path'

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
- Behavior-anchored feedback. Cite specific PRs, issues, meetings, decisions.`

const AI_REQUEST_TIMEOUT_MS = 120_000
const CHAT_REQUEST_TIMEOUT_MS = 300_000

type StreamCallback = (chunk: string) => void
type ToolStatusCallback = (toolName: string, args: Record<string, unknown>) => void

export interface CopilotMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

let client: CopilotClient | null = null
let clientToken: string | null = null

type CopilotSession = Awaited<ReturnType<CopilotClient['createSession']>>
const activeSessions = new Map<string, { session: CopilotSession; cancelled: boolean }>()

/**
 * Resolve the path to the Copilot CLI.
 * Prefers the bundled .js entry point (uses Electron's Node via process.execPath)
 * over system bin paths (which need #!/usr/bin/env node shebang).
 */
export async function resolveCopilotCliPath(): Promise<string | undefined> {
  const fs = await import('fs')

  // Prefer bundled JS entry point — avoids needing system node
  const bundledPath = join(__dirname, '../../node_modules/@github/copilot/index.js')
  try { fs.statSync(bundledPath); return bundledPath } catch { /* not found */ }

  // Fallback: system-installed copilot
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn('which', ['copilot'], { stdio: ['ignore', 'pipe', 'ignore'] })
      let out = ''
      child.stdout.on('data', (d: Buffer) => { out += d.toString() })
      child.on('error', reject)
      child.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error('not found')))
    })
  } catch {
    const home = process.env.HOME || ''
    const candidates = [
      `${home}/.local/bin/copilot`,
      '/usr/local/bin/copilot',
      '/opt/homebrew/bin/copilot',
    ]
    for (const p of candidates) {
      try { fs.statSync(p); return p } catch { /* next */ }
    }
  }
  return undefined
}

async function getClient(): Promise<CopilotClient> {
  const token = getToken()
  if (!token) {
    throw new Error('Not authenticated — please sign in via Settings')
  }

  // Reset client if token changed (e.g. re-auth)
  if (client && clientToken !== token) {
    try { await client.stop() } catch {}
    client = null
    clientToken = null
  }

  if (!client) {

    const cliPath = await resolveCopilotCliPath()

    console.log('[Copilot SDK] CLI path:', cliPath || 'auto-detect')
    client = new CopilotClient({
      ...(cliPath ? { cliPath } : {}),
      githubToken: token,
      useLoggedInUser: false,
      autoStart: false
    } as ConstructorParameters<typeof CopilotClient>[0])
    await client.start()
    clientToken = token
    console.log('[Copilot SDK] Client started')
  }
  return client
}

export interface AiGenerateResult {
  content: string
  modifiedFiles: string[]
}

/** Strip <system_notification>...</system_notification> tags from AI output */
function stripSystemNotifications(text: string): string {
  return text.replace(/<system_notification>[\s\S]*?<\/system_notification>\s*/g, '')
}

export async function aiGenerate(
  action: string,
  context: Record<string, unknown>,
  onChunk: StreamCallback,
  requestId: string,
  onToolStatus?: ToolStatusCallback
): Promise<AiGenerateResult> {
  const entry = { session: null as unknown as CopilotSession, cancelled: false }
  const unsubscribers: (() => void)[] = []
  const messages = buildMessages(action, context)
  const isChat = action === 'chat'
  const timeout = isChat ? CHAT_REQUEST_TIMEOUT_MS : AI_REQUEST_TIMEOUT_MS
  const modifiedFiles = new Set<string>()

  try {
    const c = await getClient()
    const settings = getSettings()
    const requestedModel = typeof context['model'] === 'string' ? context['model'] : undefined
    const model = requestedModel || settings.defaultModel || 'claude-sonnet-4.5'
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

      let pendingTurnSeparator = false

      unsubscribers.push(session.on('assistant.message_delta', (event) => {
        if (entry.cancelled || inToolPhase) return
        const delta = event.data.deltaContent
        if (delta) {
          // Emit buffered turn separator only when real text follows
          if (pendingTurnSeparator) {
            currentTurnText += '\n\n'
            onChunk('\n\n')
            lastSentLength = currentTurnText.length
            pendingTurnSeparator = false
          }
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
        // Buffer the separator — only emit when the next text delta arrives
        if (hasStreamedAnyContent) {
          pendingTurnSeparator = true
        }
        currentTurnText = ''
        lastSentLength = 0
        inToolPhase = false
      }))

      unsubscribers.push(session.on('tool.execution_start', (event) => {
        if (entry.cancelled) return
        const toolName = event.data.toolName
        const args = (event.data.arguments as Record<string, unknown>) || {}
        debugLog('[Copilot SDK] Tool:', toolName, args)
        inToolPhase = true

        // Track file-modifying tools
        if (toolName === 'edit' || toolName === 'create') {
          const filePath = (args.path as string) || (args.filePath as string)
          if (filePath) modifiedFiles.add(filePath)
        }

        if (onToolStatus) {
          onToolStatus(toolName, args)
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
      debugLog('[Copilot SDK] Chat complete:', finalContent.length, 'chars', 'Modified files:', [...modifiedFiles])

      if (finalContent && finalContent.length > lastSentLength) {
        onChunk(finalContent.slice(lastSentLength))
      }

      const cleanedContent = stripSystemNotifications(finalContent)

      return { content: cleanedContent, modifiedFiles: [...modifiedFiles] }
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
      // Build file attachments for images (if any)
      const imagePaths = Array.isArray(context['imagePaths']) ? context['imagePaths'] as string[] : []
      const attachments = imagePaths.length > 0
        ? imagePaths.map(p => ({
            type: 'file' as const,
            path: join(settings.repoPath || '', p),
          }))
        : undefined
      const response = await session.sendAndWait({ prompt: userMessage, attachments }, timeout)

      // Use sendAndWait return if streaming didn't capture anything
      const returnContent = response?.data?.content || ''
      if (returnContent && !fullResponse) {
        fullResponse = returnContent
        onChunk(returnContent)
      }

      debugLog('[Copilot SDK] Response complete:', fullResponse.length, 'chars')
      return { content: stripSystemNotifications(fullResponse), modifiedFiles: [] }
    }
  } catch (error) {
    if (entry.cancelled) {
      return { content: '', modifiedFiles: [] }
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
    clientToken = null
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
${context.actionItems ? `\nAction items:\n${context.actionItems}` : ''}
${context.contextNotes ? `\nCaptured context (Slack threads, GitHub discussions, emails, etc.):\n${context.contextNotes}` : ''}
${context.githubActivity ? `\nGitHub activity this month (include links in the check-in where relevant):\n${context.githubActivity}` : ''}`
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
${context.actionItems ? `Action items (completed and open):\n${context.actionItems}` : 'No action items available.'}
${context.contextNotes ? `\nCaptured context (Slack threads, GitHub discussions, emails, etc.):\n${context.contextNotes}` : ''}
${context.githubActivity ? `\nGitHub activity for the review period (PRs, code reviews, issues, discussions). Cite specific contributions with links where relevant:\n${context.githubActivity}` : ''}`
      })
      break

    case 'prep-one-on-one':
      messages.push({
        role: 'user',
        content: `Prepare notes for my upcoming 1:1 with ${context.reportName}.

Return ONLY a markdown document with the sections below. Use checkbox syntax (- [ ]) for every action item and discussion topic so I can check them off during the meeting. Be specific and actionable. Keep it concise — no filler.

## Carry-forward action items
List any unchecked action items from recent meetings as checkboxes:
- [ ] Owner: specific action item text

## Discussion topics & questions
Based on recent activity, suggest discussion topics and questions to ask as checkboxes. Mix topics and questions together, ordered by importance:
- [ ] Topic or question (brief context on why it matters)

## Quick context
2-3 brief bullet points on what's been happening recently. No fluff.

---

Context:
${context.about ? `About this person:\n${context.about}\n` : ''}
${context.jobExpectations ? `Job expectations for this role:\n${context.jobExpectations}\n` : ''}
${context.summaries ? `Recent 1:1 summaries:\n${context.summaries}` : 'No recent summaries available.'}

${context.actionItems ? `Open action items:\n${context.actionItems}` : 'No open action items.'}

${context.feedback ? `Recent feedback:\n${context.feedback}` : ''}

${context.crossMeetingMentions ? `Mentions of ${context.reportName} in other recent meetings (not their 1:1s). Use these to surface cross-team topics or things others said about them:\n${context.crossMeetingMentions}` : ''}

${context.githubActivity ? `Recent GitHub activity (PRs, issues, code reviews, discussions). Use this to ask informed questions about their work, acknowledge contributions, or surface things worth discussing:\n${context.githubActivity}` : ''}`
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
contexts/                    — All captured content (meetings, slack, email, etc.) with YAML frontmatter
  YYYY-MM-DD-slug.md         — Each file has frontmatter (date, source, title, people, tags) and body content
transcripts/processed/       — Raw meeting transcripts
  YYYY-MM-DD-slug.txt        — Original unprocessed transcripts
people/                      — Profiles for anyone (not just direct reports)
  firstname-lastname.md      — Person profiles with YAML frontmatter (name, role, relationship, etc.)
impact-log.md                — Manager's impact evidence log

TIPS:
- Start with ls to see what's available before reading specific files.
- Every file in contexts/ is a captured piece of content (meeting summary, slack thread, etc.). Raw transcripts are in transcripts/processed/.
- Check-in files are in check-ins/monthly/ and named by YYYY-MM.
- When looking for info about a person, check both reports/{name}/ and people/{slug}.md.
- When writing feedback to feedback/log.md, APPEND to the file (don't overwrite).
- For new content captures, use the YYYY-MM-DD-slug.md naming convention in contexts/.`
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

    case 'classify-content':
      messages.push({
        role: 'user',
        content: `Analyze this content that was pasted into the app. My direct reports are: ${context.reportNames}.

Classify it and extract structured data. Return ONLY valid JSON (no markdown fences, no preamble).

Required JSON shape:
{
  "source": "slack" | "github" | "email" | "meeting" | "feedback" | "other",
  "title": "Short 3-8 word title, like a calendar event name",
  "summary": "2-3 sentence summary of the content",
  "detailed_summary": "A thorough markdown summary. For meetings: key topics discussed, decisions made, wins, challenges, sentiment. For Slack/email: main thread of discussion, conclusions reached, open questions. Use bullet points and short paragraphs. This should be useful months later when reviewing what happened.",
  "tags": ["relevant", "tags"],
  "people_mentioned": ["Exact Name"],
  "feedback": [
    {
      "person": "Exact Name",
      "type": "positive" | "constructive" | "mixed",
      "content": "specific behavior-anchored observation"
    }
  ],
  "action_items": [
    {
      "text": "action item description",
      "owner": "Name"
    }
  ],
  "resolved_action_items": [
    {
      "original_text": "exact text of the resolved action item from the EXISTING OPEN ITEMS list",
      "owner": "Name",
      "reason": "brief explanation of how/why this was resolved based on the content"
    }
  ],
  "impact": [
    {
      "text": "Short title: Description of the manager's impact"
    }
  ],
  "key_context": "anything noteworthy the AI should remember for future reviews/check-ins"
}

Rules:
- "people_mentioned" should only include people who are meaningfully discussed, not just @mentioned in passing
- "feedback" should only contain concrete, behavior-anchored observations about my direct reports
- For "person" fields, use the exact name from my reports list when possible
- If no feedback, action items, or impact exist, use empty arrays
- "source" should be inferred from the content format (slack threads have timestamps and usernames, github has PR/issue references, meeting transcripts have speaker turns, etc.)
- "title" is a very short label (3-8 words) like a calendar event name. Examples: "EPD weekly planning", "1:1 with Jennifer", "CSRA email notification bug", "Sprint retro"
- "summary" is a short 2-3 sentence overview for metadata
- "detailed_summary" is a thorough, structured markdown summary that captures the substance of the content. Write it so someone reading it months later can understand what happened without reading the raw content. Include specific names, decisions, and outcomes.
- "key_context" should capture strategic information, decisions, or context that would be useful when writing future performance reviews or check-ins
- "impact" should capture evidence of MY impact as the manager: decisions I made or influenced, people I coached or unblocked, problems I solved, process improvements I drove, cross-team coordination I facilitated, recognition I received. Format each as "Short title: description" — do NOT include dates in the text (dates are added automatically by the app).
- "resolved_action_items" should identify any items from the EXISTING OPEN ITEMS list below that this content indicates have been completed, addressed, or are no longer relevant. Only include items where the content provides clear evidence they were resolved. Use the EXACT original_text from the open items list.

${context.sourceHint === 'feedback' ? `The user explicitly indicated this is FEEDBACK about their direct reports. Treat the entire content as feedback observations. Extract at least one feedback entry for any direct report mentioned. If the person isn't named explicitly, try to identify them from context. Set source to "feedback".` : context.sourceHint ? `The user indicated this is from: ${context.sourceHint}` : ''}

${context.openActionItems ? `EXISTING OPEN ACTION ITEMS (check if any were resolved by this content):\n${context.openActionItems}\n` : ''}
CONTENT:
${context.content}`
      })
      break

    case 'rewrite-feedback':
      messages.push({
        role: 'system',
        content: 'You are a management coach. Rewrite the following feedback to be more specific, behavior-anchored, and actionable. Preserve the sentiment type (positive, constructive, or mixed). Return only the rewritten feedback, no preamble or explanation.'
      })
      messages.push({
        role: 'user',
        content: `Rewrite this ${context.feedbackType || 'positive'} feedback:\n\n${context.feedback}`
      })
      break

    case 'summarize-team-activity':
      messages.push({
        role: 'user',
        content: `Write a team PR/activity scan for my engineering team. Today is ${context.dateLabel}.

Write it as a quick-read briefing I can scan in 30 seconds. Cover each person who has activity. For each person, summarize what they're working on, highlight anything that needs my attention (stale PRs, PRs with no reviews, interesting side projects, etc.), and link to specific PRs/issues where relevant.

CRITICAL: Each activity item is tagged as either "authored" or "reviewed". You MUST respect this distinction:
- "authored" means the person wrote the PR or created the issue. Use words like "landed", "shipped", "opened", "working on" ONLY for authored items.
- "reviewed" means the person reviewed someone else's PR. Use words like "reviewed", "approved", "gave feedback on" for these. NEVER say someone "landed" or "shipped" a PR they only reviewed.
- "commented" means the person commented on an issue. Use "commented on" or "engaged with" for these.

If someone is marked [ON PTO], note that they're on PTO. Low or no activity from someone on PTO is expected and not a concern — don't suggest checking in with them or flag their inactivity. If they DO have activity while on PTO, mention it briefly but don't make a big deal of it.

IMPORTANT: I've included recent context notes below (meetings, Slack threads, emails, etc. from the past week). Use this to avoid flagging things I already know about. If a PR or issue was discussed in a recent meeting or Slack thread, don't tell me to "check in" on it or flag it as needing attention — I'm already aware. Focus your attention flags on things that are NOT covered by the recent context.

Use markdown. Use a bold name for each person (e.g. **Alex**). Use markdown links for PR/issue references (e.g. [PR title](url)). Keep descriptions short and conversational.

End with a **TL;DR** paragraph highlighting the 2-3 most important things I should pay attention to.

If someone has no activity and is NOT on PTO, mention them briefly ("quiet day" or similar). If everyone is quiet, say so.

Do NOT use headings (#). Just bold names and body text. Keep the whole thing concise.

TEAM ACTIVITY DATA:
${context.activityData}${context.recentContext ? `

RECENT CONTEXT (meetings, Slack, email, etc. from the past week — I already know about these):
${context.recentContext}` : ''}`
      })
      break

    case 'summarize-person-activity':
      messages.push({
        role: 'user',
        content: `Analyze the GitHub activity for ${context.displayName} (@${context.githubUsername}) from ${context.startDate} to ${context.endDate}.

Write a concise but substantive activity analysis. This will be used for 1:1 prep, performance check-ins, and reviews. Focus on WHAT the work tells you about this person, not just listing items.

Structure:

**Work themes**: What areas/projects are they focused on? Are they spread thin or deep in one area?

**Code review quality**: Based on the review comments included, how thorough are their reviews? Do they give substantive feedback or just approvals? Are they reviewing across the team or only their own PRs?

**Collaboration signals**: Are they commenting on others' issues? Starting discussions? How engaged are they in the broader team/org?

**Things worth discussing**: Anything that stands out as a good 1:1 topic. Stale PRs, big contributions worth acknowledging, patterns to explore.

**Quick stats**: PRs: X authored, Y reviewed. Issues: X created, Y commented. Discussions: X.

Keep it under 400 words. Casual tone, direct observations. No filler. If the data is thin, say so.

Activity data:
${context.activityData}`
      })
      break

    case 'prompt-fill-weekly-priorities':
      messages.push({
        role: 'user',
        content: `Suggest my top priorities for this week as an engineering manager.

Look at what's open, what's upcoming, and what needs attention. Give me 3-5 priorities, each one sentence. Order by importance.

Format as a simple numbered list. No headers, no fluff. Each item should be specific and actionable, not generic ("review PRs" is bad, "follow up on the auth refactor PR that's been open 3 days" is good).

Context:
${context.teamContext ? `Team overview:\n${context.teamContext}\n` : ''}
${context.actionItems ? `Open action items:\n${context.actionItems}\n` : ''}
${context.upcomingMeetings ? `Upcoming meetings:\n${context.upcomingMeetings}\n` : ''}
${context.githubActivity ? `Recent team GitHub activity (use this to suggest specific follow-ups, acknowledgments, or things worth checking in on):\n${context.githubActivity}` : ''}`
      })
      break

    case 'weekly-reflection':
      messages.push({
        role: 'user',
        content: `Help me write my weekly reflection as an engineering manager.

I want to capture: what shipped, what's at risk, what I learned, and what I'd do differently. Be specific, pull from the data. Keep it short and honest.

Format:
## What shipped
- [Specific things the team delivered this week]

## What's at risk
- [Open items, stale PRs, unresolved blockers, people who might need attention]

## What I learned
- [Observations, patterns, things that surprised me]

## Next week
- [1-2 things to carry forward or change]

Context:
${context.weeklyGoals ? `My goals for this week were:\n${context.weeklyGoals}\n` : ''}
${context.teamContext ? `Team overview:\n${context.teamContext}\n` : ''}
${context.actionItems ? `Open action items:\n${context.actionItems}\n` : ''}
${context.githubActivity ? `Team GitHub activity this week (what shipped, what's in progress, code review activity):\n${context.githubActivity}` : ''}`
      })
      break

    case 'weekly-snippet':
      messages.push({
        role: 'user',
        content: `Write my weekly snippet to share with my manager. This is a concise status update covering the past week.

Use EXACTLY these headings in this order:

## Top of mind
[1-2 things I'm most focused on or concerned about right now]

## Top accomplishments
[3-5 concrete wins from this week — things that shipped, decisions made, problems solved]

## Incidents
[Any incidents, outages, escalations, or fires this week. If none, say "None this week."]

## Risks
[Things that could go wrong, blockers, concerns about upcoming work or people]

## Shout-outs
[Team members who went above and beyond this week, and what they did]

Be specific and concise. Use bullet points. Reference actual PRs, issues, and people by name where possible. This should read like a real status update, not generic filler.

Context:
${context.weeklyGoals ? `My priorities for this week were:\n${context.weeklyGoals}\n` : ''}
${context.teamContext ? `Team overview:\n${context.teamContext}\n` : ''}
${context.actionItems ? `Open action items:\n${context.actionItems}\n` : ''}
${context.githubActivity ? `Team GitHub activity this week:\n${context.githubActivity}` : ''}`
      })
      break

    case 'sprint-goal':
      messages.push({
        role: 'user',
        content: `Help me define the goal for this sprint as an engineering manager.

I need a clear, focused sprint goal that captures what success looks like. Consider what the team is actively working on, what's blocked, and what needs to ship. The goal should be concrete enough that at sprint end we can say "yes we hit it" or "no we didn't."

Format:
**Sprint goal**: [One sentence capturing the primary objective]

**Key deliverables**:
- [Specific, measurable deliverable with owner if obvious]
- [2-4 items max — be ruthless about focus]

**Risks to watch**:
- [Things that could derail the sprint based on current activity]

Keep it short. One sprint goal, not five. If multiple things matter, pick the one that matters most and list the rest as deliverables.

Context:
${context.teamContext ? `Team overview:\n${context.teamContext}\n` : ''}
${context.actionItems ? `Open action items:\n${context.actionItems}\n` : ''}
${context.githubActivity ? `Current team GitHub activity (what's in-flight, what's been shipping, what's stale):\n${context.githubActivity}` : ''}`
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
