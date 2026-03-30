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

import { getTeamActivity, clearActivityCache, getActivityLookbackHours, extractIssueNumber, enrichItemsWithContent, formatActivityAsMarkdown, fetchActivityForPerson, saveActivitySnapshot } from '../../src/main/github-activity'
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
    mockFetch.mockReset()
  })

  afterEach(() => {
    clearActivityCache()
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
    // Monday March 30 minus 3 days = Friday March 27
    expect(firstUrl).toContain('updated:>=2026-03-27')

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
    // Wednesday March 25 minus 1 day = Tuesday March 24
    expect(firstUrl).toContain('updated:>=2026-03-24')

    vi.useRealTimers()
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
