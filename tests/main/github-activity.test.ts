import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/main/store', () => ({
  getGithubOrgToken: vi.fn(),
  getGithubOrgName: vi.fn()
}))

vi.mock('../../src/main/github', () => ({
  getReports: vi.fn(),
  getReportProfile: vi.fn(),
  commitFile: vi.fn()
}))

import { getTeamActivity, clearActivityCache, clearRateLimit, getActivityLookbackHours, extractIssueNumber, enrichItemsWithContent, formatActivityAsMarkdown, fetchActivityForPerson, saveActivitySnapshot, fetchTeamMemberActivity, _setSleepForTests, getRateLimitErrorMessage } from '../../src/main/github-activity'
import { getGithubOrgToken, getGithubOrgName } from '../../src/main/store'
import { getReports, getReportProfile, commitFile } from '../../src/main/github'

const mockedGetToken = vi.mocked(getGithubOrgToken)
const mockedGetOrgName = vi.mocked(getGithubOrgName)
const mockedGetReports = vi.mocked(getReports)
const mockedGetProfile = vi.mocked(getReportProfile)
const mockedCommitFile = vi.mocked(commitFile)

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeSearchResponse(items: Array<{
  id?: number
  title?: string
  html_url?: string
  state?: string
  created_at?: string
  updated_at?: string
  comments?: number
  labels?: { name: string }[]
  pull_request?: { merged_at: string | null } | undefined
  repository_url?: string
}>) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      total_count: items.length,
      items: items.map((item, i) => ({
        id: item.id ?? i + 1,
        title: item.title ?? `Item ${i + 1}`,
        html_url: item.html_url ?? `https://github.com/org/repo/issues/${i + 1}`,
        state: item.state ?? 'open',
        created_at: item.created_at ?? '2026-03-22T10:00:00Z',
        updated_at: item.updated_at ?? '2026-03-23T10:00:00Z',
        comments: item.comments ?? 0,
        labels: item.labels ?? [],
        pull_request: item.pull_request,
        repository_url: item.repository_url ?? 'https://api.github.com/repos/myorg/myrepo'
      }))
    })
  }
}

function makeGraphQLResponse(nodes: Array<{
  id?: string
  title?: string
  url?: string
  createdAt?: string
  updatedAt?: string
  closed?: boolean
  comments?: number
  labels?: string[]
  repo?: string
}>) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      data: {
        search: {
          nodes: nodes.map((n, i) => ({
            id: n.id ?? `D_kwDOAbc${i}`,
            title: n.title ?? `Discussion ${i + 1}`,
            url: n.url ?? `https://github.com/org/repo/discussions/${i + 1}`,
            createdAt: n.createdAt ?? '2026-03-22T10:00:00Z',
            updatedAt: n.updatedAt ?? '2026-03-23T10:00:00Z',
            closed: n.closed ?? false,
            comments: { totalCount: n.comments ?? 0 },
            labels: { nodes: (n.labels ?? []).map(name => ({ name })) },
            repository: { nameWithOwner: n.repo ?? 'myorg/myrepo' }
          }))
        }
      }
    })
  }
}

const emptySearchResponse = makeSearchResponse([])
const emptyGraphQLResponse = makeGraphQLResponse([])

function mockAllEmpty() {
  mockFetch.mockResolvedValue(emptySearchResponse)
}

function mockFetchResponder(restResponses: ReturnType<typeof makeSearchResponse>[], graphqlResponses: ReturnType<typeof makeGraphQLResponse>[] = []) {
  let restIdx = 0
  let graphqlIdx = 0
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/graphql')) {
      return graphqlResponses[graphqlIdx++] ?? emptyGraphQLResponse
    }
    return restResponses[restIdx++] ?? emptySearchResponse
  })
}

function makeProfile(name: string, github: string) {
  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    role: 'Engineer',
    team: '',
    github,
    startDate: '',
    meetingDay: 'monday',
    location: '',
    timezone: '',
    manager: '',
    about: '',
    communicationPreferences: {}
  }
}

describe('getTeamActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearActivityCache()
    clearRateLimit()
    mockFetch.mockReset()
  })

  afterEach(() => {
    clearActivityCache()
    clearRateLimit()
  })

  it('returns empty array when no org token is configured', async () => {
    mockedGetToken.mockReturnValue(null)

    const result = await getTeamActivity()
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns empty array when no org name is configured', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('')

    const result = await getTeamActivity()
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches activity for all reports with GitHub usernames', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice', 'bob'])
    mockedGetProfile
      .mockReturnValueOnce(makeProfile('alice', 'alice-gh'))
      .mockReturnValueOnce(makeProfile('bob', 'bob-gh'))

    const issueResponse = makeSearchResponse([
      { title: 'Fix bug', state: 'open', pull_request: undefined }
    ])

    mockFetchResponder(
      [issueResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse,
       issueResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse, emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    expect(result).toHaveLength(2)
    expect(result[0].reportName).toBe('alice')
    expect(result[0].githubUsername).toBe('alice-gh')
    expect(result[0].items).toHaveLength(1)
    expect(result[0].items[0].title).toBe('Fix bug')
    expect(result[0].items[0].type).toBe('issue')
    expect(result[0].error).toBeNull()

    expect(result[1].reportName).toBe('bob')
    expect(result[1].items).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(14) // 6 per person × 2 + 1 enrichment each
  })

  it('returns error message for reports without GitHub username', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['charlie'])
    mockedGetProfile.mockReturnValue(makeProfile('charlie', ''))

    const result = await getTeamActivity()

    expect(result).toHaveLength(1)
    expect(result[0].reportName).toBe('charlie')
    expect(result[0].error).toBe('No GitHub username in profile')
    expect(result[0].items).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('correctly identifies PRs vs issues', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [
        makeSearchResponse([{ id: 10, title: 'An issue', pull_request: undefined }]),
        makeSearchResponse([{ id: 20, title: 'A PR', pull_request: { merged_at: null } }]),
        emptySearchResponse,
        emptySearchResponse
      ],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    const types = result[0].items.map(i => i.type)
    expect(types).toContain('issue')
    expect(types).toContain('pr')
  })

  it('correctly determines merged state', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [
        makeSearchResponse([{ id: 10, title: 'Open issue', state: 'open' }]),
        makeSearchResponse([
          { id: 20, title: 'Merged PR', state: 'closed', pull_request: { merged_at: '2026-03-23T12:00:00Z' } },
          { id: 21, title: 'Closed PR', state: 'closed', pull_request: { merged_at: null } }
        ]),
        emptySearchResponse,
        emptySearchResponse
      ],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    const states = result[0].items.map(i => ({ title: i.title, state: i.state }))
    expect(states).toContainEqual({ title: 'Merged PR', state: 'merged' })
    expect(states).toContainEqual({ title: 'Closed PR', state: 'closed' })
    expect(states).toContainEqual({ title: 'Open issue', state: 'open' })
  })

  it('extracts repo name from repository_url', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [makeSearchResponse([{ repository_url: 'https://api.github.com/repos/myorg/frontend-app' }]),
       emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()
    expect(result[0].items[0].repo).toBe('myorg/frontend-app')
  })

  it('passes correct authorization headers', async () => {
    mockedGetToken.mockReturnValue('ghp_secret_token')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.github.com/search/issues'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer ghp_secret_token',
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        })
      })
    )
  })

  it('handles SSO 403 error', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ 'X-GitHub-SSO': 'required; url=https://github.com/orgs/myorg/sso' }),
      json: async () => ({})
    })

    const result = await getTeamActivity()

    expect(result[0].error).toContain('SSO authorization required')
    expect(result[0].items).toEqual([])
  })

  it('handles rate limit 403 error', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600)
      }),
      json: async () => ({})
    })

    const result = await getTeamActivity()

    expect(result[0].error).toContain('Rate limited')
    expect(result[0].items).toEqual([])
  })

  it('skips API calls when rate limited and returns empty results', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice', 'bob'])
    mockedGetProfile.mockImplementation((name: string) => makeProfile(name, `${name}-gh`))

    // First call hits rate limit
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600)
      }),
      json: async () => ({})
    })

    await getTeamActivity()
    clearActivityCache()
    const callsAfterFirstRate = mockFetch.mock.calls.length

    // Second call should skip API entirely due to rate limit tracking
    mockFetch.mockClear()
    const result = await getTeamActivity()

    // No new fetch calls should be made — all skipped
    expect(mockFetch).toHaveBeenCalledTimes(0)
    expect(result[0].items).toEqual([])
    expect(result[1].items).toEqual([])
  })

  it('handles generic API errors', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
      json: async () => ({})
    })

    const result = await getTeamActivity()

    expect(result[0].error).toContain('GitHub API returned 500')
    expect(result[0].items).toEqual([])
  })

  it('uses cached data within TTL', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [makeSearchResponse([{ title: 'Cached item' }]), emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result1 = await getTeamActivity()
    expect(result1[0].items[0].title).toBe('Cached item')
    expect(mockFetch).toHaveBeenCalledTimes(7) // 6 search/GQL + 1 enrichment

    const result2 = await getTeamActivity()
    expect(result2[0].items[0].title).toBe('Cached item')
  })

  it('clearActivityCache forces fresh fetch on next call', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [makeSearchResponse([{ title: 'Fresh data' }]), emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()
    expect(mockFetch).toHaveBeenCalledTimes(7) // 6 search/GQL + 1 enrichment

    clearActivityCache()
    mockFetch.mockClear()

    mockFetchResponder(
      [makeSearchResponse([{ title: 'Fresh data 2' }]), emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()
    expect(result[0].items[0].title).toBe('Fresh data 2')
    expect(mockFetch).toHaveBeenCalledTimes(7) // 6 search/GQL + 1 enrichment
  })

  it('handles mixed success and failure across reports', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice', 'bob'])
    mockedGetProfile
      .mockReturnValueOnce(makeProfile('alice', 'alice-gh'))
      .mockReturnValueOnce(makeProfile('bob', 'bob-gh'))

    const errorResponse = {
      ok: false,
      status: 500,
      statusText: 'Server Error',
      headers: new Headers(),
      json: async () => ({})
    }

    mockFetchResponder(
      [makeSearchResponse([{ title: 'Alice PR' }]), emptySearchResponse, emptySearchResponse, emptySearchResponse,
       errorResponse as any, errorResponse as any, errorResponse as any, errorResponse as any],
      [emptyGraphQLResponse, emptyGraphQLResponse, emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    expect(result).toHaveLength(2)
    expect(result[0].items).toHaveLength(1)
    expect(result[0].error).toBeNull()
    expect(result[1].items).toEqual([])
    expect(result[1].error).toContain('GitHub API returned 500')
  })

  it('includes labels from activity items', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [makeSearchResponse([{ labels: [{ name: 'bug' }, { name: 'priority:high' }] }]),
       emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()
    expect(result[0].items[0].labels).toEqual(['bug', 'priority:high'])
  })

  it('constructs correct search query with org and username', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('my-company')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-dev'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()

    const restCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/search/issues')
    )
    expect(restCalls.length).toBe(4)

    const authorIssueUrl = restCalls[0][0] as string
    expect(authorIssueUrl).toContain('org%3Amy-company')
    expect(authorIssueUrl).toContain('author%3Aalice-dev')
    expect(authorIssueUrl).toContain('per_page=50')
    expect(authorIssueUrl).toContain('sort=updated')
  })

  it('makes commenter queries alongside author queries', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()

    const restCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/search/issues')
    )
    const urls = restCalls.map((c: any[]) => decodeURIComponent(c[0] as string))

    expect(urls.some((u: string) => u.includes('author:alice-gh') && u.includes('is:issue'))).toBe(true)
    expect(urls.some((u: string) => u.includes('author:alice-gh') && u.includes('is:pull-request'))).toBe(true)
    expect(urls.some((u: string) => u.includes('commenter:alice-gh') && u.includes('is:issue'))).toBe(true)
    expect(urls.some((u: string) => u.includes('commenter:alice-gh') && u.includes('is:pull-request'))).toBe(true)
  })

  it('makes GraphQL discussion queries', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()

    const graphqlCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/graphql')
    )
    expect(graphqlCalls.length).toBe(2)

    const bodies = graphqlCalls.map((c: any[]) => JSON.parse(c[1].body))
    const queries = bodies.map((b: any) => b.variables.q)

    expect(queries.some((q: string) => q.includes('author:alice-gh'))).toBe(true)
    expect(queries.some((q: string) => q.includes('commenter:alice-gh'))).toBe(true)
  })

  it('returns discussion items with correct type', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [makeGraphQLResponse([
        { title: 'RFC: New API design', repo: 'myorg/backend', labels: ['rfc'] }
      ]), emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    const discussion = result[0].items.find(i => i.type === 'discussion')
    expect(discussion).toBeDefined()
    expect(discussion!.title).toBe('RFC: New API design')
    expect(discussion!.repo).toBe('myorg/backend')
    expect(discussion!.labels).toEqual(['rfc'])
    expect(discussion!.state).toBe('open')
  })

  it('deduplicates items between author and commenter queries', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const sharedItem = { id: 42, title: 'Shared Issue', state: 'open' as const, pull_request: undefined }

    mockFetchResponder(
      [
        makeSearchResponse([sharedItem]),
        emptySearchResponse,
        makeSearchResponse([sharedItem, { id: 99, title: 'Commented Only' }]),
        emptySearchResponse
      ],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    const ids = result[0].items.map(i => i.id)
    expect(ids.filter(id => id === 42)).toHaveLength(1)
    expect(ids).toContain(99)
    expect(result[0].items).toHaveLength(2)

    // Item 42 came from author query first, so should have role 'author'
    const item42 = result[0].items.find(i => i.id === 42)
    expect(item42!.role).toBe('author')

    // Item 99 came only from commenter query, so should have role 'commenter'
    const item99 = result[0].items.find(i => i.id === 99)
    expect(item99!.role).toBe('commenter')
  })

  it('deduplicates discussion items between author and commenter queries', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [
        makeGraphQLResponse([{ id: 'D_abc123', title: 'Shared Discussion' }]),
        makeGraphQLResponse([{ id: 'D_abc123', title: 'Shared Discussion' }, { id: 'D_def456', title: 'Commented Discussion' }])
      ]
    )

    const result = await getTeamActivity()

    const discussions = result[0].items.filter(i => i.type === 'discussion')
    expect(discussions).toHaveLength(2)
    const titles = discussions.map(d => d.title)
    expect(titles).toContain('Shared Discussion')
    expect(titles).toContain('Commented Discussion')

    const shared = discussions.find(d => d.title === 'Shared Discussion')
    expect(shared!.role).toBe('author')
    const commented = discussions.find(d => d.title === 'Commented Discussion')
    expect(commented!.role).toBe('commenter')
  })

  it('maps closed discussion state correctly', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [makeGraphQLResponse([
        { title: 'Open Discussion', closed: false },
        { title: 'Closed Discussion', closed: true }
      ]), emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    const discussions = result[0].items.filter(i => i.type === 'discussion')
    expect(discussions.find(d => d.title === 'Open Discussion')!.state).toBe('open')
    expect(discussions.find(d => d.title === 'Closed Discussion')!.state).toBe('closed')
  })

  it('handles GraphQL errors gracefully', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [{
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: null,
          errors: [{ message: 'Something went wrong' }]
        })
      } as any, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    expect(result[0].error).toContain('GraphQL error')
    expect(result[0].items).toEqual([])
  })

  it('sends 6 fetch calls per user (4 REST + 2 GraphQL)', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()

    expect(mockFetch).toHaveBeenCalledTimes(6)

    const restCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/search/issues')
    )
    const graphqlCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/graphql')
    )
    expect(restCalls).toHaveLength(4)
    expect(graphqlCalls).toHaveLength(2)
  })

  it('uses Bearer token for GraphQL requests too', async () => {
    mockedGetToken.mockReturnValue('ghp_secret_token')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()

    const graphqlCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/graphql')
    )
    expect(graphqlCalls.length).toBeGreaterThan(0)
    expect(graphqlCalls[0][1].headers['Authorization']).toBe('Bearer ghp_secret_token')
  })

  it('looks back 72h on Mondays (3 days instead of 1)', async () => {
    const monday = new Date('2026-03-30T12:00:00Z') // Monday
    vi.useFakeTimers({ now: monday })

    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()

    const restCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/search/issues')
    )
    const firstUrl = decodeURIComponent(restCalls[0][0] as string)
    // Monday March 30 minus 3 days = Friday March 27; issue author query uses created:
    expect(firstUrl).toContain('created:>=2026-03-27')

    vi.useRealTimers()
  })

  it('looks back 24h on non-Monday days', async () => {
    const wednesday = new Date('2026-03-25T12:00:00Z') // Wednesday
    vi.useFakeTimers({ now: wednesday })

    clearActivityCache()

    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetchResponder(
      [emptySearchResponse, emptySearchResponse, emptySearchResponse, emptySearchResponse],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    await getTeamActivity()

    const restCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/search/issues')
    )
    const firstUrl = decodeURIComponent(restCalls[0][0] as string)
    // Wednesday March 25 minus 1 day = Tuesday March 24; issue author query uses created:
    expect(firstUrl).toContain('created:>=2026-03-24')

    vi.useRealTimers()
  })

  it('assigns role author to items from the author search and commenter to items from the commenter search', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const authorIssue = { id: 10, title: 'Author Issue', pull_request: undefined }
    const authorPR = { id: 20, title: 'Author PR', pull_request: { merged_at: null } }
    const commenterIssue = { id: 30, title: 'Commenter Issue', pull_request: undefined }
    const commenterPR = { id: 40, title: 'Commenter PR', pull_request: { merged_at: null } }

    mockFetchResponder(
      [
        makeSearchResponse([authorIssue]),   // authored issues
        makeSearchResponse([authorPR]),      // authored PRs
        makeSearchResponse([commenterIssue]),// commented issues
        makeSearchResponse([commenterPR])    // commented PRs
      ],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    const items = result[0].items
    expect(items.find(i => i.id === 10)!.role).toBe('author')
    expect(items.find(i => i.id === 20)!.role).toBe('author')
    expect(items.find(i => i.id === 30)!.role).toBe('commenter')
    expect(items.find(i => i.id === 40)!.role).toBe('commenter')
  })

  it('gives author precedence when an item appears in both author and commenter PR searches', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const sharedPR = { id: 50, title: 'Shared PR', pull_request: { merged_at: null } }
    const commenterOnlyPR = { id: 60, title: 'Commenter Only PR', pull_request: { merged_at: null } }

    mockFetchResponder(
      [
        emptySearchResponse,                          // authored issues
        makeSearchResponse([sharedPR]),                // authored PRs
        emptySearchResponse,                          // commented issues
        makeSearchResponse([sharedPR, commenterOnlyPR]) // commented PRs
      ],
      [emptyGraphQLResponse, emptyGraphQLResponse]
    )

    const result = await getTeamActivity()

    const items = result[0].items
    // Shared PR should only appear once with role 'author'
    expect(items.filter(i => i.id === 50)).toHaveLength(1)
    expect(items.find(i => i.id === 50)!.role).toBe('author')
    // Commenter-only PR should have role 'commenter'
    expect(items.find(i => i.id === 60)!.role).toBe('commenter')
  })
})

describe('getActivityLookbackHours', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 72 on Monday', () => {
    vi.useFakeTimers({ now: new Date('2026-03-30T12:00:00Z') }) // Monday
    expect(getActivityLookbackHours()).toBe(72)
  })

  it('returns 24 on other days', () => {
    vi.useFakeTimers({ now: new Date('2026-03-25T12:00:00Z') }) // Wednesday
    expect(getActivityLookbackHours()).toBe(24)
  })
})

describe('extractIssueNumber', () => {
  it('parses PR URLs', () => {
    const result = extractIssueNumber('https://github.com/myorg/myrepo/pull/42')
    expect(result).toEqual({ owner: 'myorg', repo: 'myrepo', number: 42 })
  })

  it('parses issue URLs', () => {
    const result = extractIssueNumber('https://github.com/acme/widgets/issues/123')
    expect(result).toEqual({ owner: 'acme', repo: 'widgets', number: 123 })
  })

  it('returns null for non-matching URLs', () => {
    expect(extractIssueNumber('https://github.com/myorg/myrepo')).toBeNull()
    expect(extractIssueNumber('https://example.com/pull/1')).toBeNull()
    expect(extractIssueNumber('')).toBeNull()
  })

  it('parses URLs with extra path segments', () => {
    const result = extractIssueNumber('https://github.com/org/repo/pull/99/files')
    expect(result).toEqual({ owner: 'org', repo: 'repo', number: 99 })
  })
})

describe('enrichItemsWithContent', () => {
  const headers = { Authorization: 'Bearer test', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }

  beforeEach(() => {
    mockFetch.mockReset()
    clearRateLimit()
  })

  it('fetches reviews and comments for PR items', async () => {
    const items = [{
      id: 1,
      title: 'Fix bug',
      url: 'https://github.com/myorg/myrepo/pull/10',
      state: 'open' as const,
      type: 'pr' as const,
      repo: 'myorg/myrepo',
      comments: 3,
      labels: [],
      createdAt: '2026-03-20T10:00:00Z',
      updatedAt: '2026-03-22T10:00:00Z'
    }]

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          { user: { login: 'reviewer1' }, body: 'LGTM', submitted_at: '2026-03-21T10:00:00Z', state: 'APPROVED' }
        ])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          { user: { login: 'commenter1' }, body: 'Nice work', created_at: '2026-03-21T11:00:00Z' }
        ])
      })

    const result = await enrichItemsWithContent(items, headers)
    expect(result).toHaveLength(1)
    expect(result[0].reviewComments).toHaveLength(1)
    expect(result[0].reviewComments![0].author).toBe('reviewer1')
    expect(result[0].reviewComments![0].reviewState).toBe('APPROVED')
    expect(result[0].issueComments).toHaveLength(1)
    expect(result[0].issueComments![0].author).toBe('commenter1')
  })

  it('fetches only comments for issue items', async () => {
    const items = [{
      id: 2,
      title: 'Bug report',
      url: 'https://github.com/myorg/myrepo/issues/20',
      state: 'open' as const,
      type: 'issue' as const,
      repo: 'myorg/myrepo',
      comments: 1,
      labels: [],
      createdAt: '2026-03-20T10:00:00Z',
      updatedAt: '2026-03-22T10:00:00Z'
    }]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { user: { login: 'alice' }, body: 'Can reproduce', created_at: '2026-03-21T10:00:00Z' }
      ])
    })

    const result = await enrichItemsWithContent(items, headers)
    expect(result).toHaveLength(1)
    expect(result[0].issueComments).toHaveLength(1)
    expect(result[0].issueComments![0].body).toBe('Can reproduce')
    expect(result[0].reviewComments).toBeUndefined()
  })

  it('skips items with non-GitHub URLs', async () => {
    const items = [{
      id: 3,
      title: 'Something',
      url: 'https://not-github.com/foo',
      state: 'open' as const,
      type: 'pr' as const,
      repo: 'other/repo',
      comments: 0,
      labels: [],
      createdAt: '2026-03-20T10:00:00Z',
      updatedAt: '2026-03-22T10:00:00Z'
    }]

    const result = await enrichItemsWithContent(items, headers)
    expect(result).toHaveLength(1)
    expect(result[0].reviewComments).toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('limits enrichment to MAX_CONTENT_ITEMS (15), sorted by comment count', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: i + 100,
      title: `Item ${i}`,
      url: `https://github.com/myorg/myrepo/issues/${i + 100}`,
      state: 'open' as const,
      type: 'issue' as const,
      repo: 'myorg/myrepo',
      comments: 20 - i,
      labels: [],
      createdAt: '2026-03-20T10:00:00Z',
      updatedAt: '2026-03-22T10:00:00Z'
    }))

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ([])
    })

    await enrichItemsWithContent(items, headers)
    expect(mockFetch).toHaveBeenCalledTimes(15)
  })

  it('respects custom limit parameter', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: i + 200,
      title: `Item ${i}`,
      url: `https://github.com/myorg/myrepo/issues/${i + 200}`,
      state: 'open' as const,
      type: 'issue' as const,
      repo: 'myorg/myrepo',
      comments: 10 - i,
      labels: [],
      createdAt: '2026-03-20T10:00:00Z',
      updatedAt: '2026-03-22T10:00:00Z'
    }))

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ([])
    })

    await enrichItemsWithContent(items, headers, 3)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('returns all items even when only some are enriched', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: i + 300,
      title: `Item ${i}`,
      url: `https://github.com/myorg/myrepo/issues/${i + 300}`,
      state: 'open' as const,
      type: 'issue' as const,
      repo: 'myorg/myrepo',
      comments: 5 - i,
      labels: [],
      createdAt: '2026-03-20T10:00:00Z',
      updatedAt: '2026-03-22T10:00:00Z'
    }))

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ([{ user: { login: 'tester' }, body: 'Test comment', created_at: '2026-03-21T10:00:00Z' }])
    })

    const result = await enrichItemsWithContent(items, headers, 2)
    expect(result).toHaveLength(5)
    const enrichedCount = result.filter(r => r.issueComments && r.issueComments.length > 0).length
    expect(enrichedCount).toBe(2)
  })
})

describe('formatActivityAsMarkdown', () => {
  it('formats a complete activity result', () => {
    const result = {
      reportName: 'alice',
      displayName: 'Alice Smith',
      githubUsername: 'alice-gh',
      startDate: '2026-03-15',
      endDate: '2026-03-22',
      fetchedAt: '2026-03-22T12:00:00Z',
      items: [
        {
          id: 1, title: 'Add auth', url: 'https://github.com/org/repo/pull/1',
          state: 'merged' as const, type: 'pr' as const, repo: 'org/repo',
          comments: 2, labels: [], createdAt: '2026-03-16T10:00:00Z', updatedAt: '2026-03-17T10:00:00Z',
          reviewComments: [
            { author: 'bob', body: 'Looks good to me', createdAt: '2026-03-17T10:00:00Z', reviewState: 'APPROVED' }
          ]
        },
        {
          id: 2, title: 'Fix login bug', url: 'https://github.com/org/repo/issues/5',
          state: 'closed' as const, type: 'issue' as const, repo: 'org/repo',
          comments: 1, labels: [], createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-18T10:00:00Z',
          issueComments: [
            { author: 'alice-gh', body: 'Fixed in #1', createdAt: '2026-03-18T10:00:00Z' }
          ]
        },
        {
          id: 3, title: 'RFC: new API', url: 'https://github.com/org/repo/discussions/10',
          state: 'open' as const, type: 'discussion' as const, repo: 'org/repo',
          comments: 0, labels: [], createdAt: '2026-03-20T10:00:00Z', updatedAt: '2026-03-21T10:00:00Z'
        }
      ]
    }

    const md = formatActivityAsMarkdown(result)
    expect(md).toContain('# GitHub activity: Alice Smith (@alice-gh)')
    expect(md).toContain('_2026-03-15 to 2026-03-22_')
    expect(md).toContain('1 PRs authored')
    expect(md).toContain('0 PRs reviewed/commented')
    expect(md).toContain('1 issues authored')
    expect(md).toContain('1 discussions')
    expect(md).toContain('## Pull requests (authored)')
    expect(md).toContain('🟣')
    expect(md).toContain('Add auth')
    expect(md).toContain('@bob')
    expect(md).toContain('APPROVED')
    expect(md).toContain('## Issues (authored)')
    expect(md).toContain('Fixed in #1')
    expect(md).toContain('## Discussions')
    expect(md).toContain('RFC: new API')
  })

  it('omits empty sections', () => {
    const result = {
      reportName: 'bob',
      displayName: 'Bob Jones',
      githubUsername: 'bob-gh',
      startDate: '2026-03-15',
      endDate: '2026-03-22',
      fetchedAt: '2026-03-22T12:00:00Z',
      items: [
        {
          id: 1, title: 'My PR', url: 'https://github.com/org/repo/pull/1',
          state: 'open' as const, type: 'pr' as const, repo: 'org/repo',
          comments: 0, labels: [], createdAt: '2026-03-16T10:00:00Z', updatedAt: '2026-03-17T10:00:00Z'
        }
      ]
    }

    const md = formatActivityAsMarkdown(result)
    expect(md).toContain('## Pull requests (authored)')
    expect(md).not.toContain('## Issues')
    expect(md).not.toContain('## Discussions')
  })
})

describe('fetchActivityForPerson', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearRateLimit()
  })

  it('returns null when no token', async () => {
    mockedGetToken.mockReturnValue(null as unknown as string)
    const result = await fetchActivityForPerson('alice', '2026-03-15', '2026-03-22')
    expect(result).toBeNull()
  })

  it('returns null when no org', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue(null as unknown as string)
    const result = await fetchActivityForPerson('alice', '2026-03-15', '2026-03-22')
    expect(result).toBeNull()
  })

  it('returns null when person has no github username', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetProfile.mockReturnValue({ ...makeProfile('alice', ''), github: '' })

    const result = await fetchActivityForPerson('alice', '2026-03-15', '2026-03-22')
    expect(result).toBeNull()
  })

  it('returns structured result with items on success', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const prResponse = makeSearchResponse([
      { title: 'Add auth', html_url: 'https://github.com/myorg/repo/pull/1', pull_request: { merged_at: '2026-03-17T10:00:00Z' } }
    ])

    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/search/issues')) return prResponse
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      if (typeof url === 'string' && (url.includes('/reviews') || url.includes('/comments'))) {
        return { ok: true, json: async () => ([]) }
      }
      return emptySearchResponse
    })

    const result = await fetchActivityForPerson('alice', '2026-03-15', '2026-03-22')
    expect(result).not.toBeNull()
    expect(result!.reportName).toBe('alice')
    expect(result!.displayName).toBe('Alice')
    expect(result!.githubUsername).toBe('alice-gh')
    expect(result!.startDate).toBe('2026-03-15')
    expect(result!.endDate).toBe('2026-03-22')
    expect(result!.fetchedAt).toBeTruthy()
  })
})

describe('saveActivitySnapshot', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearRateLimit()
    mockedCommitFile.mockReset()
  })

  it('throws when activity cannot be fetched', async () => {
    mockedGetToken.mockReturnValue(null as unknown as string)
    await expect(saveActivitySnapshot('alice', '2026-03-15', '2026-03-22'))
      .rejects.toThrow('Could not fetch activity')
  })

  it('saves snapshot with correct path and frontmatter', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/search/issues')) return emptySearchResponse
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      return { ok: true, json: async () => ([]) }
    })

    mockedCommitFile.mockResolvedValue(undefined as never)

    const filename = await saveActivitySnapshot('alice', '2026-03-15', '2026-03-22')
    expect(filename).toBe('2026-03-15-github-activity-alice.md')

    expect(mockedCommitFile).toHaveBeenCalledTimes(1)
    const [path, content, message] = mockedCommitFile.mock.calls[0]
    expect(path).toBe('contexts/2026-03-15-github-activity-alice.md')
    expect(content).toContain('source: github')
    expect(content).toContain('github-activity')
    expect(content).toContain('activity-snapshot')
    expect(content).toContain('Alice')
    expect(message).toContain('Alice')
    expect(message).toContain('2026-03-15')
  })
})

// ── Rate-limit retry behaviour (auto + per-member force-retry) ──

describe('rate-limit retry behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearActivityCache()
    clearRateLimit()
    mockFetch.mockReset()
    vi.unstubAllEnvs()
    // No-op sleep so tests run instantly regardless of wait amounts.
    _setSleepForTests(async () => {})
  })

  afterEach(() => {
    clearActivityCache()
    clearRateLimit()
    vi.unstubAllEnvs()
    _setSleepForTests(null)
  })

  function makeRateLimitResponse(
    opts: { status?: number; remaining?: string; reset?: string; retryAfter?: string; sso?: boolean } = {}
  ) {
    const headers = new Headers()
    if (opts.remaining !== undefined) headers.set('X-RateLimit-Remaining', opts.remaining)
    if (opts.reset !== undefined) headers.set('X-RateLimit-Reset', opts.reset)
    if (opts.retryAfter !== undefined) headers.set('Retry-After', opts.retryAfter)
    if (opts.sso) headers.set('X-GitHub-SSO', 'required')
    return {
      ok: false,
      status: opts.status ?? 403,
      headers,
      json: async () => ({})
    }
  }

  // Helper: schedule one rate-limited response followed by success responses
  // for the remaining 5 sibling queries within a fetchUserActivity call (5
  // search/GraphQL + N enrichment). Returns the rate-limited response so
  // tests can inspect it.
  function setupSequence(responses: Array<ReturnType<typeof makeRateLimitResponse> | ReturnType<typeof makeSearchResponse> | ReturnType<typeof makeGraphQLResponse>>) {
    let idx = 0
    mockFetch.mockImplementation(async () => {
      const r = responses[idx] ?? emptySearchResponse
      idx++
      return r
    })
  }

  it('retries after a 403 with reset in the near future and succeeds', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
      }
      return emptySearchResponse
    })

    const result = await getTeamActivity()
    expect(result[0].error).toBeNull()
    // At least the rate-limited call was retried (otherwise callCount would
    // stay at 1 forever and we'd never make any successful requests).
    expect(callCount).toBeGreaterThan(1)
  })

  it('retries after a 429 with Retry-After: 0 and succeeds', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    let firstRequestSeen = false
    mockFetch.mockImplementation(async () => {
      if (!firstRequestSeen) {
        firstRequestSeen = true
        return makeRateLimitResponse({ status: 429, retryAfter: '0' })
      }
      return emptySearchResponse
    })

    const result = await getTeamActivity()
    expect(result[0].error).toBeNull()
  })

  it('treats a 403 with only Retry-After (no X-RateLimit-Remaining) as a rate limit and retries', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    let firstRequestSeen = false
    mockFetch.mockImplementation(async () => {
      if (!firstRequestSeen) {
        firstRequestSeen = true
        return makeRateLimitResponse({ status: 403, retryAfter: '0' })
      }
      return emptySearchResponse
    })

    const result = await getTeamActivity()
    expect(result[0].error).toBeNull()
  })

  it('gives up after MANAGER_INATOR_RATE_LIMIT_MAX_RETRIES=1 and surfaces rate-limit error', async () => {
    vi.stubEnv('MANAGER_INATOR_RATE_LIMIT_MAX_RETRIES', '1')
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    mockFetch.mockResolvedValue(
      makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    )

    const result = await getTeamActivity()
    // With maxRetries=1 and Promise.allSettled, all 6 sibling queries fail
    // with rate-limit errors after one retry each. Result: empty items, the
    // partial-error field captures the rate-limit message.
    expect(result[0].items).toEqual([])
    expect(result[0].error).toMatch(/Rate limited/)
  })

  it('respects upper clamp of 5 for the env var (huge value silently caps)', async () => {
    vi.stubEnv('MANAGER_INATOR_RATE_LIMIT_MAX_RETRIES', '1000')
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      return makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    })

    await getTeamActivity()
    // Each of the 6 sibling queries makes 1 initial + 5 retries = 6 calls
    // max under the cap. Total upper bound: 36 calls. If env wasn't clamped,
    // we'd see far more.
    expect(callCount).toBeLessThanOrEqual(6 * 6)
  })

  it('falls back to default retries (3) when env var is NaN/garbage', async () => {
    vi.stubEnv('MANAGER_INATOR_RATE_LIMIT_MAX_RETRIES', 'not-a-number')
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      return makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    })

    await getTeamActivity()
    // 6 siblings × (1 initial + 3 retries) = 24 calls under default behaviour.
    expect(callCount).toBeLessThanOrEqual(6 * 4)
  })

  it('falls back to default retries when env var is negative', async () => {
    vi.stubEnv('MANAGER_INATOR_RATE_LIMIT_MAX_RETRIES', '-5')
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      return makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    })

    await getTeamActivity()
    expect(callCount).toBeLessThanOrEqual(6 * 4)
  })

  it('fails fast (no retry) when reset is beyond the 5-minute wait cap', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Reset 10 minutes out — beyond the 5 minute cap, should give up immediately.
    const farReset = String(Math.floor(Date.now() / 1000) + 600)
    mockFetch.mockResolvedValue(
      makeRateLimitResponse({ status: 403, remaining: '0', reset: farReset })
    )

    const result = await getTeamActivity()
    expect(result[0].items).toEqual([])
    expect(result[0].error).toMatch(/Rate limited/)
    // The first sibling makes one request, hits the cap, sets the global
    // gate. The other 5 siblings then bail fast via isRateLimited() without
    // making a request. So we expect at most ~6 total fetch calls (one per
    // sibling that managed to start before the gate was set), almost
    // certainly less than 6×4 = 24 (which would imply retrying).
    expect(mockFetch.mock.calls.length).toBeLessThan(12)
  })

  it('preserves partial success when one sibling rate-limits and others succeed', async () => {
    vi.stubEnv('MANAGER_INATOR_RATE_LIMIT_MAX_RETRIES', '0') // no retries — fail fast on rate limit
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Order in fetchUserActivity: 4 REST (issue, PR, commenter-issue, commenter-PR), 2 GraphQL discussions.
    // Make the first REST call rate-limited; subsequent succeed.
    let restIdx = 0
    let graphqlIdx = 0
    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/graphql')) {
        graphqlIdx++
        return emptyGraphQLResponse
      }
      restIdx++
      if (restIdx === 1) {
        return makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
      }
      return makeSearchResponse([{ id: restIdx, title: `Item ${restIdx}` }])
    })

    const result = await getTeamActivity()
    // Other REST queries should still produce items even though one failed.
    expect(result[0].items.length).toBeGreaterThan(0)
    // And the partial error should be exposed when items survive? Per
    // refreshCache logic, error is only set if items is empty. With items
    // present, error is null even on partial failure. Verify items survived.
    expect(graphqlIdx).toBeGreaterThan(0) // Sanity: GraphQL was called
  })

  it('SSO 403 is not retried (single fetch call, immediate error)', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    let restCount = 0
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      restCount++
      return makeRateLimitResponse({ status: 403, sso: true })
    })

    const result = await getTeamActivity()
    expect(result[0].error).toMatch(/SSO authorization required/)
    // Each of the 4 REST sibling queries should make exactly 1 call, no retries.
    expect(restCount).toBeLessThanOrEqual(4)
  })

  it('enrichment rate-limit does not fail the whole per-member fetch', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // The first REST search returns a PR item that will be enriched.
    // Subsequent searches return empty. Enrichment calls (different URL
    // shape: /repos/.../reviews or /comments) all rate-limit; per the
    // catch-and-return-[] pattern these should silently swallow.
    let searchCount = 0
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      if (typeof url === 'string' && url.includes('/search/issues')) {
        searchCount++
        if (searchCount === 2) {
          return makeSearchResponse([
            {
              id: 99,
              title: 'PR with comments',
              html_url: 'https://github.com/myorg/myrepo/pull/99',
              pull_request: { merged_at: null },
              comments: 5
            }
          ])
        }
        return emptySearchResponse
      }
      // Enrichment URLs (e.g. /repos/myorg/myrepo/pulls/99/reviews) — return rate-limit.
      const futureReset = String(Math.floor(Date.now() / 1000) + 1)
      return makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    })

    const result = await getTeamActivity()
    // We still get the PR item; enrichment silently dropped its extra data.
    expect(result[0].error).toBeNull()
    expect(result[0].items.some(i => i.title === 'PR with comments')).toBe(true)
  })
})

describe('fetchTeamMemberActivity (per-member retry)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearActivityCache()
    clearRateLimit()
    mockFetch.mockReset()
    vi.unstubAllEnvs()
    _setSleepForTests(async () => {})
  })

  afterEach(() => {
    clearActivityCache()
    clearRateLimit()
    vi.unstubAllEnvs()
    _setSleepForTests(null)
  })

  function makeRateLimitResponse(
    opts: { status?: number; remaining?: string; reset?: string; retryAfter?: string } = {}
  ) {
    const headers = new Headers()
    if (opts.remaining !== undefined) headers.set('X-RateLimit-Remaining', opts.remaining)
    if (opts.reset !== undefined) headers.set('X-RateLimit-Reset', opts.reset)
    if (opts.retryAfter !== undefined) headers.set('Retry-After', opts.retryAfter)
    return {
      ok: false,
      status: opts.status ?? 403,
      headers,
      json: async () => ({})
    }
  }

  it('returns an error result when the org token is missing', async () => {
    mockedGetToken.mockReturnValue(null)
    const result = await fetchTeamMemberActivity('alice')
    expect(result.error).toMatch(/token/i)
    expect(result.items).toEqual([])
  })

  it('returns an error result when the report has no github username', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetProfile.mockReturnValue(makeProfile('alice', ''))
    const result = await fetchTeamMemberActivity('alice')
    expect(result.error).toMatch(/No GitHub username/)
    expect(result.items).toEqual([])
  })

  it('fetches and returns activity for a single member', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      if (typeof url === 'string' && url.includes('/search/issues')) {
        return makeSearchResponse([{ id: 42, title: 'Single fetch item' }])
      }
      return { ok: true, headers: new Headers(), json: async () => ([]) }
    })

    const result = await fetchTeamMemberActivity('alice')
    expect(result.reportName).toBe('alice')
    expect(result.items.some(i => i.title === 'Single fetch item')).toBe(true)
    expect(result.error).toBeNull()
  })

  it('with force=true, clears the rate-limit gate and runs single-shot (no retry)', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // First: trigger getTeamActivity to set the rate-limit gate.
    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    mockFetch.mockResolvedValue(
      makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    )
    await getTeamActivity()
    clearActivityCache()

    // Now configure: every request rate-limits. If force=true correctly
    // bypasses the gate AND runs single-shot, we should see exactly N calls
    // (one per sibling), not N×(1+retries).
    mockFetch.mockReset()
    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      return makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    })

    const result = await fetchTeamMemberActivity('alice', { force: true })

    // single-shot: 6 sibling requests, no retries, then they each set the
    // gate so subsequent ones bail. We expect at most 6 calls.
    expect(callCount).toBeLessThanOrEqual(6)
    expect(result.error).toMatch(/Rate limited/)
    expect(result.items).toEqual([])
  })

  it('patches the cached team activity so subsequent getTeamActivity reflects the fix', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Seed the cache with an error result.
    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    mockFetch.mockResolvedValue(
      makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    )
    const first = await getTeamActivity()
    expect(first[0].error).toMatch(/Rate limited/)

    // Now configure success and patch via single-member retry.
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      if (typeof url === 'string' && url.includes('/search/issues')) {
        return makeSearchResponse([{ id: 7, title: 'Recovered item' }])
      }
      return { ok: true, headers: new Headers(), json: async () => ([]) }
    })

    await fetchTeamMemberActivity('alice', { force: true })

    // Subsequent getTeamActivity should serve the patched data from cache.
    const second = await getTeamActivity()
    expect(second[0].error).toBeNull()
    expect(second[0].items.some(i => i.title === 'Recovered item')).toBe(true)
  })

  it('a stale background refresh does not overwrite a fresh single-member patch', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Seed the cache with stale rate-limited data.
    const futureReset = String(Math.floor(Date.now() / 1000) + 1)
    mockFetch.mockResolvedValue(
      makeRateLimitResponse({ status: 403, remaining: '0', reset: futureReset })
    )
    await getTeamActivity()

    // The cache is now populated with errored entries. A subsequent
    // getTeamActivity call kicks off a background refresh while serving
    // cached data. We hold the background refresh open by making it slow
    // via a deferred fetch implementation, then run the manual patch.
    let resolveBgFetch: (() => void) | null = null
    const bgGate = new Promise<void>(resolve => { resolveBgFetch = resolve })
    let bgFirstCall = true
    mockFetch.mockImplementation(async () => {
      if (bgFirstCall) {
        bgFirstCall = false
        await bgGate
      }
      // The background refresh's later calls return success (which would
      // overwrite the cache if not for the generation counter guard).
      return makeSearchResponse([{ id: 999, title: 'Stale bg refresh data' }])
    })

    // Trigger getTeamActivity — returns cache, kicks off background refresh
    // (which is now blocked on bgGate).
    const _cached = await getTeamActivity()
    void _cached
    // Give the background refresh a microtask to schedule its first fetch.
    await Promise.resolve()

    // Now run the manual patch with a successful response.
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      return makeSearchResponse([{ id: 7, title: 'Manual patch item' }])
    })
    await fetchTeamMemberActivity('alice', { force: true })

    // Now let the background refresh complete.
    if (resolveBgFetch) (resolveBgFetch as () => void)()
    // Yield enough microtasks for the background refresh to attempt to
    // assign _cache, see the changed generation, and bail.
    for (let i = 0; i < 10; i++) await Promise.resolve()

    const final = await getTeamActivity()
    // The manual patch should still win — the stale bg data should NOT
    // appear.
    expect(final[0].items.some(i => i.title === 'Manual patch item')).toBe(true)
    expect(final[0].items.some(i => i.title === 'Stale bg refresh data')).toBe(false)
  })
})

// ── Regression: silent-bail surfacing + cached-items preservation ──

describe('silent-bail surfacing when rate-limit gate is active', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearActivityCache()
    clearRateLimit()
    mockFetch.mockReset()
    vi.unstubAllEnvs()
    _setSleepForTests(async () => {})
  })

  afterEach(() => {
    clearActivityCache()
    clearRateLimit()
    vi.unstubAllEnvs()
    _setSleepForTests(null)
  })

  function makeRateLimitResponse(opts: { status?: number; remaining?: string; reset?: string } = {}) {
    const headers = new Headers()
    if (opts.remaining !== undefined) headers.set('X-RateLimit-Remaining', opts.remaining)
    if (opts.reset !== undefined) headers.set('X-RateLimit-Reset', opts.reset)
    return {
      ok: false,
      status: opts.status ?? 403,
      headers,
      json: async () => ({})
    }
  }

  it('getRateLimitErrorMessage returns null when no gate is set', () => {
    expect(getRateLimitErrorMessage()).toBeNull()
  })

  it('getRateLimitErrorMessage returns a formatted message when the gate is in the future', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Reset far enough in the future that the wrapper gives up immediately.
    const farReset = String(Math.floor(Date.now() / 1000) + 3600)
    mockFetch.mockResolvedValue(makeRateLimitResponse({ status: 403, remaining: '0', reset: farReset }))
    await getTeamActivity()

    const msg = getRateLimitErrorMessage()
    expect(msg).toMatch(/Rate limited/)
  })

  it('REGRESSION: when the gate is set by a prior call, the next getTeamActivity surfaces the gate error (not silent empty)', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Step 1: trigger a rate-limit hit that sets the gate far in the future.
    const farReset = String(Math.floor(Date.now() / 1000) + 3600)
    mockFetch.mockResolvedValue(makeRateLimitResponse({ status: 403, remaining: '0', reset: farReset }))
    await getTeamActivity()
    clearActivityCache()

    // Step 2: gate is still set. Subsequent call — every primitive's
    // pre-flight isRateLimited() short-circuits with []. Before the fix
    // this produced { items: [], error: null }. With the fix we surface
    // the gate state as the error.
    mockFetch.mockReset()
    let callCount = 0
    mockFetch.mockImplementation(async () => {
      callCount++
      return emptySearchResponse
    })

    const result = await getTeamActivity()

    // No HTTP calls at all (everything bailed via the gate).
    expect(callCount).toBe(0)
    // The member surfaces the gate as an error so the UI shows the badge
    // + Retry button instead of "No recent activity".
    expect(result[0].items).toEqual([])
    expect(result[0].error).toMatch(/Rate limited/)
  })

  it('REGRESSION: preserves cached items when a fresh refresh under an active gate yields nothing for that member', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Step 1: seed the cache with real data via a successful refresh.
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      if (typeof url === 'string' && url.includes('/search/issues')) {
        return makeSearchResponse([{ id: 42, title: 'Real cached PR' }])
      }
      return { ok: true, headers: new Headers(), json: async () => ([]) }
    })
    const first = await getTeamActivity()
    expect(first[0].items.some(i => i.title === 'Real cached PR')).toBe(true)

    // Step 2: provoke a rate-limit hit that sets the gate far out, then
    // clear the cache so the next call goes through refreshCache.
    const farReset = String(Math.floor(Date.now() / 1000) + 3600)
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(makeRateLimitResponse({ status: 403, remaining: '0', reset: farReset }))
    // Trigger one fetchTeamMemberActivity in non-force mode to set the gate
    // without clearing it. Easier: just manually set _rateLimitedUntil via
    // the public hook. Use a tiny "happy" sequence to keep cache populated,
    // then trip the gate directly by calling getTeamActivity again — but
    // that would clear the existing cache through refreshCache.
    //
    // Simplest: trigger the gate via fetchTeamMemberActivity force=false
    // path... but that path also patches the cache. We need the cache to
    // STILL have the original real data.
    //
    // Cleanest: call fetchSearchPage indirectly by calling getTeamActivity
    // with all-rate-limit responses; the failure surfaces the error AND
    // (after the fix) preserves the cached items.

    // Re-seed the mock: all calls return rate-limit. clearActivityCache to
    // force a fresh refresh (which will see _cache is null... wait, we
    // want _cache to still be populated). Don't clearActivityCache. Let
    // the TTL elapse via cache bypass.
    //
    // The cache TTL is 15 min, so within the same test we're inside TTL.
    // To force the refresh we need to clear the cache OR call the
    // refresh-only path. clearActivityCache() bumps generation but also
    // sets _cache = null, which means the cachedItemsByName snapshot in
    // refreshCache will be empty.
    //
    // Workaround: temporarily set the TTL via cache timestamp manipulation
    // is not exposed. Instead: rely on the existing background-refresh
    // path. getTeamActivity returns cached + kicks background refresh
    // when within TTL. We can call getTeamActivity, wait for the
    // background refresh, then check the cache.
    //
    // Implementation: queue the rate-limit responses, call getTeamActivity
    // (returns cached data immediately), await the background refresh
    // completion, then call getTeamActivity again to read the (now
    // patched) cache.

    const cachedReturn = await getTeamActivity() // returns cached, starts background refresh
    void cachedReturn

    // Yield enough microtasks for the background refresh to complete.
    for (let i = 0; i < 30; i++) await Promise.resolve()

    // Read the updated cache.
    const second = await getTeamActivity()

    // The cached items must still be present (not wiped to []).
    expect(second[0].items.some(i => i.title === 'Real cached PR')).toBe(true)
    // And the gate error must be surfaced so the user sees a Retry button.
    expect(second[0].error).toMatch(/Rate limited/)
  })

  it('REGRESSION: fetchTeamMemberActivity (non-force) surfaces gate error when items end up empty', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Set the gate via a prior team-activity call.
    const farReset = String(Math.floor(Date.now() / 1000) + 3600)
    mockFetch.mockResolvedValue(makeRateLimitResponse({ status: 403, remaining: '0', reset: farReset }))
    await getTeamActivity()
    clearActivityCache()

    // Now call fetchTeamMemberActivity with force=false (default). The
    // primitives should silently bail, but the gate fallback should
    // surface the error.
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(emptySearchResponse) // shouldn't be called

    const result = await fetchTeamMemberActivity('alice')
    expect(result.items).toEqual([])
    expect(result.error).toMatch(/Rate limited/)
  })

  it('preserves cached items for hard errors too', async () => {
    mockedGetToken.mockReturnValue('ghp_test')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    // Seed cache with real data.
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/graphql')) return emptyGraphQLResponse
      if (typeof url === 'string' && url.includes('/search/issues')) {
        return makeSearchResponse([{ id: 100, title: 'Cached entry' }])
      }
      return { ok: true, headers: new Headers(), json: async () => ([]) }
    })
    await getTeamActivity()

    // Force a hard error in the next refresh by throwing in getReportProfile.
    mockedGetProfile.mockImplementation(() => { throw new Error('Profile load failed') })
    mockFetch.mockReset()

    // Trigger background refresh and wait for it.
    await getTeamActivity()
    for (let i = 0; i < 30; i++) await Promise.resolve()

    const second = await getTeamActivity()
    // Even with a hard error, cached items survive so the user doesn't
    // lose their data.
    expect(second[0].items.some(i => i.title === 'Cached entry')).toBe(true)
    expect(second[0].error).toMatch(/Profile load failed/)
  })
})
