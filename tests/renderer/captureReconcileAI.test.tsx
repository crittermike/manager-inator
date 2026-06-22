// @vitest-environment happy-dom
/**
 * Coverage for the AI fallback in CaptureSession's name-reconciliation
 * pipeline. When deterministic reconciliation returns confidence:'none' for
 * a nickname (e.g. "Katherine Pate" with no listed alias), the AI fallback
 * is asked to map it to a known person. A high-confidence response should:
 *   - canonicalize the name in `people:` and `speakers:`
 *   - append the raw spelling as an alias on the matched person
 *   - emit a "Linked X → Y" toast
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.mock('../../src/renderer/components/common/Toast', () => ({ useToast: () => mockToast }))

vi.mock('../../src/renderer/hooks/useData', () => ({
  useSettings: () => ({ settings: { userName: 'Mike Crittenden' }, loading: false }),
}))

const generateMock = vi.fn()
vi.mock('../../src/renderer/hooks/useAI', () => ({
  useAI: () => ({
    streaming: false,
    streamedText: '',
    generate: generateMock,
    cancel: vi.fn(),
    reset: vi.fn(),
  }),
}))

const commitFileMock = vi.fn().mockResolvedValue(undefined)
const listPeopleMock = vi.fn()
const getFileContentMock = vi.fn()
const findPersonByNameMock = vi.fn().mockImplementation(async (name: string) => {
  const map: Record<string, string> = {
    'Kate Pate': 'kate-pate',
    'Mike Crittenden': 'mike',
  }
  return map[name] ?? null
})
const aiGenerateMock = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    commitFile: commitFileMock,
    getFileContent: getFileContentMock,
    listPeople: listPeopleMock,
    findPersonByName: findPersonByNameMock,
    aiGenerate: aiGenerateMock,
    getOpenActionItemsForPeople: vi.fn().mockResolvedValue([]),
    deleteFile: vi.fn(),
    resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined),
    onDataFilesChanged: undefined,
    onAiFilesChanged: undefined,
  },
  writable: true,
})

import { CaptureSession } from '../../src/renderer/components/common/CaptureSession'

const Wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

function buildClassifyResponse(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    source: 'meeting',
    title: 'Test meeting',
    summary: 'A test meeting',
    detailed_summary: 'Details',
    tags: [],
    people_mentioned: [],
    attendees: [],
    feedback: [],
    action_items: [],
    resolved_action_items: [],
    impact: [],
    key_context: '',
    ...overrides,
  })
}

async function findCommitMatching(predicate: (path: string) => boolean): Promise<{ path: string; content: string } | null> {
  for (let i = 0; i < 50; i++) {
    const call = commitFileMock.mock.calls.find(c => typeof c[0] === 'string' && predicate(c[0] as string))
    if (call) return { path: call[0] as string, content: call[1] as string }
    await new Promise(r => setTimeout(r, 20))
  }
  return null
}

describe('CaptureSession AI name reconciliation fallback', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true, value: true, writable: true,
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)
  })

  afterEach(async () => {
    await act(() => root.unmount())
    container.remove()
  })

  it('canonicalizes "Katherine Pate" → "Kate Pate" via AI fallback and appends alias', async () => {
    listPeopleMock.mockResolvedValue([
      {
        name: 'Kate Pate',
        slug: 'kate-pate',
        aliases: [],
        meetingCount: 0,
        lastSeen: null,
        role: 'PM',
        github: '',
        location: '',
        relationship: 'Peer Manager',
      },
    ])
    getFileContentMock.mockImplementation(async (path: string) => {
      if (path === 'people/kate-pate.md') {
        return `---\nname: Kate Pate\nslug: kate-pate\nrelationship: Peer Manager\n---\n\nNotes.\n`
      }
      return ''
    })

    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({
        people_mentioned: ['Katherine Pate'],
        attendees: ['Katherine Pate'],
      })
    )
    aiGenerateMock.mockResolvedValueOnce('{"slug":"kate-pate","confidence":"high"}')

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t1"
            initialContent="1:1 with Katherine Pate. Discussed roadmap."
            sourceHint="meeting"
            reports={[]}
            onStatusChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </Wrapper>
      )
    })

    expect(aiGenerateMock).toHaveBeenCalledWith(
      'reconcile-name',
      expect.objectContaining({ raw: 'Katherine Pate' }),
      expect.any(Function),
      expect.any(String),
    )

    const ctx = await findCommitMatching(p => p.startsWith('contexts/'))
    expect(ctx).not.toBeNull()
    // Speakers section contains Kate Pate (canonical), not Katherine Pate.
    const speakersBlock = ctx!.content.match(/speakers:\n([\s\S]*?)(?=^[a-z_-]+:|^---)/m)?.[1] ?? ''
    expect(speakersBlock).toContain('Kate Pate')
    expect(speakersBlock).not.toContain('Katherine Pate')
    expect(ctx!.content).toMatch(/people:[\s\S]*kate-pate/m)

    const alias = await findCommitMatching(p => p === 'people/kate-pate.md')
    expect(alias).not.toBeNull()
    expect(alias!.content).toMatch(/^aliases:\s*Katherine Pate\s*$/m)

    expect(mockToast.success).toHaveBeenCalledWith('Linked "Katherine Pate" → Kate Pate')
  })

  it('ignores AI responses with confidence "low" — name flows through unchanged', async () => {
    listPeopleMock.mockResolvedValue([
      {
        name: 'Kate Pate',
        slug: 'kate-pate',
        aliases: [],
        meetingCount: 0,
        lastSeen: null,
        role: 'PM',
        github: '',
        location: '',
        relationship: 'Peer Manager',
      },
    ])
    getFileContentMock.mockResolvedValue('')

    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({
        people_mentioned: ['Sam'],
        attendees: ['Sam'],
      })
    )
    aiGenerateMock.mockResolvedValueOnce('{"slug":"kate-pate","confidence":"low"}')

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t2"
            initialContent="Talked to Sam."
            sourceHint="meeting"
            reports={[]}
            onStatusChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </Wrapper>
      )
    })

    const ctx = await findCommitMatching(p => p.startsWith('contexts/'))
    expect(ctx).not.toBeNull()
    const speakersBlock = ctx!.content.match(/speakers:\n([\s\S]*?)(?=^[a-z_-]+:|^---)/m)?.[1] ?? ''
    expect(speakersBlock).toContain('Sam')
    expect(speakersBlock).not.toContain('Kate Pate')

    // No alias commit on the candidate person.
    const aliasCalls = commitFileMock.mock.calls.filter(c => typeof c[0] === 'string' && (c[0] as string) === 'people/kate-pate.md')
    expect(aliasCalls).toHaveLength(0)
    expect(mockToast.success).not.toHaveBeenCalledWith(expect.stringContaining('Linked'))
  })

  it('silently swallows AI failures (malformed JSON) — capture still saves', async () => {
    listPeopleMock.mockResolvedValue([
      {
        name: 'Kate Pate',
        slug: 'kate-pate',
        aliases: [],
        meetingCount: 0,
        lastSeen: null,
        role: 'PM',
        github: '',
        location: '',
        relationship: 'Peer Manager',
      },
    ])
    getFileContentMock.mockResolvedValue('')

    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({
        people_mentioned: ['Whoever'],
        attendees: ['Whoever'],
      })
    )
    aiGenerateMock.mockResolvedValueOnce('not valid json at all')

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t3"
            initialContent="Met someone."
            sourceHint="meeting"
            reports={[]}
            onStatusChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </Wrapper>
      )
    })

    const ctx = await findCommitMatching(p => p.startsWith('contexts/'))
    expect(ctx).not.toBeNull()
    expect(ctx!.content).toMatch(/speakers:[\s\S]*Whoever/m)
  })
})
