import { getGithubOrgToken, getGithubOrgName } from './store'
import { getReports, getReportProfile, commitFile } from './github'
import type { GitHubActivityItem, TeamMemberActivity, MonthlyActivityStats, ActivityComment, PersonActivityResult } from '../shared/types'

const CACHE_TTL_MS = 15 * 60 * 1000
const MAX_CONCURRENT = 3
const GITHUB_API = 'https://api.github.com'

// Max time we'll sleep while waiting for a rate-limit window to open before
// giving up on auto-retry. If the reset is further out, we set the gate
// (so siblings bail) and surface the rate-limit error; the user can either
// wait for the natural reset (gate self-clears) or use the per-member Retry
// button to force a fresh attempt.
const MAX_RATE_LIMIT_WAIT_MS = 5 * 60 * 1000
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 3
const MAX_RATE_LIMIT_RETRIES_CAP = 5

function getMaxRateLimitRetries(): number {
  const raw = Number(process.env.MANAGER_INATOR_RATE_LIMIT_MAX_RETRIES)
  if (!Number.isInteger(raw) || raw < 0) return DEFAULT_MAX_RATE_LIMIT_RETRIES
  return Math.min(raw, MAX_RATE_LIMIT_RETRIES_CAP)
}

// Injectable sleep so tests can run instantly. Default uses setTimeout.
let _sleep: (ms: number) => Promise<void> = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Test-only: replace the sleep implementation. Pass null to restore default. */
export function _setSleepForTests(fn: ((ms: number) => Promise<void>) | null): void {
  _sleep = fn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
}

// Module-level rate limit tracking: once any request is rate-limited,
// all subsequent requests skip until the reset time to avoid error spam.
let _rateLimitedUntil: number | null = null

function isRateLimited(): boolean {
  if (!_rateLimitedUntil) return false
  if (Date.now() >= _rateLimitedUntil) {
    _rateLimitedUntil = null
    return false
  }
  return true
}

function setRateLimited(resetEpochSeconds: string | null): void {
  _rateLimitedUntil = resetEpochSeconds
    ? Number(resetEpochSeconds) * 1000
    : Date.now() + 60_000 // default 1 minute cooldown
}

export function getRateLimitResetTime(): number | null {
  return _rateLimitedUntil
}

export function clearRateLimit(): void {
  _rateLimitedUntil = null
}

/**
 * Returns a formatted error message if the rate-limit gate is currently
 * active (future reset), else null. Used by callers that want to surface
 * the gate state when their fetch produced no items but also no
 * caller-visible error (because the primitives' isRateLimited() pre-flight
 * silently bails with []).
 */
export function getRateLimitErrorMessage(): string | null {
  if (!_rateLimitedUntil) return null
  if (Date.now() >= _rateLimitedUntil) return null
  return `Rate limited — resets at ${new Date(_rateLimitedUntil).toLocaleTimeString()}`
}

function isSsoBlocked(response: Response): boolean {
  if (response.status !== 403) return false
  const headers = response.headers
  if (!headers || typeof headers.get !== 'function') return false
  return headers.get('X-GitHub-SSO') !== null
}

/**
 * Returns the number of milliseconds we'd need to wait before retrying,
 * or null if the response is not a rate-limit response. Considers both
 * primary (X-RateLimit-Reset) and secondary (Retry-After) reset headers
 * and prefers the larger.
 */
function parseRateLimitWaitMs(response: Response): { waitMs: number; resetHeader: string | null } | null {
  const headers = response.headers
  if (!headers || typeof headers.get !== 'function') return null

  const remaining = headers.get('X-RateLimit-Remaining')
  const retryAfter = headers.get('Retry-After')
  const resetHeader = headers.get('X-RateLimit-Reset')

  const isPrimary = response.status === 403 && remaining === '0'
  const isSecondary429 = response.status === 429
  const isSecondary403 = response.status === 403 && retryAfter !== null

  if (!isPrimary && !isSecondary429 && !isSecondary403) return null

  let waitMs = 0
  if (retryAfter !== null) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      waitMs = Math.max(waitMs, Math.floor(seconds * 1000))
    }
  }
  if (resetHeader !== null) {
    const resetMs = Number(resetHeader) * 1000
    if (Number.isFinite(resetMs)) {
      waitMs = Math.max(waitMs, resetMs - Date.now())
    }
  }
  if (waitMs < 0) waitMs = 0
  return { waitMs, resetHeader }
}

function formatResetMessage(resetHeader: string | null): string {
  if (!resetHeader) return ''
  const resetDate = new Date(Number(resetHeader) * 1000)
  if (Number.isNaN(resetDate.getTime())) return ''
  return ` — resets at ${resetDate.toLocaleTimeString()}`
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

class SsoError extends Error {
  constructor() {
    super("SSO authorization required — visit your org's SSO page to authorize this token")
    this.name = 'SsoError'
  }
}

interface RetryOptions {
  /** Override the env-var max retries. Use `0` to disable auto-retry. */
  maxRetries?: number
}

/**
 * Wraps a fetch call with rate-limit-aware retry behaviour. Detects 403
 * primary, 429 secondary, and 403-with-Retry-After secondary rate limits;
 * waits for the reset (capped at MAX_RATE_LIMIT_WAIT_MS) and retries up to
 * the configured max. SSO 403s are surfaced immediately without retry.
 *
 * If we are already gated by `_rateLimitedUntil` from a prior request and
 * the wait would exceed the cap, throws immediately without making any
 * request.
 */
async function withRateLimitRetry(
  makeRequest: () => Promise<Response>,
  options: RetryOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? getMaxRateLimitRetries()

  // Pre-flight: if we're already gated and the gate is within the cap,
  // wait for it. If beyond the cap, throw without making a request.
  if (_rateLimitedUntil) {
    const remaining = _rateLimitedUntil - Date.now()
    if (remaining > MAX_RATE_LIMIT_WAIT_MS) {
      throw new RateLimitError(
        `Rate limited — resets at ${new Date(_rateLimitedUntil).toLocaleTimeString()}`
      )
    }
    if (remaining > 0) {
      await _sleep(remaining)
      _rateLimitedUntil = null
    }
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await makeRequest()

    if (isSsoBlocked(response)) {
      throw new SsoError()
    }

    const parsed = parseRateLimitWaitMs(response)
    if (!parsed) {
      return response
    }

    // Rate-limited response. Always set the gate so concurrent siblings bail.
    setRateLimited(parsed.resetHeader)

    const giveUp =
      attempt >= maxRetries || parsed.waitMs > MAX_RATE_LIMIT_WAIT_MS

    if (giveUp) {
      throw new RateLimitError(`Rate limited${formatResetMessage(parsed.resetHeader)}`)
    }

    await _sleep(parsed.waitMs)
    // After the wait, the natural reset has passed; clear the gate so the
    // retry isn't immediately bounced by our own pre-flight check next loop.
    _rateLimitedUntil = null
  }

  throw new RateLimitError('Rate limited — retries exhausted')
}

interface CacheEntry {
  data: TeamMemberActivity[]
  timestamp: number
  refreshing: boolean
  /** Bumped on every patch/replace; refreshes only persist if generation matches. */
  generation: number
}

let _cache: CacheEntry | null = null
let _cacheGeneration = 0

interface SearchIssueItem {
  id: number
  title: string
  html_url: string
  state: string
  created_at: string
  updated_at: string
  comments: number
  labels: { name: string }[]
  pull_request?: { merged_at: string | null }
  repository_url: string
}

interface SearchResponse {
  total_count: number
  items: SearchIssueItem[]
}

interface GraphQLDiscussionNode {
  id: string
  title: string
  url: string
  createdAt: string
  updatedAt: string
  closed: boolean
  comments: { totalCount: number }
  labels: { nodes: { name: string }[] } | null
  repository: { nameWithOwner: string }
}

interface GraphQLSearchResponse {
  data: {
    search: {
      nodes: GraphQLDiscussionNode[]
    }
  }
  errors?: { message: string }[]
}

function repoFromUrl(repositoryUrl: string): string {
  const match = repositoryUrl.match(/repos\/(.+)$/)
  return match ? match[1] : repositoryUrl
}

function determineState(item: SearchIssueItem): 'open' | 'closed' | 'merged' {
  if (item.pull_request?.merged_at) return 'merged'
  return item.state === 'open' ? 'open' : 'closed'
}

interface PartialUserActivity {
  items: GitHubActivityItem[]
  error: string | null
}

async function fetchUserActivity(
  username: string,
  org: string,
  token: string,
  options: RetryOptions = {}
): Promise<PartialUserActivity> {
  const now = new Date()
  // On Monday, look back 72h to capture Friday's activity
  const lookbackDays = now.getDay() === 1 ? 3 : 1
  const since = new Date(now)
  since.setDate(since.getDate() - lookbackDays)
  const sinceStr = since.toISOString().split('T')[0]

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }



  const authorQuery = `org:${org} author:${username} updated:>=${sinceStr}`
  const authorIssueQuery = `org:${org} author:${username} created:>=${sinceStr}`
  const commenterQuery = `org:${org} commenter:${username} updated:>=${sinceStr}`

  const settled = await Promise.allSettled([
    fetchSearchPage(`${authorIssueQuery} is:issue`, headers, options),
    fetchSearchPage(`${authorQuery} is:pull-request`, headers, options),
    fetchSearchPage(`${commenterQuery} is:issue`, headers, options),
    fetchSearchPage(`${commenterQuery} is:pull-request`, headers, options),
    fetchDiscussions(`org:${org} author:${username} updated:>=${sinceStr}`, headers, options),
    fetchDiscussions(`org:${org} commenter:${username} updated:>=${sinceStr}`, headers, options)
  ])

  const authorResults = settled.slice(0, 2).concat([settled[4]])
  const commenterResults = settled.slice(2, 4).concat([settled[5]])

  const seen = new Map<number, GitHubActivityItem>()
  for (const r of authorResults) {
    if (r.status === 'fulfilled') {
      for (const item of r.value) seen.set(item.id, { ...item, role: 'author' })
    }
  }
  for (const r of commenterResults) {
    if (r.status === 'fulfilled') {
      for (const item of r.value) {
        if (!seen.has(item.id)) seen.set(item.id, { ...item, role: 'commenter' })
      }
    }
  }

  const firstRejection = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  const error = firstRejection
    ? (firstRejection.reason instanceof Error ? firstRejection.reason.message : String(firstRejection.reason))
    : null

  return { items: Array.from(seen.values()), error }
}

async function fetchSearchPage(
  query: string,
  headers: Record<string, string>,
  options: RetryOptions = {}
): Promise<GitHubActivityItem[]> {
  if (isRateLimited()) return []

  const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=50&sort=updated`

  let response: Response
  try {
    response = await withRateLimitRetry(() => fetch(url, { headers }), options)
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof SsoError) {
      throw new Error(err.message)
    }
    throw err
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.message || JSON.stringify(body)
    } catch { /* ignore parse errors */ }
    throw new Error(`GitHub API returned ${response.status}: ${detail}`)
  }

  const data = (await response.json()) as SearchResponse

  return data.items.map((item): GitHubActivityItem => ({
    id: item.id,
    type: item.pull_request ? 'pr' : 'issue',
    title: item.title,
    url: item.html_url,
    repo: repoFromUrl(item.repository_url),
    state: determineState(item),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    comments: item.comments,
    labels: item.labels.map(l => l.name)
  }))
}

async function fetchDiscussions(
  query: string,
  headers: Record<string, string>,
  options: RetryOptions = {}
): Promise<GitHubActivityItem[]> {
  if (isRateLimited()) return []

  const graphqlQuery = {
    query: `query($q: String!) {
      search(type: DISCUSSION, query: $q, first: 50) {
        nodes {
          ... on Discussion {
            id
            title
            url
            createdAt
            updatedAt
            closed
            comments(first: 0) { totalCount }
            labels(first: 10) { nodes { name } }
            repository { nameWithOwner }
          }
        }
      }
    }`,
    variables: { q: query }
  }

  let response: Response
  try {
    response = await withRateLimitRetry(
      () => fetch(`${GITHUB_API}/graphql`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(graphqlQuery)
      }),
      options
    )
  } catch (err) {
    if (err instanceof RateLimitError || err instanceof SsoError) {
      throw new Error(err.message)
    }
    throw err
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.message || JSON.stringify(body)
    } catch { /* ignore parse errors */ }
    throw new Error(`GitHub API returned ${response.status}: ${detail}`)
  }

  const result = (await response.json()) as GraphQLSearchResponse

  if (result.errors?.length) {
    throw new Error(`GraphQL error: ${result.errors[0].message}`)
  }

  return (result.data?.search?.nodes || [])
    .filter((n): n is GraphQLDiscussionNode => n != null && 'title' in n)
    .map((node): GitHubActivityItem => ({
      id: typeof node.id === 'string' ? hashStringId(node.id) : Number(node.id),
      type: 'discussion',
      title: node.title,
      url: node.url,
      repo: node.repository.nameWithOwner,
      state: node.closed ? 'closed' : 'open',
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      comments: node.comments.totalCount,
      labels: node.labels?.nodes.map(l => l.name) || []
    }))
}

function hashStringId(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++
      results[idx] = await tasks[idx]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function getTeamActivity(): Promise<TeamMemberActivity[]> {
  const token = getGithubOrgToken()
  if (!token) return []

  const orgName = getGithubOrgName()
  if (!orgName) return []

  if (_cache && Date.now() - _cache.timestamp < CACHE_TTL_MS) {
    if (!_cache.refreshing) {
      _cache.refreshing = true
      refreshCache(token, orgName).finally(() => {
        if (_cache) _cache.refreshing = false
      })
    }
    return _cache.data
  }

  return refreshCache(token, orgName)
}

async function refreshCache(token: string, orgName: string): Promise<TeamMemberActivity[]> {
  const reportNames = getReports()
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  // Snapshot the cache generation at the start of this refresh; if it changes
  // (because a manual single-member patch ran while we were refreshing) we
  // do not overwrite the cache below — the patched data wins.
  const generationAtStart = _cacheGeneration

  // Snapshot the per-member items currently in cache so we can preserve them
  // when a fresh refresh under an active rate-limit gate yields nothing
  // useful for that member. Without this, a cache full of good data gets
  // overwritten with empty items the moment the gate trips, making the UI
  // look like "no recent activity" everywhere.
  const cachedItemsByName = new Map<string, GitHubActivityItem[]>()
  if (_cache) {
    for (const m of _cache.data) {
      if (m.items.length > 0) cachedItemsByName.set(m.reportName, m.items)
    }
  }

  const tasks = reportNames.map(name => async (): Promise<TeamMemberActivity> => {
    try {
      const profile = getReportProfile(name)
      const ghUsername = profile.github
      if (!ghUsername) {
        return {
          reportName: name,
          displayName: profile.displayName,
          githubUsername: '',
          items: [],
          error: 'No GitHub username in profile'
        }
      }

      const { items: rawItems, error: partialError } = await fetchUserActivity(ghUsername, orgName, token)
      const items = await enrichItemsWithContent(rawItems, headers, MAX_TEAM_CONTENT_ITEMS)
      if (partialError) {
        console.error(`[GitHub Activity] Partial failure for ${name}:`, partialError)
      }

      // Falls back to the gate state when the primitives silently bailed
      // via the isRateLimited() pre-flight — otherwise the user sees
      // "No recent activity" with no Retry-able error.
      const gateError = (!partialError && items.length === 0) ? getRateLimitErrorMessage() : null
      const effectiveError = items.length > 0 ? null : (partialError ?? gateError)

      // If the fresh fetch produced nothing useful AND we have a rate-limit
      // signal AND we had previously cached items for this member, keep the
      // cached items so the user doesn't lose context. The error badge plus
      // Retry button still tell them what happened.
      const cachedItems = cachedItemsByName.get(name)
      if (items.length === 0 && effectiveError && cachedItems && cachedItems.length > 0) {
        return {
          reportName: name,
          displayName: profile.displayName,
          githubUsername: ghUsername,
          items: cachedItems,
          error: effectiveError
        }
      }

      return {
        reportName: name,
        displayName: profile.displayName,
        githubUsername: ghUsername,
        items,
        error: effectiveError
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`[GitHub Activity] Error fetching activity for ${name}:`, errorMsg)
      let displayName = name
      let ghUsername = ''
      try {
        const p = getReportProfile(name)
        displayName = p.displayName
        ghUsername = p.github || ''
      } catch { /* use dir name */ }
      // Even in the hard-error path, preserve cached items if we have them.
      const cachedItems = cachedItemsByName.get(name)
      return {
        reportName: name,
        displayName,
        githubUsername: ghUsername,
        items: cachedItems ?? [],
        error: errorMsg
      }
    }
  })

  const results = await runWithConcurrency(tasks, MAX_CONCURRENT)

  // Only persist if no patch happened mid-refresh. Otherwise the patched
  // single-member data would be lost.
  if (_cacheGeneration === generationAtStart) {
    _cache = {
      data: results,
      timestamp: Date.now(),
      refreshing: false,
      generation: _cacheGeneration
    }
  }

  return results
}

export function clearActivityCache(): void {
  _cache = null
  _cacheGeneration++
}

/**
 * Fetch activity for a single team member. Used by the per-member Retry
 * button in the Raw team activity view. When `force=true`, clears any
 * active rate-limit gate and runs single-shot (no auto-retry on
 * rate-limit) so the user gets fast feedback instead of a long spinner.
 * Patches the result into the team activity cache via the generation
 * counter so a concurrent background refresh can't overwrite it.
 */
export async function fetchTeamMemberActivity(
  reportName: string,
  options: { force?: boolean } = {}
): Promise<TeamMemberActivity> {
  if (options.force) {
    _rateLimitedUntil = null
  }

  const retryOptions: RetryOptions = options.force ? { maxRetries: 0 } : {}

  const buildErrorResult = (errorMsg: string, fallbackName?: string, fallbackGithub?: string): TeamMemberActivity => ({
    reportName,
    displayName: fallbackName ?? reportName,
    githubUsername: fallbackGithub ?? '',
    items: [],
    error: errorMsg
  })

  let result: TeamMemberActivity
  try {
    const token = getGithubOrgToken()
    if (!token) {
      result = buildErrorResult('No GitHub org token configured')
    } else {
      const orgName = getGithubOrgName()
      if (!orgName) {
        result = buildErrorResult('No GitHub org name configured')
      } else {
        const profile = getReportProfile(reportName)
        if (!profile.github) {
          result = {
            reportName,
            displayName: profile.displayName,
            githubUsername: '',
            items: [],
            error: 'No GitHub username in profile'
          }
        } else {
          const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
          try {
            const { items: rawItems, error: partialError } = await fetchUserActivity(
              profile.github, orgName, token, retryOptions
            )
            const items = await enrichItemsWithContent(rawItems, headers, MAX_TEAM_CONTENT_ITEMS)
            // Surface the gate state when the primitives bailed silently
            // (only matters for the non-force path; force=true already
            // cleared the gate and runs single-shot).
            const gateError = (!partialError && items.length === 0) ? getRateLimitErrorMessage() : null
            result = {
              reportName,
              displayName: profile.displayName,
              githubUsername: profile.github,
              items,
              error: items.length > 0 ? null : (partialError ?? gateError)
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            console.error(`[GitHub Activity] Error refetching activity for ${reportName}:`, errorMsg)
            result = buildErrorResult(errorMsg, profile.displayName, profile.github)
          }
        }
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    result = buildErrorResult(errorMsg)
  }

  // Patch the cache (if any) so subsequent reads see the fix and bump the
  // generation counter so any in-flight background refresh discards itself.
  _cacheGeneration++
  if (_cache) {
    const idx = _cache.data.findIndex(m => m.reportName === reportName)
    if (idx >= 0) {
      _cache.data = [
        ..._cache.data.slice(0, idx),
        result,
        ..._cache.data.slice(idx + 1)
      ]
    } else {
      _cache.data = [..._cache.data, result]
    }
    _cache.generation = _cacheGeneration
  }

  return result
}

export function getActivityLookbackHours(): number {
  return new Date().getDay() === 1 ? 72 : 24
}

function monthDateRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

async function fetchMonthlyActivity(
  username: string,
  org: string,
  token: string,
  year: number,
  month: number
): Promise<MonthlyActivityStats> {
  const { start, end } = monthDateRange(year, month)
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }



  const [mergedPRs, reviewedPRs, createdIssues, closedIssues, discussions] = await Promise.all([
    fetchSearchPage(`org:${org} author:${username} is:pr is:merged merged:${start}..${end}`, headers),
    fetchSearchPage(`org:${org} reviewed-by:${username} is:pr updated:${start}..${end}`, headers),
    fetchSearchPage(`org:${org} author:${username} is:issue created:${start}..${end}`, headers),
    fetchSearchPage(`org:${org} author:${username} is:issue is:closed closed:${start}..${end}`, headers),
    fetchDiscussions(`org:${org} author:${username} created:${start}..${end}`, headers)
  ])

  const reviewedFiltered = reviewedPRs.filter(pr => !mergedPRs.some(m => m.id === pr.id))

  return {
    prsMerged: mergedPRs.map(pr => ({
      title: pr.title,
      url: pr.url,
      repo: pr.repo,
      mergedAt: pr.updatedAt
    })),
    prsReviewed: reviewedFiltered.map(pr => ({
      title: pr.title,
      url: pr.url,
      repo: pr.repo
    })),
    issuesCreated: createdIssues.map(i => ({
      title: i.title,
      url: i.url,
      repo: i.repo,
      state: i.state
    })),
    issuesClosed: closedIssues.map(i => ({
      title: i.title,
      url: i.url,
      repo: i.repo
    })),
    discussionsCreated: discussions.map(d => ({
      title: d.title,
      url: d.url,
      repo: d.repo
    })),
    counts: {
      prsMerged: mergedPRs.length,
      prsReviewed: reviewedFiltered.length,
      issuesCreated: createdIssues.length,
      issuesClosed: closedIssues.length,
      discussionsCreated: discussions.length
    }
  }
}

export async function getMonthlyActivityForPerson(
  reportName: string,
  year: number,
  month: number
): Promise<MonthlyActivityStats | null> {
  const token = getGithubOrgToken()
  if (!token) return null

  const orgName = getGithubOrgName()
  if (!orgName) return null

  const profile = getReportProfile(reportName)
  if (!profile.github) return null

  return fetchMonthlyActivity(profile.github, orgName, token, year, month)
}

// ── Content Fetching (PR reviews, issue comments) ──

interface ReviewApiItem {
  user: { login: string } | null
  body: string
  submitted_at: string
  state: string
}

interface CommentApiItem {
  user: { login: string } | null
  body: string
  created_at: string
}

export function extractIssueNumber(url: string): { owner: string; repo: string; number: number } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2], number: parseInt(match[4], 10) }
}

async function fetchPRReviews(
  owner: string,
  repo: string,
  prNumber: number,
  headers: Record<string, string>
): Promise<ActivityComment[]> {
  if (isRateLimited()) return []
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=30`
  try {
    const response = await withRateLimitRetry(() => fetch(url, { headers }))
    if (!response.ok) return []
    const data = (await response.json()) as ReviewApiItem[]
    return data
      .filter(r => r.body && r.body.trim().length > 0)
      .map(r => ({
        author: r.user?.login || 'unknown',
        body: r.body.slice(0, 1000),
        createdAt: r.submitted_at,
        reviewState: r.state
      }))
  } catch {
    return []
  }
}

async function fetchIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  headers: Record<string, string>
): Promise<ActivityComment[]> {
  if (isRateLimited()) return []
  const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=20&sort=created&direction=desc`
  try {
    const response = await withRateLimitRetry(() => fetch(url, { headers }))
    if (!response.ok) return []
    const data = (await response.json()) as CommentApiItem[]
    return data.map(c => ({
      author: c.user?.login || 'unknown',
      body: c.body.slice(0, 1000),
      createdAt: c.created_at
    }))
  } catch {
    return []
  }
}

const MAX_CONTENT_ITEMS = 15
const MAX_TEAM_CONTENT_ITEMS = 3

export async function enrichItemsWithContent(
  items: GitHubActivityItem[],
  headers: Record<string, string>,
  limit = MAX_CONTENT_ITEMS
): Promise<GitHubActivityItem[]> {
  const sorted = [...items].sort((a, b) => b.comments - a.comments)
  const toEnrich = sorted.slice(0, limit)
  const rest = sorted.slice(limit)

  const enriched = await Promise.all(toEnrich.map(async (item) => {
    const parsed = extractIssueNumber(item.url)
    if (!parsed) return item

    if (item.type === 'pr') {
      const [reviews, comments] = await Promise.all([
        fetchPRReviews(parsed.owner, parsed.repo, parsed.number, headers),
        fetchIssueComments(parsed.owner, parsed.repo, parsed.number, headers)
      ])
      return { ...item, reviewComments: reviews, issueComments: comments }
    } else if (item.type === 'issue') {
      const comments = await fetchIssueComments(parsed.owner, parsed.repo, parsed.number, headers)
      return { ...item, issueComments: comments }
    }
    return item
  }))

  return [...enriched, ...rest]
}

// ── Per-person activity fetch with date range ──

async function fetchUserActivityForDateRange(
  username: string,
  org: string,
  token: string,
  startDate: string,
  endDate: string
): Promise<GitHubActivityItem[]> {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }



  const dateRange = `${startDate}..${endDate}`
  const authorQuery = `org:${org} author:${username} updated:${dateRange}`
  const authorIssueQuery = `org:${org} author:${username} created:${dateRange}`
  const commenterQuery = `org:${org} commenter:${username} updated:${dateRange}`

  const [issueItems, prItems, commentedIssues, commentedPRs, authoredDiscussions, commentedDiscussions] = await Promise.all([
    fetchSearchPage(`${authorIssueQuery} is:issue`, headers),
    fetchSearchPage(`${authorQuery} is:pull-request`, headers),
    fetchSearchPage(`${commenterQuery} is:issue`, headers),
    fetchSearchPage(`${commenterQuery} is:pull-request`, headers),
    fetchDiscussions(`org:${org} author:${username} updated:>=${startDate}`, headers),
    fetchDiscussions(`org:${org} commenter:${username} updated:>=${startDate}`, headers)
  ])

  const seen = new Map<number, GitHubActivityItem>()
  for (const item of [...issueItems, ...prItems, ...authoredDiscussions]) {
    seen.set(item.id, { ...item, role: 'author' })
  }
  for (const item of [...commentedIssues, ...commentedPRs, ...commentedDiscussions]) {
    if (!seen.has(item.id)) {
      seen.set(item.id, { ...item, role: 'commenter' })
    }
  }

  const allItems = Array.from(seen.values())
  return enrichItemsWithContent(allItems, headers)
}

export async function fetchActivityForPerson(
  reportName: string,
  startDate: string,
  endDate: string
): Promise<PersonActivityResult | null> {
  const token = getGithubOrgToken()
  if (!token) return null

  const orgName = getGithubOrgName()
  if (!orgName) return null

  const profile = getReportProfile(reportName)
  if (!profile.github) return null

  const items = await fetchUserActivityForDateRange(profile.github, orgName, token, startDate, endDate)

  return {
    reportName,
    displayName: profile.displayName,
    githubUsername: profile.github,
    items,
    startDate,
    endDate,
    fetchedAt: new Date().toISOString()
  }
}

// ── Activity Snapshot (save as context note) ──

export function formatActivityAsMarkdown(result: PersonActivityResult): string {
  const { displayName, githubUsername, items, startDate, endDate } = result

  const prItems = items.filter(i => i.type === 'pr')
  const issueItems = items.filter(i => i.type === 'issue')
  const discussionItems = items.filter(i => i.type === 'discussion')

  const authoredPRs = prItems.filter(i => i.role !== 'commenter')
  const reviewedPRs = prItems.filter(i => i.role === 'commenter')
  const authoredIssues = issueItems.filter(i => i.role !== 'commenter')
  const commentedIssues = issueItems.filter(i => i.role === 'commenter')

  const lines: string[] = []
  lines.push(`# GitHub activity: ${displayName} (@${githubUsername})`)
  lines.push(`_${startDate} to ${endDate}_\n`)

  lines.push(`**Summary**: ${authoredPRs.length} PRs authored, ${reviewedPRs.length} PRs reviewed/commented, ${authoredIssues.length} issues authored, ${commentedIssues.length} issues commented, ${discussionItems.length} discussions\n`)

  if (authoredPRs.length > 0) {
    lines.push('## Pull requests (authored)')
    for (const pr of authoredPRs) {
      const stateEmoji = pr.state === 'merged' ? '🟣' : pr.state === 'open' ? '🟢' : '⚫'
      lines.push(`- ${stateEmoji} [${pr.title}](${pr.url}) (${pr.repo}, ${pr.state})`)
      if (pr.reviewComments && pr.reviewComments.length > 0) {
        lines.push('  - Reviews:')
        for (const review of pr.reviewComments.slice(0, 5)) {
          const stateTag = review.reviewState ? ` [${review.reviewState}]` : ''
          const bodyPreview = review.body.split('\n')[0].slice(0, 200)
          lines.push(`    - @${review.author}${stateTag}: ${bodyPreview}`)
        }
      }
      if (pr.issueComments && pr.issueComments.length > 0) {
        lines.push(`  - ${pr.issueComments.length} comments`)
        for (const c of pr.issueComments.slice(0, 3)) {
          const bodyPreview = c.body.split('\n')[0].slice(0, 200)
          lines.push(`    - @${c.author}: ${bodyPreview}`)
        }
      }
    }
    lines.push('')
  }

  if (reviewedPRs.length > 0) {
    lines.push('## Pull requests (reviewed/commented)')
    for (const pr of reviewedPRs) {
      const stateEmoji = pr.state === 'merged' ? '🟣' : pr.state === 'open' ? '🟢' : '⚫'
      lines.push(`- ${stateEmoji} [${pr.title}](${pr.url}) (${pr.repo}, ${pr.state})`)
      if (pr.reviewComments && pr.reviewComments.length > 0) {
        lines.push('  - Reviews:')
        for (const review of pr.reviewComments.slice(0, 5)) {
          const stateTag = review.reviewState ? ` [${review.reviewState}]` : ''
          const bodyPreview = review.body.split('\n')[0].slice(0, 200)
          lines.push(`    - @${review.author}${stateTag}: ${bodyPreview}`)
        }
      }
      if (pr.issueComments && pr.issueComments.length > 0) {
        lines.push(`  - ${pr.issueComments.length} comments`)
        for (const c of pr.issueComments.slice(0, 3)) {
          const bodyPreview = c.body.split('\n')[0].slice(0, 200)
          lines.push(`    - @${c.author}: ${bodyPreview}`)
        }
      }
    }
    lines.push('')
  }

  if (authoredIssues.length > 0) {
    lines.push('## Issues (authored)')
    for (const issue of authoredIssues) {
      const stateEmoji = issue.state === 'open' ? '🟢' : '⚫'
      lines.push(`- ${stateEmoji} [${issue.title}](${issue.url}) (${issue.repo}, ${issue.state})`)
      if (issue.issueComments && issue.issueComments.length > 0) {
        for (const c of issue.issueComments.slice(0, 3)) {
          const bodyPreview = c.body.split('\n')[0].slice(0, 200)
          lines.push(`  - @${c.author}: ${bodyPreview}`)
        }
      }
    }
    lines.push('')
  }

  if (commentedIssues.length > 0) {
    lines.push('## Issues (commented)')
    for (const issue of commentedIssues) {
      const stateEmoji = issue.state === 'open' ? '🟢' : '⚫'
      lines.push(`- ${stateEmoji} [${issue.title}](${issue.url}) (${issue.repo}, ${issue.state})`)
      if (issue.issueComments && issue.issueComments.length > 0) {
        for (const c of issue.issueComments.slice(0, 3)) {
          const bodyPreview = c.body.split('\n')[0].slice(0, 200)
          lines.push(`  - @${c.author}: ${bodyPreview}`)
        }
      }
    }
    lines.push('')
  }

  if (discussionItems.length > 0) {
    lines.push('## Discussions')
    for (const d of discussionItems) {
      lines.push(`- [${d.title}](${d.url}) (${d.repo}, ${d.state})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export async function saveActivitySnapshot(
  reportName: string,
  startDate: string,
  endDate: string
): Promise<string> {
  const result = await fetchActivityForPerson(reportName, startDate, endDate)
  if (!result) throw new Error('Could not fetch activity (missing token, org, or GitHub username)')

  const profile = getReportProfile(reportName)
  const slug = reportName.toLowerCase().replace(/\s+/g, '-')
  const filename = `${startDate}-github-activity-${slug}.md`

  const frontmatter = [
    '---',
    `date: ${startDate}`,
    'source: github',
    `title: ${profile.displayName.split(' ')[0]}'s GitHub Activity${startDate === endDate ? `: ${startDate}` : ` (${startDate} to ${endDate})`}`,
    `people:`,
    `  - ${slug}`,
    'tags:',
    '  - github-activity',
    '  - activity-snapshot',
    '---',
    ''
  ].join('\n')

  const body = formatActivityAsMarkdown(result)
  const content = frontmatter + body

  await commitFile(
    `contexts/${filename}`,
    content,
    `Save GitHub activity snapshot for ${profile.displayName} (${startDate} to ${endDate})`
  )

  return filename
}
