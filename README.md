<p align="center">
  <img src="resources/icon.png" alt="Manager-inator" width="128" />
</p>

<h1 align="center">Manager-inator</h1>

<p align="center">
  AI-powered desktop app that helps engineering managers stay on top of everything:<br>
  1:1 prep, performance check-ins, feedback tracking, team activity, and more.
</p>

---

## Features

- **1:1 prep generation** from recent meetings, action items, and feedback
- **Performance reviews and monthly check-ins** with AI drafts from accumulated context
- **Feedback capture** tagged to people automatically from any source
- **Transcript processing** extracts summaries, action items, and feedback in one pass
- **Today dashboard** with actionable management cadence items
- **Per-person activity stream** with full history (meetings, feedback, reviews, GitHub activity)
- **AI chat** with team context on every page
- **Local-first data** stored as markdown in a Git repo you control
- **Auto-updates** with background downloads

## Requirements

- macOS
- [GitHub](https://github.com) account with [Copilot](https://github.com/features/copilot) subscription

## Install

Download the `.dmg` from the [Releases page](https://github.com/crittermike/manager-inator/releases):

- **Apple Silicon:** `Manager-inator-x.x.x-arm64.dmg`
- **Intel Mac:** `Manager-inator-x.x.x-x64.dmg`

## Development

See [AGENTS.md](AGENTS.md) for architecture and conventions.

```bash
npm install
npm run dev          # Dev mode with hot reload
npm run build        # Production build
npx vitest run       # Run tests
```
