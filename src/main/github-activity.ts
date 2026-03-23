import { getGithubOrgToken, getGithubOrgName } from './store'
import { getReports, getReportProfile } from './github'
import type { GitHubActivityItem, TeamMemberActivity } from '../shared/types'

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
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const since = yesterday.toISOString().split('T')[0]

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  const baseQuery = `org:${org} author:${username} updated:>=${since}`
  console.log(`[GitHub Activity] Fetching: org=${org}, user=${username}, since=${since}`)

  const [issueItems, prItems] = await Promise.all([
    fetchSearchPage(`${baseQuery} is:issue`, headers),
    fetchSearchPage(`${baseQuery} is:pull-request`, headers)
  ])

  return [...issueItems, ...prItems]
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

      const items = await fetchUserActivity(ghUsername, orgName, token)
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
