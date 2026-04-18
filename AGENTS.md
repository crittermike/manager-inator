# AGENTS.md — Session Context for AI Agents

## Recent Changes (April 2026)

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
   - Build a universal Mac `.dmg` and `.zip`
   - Publish them as a GitHub Release for tag `v1.1.0`
5. All running copies of the app will detect the new version within ~4 hours (or on next launch) and prompt the user to restart to update.

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
