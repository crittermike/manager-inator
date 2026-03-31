import { getGithubOrgToken, getGithubOrgName } from './store'
import { getReports, getReportProfile, commitFile } from './github'
import type { GitHubActivityItem, TeamMemberActivity, MonthlyActivityStats, ActivityComment, PersonActivityResult } from '../shared/types'

const CACHE_TTL_MS = 15 * 60 * 1000
const MAX_CONCURRENT = 3
const GITHUB_API = 'https://api.github.com'

interface CacheEntry {
  data: TeamMemberActivity[]
  timestamp: number
  refreshing: boolean
}

let _cache: CacheEntry | null = null

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

async function fetchUserActivity(
  username: string,
  org: string,
  token: string
): Promise<GitHubActivityItem[]> {
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

  console.log(`[GitHub Activity] Fetching: org=${org}, user=${username}, since=${sinceStr}, lookback=${lookbackDays}d`)

  const authorQuery = `org:${org} author:${username} updated:>=${sinceStr}`
  const commenterQuery = `org:${org} commenter:${username} updated:>=${sinceStr}`

  const [issueItems, prItems, commentedIssues, commentedPRs, authoredDiscussions, commentedDiscussions] = await Promise.all([
    fetchSearchPage(`${authorQuery} is:issue`, headers),
    fetchSearchPage(`${authorQuery} is:pull-request`, headers),
    fetchSearchPage(`${commenterQuery} is:issue`, headers),
    fetchSearchPage(`${commenterQuery} is:pull-request`, headers),
    fetchDiscussions(`org:${org} author:${username} updated:>=${sinceStr}`, headers),
    fetchDiscussions(`org:${org} commenter:${username} updated:>=${sinceStr}`, headers)
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

  return Array.from(seen.values())
}

async function fetchSearchPage(
  query: string,
  headers: Record<string, string>
): Promise<GitHubActivityItem[]> {
  const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=50&sort=updated`

  const response = await fetch(url, { headers })

  if (response.status === 403) {
    const ssoHeader = response.headers.get('X-GitHub-SSO')
    if (ssoHeader) {
      throw new Error('SSO authorization required — visit your org\'s SSO page to authorize this token')
    }

    const remaining = response.headers.get('X-RateLimit-Remaining')
    if (remaining === '0') {
      const resetAt = response.headers.get('X-RateLimit-Reset')
      const resetDate = resetAt ? new Date(Number(resetAt) * 1000) : null
      throw new Error(
        `Rate limited${resetDate ? ` — resets at ${resetDate.toLocaleTimeString()}` : ''}`
      )
    }
    throw new Error(`GitHub API returned 403`)
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
  headers: Record<string, string>
): Promise<GitHubActivityItem[]> {
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

  const response = await fetch(`${GITHUB_API}/graphql`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(graphqlQuery)
  })

  if (!response.ok) {
    if (response.status === 403) {
      const ssoHeader = response.headers.get('X-GitHub-SSO')
      if (ssoHeader) {
        throw new Error('SSO authorization required — visit your org\'s SSO page to authorize this token')
      }
      const remaining = response.headers.get('X-RateLimit-Remaining')
      if (remaining === '0') {
        const resetAt = response.headers.get('X-RateLimit-Reset')
        const resetDate = resetAt ? new Date(Number(resetAt) * 1000) : null
        throw new Error(
          `Rate limited${resetDate ? ` — resets at ${resetDate.toLocaleTimeString()}` : ''}`
        )
      }
      throw new Error('GitHub API returned 403')
    }
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

      const rawItems = await fetchUserActivity(ghUsername, orgName, token)
      const items = await enrichItemsWithContent(rawItems, headers, MAX_TEAM_CONTENT_ITEMS)
      return {
        reportName: name,
        displayName: profile.displayName,
        githubUsername: ghUsername,
        items,
        error: null
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
      return {
        reportName: name,
        displayName,
        githubUsername: ghUsername,
        items: [],
        error: errorMsg
      }
    }
  })

  const results = await runWithConcurrency(tasks, MAX_CONCURRENT)

  _cache = {
    data: results,
    timestamp: Date.now(),
    refreshing: false
  }

  return results
}

export function clearActivityCache(): void {
  _cache = null
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

  console.log(`[GitHub Activity] Monthly fetch: org=${org}, user=${username}, ${start}..${end}`)

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
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=30`
  try {
    const response = await fetch(url, { headers })
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
  const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=20&sort=created&direction=desc`
  try {
    const response = await fetch(url, { headers })
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

  console.log(`[GitHub Activity] Fetching range: org=${org}, user=${username}, ${startDate}..${endDate}`)

  const dateRange = `${startDate}..${endDate}`
  const authorQuery = `org:${org} author:${username} updated:${dateRange}`
  const commenterQuery = `org:${org} commenter:${username} updated:${dateRange}`

  const [issueItems, prItems, commentedIssues, commentedPRs, authoredDiscussions, commentedDiscussions] = await Promise.all([
    fetchSearchPage(`${authorQuery} is:issue`, headers),
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
  const reviewedIssues = issueItems.filter(i => i.role === 'commenter')

  const lines: string[] = []
  lines.push(`# GitHub activity: ${displayName} (@${githubUsername})`)
  lines.push(`_${startDate} to ${endDate}_\n`)

  lines.push(`**Summary**: ${authoredPRs.length} PRs authored, ${reviewedPRs.length} PRs reviewed/commented, ${authoredIssues.length} issues authored, ${reviewedIssues.length} issues commented, ${discussionItems.length} discussions\n`)

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

  if (reviewedIssues.length > 0) {
    lines.push('## Issues (commented)')
    for (const issue of reviewedIssues) {
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
