# AGENTS.md — Session Context for AI Agents

## Recent Changes (March 2026)

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

### Stream Entry Types in ReportDetail
| Type | ID Pattern | Data Shape |
|------|-----------|------------|
| `1:1` | `meeting-${filename}` | `{ transcript: Transcript, summary?: Summary }` |
| `feedback` | `feedback-${date}-${index}` | `FeedbackEntry` |
| `check-in` | `checkin-${date}` | `CheckIn` |
| `action` | `action-${sourceFile}` | `ActionItem[]` |
| `review` | `review-${period}` | `{ period, content }` |

## Test Suite
- 270 tests across 13 files
- Run: `npx vitest run`
- Key test files:
  - `tests/main/github-integration.test.ts` (72 tests) — core data layer
  - `tests/main/github-activity.test.ts` (16 tests) — org-level PR/issue tracking
  - `tests/main/parseSpeakers.test.ts` (17 tests) — YAML frontmatter speaker parsing
  - `tests/main/copilot.test.ts` (14 tests) — AI integration

## Build & Dev
```bash
npm run dev          # Dev mode with hot reload
npm run build        # Production build (electron-vite)
npx tsc --noEmit     # Type check
npx vitest run       # Test suite
```
