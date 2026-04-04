# Manager-inator

An AI-powered desktop app that helps engineering managers stay on top of everything: 1:1 prep, performance check-ins, feedback tracking, team activity, and more. Think of it as your management operating system.

## Why Manager-inator?

Engineering management involves a lot of context-switching and bookkeeping. You're tracking feedback for five people, prepping for tomorrow's 1:1, writing a performance review, and trying to remember what happened in last week's skip-level, all while actually doing your job.

Manager-inator keeps all of that in one place and uses AI to do the heavy lifting:

- **Never walk into a 1:1 unprepared.** The app generates prep docs based on recent meetings, open action items, and pending feedback, then reminds you the morning of.
- **Performance reviews write themselves.** Monthly check-ins build up over time so review season is a synthesis exercise, not a memory test.
- **Feedback is captured in the moment.** Drop in a note from a Slack thread, a PR review, or a meeting, and it's tagged to the right person automatically.
- **Meeting transcripts become actionable.** Paste or drop a transcript and the AI extracts summaries, action items, feedback, and impact evidence in one pass.
- **Your data stays yours.** Everything is stored locally in a Git repo you control: plain markdown files, fully portable, no vendor lock-in.

## What it looks like

### Today view
Your daily dashboard. Shows what needs attention right now: overdue 1:1s, upcoming prep, unprocessed transcripts, management cadence items (quarterly planning, team health checks, sprint retros). Everything is actionable in place, no "check this off" busywork.

### Direct report pages
A single scrollable page per person with their full history: 1:1 summaries, feedback log, check-ins, performance reviews, action items, and GitHub activity. Generate any artifact inline (prep, check-in, review) with full context from everything you've captured.

### AI chat
A persistent AI assistant that knows your team context. Ask it to draft talking points, summarize trends, or brainstorm approaches. Available as a floating panel on every page or as a full-screen chat.

### Capture panel
Drop in content from anywhere (meeting transcripts, Slack threads, emails, GitHub discussions) and the AI processes it into structured artifacts: summaries, action items, feedback, and impact evidence.

## Installation

### Download

Grab the latest release from the [Releases page](https://github.com/crittermike/manager-inator/releases):

- **Apple Silicon (M1/M2/M3/M4):** `Manager-inator-x.x.x-arm64.dmg`
- **Intel Mac:** `Manager-inator-x.x.x-x64.dmg`

## How it works

### Data storage
All your data lives in a local Git repo as plain markdown files. The app reads and writes to this repo, committing and pushing changes automatically. You can browse, edit, or back up your data outside the app anytime.

### AI features
Powered by [GitHub Copilot](https://github.com/features/copilot) via the bundled Copilot SDK. All AI processing happens through your existing Copilot subscription, no additional API keys needed.

### Auto-updates
The app checks for new versions on launch and every 4 hours. Updates download in the background and you'll see a banner when a new version is ready. Just click to restart.

## Prerequisites

- macOS (Windows/Linux support planned)
- A [GitHub](https://github.com) account
- [GitHub Copilot](https://github.com/features/copilot) subscription

## Development

See [AGENTS.md](AGENTS.md) for architecture details, development setup, and contribution guidelines.

```bash
npm install
npm run dev          # Dev mode with hot reload
npm run build        # Production build
npx vitest run       # Run tests
```

## License

Private, not open source.
