import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('buildMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetSettings.mockReturnValue({
      repoPath: '/tmp/test-repo',
      defaultModel: 'gpt-4.1',
      aiCustomInstructions: '',
      githubToken: null,
      repoOwner: '',
      repoName: ''
    })
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
      repoName: ''
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
})
