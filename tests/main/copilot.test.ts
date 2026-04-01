import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CopilotClient } from '@github/copilot-sdk'

vi.mock('../../src/main/store', () => ({
  getSettings: vi.fn(() => ({
    repoPath: '/tmp/test-repo',
    defaultModel: 'gpt-4.1',
    aiCustomInstructions: ''
  }))
}))

import { buildMessages, type CopilotMessage } from '../../src/main/copilot'
import { getSettings } from '../../src/main/store'

const mockedGetSettings = vi.mocked(getSettings)
const mockedCreateSession = vi.spyOn(CopilotClient.prototype, 'createSession')

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
    const { aiGenerate } = await import('../../src/main/copilot')

    await aiGenerate(
      'chat',
      {
        message: 'hi',
        history: [],
        model: 'gpt-5.4'
      },
      () => {},
      'req-123'
    )

    expect(mockedCreateSession).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4' }))
  })
})
