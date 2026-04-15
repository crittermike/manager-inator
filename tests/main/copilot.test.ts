import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CopilotClient } from '@github/copilot-sdk'

vi.mock('../../src/main/store', () => ({
  getSettings: vi.fn(() => ({
    repoPath: '/tmp/test-repo',
    defaultModel: 'gpt-4.1',
    aiCustomInstructions: ''
  })),
  getToken: vi.fn(() => 'ghp_test-token-abc123')
}))

import { buildMessages, aiGenerate, aiCancel, stopClient, estimateTokens, truncateMessagesToFit, type CopilotMessage } from '../../src/main/copilot'
import { getSettings, getToken } from '../../src/main/store'

const mockedGetSettings = vi.mocked(getSettings)
const mockedGetToken = vi.mocked(getToken)
const mockedCreateSession = vi.spyOn(CopilotClient.prototype, 'createSession')
const mockedStart = vi.spyOn(CopilotClient.prototype, 'start')
const mockedStop = vi.spyOn(CopilotClient.prototype, 'stop')

describe('buildMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetSettings.mockReturnValue({
      repoPath: '/tmp/test-repo',
      defaultModel: 'gpt-4.1',
      aiCustomInstructions: '',
      githubToken: null,
      repoOwner: '',
      repoName: '',
      userName: '',
      userGithub: ''
    })
    mockedGetToken.mockReturnValue('ghp_test-token-abc123')
    mockedCreateSession.mockResolvedValue({
      on: () => () => {},
      sendAndWait: async () => ({ data: { content: '' } }),
      disconnect: async () => {},
      abort: async () => {}
    } as unknown as Awaited<ReturnType<CopilotClient['createSession']>>)
  })

  it('always includes the system prompt as first message', () => {
    const result = buildMessages('generate-checkin', { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' })
    expect(result[0].role).toBe('system')
    expect(result[0].content).toContain('Manager-inator')
  })

  it('appends custom instructions when set', () => {
    mockedGetSettings.mockReturnValue({
      repoPath: '/tmp/test-repo',
      defaultModel: 'gpt-4.1',
      aiCustomInstructions: 'Always be concise',
      githubToken: null,
      repoOwner: '',
      repoName: '',
      userName: '',
      userGithub: ''
    })

    const result = buildMessages('generate-checkin', { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' })
    const customMsg = result.find(m => m.content.includes('Always be concise'))
    expect(customMsg).toBeDefined()
    expect(customMsg!.role).toBe('system')
  })

  it('builds generate-checkin messages', () => {
    const result = buildMessages('generate-checkin', {
      reportName: 'Nic',
      month: '2026-03',
      displayName: 'Nic',
      monthName: 'March 2026',
      about: 'Backend engineer',
      summaries: 'Summary data',
      feedback: 'Feedback data'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('monthly check-in')
    expect(userMsg.content).toContain('Backend engineer')
  })

  it('builds generate-review messages', () => {
    const result = buildMessages('generate-review', {
      reportName: 'Nic',
      period: '2026-H1',
      displayName: 'Nic',
      role: 'Senior Engineer'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('performance review')
    expect(userMsg.content).toContain('Senior Engineer')
  })

  it('builds prep-one-on-one messages', () => {
    const result = buildMessages('prep-one-on-one', {
      reportName: 'Nic',
      about: 'Good engineer',
      summaries: 'Recent summaries',
      actionItems: 'Open items',
      feedback: 'Recent feedback'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('upcoming 1:1')
    expect(userMsg.content).toContain('checkbox')
  })

  it('builds chat messages with history folding', () => {
    const history: CopilotMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ]
    const result = buildMessages('chat', {
      message: 'What about Nic?',
      history
    })

    const systemMsgs = result.filter(m => m.role === 'system')
    expect(systemMsgs.length).toBeGreaterThanOrEqual(2)
    expect(systemMsgs.some(m => m.content.includes('DATA REPO STRUCTURE'))).toBe(true)

    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('Previous conversation')
    expect(userMsg.content).toContain('Hello')
    expect(userMsg.content).toContain('Hi there!')
    expect(userMsg.content).toContain('What about Nic?')
  })

  it('builds chat messages without history', () => {
    const result = buildMessages('chat', { message: 'Tell me about the team', history: [] })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).not.toContain('Previous conversation')
    expect(userMsg.content).toContain('Tell me about the team')
  })

  it('handles unknown action as JSON fallback', () => {
    const result = buildMessages('unknown-action', { foo: 'bar' })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('unknown-action')
    expect(userMsg.content).toContain('"foo"')
  })

  it('system prompt includes writing rules', () => {
    const result = buildMessages('chat', { message: 'hi', history: [] })
    const systemContent = result[0].content
    expect(systemContent).toContain('WRITING RULES')
    expect(systemContent).toContain('em dashes')
  })

  it('builds classify-content messages with detailed_summary and source hint', () => {
    const result = buildMessages('classify-content', {
      reportNames: 'Nic, Steve',
      content: 'Test meeting content here',
      sourceHint: 'meeting'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('Nic, Steve')
    expect(userMsg.content).toContain('Test meeting content here')
    expect(userMsg.content).toContain('detailed_summary')
    expect(userMsg.content).toContain('The user indicated this is from: meeting')
    expect(userMsg.content).not.toContain('meeting-transcript')
  })

  it('builds classify-content messages without source hint when omitted', () => {
    const result = buildMessages('classify-content', {
      reportNames: 'Nic',
      content: 'Some slack dump'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('Nic')
    expect(userMsg.content).toContain('Some slack dump')
    expect(userMsg.content).not.toContain('The user indicated this is from:')
  })

  it('builds summarize-team-activity messages', () => {
    const result = buildMessages('summarize-team-activity', {
      dateLabel: '2026-03-26',
      activityData: 'Nic opened PR #42: Fix auth bug'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('team PR/activity scan')
    expect(userMsg.content).toContain('2026-03-26')
    expect(userMsg.content).toContain('Nic opened PR #42: Fix auth bug')
  })

  it('generate-review includes githubActivity when provided', () => {
    const result = buildMessages('generate-review', {
      reportName: 'Nic',
      period: '2026-H1',
      displayName: 'Nic',
      role: 'Senior Engineer',
      githubActivity: 'Period: 2026-01-01 to 2026-06-30\nTotal: 42 PRs, 10 issues'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('42 PRs, 10 issues')
    expect(userMsg.content).toContain('GitHub activity for the review period')
  })

  it('generate-review omits githubActivity line when not provided', () => {
    const result = buildMessages('generate-review', {
      reportName: 'Nic',
      period: '2026-H1',
      displayName: 'Nic',
      role: 'Senior Engineer'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).not.toContain('GitHub activity for the review period')
  })

  it('builds prompt-fill-weekly-priorities messages with activity context', () => {
    const result = buildMessages('prompt-fill-weekly-priorities', {
      teamContext: 'Nic: on-track, last 1:1 2026-03-25',
      actionItems: '- [ ] Nic: ship auth refactor',
      githubActivity: 'Nic: 3 PRs merged, 2 reviews'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('top priorities for this week')
    expect(userMsg.content).toContain('Nic: on-track')
    expect(userMsg.content).toContain('ship auth refactor')
    expect(userMsg.content).toContain('3 PRs merged')
  })

  it('builds weekly-reflection messages with goals and activity', () => {
    const result = buildMessages('weekly-reflection', {
      weeklyGoals: '- Finalize Q2 planning\n- Review Nic\'s PR',
      teamContext: 'Team of 3 engineers',
      githubActivity: 'Nic merged 5 PRs, Steve opened 2 issues'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('weekly reflection')
    expect(userMsg.content).toContain('Finalize Q2 planning')
    expect(userMsg.content).toContain('Nic merged 5 PRs')
    expect(userMsg.content).toContain('Team of 3 engineers')
  })

  it('builds sprint-goal messages with team context and activity', () => {
    const result = buildMessages('sprint-goal', {
      teamContext: 'Nic: on-track, Steve: needs attention',
      actionItems: '- [ ] Nic: finish auth migration',
      githubActivity: 'Nic: 2 open PRs on auth module, Steve: 1 stale PR'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('sprint')
    expect(userMsg.content).toContain('Key deliverables')
    expect(userMsg.content).toContain('Risks to watch')
    expect(userMsg.content).toContain('Nic: on-track')
    expect(userMsg.content).toContain('finish auth migration')
    expect(userMsg.content).toContain('2 open PRs on auth module')
  })

  it('builds sprint-goal messages without optional context', () => {
    const result = buildMessages('sprint-goal', {})
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('sprint')
    expect(userMsg.content).toContain('Key deliverables')
    expect(userMsg.content).not.toContain('Team overview')
    expect(userMsg.content).not.toContain('Open action items')
    expect(userMsg.content).not.toContain('Current team GitHub activity')
  })

  it('passes an explicit chat model override to createSession', async () => {
    await stopClient()

    await aiGenerate(
      'chat',
      {
        message: 'hi',
        history: [],
        model: 'gpt-5.4'
      },
      () => {},
      'req-model-override'
    )

    expect(mockedCreateSession).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4' }))
  })
})

describe('getClient authentication', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await stopClient()
    mockedGetSettings.mockReturnValue({
      repoPath: '/tmp/test-repo',
      defaultModel: 'gpt-4.1',
      aiCustomInstructions: '',
      githubToken: null,
      repoOwner: '',
      repoName: '',
      userName: '',
      userGithub: ''
    })
    mockedGetToken.mockReturnValue('ghp_test-token-abc123')
    mockedCreateSession.mockResolvedValue({
      on: () => () => {},
      sendAndWait: async () => ({ data: { content: '' } }),
      disconnect: async () => {},
      abort: async () => {}
    } as unknown as Awaited<ReturnType<CopilotClient['createSession']>>)
    // Reset spies after stopClient() so beforeEach stop isn't counted
    mockedStart.mockClear()
    mockedStop.mockClear()
  })

  it('throws when no auth token is available', async () => {
    mockedGetToken.mockReturnValue(null)

    await expect(
      aiGenerate('chat', { message: 'hi', history: [] }, () => {}, 'req-no-token')
    ).rejects.toThrow('Not authenticated')
  })

  it('starts client and creates session with valid token', async () => {
    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-token-check'
    )

    expect(mockedStart).toHaveBeenCalled()
    expect(mockedCreateSession).toHaveBeenCalled()
  })

  it('reuses cached client for subsequent calls', async () => {
    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-first'
    )

    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-second'
    )

    expect(mockedStart).toHaveBeenCalledTimes(1)
  })

  it('resets client when token changes between calls', async () => {
    mockedGetToken.mockReturnValue('ghp_token-A')

    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-tokenA'
    )

    expect(mockedStart).toHaveBeenCalledTimes(1)

    mockedGetToken.mockReturnValue('ghp_token-B')

    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-tokenB'
    )

    expect(mockedStop).toHaveBeenCalledTimes(1)
    expect(mockedStart).toHaveBeenCalledTimes(2)
  })

  it('does not reset client when token stays the same', async () => {
    mockedGetToken.mockReturnValue('ghp_stable-token')

    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-stable1'
    )

    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-stable2'
    )

    expect(mockedStop).not.toHaveBeenCalled()
    expect(mockedStart).toHaveBeenCalledTimes(1)
  })

  it('stopClient clears cached client so next call creates a new one', async () => {
    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-before-stop'
    )

    expect(mockedStart).toHaveBeenCalledTimes(1)

    await stopClient()

    await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-after-stop'
    )

    expect(mockedStart).toHaveBeenCalledTimes(2)
  })

  it('strips system notification tags from response', async () => {
    mockedCreateSession.mockResolvedValue({
      on: () => () => {},
      sendAndWait: async () => ({
        data: { content: 'Hello <system_notification>internal</system_notification> world' }
      }),
      disconnect: async () => {},
      abort: async () => {}
    } as unknown as Awaited<ReturnType<CopilotClient['createSession']>>)

    const result = await aiGenerate(
      'generate-checkin',
      { reportName: 'Nic', month: '2026-03', displayName: 'Nic', monthName: 'March 2026' },
      () => {},
      'req-strip'
    )

    expect(result.content).not.toContain('system_notification')
    expect(result.content).toContain('Hello')
    expect(result.content).toContain('world')
  })
})

describe('estimateTokens', () => {
  it('estimates tokens at ~3 chars per token', () => {
    expect(estimateTokens('abc')).toBe(1)
    expect(estimateTokens('a'.repeat(300))).toBe(100)
    expect(estimateTokens('')).toBe(0)
  })
})

describe('truncateMessagesToFit', () => {
  it('returns messages unchanged when under budget', () => {
    const messages: CopilotMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Short user message' }
    ]
    const result = truncateMessagesToFit(messages, 'generate-checkin')
    expect(result).toEqual(messages)
  })

  it('truncates the longest user message from the end for non-chat actions', () => {
    // Create a message that exceeds 130K tokens (~390K chars)
    const bigContext = 'x'.repeat(500_000)
    const messages: CopilotMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: `Instructions\n\nContext:\n${bigContext}` }
    ]
    const result = truncateMessagesToFit(messages, 'generate-checkin')
    expect(result.length).toBe(2)
    expect(result[1].content.length).toBeLessThan(messages[1].content.length)
    expect(result[1].content).toContain('[Context truncated to fit model token limit]')
    // Should still have the beginning of the message
    expect(result[1].content).toContain('Instructions')
  })

  it('truncates from the beginning for chat actions (preserves latest message)', () => {
    const oldHistory = 'Old history message\n'.repeat(20_000)
    const currentMessage = 'What is the latest status?'
    const messages: CopilotMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: `Previous conversation:\n${oldHistory}---\n\n${currentMessage}` }
    ]
    const result = truncateMessagesToFit(messages, 'chat')
    expect(result[1].content.length).toBeLessThan(messages[1].content.length)
    expect(result[1].content).toContain('[Earlier conversation history truncated')
    // Current message should be preserved (it's at the end)
    expect(result[1].content).toContain(currentMessage)
  })

  it('does not truncate system messages', () => {
    const bigContext = 'x'.repeat(500_000)
    const messages: CopilotMessage[] = [
      { role: 'system', content: 'Important system prompt' },
      { role: 'user', content: bigContext }
    ]
    const result = truncateMessagesToFit(messages, 'prep-one-on-one')
    expect(result[0].content).toBe('Important system prompt')
  })

  it('keeps at least 2000 chars in the truncated message', () => {
    // Edge case: huge overage that would truncate to nothing
    const messages: CopilotMessage[] = [
      { role: 'system', content: 'x'.repeat(400_000) },
      { role: 'user', content: 'y'.repeat(10_000) }
    ]
    const result = truncateMessagesToFit(messages, 'generate-checkin')
    // User message should still have at least 2000 chars
    expect(result[1].content.length).toBeGreaterThanOrEqual(2000)
  })

  it('handles messages with no user messages gracefully', () => {
    const messages: CopilotMessage[] = [
      { role: 'system', content: 'x'.repeat(500_000) }
    ]
    const result = truncateMessagesToFit(messages, 'generate-checkin')
    expect(result).toEqual(messages)
  })
})
