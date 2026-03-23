# Manager-inator App

An AI-native Electron desktop app for engineering managers. Surfaces what needs your attention right now — overdue items, upcoming 1:1 prep, unprocessed transcripts — and lets you act on everything in place. Backed by a local Git repo as the source of truth and powered by the GitHub Copilot SDK for AI features.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ github.ts│  │copilot.ts│  │  auth.ts  │  │  store.ts  │  │
│  │ (data)   │  │ (AI)     │  │ (OAuth)   │  │ (settings) │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       └──────────────┴─────────────┴──────────────┘         │
│                         ipc.ts                               │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                    preload/index.ts                          │
│                    (context bridge)                           │
├───────────────────────────┼──────────────────────────────────┤
│                  Electron Renderer Process                    │
│                                                             │
│  ┌─────────┐  ┌──────────────────────────────────────────┐  │
│  │ AppShell│  │              Pages                        │  │
│  │(sidebar)│  │ Today · ReportDetail · Search            │  │
│  │         │  │ TranscriptProcessor · Settings            │  │
│  └─────────┘  └──────────────────────────────────────────┘  │
│                                                             │
│  Hooks: useAuth · useData · useAI                           │
│  Stack: React 19 · React Router · Tailwind CSS 4            │
└─────────────────────────────────────────────────────────────┘
                            │
                   Local Git Repository
              (manager-inator data repo)
```

### Key design decisions

- **Local filesystem, not GitHub API.** All reads use `fs.readFileSync` for instant access. No network latency for navigation.
- **Git for writes.** File changes go through `writeFileSync` → `git add` → `git commit` → `git push` (push is fire-and-forget async).
- **Write-only cache invalidation.** All data caches persist until the app itself writes a file. No polling, no TTL expiry. First load populates caches; subsequent navigation is instant.
- **Copilot SDK for AI.** Uses `@github/copilot-sdk` with the user's existing `gh copilot` CLI authentication. Supports streaming responses.
- **Markdown as data format.** Profiles, summaries, check-ins, and feedback are all markdown files with optional YAML frontmatter. Humans and AI agents can both read/write them.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron (via electron-vite) |
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| Routing | react-router-dom (HashRouter) |
| AI | @github/copilot-sdk, @github/copilot |
| Markdown | react-markdown + remark-gfm |
| Icons | lucide-react |
| Storage | electron-store (encrypted) |
| Build | electron-vite (Vite-based) |

---

## Getting started

### Prerequisites

- Node.js 18+
- GitHub CLI (`gh`) with Copilot extension installed and authenticated
- A local clone of the data repo (e.g., `manager-inator`)

### Install and run

```bash
npm install
npm run dev        # Development with hot reload
npm run build      # Production build
npm run preview    # Run production build locally
```

### First launch

1. **Authenticate** — The app uses GitHub OAuth device flow. You'll get a code to enter at github.com/login/device.
2. **Set repo path** — Point the app to your local clone of the data repo.
3. **Done** — The Today view loads with your action items.

---

## Data model

All data lives in a local Git repository. The app reads from and writes to this repo.

### Directory structure (data repo)

```
├── reports/
│   └── {name}/                    # One per direct report
│       ├── profile.md             # Role, GitHub handle, meeting day, location
│       ├── custom-instructions.md # AI context specific to this person
│       ├── job-expectations.md    # Role expectations, competencies (used as AI context)
│       ├── DASHBOARD.md           # Per-report status dashboard
│       ├── priorities.md          # Current weekly priorities
│       ├── check-ins/
│       │   ├── monthly/YYYY-MM.md # Private monthly check-ins
│       │   └── shared/YYYY-MM.md  # Shared versions for the employee
│       ├── feedback/log.md        # Feedback entries
│       ├── reviews/               # Performance reviews (YYYY-H1.md or YYYY-H2.md)
│       └── prep/YYYY-MM-DD.md     # 1:1 prep documents
├── meetings/
│   └── YYYY-MM-DD-slug.md         # AI-generated summaries (YAML frontmatter)
├── transcripts/
│   └── processed/
│       └── YYYY-MM-DD-slug.txt    # Original raw transcripts
├── people/
│   └── firstname-lastname.md      # Profiles for anyone (not just reports)
├── mike-impact-log.md             # Manager's impact evidence log
└── settings.md                    # Dropdown options for roles/relationships
```

**Key convention**: Every `.md` file in `meetings/` is a processed summary. Raw transcripts are stored separately in `transcripts/processed/`. There is no `-summary.md` suffix — the meeting file itself is the summary.

### YAML frontmatter conventions

**Meeting summaries** (`meetings/*.md`):
```yaml
---
title: Nic 1-1           # Optional display title override
speakers:
  - Mike Crittenden
  - Nic Daantos
---
```

**People profiles** (`people/*.md`):
```yaml
---
name: Nic Daantos
slug: nic-daantos
aliases: Nick
role: Software Engineer
github: nicdaantos
location: North Carolina
relationship: Direct Report
---
```

### Person-to-meeting matching

The app associates people with meetings through two mechanisms:

1. **Filename segment matching** — The meeting slug is split by `-` and each segment is compared to the person's slug first part. E.g., person `nic-daantos` → first segment `nic` → matches `2026-03-11-nic-1-1.md`.
2. **Speaker frontmatter** — Meeting files list speakers in YAML frontmatter. The app parses these and matches by full name or first name against the person's name and aliases.

Both are used together. Filename matching is fast (no file reads); speaker matching catches cases where a person appears in a meeting but isn't in the filename (e.g., team meetings).

---

## Main process modules

### `src/main/github.ts` — Data layer

The core data module. All filesystem reads and Git writes happen here.

**Key exports:**
| Function | Purpose |
|----------|---------|
| `getReports()` | Lists report directories (those with `profile.md`) |
| `getReportData(name)` | Full report: profile, check-ins, transcripts, action items, feedback, reviews |
| `getTeamOverview()` | Team data: all reports with status indicators |
| `listMeetings()` | All meetings with title overrides from frontmatter |
| `listPeople()` | All people profiles with meeting counts |
| `getPersonMeetings(slug)` | Meetings associated with a specific person |
| `findPersonByName(name)` | Fuzzy lookup: exact → alias → first name match |
| `commitFile(path, content, msg)` | Write + git add + commit + async push |
| `saveMeetingTitle(filename, title)` | Save title override to YAML frontmatter |
| `toggleActionItem(sourceFile, sourceLine)` | Toggle checkbox in source meeting file |
| `getTeamActionItems()` | All open action items across all reports |
| `getImpactLog()` | Read manager's impact log |
| `getSettingsOptions()` | Parse dropdown options from `settings.md` |
| `preWarmCaches()` | Pre-populate all caches at startup |

**Caching architecture:**
- `_meetingsCache` — File listing + speaker map + title map. Built once, invalidated on any `commitFile`.
- `_reportDataCache` — Per-report data (Map). Invalidated on writes.
- `_teamOverviewCache` — Team overview data. Invalidated on writes.
- `_peopleCache` — People list with meeting counts. Invalidated on writes.

All caches are **write-invalidated only** — no time-based expiry. Since the app controls all writes to the repo, there's no stale data risk.

**Load vs. Refresh pattern** (in `useData.ts` hooks):
- `load()` — reads from caches without clearing. Used on page mount for instant navigation.
- `refresh()` — clears caches first, then reloads. Used only on explicit user "Refresh" action.

### `src/main/copilot.ts` — AI integration

Uses `@github/copilot-sdk` with the user's existing GitHub Copilot CLI authentication.

**How it works:**
1. Finds the `copilot` CLI binary (checks `which copilot`, then common paths)
2. Creates a `CopilotClient` with `useLoggedInUser: true`
3. For each generation, creates a session with model + system prompt
4. Listens for `assistant.message_delta` (streaming) and `assistant.message` (complete) events
5. Streams chunks to the renderer via IPC

**System prompt** includes:
- Manager context (performance management focus)
- Name corrections (Nick→Nic, gas→GHAS, Akash→Aakash, etc.)
- Writing style rules (no em dashes, sentence case, casual tone)
- Pronoun preferences (Tara uses they/them)

**Available AI actions:**

| Action | Purpose |
|--------|---------|
| `summarize-meeting` | Generate summary with YAML speaker frontmatter |
| `extract-action-items` | Pull checkbox-formatted action items |
| `extract-feedback` | Find feedback about direct reports |
| `extract-impact` | Extract manager impact evidence |
| `generate-checkin` | Monthly performance check-in |
| `generate-review` | Semi-annual performance review draft |
| `prep-one-on-one` | Interactive prep doc with checkboxes |
| `chat` | Free-form conversation |

**Model configuration:**
- Default model stored in electron-store (default: `gpt-4.1`)
- Model IDs use dashes not dots: `claude-opus-4-6` not `claude-opus-4.6`
- Configurable in Settings page

### `src/main/auth.ts` — GitHub OAuth

Device code flow (no browser redirect needed):
1. App requests a device code from GitHub
2. User enters code at github.com/login/device
3. App polls until authorized
4. Token stored encrypted in electron-store

**OAuth App Client ID:** `Ov23ctu9WlUlp4aqg2qi`
**Scope:** `repo`

### `src/main/store.ts` — Encrypted settings

Uses `electron-store` with encryption key `manager-inator-v1`.

**Stored fields:**
- `githubToken` — OAuth access token
- `repoPath` — Local filesystem path to data repo
- `defaultModel` — AI model ID (default: `gpt-4.1`)
- Cadence settings (check-in frequency, sprint length, end-of-week day, etc.)

### `src/main/ipc.ts` — IPC bridge

All IPC channels:

```
auth:status, auth:start, auth:poll, auth:logout
settings:get, settings:save
github:reports, github:profile, github:report-data, github:team-overview
github:file-content, github:commit-file
github:list-meetings, github:list-people, github:person-meetings, github:find-person
github:impact-log, github:settings-options
github:save-meeting-title, github:toggle-action-item
github:team-action-items, github:team-priorities, github:save-report-priorities
github:clear-caches, github:cancel-backfill
ai:generate (streams chunks via ai:chunk event), ai:cancel
ai:backfill-summaries (streams progress via ai:backfill-progress event)
```

---

## Renderer pages

### Today (`/`)

The main screen. A sequential timeline of actionable items ordered by priority, driven by the management playbook cadence. Four sections:

1. **Overdue (red)** — 1:1s more than 14 days old, stale action items (2+ days), overdue feedback, overdue check-ins
2. **Before your next 1:1 (yellow)** — Upcoming 1:1 prep for today, tomorrow, and 2 days out. Inline prep generation with interactive checkboxes. Sprint start/end prompts. Management cadence items (weekly priorities, reflections, skip-level, peer sync, quarterly planning, semi-annual reviews)
3. **Inbox (green)** — Unprocessed meeting transcripts. Each expands inline for AI processing (summary, action items, feedback, impact extraction)
4. **Done today (collapsed)** — Completed items, auto-tracked per day via localStorage

Every item is actionable in-place. Supports drag-and-drop transcript upload (.txt/.md files).

### Report Detail (`/report/:name`)

Single scrollable page per person with:
- **Profile header** — Name, role, GitHub handle, meeting day, location
- **Key facts bar** — Last 1:1, next 1:1, open action items, days since last feedback
- **Quick actions** — Prep 1:1, generate check-in, generate review, add feedback (all expand inline)
- **About section** — Editable notes about the person (collapsible)
- **Job expectations** — Editable role expectations used as AI context (collapsible)
- **Filter bar** — Clickable type tags (All, 1:1s, Feedback, Actions, Check-ins, Reviews)
- **Unified activity stream** — Reverse-chronological feed of all activity. Open action items pinned to top.

Context-aware entry: arriving from Today with a `?filter=` param pre-selects the relevant filter.

### Search (`/search`)

Find meetings and people by keyword. Features:
- Full-text search across meeting titles, filenames, and people profiles
- Inline meeting viewer (no page navigation needed)
- Recent meetings list shown when no search query
- Deep-linkable via `?meeting=` query param

### Transcript Processor (`/transcript`)

4-step AI pipeline for processing meeting transcripts:
1. **Paste** — Input transcript + title + date
2. **AI processing** — Summary → Action items → Feedback → Impact (with progress bar)
3. **Review** — Edit title, review all AI outputs
4. **Save** — Commits raw transcript to `transcripts/processed/`, summary to `meetings/`, and impact log entries to repo

### Settings (`/settings`)

- AI model picker
- Repo path configuration
- Management cadence settings (check-in frequency, feedback reminder days, sprint length, sprint start date, end-of-week day)

### Other pages (accessible but not in primary nav)

- **Impact Log** (`/impact`) — Manager's evidence log with quick-add and AI summarize
- **Team** (`/team`) — Grid of all direct reports (also accessible as sidebar quick-jump)

---

## Design system

Dark theme with purple accent. Custom CSS variables in `globals.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-brand` | `#8b5cf6` | Primary actions, active states |
| `--color-brand-light` | `#a78bfa` | Text on dark backgrounds |
| `--color-surface` | `#18181b` | Card backgrounds |
| `--color-surface-raised` | `#27272a` | Elevated surfaces |
| `--color-border` | `#3f3f46` | Default borders |
| `--color-success` | `#22c55e` | Positive states |
| `--color-warning` | `#f59e0b` | Warning states |
| `--color-danger` | `#ef4444` | Error states |

Custom `.prose-dark` class handles markdown rendering with appropriate dark-mode colors for headings, paragraphs, lists, tables, blockquotes, and code blocks.

AI floating panel available on every screen via bottom-right button. Context-aware (knows which page/person you're on).

---

## Type definitions (`src/shared/types.ts`)

```typescript
ReportProfile    // name, displayName, role, team, github, startDate, meetingDay, location, about
CheckIn          // date, content, accomplishments, concerns
Summary          // date, content, keyTopics, actionItems, sentiment
Transcript       // date, content
ActionItem       // text, owner, completed, sourceFile, sourceLine, sourceLineNumber
TeamActionItem   // extends ActionItem with reportName, displayName
FeedbackEntry    // date, type (positive/constructive/mixed), source, context, content
CadenceSettings  // checkInFrequency, feedbackReminderDays, sprintLengthWeeks, endOfWeekDay, sprintStartDate
Report           // aggregate: profile + checkIns + summaries + transcripts + actionItems + feedback + reviews + jobExpectations
TeamOverview     // reports: ReportStatus[], attentionItems, lastUpdated
ReportStatus     // name, displayName, lastOneOnOne, daysGap, openActionItems, status, meetingDay, lastCheckIn, lastFeedback
AppSettings      // hasToken, repoPath, defaultModel, cadence settings, aiCustomInstructions
MeetingEntry     // date, title, filename
PersonEntry      // name, slug, aliases, meetingCount, lastSeen, role, github, location, relationship
```

---

## Known quirks and gotchas

- **Copilot SDK must be bundled** by Vite, not externalized — `vscode-jsonrpc` has ESM resolution issues otherwise. `electron-store` and `electron` must be externalized.
- **Model IDs use dashes** not dots: `claude-opus-4-6` not `claude-opus-4.6`. Old values in electron-store get normalized at runtime.
- **`electron-store`** can corrupt if the process is force-killed mid-write. Normal quit (Cmd+Q) is fine.
- **Git push** is fire-and-forget (detached process). If remote has diverged, it silently fails. Run `git pull` manually if needed.
- **YAML frontmatter** format varies across AI-generated files. Some have proper `---` YAML blocks, some have the YAML inside markdown code fences. The `stripFrontmatter` and `parseSpeakers` functions handle both cases.
- **The `listFiles` and `listDirectory` functions** use `readdirSync` with `withFileTypes: true` to avoid per-file `statSync` calls.
- **Load vs. Refresh**: Page mount uses `load()` (no cache clear) for instant navigation. Only the explicit "Refresh" button calls `refresh()` which clears caches. This prevents slow re-loads on every tab switch.

---

## Development

```bash
npm run dev          # Dev mode with hot reload
npm run build        # Production build to out/
npm run preview      # Run production build
npm run typecheck    # TypeScript validation (tsc --noEmit)

# Manual launch of production build
npx electron out/main/index.mjs
```

The app pre-warms all caches 500ms after window creation, so the first navigation after launch is fast.
