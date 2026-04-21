# AGENTS.md — Session Context for AI Agents

## Recent Changes (April 2026)

### Per-direct-report repo sync + transcript cleanup (COMPLETE)
Two related features shipped together so that managers can keep their main repo as the source of truth while still pushing curated content to per-report private repos.

**Sync UX: streaming progress + relaxed 1:1 detection (April 2026 follow-up)**
- The sync no longer blocks the UI silently. Main process emits `report:sync-progress` events at each stage (`starting`/`cloning`/`fetching`/`planning`/`comparing`/`writing` (with `current`/`total`)/`committing`/`pushing`/`done`). Renderer subscribes via `window.api.onReportSyncProgress` and shows: a "Calculating sync preview…" spinner overlay before the dialog opens, and a `⏳ <message>` line appended inside the confirm dialog while syncing.
- `isOneOnOneWith` was loosened: speakers must now be a non-empty subset of `{currentUserName, reportName-or-alias}` AND must contain the report. Empty speakers and >2 speakers still rejected. This accepts the very common case where the meeting tool only transcribes the report (manager isn't transcribed), without weakening cross-report leakage protection — because every speaker is still required to be either the user or the report.
- **Open on GitHub**: `OpenInExternal` dropdown now always includes "Open on GitHub" (icon `Github`), invoking `window.api.openInGitHub(filePath)`. `src/main/external.ts#openInGitHub` builds the URL from `settings.repoOwner`/`repoName`, falls back to parsing `git remote.origin.url` (HTTPS or SSH GitHub only), defaults branch to `main` when HEAD is detached, URL-encodes path segments, and rejects path traversal. IPC: `external:open-github`.

### Master/detail "inbox" stream view (April 2026)
- `ReportDetail`'s activity stream switched from inline expand-in-place to a two-pane email-inbox layout: compact list on the left, detail pane on the right (`lg:grid-cols-[minmax(260px,340px)_1fr]`). Below the `lg` breakpoint they stack.
- New compact list-row component: `src/renderer/components/report/StreamEntryRow.tsx` (badge + title + preview + date, `aria-current` highlight when selected). Detail pane reuses the existing `<StreamEntryCard expanded={true}>` so all detail UX (refine, edit, file viewer, etc.) carries over unchanged.
- Selection state: `selectedStreamEntryId` is **separate from** `expandedItems`. The latter still drives the GitHub activity accordion — do not unify them.
- Auto-select: the first visible entry is auto-selected on filter change / data refresh; selection is cleared/retargeted whenever the selected id is no longer in `filteredEntries`.
- AI context sync now keys off `selectedStreamEntryId` (was `expandedItems.size === 1`).
- `useListNavigation` j/k now sets selection (was toggling expansion).
- **Detail pane flows naturally** (no inner scroller). The list pane is sticky/scrollable (`lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto`); the detail pane is `min-w-0` only and lets the page scroll. Per-type subcomponents in `StreamEntryCard.tsx` had their inner `max-h-96 overflow-y-auto` caps stripped so detail content can flow to full height.
- Tests: `tests/renderer/StreamEntryRow.test.tsx` (5 tests) for the row component; `tests/renderer/ReportDetail.test.tsx` "master/detail stream" describe block covers auto-select + click-to-select. Existing tests continue to pass because they query the DOM by visible text and the same content now appears in the detail pane.

### Today master/detail (April 2026)
- The Today page uses the same email-inbox layout: left column = category nav (Team Activity if `hasGithubOrgToken`, plus the populated `TimelineSection`s — `overdue`, `reflection`, `this-week`, `coming-up`, `done`). Right column = items for the selected category, OR the Team Activity panel.
- State: `selectedCategory: 'activity' | TimelineSection | null`. Auto-select preference order: `overdue → reflection → this-week → activity → coming-up → done`. Re-targets when the current selection leaves the set.
- Removed: `expandedSections`, `setExpandedSections`, `toggleSection`, `activityExpanded`, `setActivityExpanded`, plus the section accordion buttons and chevrons. Each section / activity panel is rendered as a top-level card inside the right pane (no header toggle button).
- **`TimelineRow.handleRowClick` now navigates** for inline-style action types instead of expanding inline:
  - `prep` → `/report/<reportName>`
  - `feedback` → `/report/<reportName>?filter=feedback`
  - `inline-actions` → `/report/<reportName>?filter=action`
  - `prompt` → still expands inline (no per-report destination exists for cross-team prompts like weekly retro / sprint goal / quarterly OKR / 1:1 format check). The action button next to the row also follows the same routing rules.
- `visibleItemIds` is now scoped to the selected category (drives `useListNavigation` j/k inside the right pane only).
- Tests: `tests/renderer/Today.test.tsx` updated. New helper `selectCategory(container, label)` clicks a category in the left nav. Two tests removed/replaced (the old "collapses and re-expands a Today section" and the old per-section header className assertions); added "selects a different category to switch the right pane". Tests that look for prompt items now select the appropriate category first (`'This week'` for quarterly/team-health/1:1-format/personal-retro; `'Team Activity'` for the activity refresh affordance).


**Feature A: VTT/SRT transcript cleanup at capture time**
- New pure utility `src/renderer/utils/transcriptCleaners.ts` exports `cleanTranscript(filename, raw)` and dispatches by extension to VTT or SRT cleaners (anything else passes through).
- VTT path parses cue-by-cue and pulls speakers from `<v Speaker>...</v>` voice tags (closing tag often missing — `VOICE_TAG` regex handles both forms). Strips `WEBVTT` header, `NOTE` blocks, cue ids, timestamps, residual HTML, decodes entities.
- SRT path strips sequence numbers + timestamps, detects inline `Speaker:` prefix.
- Both pipe through `mergeAdjacentSameSpeaker` — **must require BOTH speakers be non-null to merge**, or sequential narration paragraphs collapse into one blob.
- Output format: `**Speaker:** text\n\n` blocks; falls back to plain paragraphs when no speakers detected.
- Wired into `CapturePanel.createSessionsFromFiles`: `.vtt`/`.srt` files get cleaned + forced `sourceHint='meeting'` before being stuffed into a session.
- 15 tests in `tests/renderer/transcriptCleaners.test.ts`.

**Feature B: On-demand sync to `<owner>/1-1-<github-username>` repo**
- New main module `src/main/syncToReport.ts`. Local cache lives at `app.getPath('userData') + '/synced-repos/1-1-<gh>'`.
- Owner derivation: prefers `getSettings().repoOwner`; falls back to parsing source repo's `origin` URL via `parseGithubOwnerFromOrigin` (only accepts GitHub HTTPS or SSH — rejects everything else).
- GitHub username validation regex: `/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/` — applied to BOTH `profile.github` and the owner before any URL/path construction.
- Auth-safe git invocations: every `spawnGit` call sets `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=echo`, `SSH_ASKPASS=echo` so git fails fast instead of hanging on credential prompts.
- **Strict 1:1 predicate** `isOneOnOneWith` requires `frontmatter.source === 'meeting'` AND case-insensitive normalized `speakers` set equals exactly `{currentUserName, reportName-or-alias}` (size === 2). Anything else (team standups, group meetings, 1:1s with other reports) is excluded — protects against cross-report leakage. There is regression coverage for this.
- **File mapping**:
  - `reports/<slug>/check-ins/monthly/<YYYY-MM>.md` → `check-ins/<YYYY-MM>.md`
  - `reports/<slug>/reviews/<file>.md` → `reviews/<file>.md`
  - For each `contexts/*.md` matching the strict 1:1 predicate: summary (everything before `## Raw content`) → `summaries/<date>.md`, raw content (after `## Raw content`, if non-empty) → `transcripts/<date>.md`. All frontmatter stripped.
- **Stable date-collision suffixes**: contexts grouped by date, sorted alphabetically by source filename, suffixes `''`, `-2`, `-3` assigned by index. Summary and transcript for the same source file always share a suffix (paired correctly). Preview and sync use the same planner so counts always agree.
- **Append-only mirror** (per user choice): preview returns only `{added, updated, unchanged}`. Stale dest files are never deleted.
- Path safety: `destSafePath` walks up checking for symlinks that escape the dest root. Even though dest is a clone of a user-owned repo, malicious symlinks could escape.
- Dirty-check before write: `ensureClean` runs `git status --porcelain` and aborts only if MANAGED_DIRS (`check-ins`, `reviews`, `summaries`, `transcripts`) have uncommitted changes. README/etc. edits are user's business.
- IPC: `report:get-sync-status`, `report:preview-sync`, `report:sync` in `src/main/ipc.ts`. Preload exposes `getReportSyncStatus`, `previewReportSync`, `syncReport`. Types in `src/shared/types.ts`: `ReportSyncStatus`, `ReportSyncEntry`, `ReportSyncPreview`, `ReportSyncResult`.
- UI: "Sync to 1-1-<gh> repo" item appears in the existing **More actions** menu on `ReportDetail`, gated on `report.profile.github` being set. Click → preview → ConfirmDialog showing `{added, updated, unchanged}` counts plus the first 8 dest paths → confirm → sync → toast (success / "saved locally but push failed" / already up to date).
- **`ConfirmDialog.message` now respects `\n` line breaks** via `whitespace-pre-line` (was previously collapsed to a single line). Multi-line preview messages render correctly.
- 45 tests in `tests/main/syncToReport.test.ts` covering URL parsing, username validation, the 1:1 predicate (incl. team-standup regression), summary/transcript extraction, and `planWrites` mapping incl. the same-day stable-suffix regression.

### Auto-track meeting attendees on capture (COMPLETE)
- When the Capture panel saves a meeting (AI `source === 'meeting'` OR `sourceHint === 'meeting'`), it now writes a `speakers:` frontmatter field to the new context file containing the current user (`settings.userName`) plus every name in `classified.people_mentioned`. Previously only `people:` (slugs) was written, so the ContextDetail "Attendees" UI showed "No attendees recorded" until the user manually edited speakers.
- The classify prompt was tightened to require every meeting attendee in `people_mentioned`, even silent ones, so 1:1s reliably end up with both parties listed.
- Helper extracted to `src/renderer/utils/captureAttendees.ts` (`buildMeetingAttendees`, `shouldRecordAttendees`) with unit tests in `tests/renderer/captureAttendees.test.ts`.

### Open in External App (COMPLETE)
- **Single-button dropdown** on every markdown viewer (`OpenInExternal`): clicking the ↗ icon opens a menu with "Open full view" (when applicable), "Open in VS Code", "Open in Obsidian", and "Reveal in Finder" — only the apps actually detected on the machine appear. Replaced the previous trio of separate icon buttons that cluttered the toolbar.
- **`onOpenFullView` prop**: when provided, adds an "Open full view" item at the top of the dropdown. Used in `StreamEntryCard` so the inline-expanded report stream cards can navigate to the full ContextDetail page from the same menu.
- **Auto-reload on window focus**: `useFileContent` (in `useData.ts`) now refetches whenever the window regains focus. This means edits made externally in VS Code/Obsidian appear in the app on switch-back without a manual refresh. Cached aggregates (`getReportData`, etc.) are NOT auto-refreshed on focus to avoid expensive recomputation. `ContextDetail` (full-view page for meetings/reviews/check-ins/preps/contexts) also refetches on focus, but skips the refetch while the user is actively editing title/speakers/content to avoid clobbering in-progress changes.
- **Detection is OS-aware** (`src/main/external.ts` → `detectExternalApps()`): macOS-only currently. Checks `/Applications` and `~/Applications` for VS Code, Cursor, VSCodium (any one shows the VS Code button), and Obsidian. Returns `{ vscode, obsidian, finder }`. Cached for the session.
- **URL schemes used**: `vscode://file<absolute-path>` and `obsidian://open?path=<absolute-path>`. Reveal-in-Finder uses `shell.showItemInFolder`.
- **Path traversal protected**: `safeAbsolutePath()` resolves under the configured `repoPath` and rejects anything that escapes via `..` or symlinks. Files must exist before being opened.
- **Mounted alongside RefineWithAI**: ContextDetail, PersonDetail, MyProfile (impact-log + weekly entries), ImpactLog, ReportDetail (About + Job Expectations), and the inline expanded view inside `StreamEntryCard`.
- IPC: `external:detect`, `external:open-vscode`, `external:open-obsidian`, `external:reveal-in-finder`.
- Tests: 11 main-side + 10 renderer + 2 useFileContent focus-reload tests.
- **Bug fix (cancel-edit double content)**: In `ReportDetail.tsx`, clicking Edit then Cancel on a context/prep stream card was leaving `viewingContent` set, so the inline editor closed back to a read-only viewer pane that rendered the same file already shown by `ContextDetail` above — duplicate content. Fix: `onCancelEdit` now clears both `isEditingContent` AND `viewingContent`. Regression test added in `tests/renderer/ReportDetail.test.tsx`.

### Refine with AI (COMPLETE)
- **New AI action `refine-document`** (`src/main/copilot.ts`): rewrites a markdown document based on a natural-language instruction. System prompt enforces preserving YAML frontmatter, returning ONLY content (no fences), and only changing what was asked.
- **Reusable `RefineWithAI` component** (`src/renderer/components/common/RefineWithAI.tsx`): sparkle (✨) icon button → modal with instruction textarea → Generate → before/after line diff → Accept commits via `commitFile`, Reject closes. Cmd+Enter submits. `stripCodeFence()` defensively strips ```` ```markdown ```` wrapping. Supports `onSaveOverride` prop for refining a sub-section of a file (e.g. About section merged into profile.md).
- **Line diff utility** (`src/renderer/utils/lineDiff.ts`): pure LCS implementation, returns `[{op: 'equal'|'add'|'remove', text}]`. No new deps.
- **Mounted on every markdown viewer**: ContextDetail (covers contexts/check-ins/reviews/preps/people via `dir` param), PersonDetail (Notes), MyProfile (impact-log + weekly entries), ImpactLog, ReportDetail (About uses onSaveOverride to merge into profile.md; Job Expectations is whole-file).
- Tests: 9 lineDiff tests, 8 RefineWithAI tests, 2 copilot `buildMessages` tests for `refine-document`. ContextDetail test mock updated to include AI stream listeners now that RefineWithAI uses `useAI`.

### AI Chat Image Paste Support (COMPLETE)
- **Paste images into AI chat** (`Chat.tsx` and `AIFloatingPanel.tsx`): pasting an image in the chat input commits it to `attachments/` (via `commitBinaryFile`) and shows a removable thumbnail above the textarea. On send, the image paths are passed to the AI with the message.
- New shared utilities in `src/renderer/utils/imageAttachments.ts`:
  - `uploadPastedImage(blob, mimeType)` commits a blob to `attachments/YYYY-MM-DD-<id>.<ext>` and returns `{ id, filename, dataUrl, path }`. Maps `image/jpeg → .jpg`.
  - `handleImagePaste(e)` walks `ClipboardEvent` items, uploads image items, calls `preventDefault()` only when images are found.
- New `useImagePaths(paths)` hook in `useAttachedImages.ts` lazy-loads repo-relative image paths as base64 data URLs for display in prior message bubbles (via `window.api.getFileBase64`).
- `Message` type gains optional `imagePaths?: string[]`; `sendMessage(text, context?, imagePaths?)` now accepts images (text may be empty if images are present) and passes them through to `ai.generate` as `context.imagePaths`.
- Main-side: `copilot.ts` chat path now builds SDK `attachments` from `context.imagePaths` (mirrors existing non-chat behavior) and passes them to `session.sendAndWait`.
- Tests: 3 new `sendMessage` tests (image-only, with text, omits key when empty) and 5 new tests covering `uploadPastedImage` / `handleImagePaste`.

### Capture & Today UX Improvements (COMPLETE)
- **Today page Team Activity tile** now shows a live "Updated X ago" timestamp in its subtitle (`Today.tsx`). Refreshed via a 30s tick.
- **CapturePanel drag/drop accepts `.vtt` and `.srt` files** alongside `.txt`/`.md`/`.markdown` for meeting transcript imports. File input `accept=` attribute and drop-overlay text updated accordingly.
- **Drag files directly onto the FAB** (`AppShell.tsx`) to kick off capture. The FAB has `onDragOver`/`onDrop` handlers that open the CapturePanel and dispatch a `capture-files-dropped` CustomEvent with the file list. The FAB also pulses/glows when a drag is hovering.
- **CapturePanel listens for `capture-files-dropped`** and reuses the shared `processDroppedFiles(files)` helper (extracted from `handleDrop`) to handle both text files and images.
- **CaptureSession "View" button**: processed/saved captures now have a View action (alongside Edit/Delete) that navigates to `/context/{filename}?dir=contexts` — the same full-view page opened from Search. CapturePanel passes its `onClose` down as `onNavigateAway` so the panel dismisses before navigation. Tests wrap `<CapturePanel>` in `MemoryRouter` since `useNavigate` now fires inside CaptureSession.

### AI Rate Limit Handling (COMPLETE)
- **Module-level rate limit tracking** in `src/main/github-activity.ts`: `_rateLimitedUntil` timestamp set when GitHub returns 403/429. All API functions (`fetchSearchPage`, `fetchDiscussions`, `fetchPRReviews`, `fetchIssueComments`) bail early when rate-limited instead of spamming errors.
- `clearRateLimit()` exported for test isolation.

### AI Token Limit Fix (COMPLETE)
- **Centralized prompt truncation** in `src/main/copilot.ts`: `truncateMessagesToFit()` estimates token count (~3 chars/token) and truncates messages to fit within a 130K token budget (168K model limit minus safety margin). Chat actions trim oldest history first; non-chat actions trim context from the end.
- **Source-level context caps** applied consistently across all AI context assembly points:
  - Individual summary content capped at 4000 chars (`checkin.ts`, `ReportDetail.tsx`, `Today.tsx`, `InlinePrep.tsx`)
  - Feedback limited to last 10 entries for check-ins, 15 for reviews (was unlimited)
  - Context notes limited to last 5-8 with 2000 char cap per note
  - Cross-meeting mentions reduced from 15→10 contexts scanned, each capped at 3000 chars
- **Debug logging** when truncation fires (logs action, estimated tokens, and chars removed)

### Check-in + Review Workflow Upgrade (COMPLETE)
- **Monthly check-ins auto-save after generation** in `ReportDetail.tsx`. Generating a performance check-in now immediately writes `reports/{name}/check-ins/monthly/YYYY-MM.md` instead of waiting for a separate save step.
- **Correct monthly check-in period selection**: the reporting month now targets the completed month (for example, Apr 1 generates/saves `2026-03.md`, not `2026-04.md`).
- **Correct monthly GitHub activity range** for check-ins: the check-in context now uses the intended reporting month consistently.
- **Check-ins are fully editable inline** in `ReportDetail.tsx`, including inline delete.
- **Check-ins no longer show misleading relative-time UI** in the stream row; the title month is treated as the primary label.
- **Performance reviews now have full CRUD in `ReportDetail.tsx`**:
  - add review inline
  - expand and read full review inline
  - edit inline
  - delete inline
- **Review bodies are now loaded in `getReportData()`** (`src/main/github.ts`) instead of returning empty strings. This fixes two things:
  1. inline review display/edit now works from real file content
  2. prior review text is actually available to AI review-generation context

### Performance Overhaul (COMPLETE)
43+ optimizations to eliminate 20-30s post-edit sluggishness:
- **Write-only cache invalidation**: `_meetingsCache`, `_reportDataCache`, `_teamOverviewCache`, `_peopleCache` persist until `commitFile()` writes. No polling, no TTL.
- **Targeted invalidation**: `invalidateCachesForPath(path)` in `github.ts` only clears affected caches, not everything.
- **Load vs Refresh pattern**: Page mount calls `load()` (reads from cache). Only explicit "Refresh" calls `refresh()` (clears cache first). Prevents slow re-loads on tab switch.
- **Lazy content loading**: `Transcript` and `Summary` objects carry `{ date, content: '', filename }` — content loaded on demand via `getFileContent`/`getFilesContentBulk`.
- **Bulk file API**: `getFilesContentBulk(paths: string[])` for batch reads instead of N individual IPC calls.
- **Prewarm at startup**: `preWarmCaches()` runs 500ms after window creation.
- **Fire-and-forget git push**: `commitFile` does write + git add + commit synchronously, then pushes async in detached process.

### Duplicate React Key Fix (COMPLETE)
**Root cause**: `getReportData()` matches meetings to a person via filename AND speaker/attendee matching. Steve had 70 meetings, 15 dates with multiple meetings. Stream entry IDs were `meeting-${t.date}` causing duplicate React keys.

**Fix** (3 files):
1. `src/shared/types.ts` — Added `filename?: string` to `Transcript` and `Summary` interfaces
2. `src/main/github.ts` — `getReportData()` lines ~892-902 now preserves filename from `personMeetings` into Transcript/Summary objects
3. `src/renderer/pages/ReportDetail.tsx`:
   - Stream entry IDs: `meeting-${t.filename || t.date}` (unique per meeting)
   - Summary lookup: keyed by `filename` instead of `date` (prevents collision when multiple meetings share a date)
   - `MeetingDetail` component: uses actual `filename` for "View summary →" / "View transcript →" paths instead of hardcoded `${date}-${name}-1-1.md`

### Other Bug Fixes (COMPLETE)
- AI chat "thinking" UI fix
- AI file tracking + cache invalidation + auto-refresh
- Feedback cross-contamination fix (feedback was being written to wrong person's log.md)
- Feedback format standardization
- GitHub activity test fixes (270/270 passing)
- Prewarm status fix

## Known Issues / Tech Debt (from Oracle Review)

These are NOT blocking but worth knowing about:

1. **External edit detection**: Write-only cache invalidation means edits made outside the app (e.g., in VS Code) won't be reflected until manual Refresh. Could add `fs.watch` with debounce or mtime check on focus.
2. **`preWarmCaches()` edge case**: If repo path doesn't exist, it may return without setting `_prewarmComplete`, causing renderer to wait behind `cachesReady` gate until 60s timeout.
3. **Batched git safety**: If path count exceeds 50, code falls back to `git add -A` which could stage unrelated local changes.
4. **Remaining hardcoded meeting paths**: Some bulk reads in ReportDetail may still assume `meetings/${date}-${name}-1-1.md` pattern instead of using `Summary.filename`.

## Key Architecture Notes

### Person-to-Meeting Matching (`github.ts`)
Two mechanisms (both used together):
1. **Filename matching**: `filenameMatchesPerson()` (line ~1190) — splits meeting slug by `-`, compares to person slug first segment
2. **Speaker matching**: `findMeetingsBySpeaker()` (line ~1214) — parses YAML frontmatter `speakers:` field, matches by full name or first name against person's name and aliases

`getPersonMeetings(slug)` (line ~1352) combines both, returns `{ date, title, filename }[]`.

### Cache Architecture (`github.ts`)
```
_meetingsCache    — File listing + speaker map + title map. Built by getMeetingsCache().
_reportDataCache  — Per-report Map<string, Report>. Built by getReportData().
_teamOverviewCache — TeamOverview object. Built by getTeamOverview().
_peopleCache      — PersonEntry[]. Built by listPeople().
```
All invalidated via `invalidateCachesForPath(path)` on any `commitFile()`.

### Renderer Data Flow
- `useReportData(name)` hook in `useData.ts` calls `window.api.getReportData(name)`
- Returns `Report` object with: profile, checkIns, summaries, transcripts, actionItems, feedback, reviews, preps
- `ReportDetail.tsx` builds `streamEntries` from this data in a `useMemo` — the unified activity timeline
- Filter bar (All, 1:1s, Feedback, Actions, Check-ins, Reviews) filters `streamEntries` by type

### Prompt Context Notes
- **There is still no dedicated goals file** in the report model. Goal-related AI context currently comes from a mix of:
  - `reports/{name}/profile.md` About section
  - `reports/{name}/job-expectations.md`
  - previous monthly check-ins
  - recent 1:1 summaries / context notes
  - action items
- **Prior review text is now present in `report.reviews[].content`** because `getReportData()` reads review file bodies directly.
- `generate-checkin` context is built in `src/renderer/utils/checkin.ts`.
- `generate-review` context is built in `src/renderer/pages/ReportDetail.tsx`.

### Stream Entry Types in ReportDetail
| Type | ID Pattern | Data Shape |
|------|-----------|------------|
| `1:1` | `meeting-${filename}` | `{ transcript: Transcript, summary?: Summary }` |
| `feedback` | `feedback-${date}-${index}` | `FeedbackEntry` |
| `check-in` | `checkin-${date}` | `CheckIn` |
| `action` | `action-${sourceFile}` | `ActionItem[]` |
| `review` | `review-${period}` | `{ period, content }` |

## Test Suite
- 271+ tests across 13 files
- Run: `npx vitest run`
- Key test files:
  - `tests/main/github-integration.test.ts` (73 tests) — core data layer
  - `tests/main/github-activity.test.ts` (16 tests) — org-level PR/issue tracking
  - `tests/main/parseSpeakers.test.ts` (17 tests) — YAML frontmatter speaker parsing
  - `tests/main/copilot.test.ts` (14 tests) — AI integration
  - `tests/renderer/ReportDetail.test.tsx` — check-in/review inline UX, autosave, and CRUD coverage

## Development Rules

### Testing Requirement (MANDATORY)
Every new feature MUST include thorough automated tests before it is considered complete. This is non-negotiable.

**What "thorough" means:**
- Test the happy path (normal usage)
- Test edge cases (empty input, boundary conditions, error states)
- Test user interactions (keyboard shortcuts, clicks, form submissions)
- Test integration points (IPC listeners, event handlers, callbacks)
- Test cleanup (unmount, event listener removal)

**Test patterns:**
- Renderer components: `// @vitest-environment happy-dom` + ReactDOM.createRoot + act() (see `tests/renderer/AuthScreen.test.tsx`)
- Main process: Mock `../../src/main/store`, use temp directories from `tests/helpers/fixtures.ts` (see `tests/main/github-integration.test.ts`)
- Mock `window.api` for any renderer test that calls IPC methods
- Always run `npx vitest run <test-file>` to verify tests pass before marking complete

**No feature is done without tests. No exceptions.**

## Build & Dev
```bash
npm run dev          # Dev mode with hot reload
npm run build        # Production build (electron-vite)
npx tsc --noEmit     # Type check
npx vitest run       # Test suite
```

## Releasing

The app is distributed via GitHub Releases with automatic updates via `electron-updater`.

### To create a new release:

1. **Bump the version** in `package.json` (e.g., `"version": "1.1.0"`)
2. **Commit the version bump**:
   ```bash
   git add package.json
   git commit -m "Bump version to 1.1.0"
   ```
3. **Tag and push**:
   ```bash
   git tag v1.1.0
   git push origin main --tags
   ```
4. GitHub Actions (`.github/workflows/release.yml`) will automatically:
   - Build arm64 + x64 Mac `.dmg` and `.zip` artifacts
   - Create a **draft** GitHub Release for tag `v1.1.0` and upload all artifacts to it
5. After the workflow finishes (~10 min), publish the release with curated notes:
   ```bash
   gh release edit v1.1.0 --draft=false --notes-file release-notes.md
   ```
   Or via the GitHub UI: open the draft release, paste/write notes, click Publish.
6. All running copies of the app will detect the new version within ~4 hours (or on next launch) and prompt the user to restart to update.

> ⚠️ **Do NOT run `gh release create vX.Y.Z` before the workflow runs.** electron-builder always creates new releases as drafts. If a *published* release already exists at the tag, it logs `existing type not compatible with publishing type` and silently skips uploading every artifact, leaving you with a notes-only release and zero `.dmg` files. The workflow will still report success.
>
> Symptoms: workflow is green, but `gh release view vX.Y.Z --json assets` shows `assets: []`. Recovery: save the notes (`gh release view vX.Y.Z --json body -q .body > notes.md`), `gh release delete vX.Y.Z --cleanup-tag=false --yes`, `gh run rerun <run-id>`, then publish the resulting draft with `gh release edit vX.Y.Z --draft=false --notes-file notes.md`.

### How auto-update works:
- `electron-updater` checks GitHub Releases on app launch (after 5s) and every 4 hours
- Updates download silently in the background
- A banner appears at the top of the app: "Version X ready — Restart to update"
- The user clicks "Restart to update" or the update installs on next quit

### Build scripts:
```bash
npm run dist         # Build .dmg locally (no publish)
npm run release      # Build + publish to GitHub Releases
```

### Notes:
- The app is **not code-signed**. First-time users must right-click → Open to bypass macOS Gatekeeper.
- To enable code signing, add `CSC_LINK` (base64 .p12 cert) and `CSC_KEY_PASSWORD` as GitHub repo secrets. electron-builder handles the rest.
- The GitHub Actions workflow uses `GITHUB_TOKEN` (auto-provided) for publishing releases.
