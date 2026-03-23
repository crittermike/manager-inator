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
    const result = buildMessages('summarize-transcript', { reportName: 'Nic', date: '2026-03-11', transcript: 'test' })
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

    const result = buildMessages('summarize-transcript', { reportName: 'Nic', date: '2026-03-11', transcript: 'test' })
    const customMsg = result.find(m => m.content.includes('Always be concise'))
    expect(customMsg).toBeDefined()
    expect(customMsg!.role).toBe('system')
  })

  it('builds summarize-transcript messages', () => {
    const result = buildMessages('summarize-transcript', {
      reportName: 'Nic',
      date: '2026-03-11',
      transcript: 'Mike: Hi Nic\nNic: Hi Mike'
    })
    const userMsg = result.find(m => m.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg!.content).toContain('Summarize this 1:1 transcript')
    expect(userMsg!.content).toContain('Nic')
    expect(userMsg!.content).toContain('Hi Mike')
  })

  it('builds summarize-meeting messages', () => {
    const result = buildMessages('summarize-meeting', {
      meetingTitle: 'Team sync',
      date: '2026-03-11',
      reportNames: 'Nic, Jennifer',
      transcript: 'Meeting transcript'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('Summarize this meeting transcript')
    expect(userMsg.content).toContain('Nic, Jennifer')
    expect(userMsg.content).toContain('Team sync')
  })

  it('builds extract-action-items messages', () => {
    const result = buildMessages('extract-action-items', {
      reportName: 'Nic',
      transcript: 'Action stuff'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('Extract action items')
    expect(userMsg.content).toContain('checkbox')
  })

  it('builds extract-feedback messages', () => {
    const result = buildMessages('extract-feedback', {
      reportNames: 'Nic, Tara',
      transcript: 'Feedback content'
    })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('extract any feedback')
    expect(userMsg.content).toContain('Nic, Tara')
  })

  it('builds extract-impact messages', () => {
    const result = buildMessages('extract-impact', { transcript: 'Impact stuff' })
    const userMsg = result.find(m => m.role === 'user')!
    expect(userMsg.content).toContain('evidence of MY impact')
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

  it('system prompt includes name corrections', () => {
    const result = buildMessages('chat', { message: 'hi', history: [] })
    const systemContent = result[0].content
    expect(systemContent).toContain('Nick')
    expect(systemContent).toContain('Nic')
    expect(systemContent).toContain('they/them')
  })
})
