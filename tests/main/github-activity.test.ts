import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/main/store', () => ({
  getGithubOrgToken: vi.fn(),
  getGithubOrgName: vi.fn()
}))

vi.mock('../../src/main/github', () => ({
  getReports: vi.fn(),
  getReportProfile: vi.fn()
}))

import { getTeamActivity, clearActivityCache } from '../../src/main/github-activity'
import { getGithubOrgToken, getGithubOrgName } from '../../src/main/store'
import { getReports, getReportProfile } from '../../src/main/github'

const mockedGetToken = vi.mocked(getGithubOrgToken)
const mockedGetOrgName = vi.mocked(getGithubOrgName)
const mockedGetReports = vi.mocked(getReports)
const mockedGetProfile = vi.mocked(getReportProfile)

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

    mockFetch.mockResolvedValue(makeSearchResponse([
      { title: 'Fix bug', state: 'open', pull_request: undefined }
    ]))

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
    expect(mockFetch).toHaveBeenCalledTimes(2)
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

    mockFetch.mockResolvedValue(makeSearchResponse([
      { title: 'A PR', pull_request: { merged_at: null } },
      { title: 'An issue', pull_request: undefined }
    ]))

    const result = await getTeamActivity()

    expect(result[0].items[0].type).toBe('pr')
    expect(result[0].items[0].state).toBe('open')
    expect(result[0].items[1].type).toBe('issue')
  })

  it('correctly determines merged state', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetch.mockResolvedValue(makeSearchResponse([
      { title: 'Merged PR', state: 'closed', pull_request: { merged_at: '2026-03-23T12:00:00Z' } },
      { title: 'Closed PR', state: 'closed', pull_request: { merged_at: null } },
      { title: 'Open issue', state: 'open' }
    ]))

    const result = await getTeamActivity()

    expect(result[0].items[0].state).toBe('merged')
    expect(result[0].items[1].state).toBe('closed')
    expect(result[0].items[2].state).toBe('open')
  })

  it('extracts repo name from repository_url', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetch.mockResolvedValue(makeSearchResponse([
      { repository_url: 'https://api.github.com/repos/myorg/frontend-app' }
    ]))

    const result = await getTeamActivity()
    expect(result[0].items[0].repo).toBe('myorg/frontend-app')
  })

  it('passes correct authorization headers', async () => {
    mockedGetToken.mockReturnValue('ghp_secret_token')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))

    mockFetch.mockResolvedValue(makeSearchResponse([]))

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
    mockFetch.mockResolvedValue(makeSearchResponse([{ title: 'Cached item' }]))

    const result1 = await getTeamActivity()
    expect(result1[0].items[0].title).toBe('Cached item')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const result2 = await getTeamActivity()
    expect(result2[0].items[0].title).toBe('Cached item')
  })

  it('clearActivityCache forces fresh fetch on next call', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-gh'))
    mockFetch.mockResolvedValue(makeSearchResponse([{ title: 'Fresh data' }]))

    await getTeamActivity()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    clearActivityCache()
    mockFetch.mockClear()

    mockFetch.mockResolvedValue(makeSearchResponse([{ title: 'Fresh data 2' }]))
    const result = await getTeamActivity()
    expect(result[0].items[0].title).toBe('Fresh data 2')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('handles mixed success and failure across reports', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('myorg')
    mockedGetReports.mockReturnValue(['alice', 'bob'])
    mockedGetProfile
      .mockReturnValueOnce(makeProfile('alice', 'alice-gh'))
      .mockReturnValueOnce(makeProfile('bob', 'bob-gh'))

    mockFetch
      .mockResolvedValueOnce(makeSearchResponse([{ title: 'Alice PR' }]))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        headers: new Headers(),
        json: async () => ({})
      })

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

    mockFetch.mockResolvedValue(makeSearchResponse([
      { labels: [{ name: 'bug' }, { name: 'priority:high' }] }
    ]))

    const result = await getTeamActivity()
    expect(result[0].items[0].labels).toEqual(['bug', 'priority:high'])
  })

  it('constructs correct search query with org and username', async () => {
    mockedGetToken.mockReturnValue('ghp_test123')
    mockedGetOrgName.mockReturnValue('my-company')
    mockedGetReports.mockReturnValue(['alice'])
    mockedGetProfile.mockReturnValue(makeProfile('alice', 'alice-dev'))

    mockFetch.mockResolvedValue(makeSearchResponse([]))

    await getTeamActivity()

    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('org%3Amy-company')
    expect(fetchUrl).toContain('author%3Aalice-dev')
    expect(fetchUrl).toContain('per_page=50')
    expect(fetchUrl).toContain('sort=updated')
  })
})
