# Manager-inator Desktop

AI-powered performance management desktop app for engineering managers. Built with Electron, React, and the GitHub Copilot SDK.

## What it does

Manager-inator turns your GitHub repo into a performance management system with a beautiful native desktop experience. Your repo is the source of truth; AI handles the heavy lifting.

**Core features:**
- 📊 **Team dashboard** — see all your direct reports at a glance with status indicators, last 1:1 dates, and attention alerts
- 💬 **Transcript processing** — paste a 1:1 transcript and get an AI-generated summary + action items, committed to your repo
- ✍️ **Monthly check-ins** — AI generates performance check-ins from your accumulated data
- 📋 **1:1 prep** — auto-generated prep notes pulling from action items, recent summaries, and goals
- 🎯 **Goal tracking** — view and manage SMART goals per person
- ⭐ **Feedback log** — quick feedback entry with AI-assisted categorization
- 🤖 **AI assistant** — freeform chat to ask anything about your team ("How is Tara doing?", "Draft feedback for Steve")
- 📄 **Full data browser** — check-ins, transcripts, summaries, reviews, action items — all rendered beautifully

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A GitHub account with a [Copilot subscription](https://github.com/features/copilot)
- A manager-inator data repo (see [crittermike/manager-inator](https://github.com/crittermike/manager-inator))

## Getting started

```bash
# Clone the app
git clone https://github.com/crittermike/manager-inator-app
cd manager-inator-app

# Install dependencies
npm install

# Run in development mode
npm run dev
```

On first launch:
1. **Authenticate** with GitHub (OAuth device flow — you'll get a code to enter at github.com/login/device)
2. **Connect your repo** by entering the owner and repo name (e.g., `crittermike` / `manager-inator`)
3. You're in! Your team dashboard loads automatically.

## Development

```bash
npm run dev       # Start dev server with hot reload
npm run build     # Build for production
npm run typecheck # Type-check without building
```

## Tech stack

- **Electron** — native desktop shell
- **React** + **TypeScript** — UI framework
- **Vite** (electron-vite) — fast build tooling
- **Tailwind CSS 4** — utility-first styling
- **Octokit** — GitHub API client
- **GitHub Copilot** — AI inference (uses your Copilot subscription)
- **electron-store** — encrypted local settings

## Architecture

```
src/
├── main/           # Electron main process
│   ├── index.ts    # Window management
│   ├── auth.ts     # GitHub OAuth device flow
│   ├── github.ts   # Octokit wrapper (read/write repo)
│   ├── copilot.ts  # AI inference (streaming)
│   ├── ipc.ts      # IPC handler bridge
│   └── store.ts    # Encrypted local config
├── preload/        # Context bridge
├── renderer/       # React app
│   ├── pages/      # Dashboard, ReportDetail, TranscriptProcessor, AIChat, Settings
│   ├── hooks/      # useAuth, useData, useAI
│   ├── components/ # Layout, reusable UI
│   └── styles/     # Tailwind globals
└── shared/         # TypeScript types
```

## Data model

All data lives in your GitHub repo. The app reads and writes via the GitHub API:

- `reports/{name}/profile.md` — identity and schedule
- `reports/{name}/transcripts/` — raw 1:1 notes
- `reports/{name}/summaries/` — AI-generated summaries
- `reports/{name}/check-ins/monthly/` — monthly performance records
- `reports/{name}/feedback/log.md` — feedback entries
- `reports/{name}/goals/current.md` — SMART goals
- `reports/{name}/action-items.md` — todo tracking
- `reports/{name}/reviews/` — delivered performance reviews

## License

MIT
