export interface PromptTemplate {
  id: string
  label: string
  description: string
  template: string
}

export const SYSTEM_PROMPT_DISPLAY: PromptTemplate = {
  id: 'system',
  label: 'System prompt',
  description: 'Included in every AI request. Sets the tone, writing rules, and name corrections.',
  template: `You are an AI assistant for Manager-inator, an engineering management tool.
You help managers with performance management tasks: writing check-ins, summarizing 1:1s,
tracking action items, giving feedback, and preparing for meetings.

WRITING RULES (apply to ALL generated content):
- Never use em dashes (—). Use commas, periods, colons, or restructure the sentence.
- Never use "not just X, it was Y" pattern.
- Always use sentence case for headings. Never Title Case.
- Casual, direct tone. Short sentences. Conversational.
- No filler. Skip "Great work!" or "I'd like to highlight..." Just state what happened.
- Behavior-anchored feedback. Cite specific PRs, issues, meetings, decisions.`,
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  SYSTEM_PROMPT_DISPLAY,
  {
    id: 'classify-content',
    label: 'Capture & classify',
    description: 'Used by the Capture panel to classify pasted content, summarize it, and extract feedback, action items, and impact.',
    template: `Analyze this content that was pasted into the app. My direct reports are: {reportNames}.

Classify it and extract structured data. Return ONLY valid JSON (no markdown fences, no preamble).

Required JSON shape:
{
  "source": "slack" | "github" | "email" | "meeting" | "other",
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
  "impact": [
    {
      "text": "YYYY-MM-DD — Short title: Description of the manager's impact"
    }
  ],
  "key_context": "anything noteworthy the AI should remember for future reviews/check-ins"
}

Rules:
- "people_mentioned" should only include people who are meaningfully discussed, not just @mentioned in passing
- "feedback" should only contain concrete, behavior-anchored observations about my direct reports
- For "person" fields, use the exact name from my reports list when possible
- If no feedback, action items, or impact exist, use empty arrays
- "source" should be inferred from the content format
- "summary" is a short 2-3 sentence overview for metadata
- "detailed_summary" is a thorough, structured markdown summary that captures the substance of the content. Write it so someone reading it months later can understand what happened without reading the raw content. Include specific names, decisions, and outcomes.
- "key_context" should capture strategic information useful for future performance reviews or check-ins
- "impact" should capture evidence of MY impact as the manager

{sourceHint}

CONTENT:
{content}`,
  },
  {
    id: 'generate-checkin',
    label: 'Monthly check-in',
    description: 'Generates a monthly performance check-in based on recent meetings, feedback, and action items.',
    template: `Generate a monthly check-in for {reportName} for {month}.

Use this format:
# Monthly check-in: {month}
_{displayName}, {monthName}_

> ⚠️ This document is for manager's records only.

## Accomplishments
## Concerns
## Goal progress
## Areas for growth

Context data:
{about}
{jobExpectations}
{summaries}
{checkInHistory}
{feedback}
{actionItems}
{contextNotes}`,
  },
  {
    id: 'generate-review',
    label: 'Performance review',
    description: 'Drafts a semi-annual performance review from all available data about a report.',
    template: `Write a performance review for {reportName} covering the period {period}.
{displayName} is a {role}.

Use this format:

# Performance review: {displayName}
_Review period: {period}_

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

{about}
{jobExpectations}
{pastReviews}
{checkIns}
{summaries}
{feedback}
{actionItems}
{contextNotes}`,
  },
  {
    id: 'prep-one-on-one',
    label: '1:1 prep',
    description: 'Prepares discussion topics and carry-forward items for an upcoming 1:1 meeting.',
    template: `Prepare notes for my upcoming 1:1 with {reportName}.

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
{about}
{jobExpectations}
{summaries}
{actionItems}
{feedback}
{crossMeetingMentions}`,
  },
  {
    id: 'summarize-team-activity',
    label: 'Team activity scan',
    description: 'Summarizes recent GitHub PR/issue activity across the team.',
    template: `Write a team PR/activity scan for my engineering team. Today is {dateLabel}.

Write it as a quick-read briefing I can scan in 30 seconds. Cover each person who has activity. For each person, summarize what they're working on, highlight anything that needs my attention (stale PRs, PRs with no reviews, interesting side projects, etc.), and link to specific PRs/issues where relevant.

If someone is marked [ON PTO], note that they're on PTO. Low or no activity from someone on PTO is expected and not a concern — don't suggest checking in with them or flag their inactivity. If they DO have activity while on PTO, mention it briefly but don't make a big deal of it.

Use markdown. Use a bold name for each person (e.g. **Chanakya**). Use markdown links for PR/issue references (e.g. [PR title](url)). Keep descriptions short and conversational.

End with a **TL;DR** paragraph highlighting the 2-3 most important things I should pay attention to.

If someone has no activity and is NOT on PTO, mention them briefly ("quiet day" or similar). If everyone is quiet, say so.

Do NOT use headings (#). Just bold names and body text. Keep the whole thing concise.

TEAM ACTIVITY DATA:
{activityData}`,
  },
  {
    id: 'draft-email',
    label: 'Draft email',
    description: 'Drafts a professional email about a direct report based on recent activity and context.',
    template: `Draft a professional email about {reportName}.

Tone: warm but professional. No em dashes. Keep it concise and actionable.

The email should:
- Reference specific recent activity where possible
- Be ready to send with minimal editing
- Include a clear ask or next step

Context about this person:
{about}
{jobExpectations}

Recent activity:
{summaries}
{feedback}
{actionItems}

Email purpose/topic:
{topic}`,
  },
  {
    id: 'rewrite-feedback',
    label: 'Rewrite feedback',
    description: 'Rewrites feedback to be more specific, behavior-anchored, and actionable.',
    template: `Rewrite this feedback to be more behavior-anchored and actionable.

Rules:
- Cite specific observable behaviors, not personality traits
- Use "I noticed..." or "When you..." framing
- Include impact: what was the effect of the behavior?
- End with a clear, specific suggestion or reinforcement
- Keep the same tone (positive stays positive, constructive stays constructive)
- No em dashes. Casual, direct tone.

Original feedback:
{feedback}`,
  },
  {
    id: 'generate-agenda',
    label: 'Meeting agenda',
    description: 'Generates a structured meeting agenda based on recent activity and open items.',
    template: `Generate a focused meeting agenda for my 1:1 with {reportName}.

Format as a markdown checklist (- [ ] items) grouped by topic. Keep it to 15-20 minutes of content max.

Prioritize:
1. Open action items that need follow-up
2. Recent wins worth acknowledging
3. Any concerns or areas needing attention
4. Forward-looking goals or development topics

Context:
{about}
{summaries}
{actionItems}
{feedback}`,
  },
  {
    id: 'suggest-practice',
    label: 'Suggest practice',
    description: 'Suggests a management practice based on the current team situation.',
    template: `Based on my current team situation, suggest one specific management practice I should adopt or improve.

Be concrete. Don't say "have regular 1:1s" — tell me something specific I might not be doing, like "start each 1:1 by asking what's blocking them before diving into your agenda."

Consider the team context:
{teamContext}

Format:
## The practice
[One sentence describing it]

## Why now
[2-3 sentences on why this matters given my current situation]

## How to start
[3-4 concrete bullet points to get started this week]`,
  },
  {
    id: 'summarize-recent-activity',
    label: 'TL;DR recent activity',
    description: 'Generates a quick summary of recent activity for a report — meetings, feedback, action items.',
    template: `Give me a quick TL;DR of recent activity for {reportName}. I want to get caught up in 30 seconds.

Format:
**What's been happening**: 2-3 sentences covering recent meetings and themes
**Open threads**: bullet list of unresolved action items or ongoing topics
**Vibe check**: one sentence on overall trajectory (thriving / steady / needs attention)

Be direct. No filler. If data is thin, say so.

Recent data:
{summaries}
{feedback}
{actionItems}`,
  },
  {
    id: 'prompt-fill-weekly-priorities',
    label: 'Suggest weekly priorities',
    description: 'AI-generated suggestion for weekly priorities based on open items, upcoming meetings, and team context.',
    template: `Suggest my top priorities for this week as an engineering manager.

Look at what's open, what's upcoming, and what needs attention. Give me 3-5 priorities, each one sentence. Order by importance.

Format as a simple numbered list. No headers, no fluff. Each item should be specific and actionable, not generic ("review PRs" is bad, "follow up on Nic's auth refactor PR that's been open 3 days" is good).

Context:
{teamContext}
{actionItems}
{upcomingMeetings}`,
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Free-form conversation with access to your data repo. The AI can read, edit, and create files.',
    template: `You have access to the manager's data repository. You can read files, list directories, edit files, and create new files. Use these tools to look up specific information and to make changes when asked.

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
transcripts/processed/       — Raw meeting transcripts
people/                      — Profiles for anyone (not just direct reports)
mike-impact-log.md           — Manager's impact evidence log

{conversationHistory}
{message}`,
  },
]
