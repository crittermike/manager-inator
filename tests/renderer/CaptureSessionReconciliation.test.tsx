// @vitest-environment happy-dom
/**
 * Integration coverage for CaptureSession's name-reconciliation pipeline.
 *
 * When the AI returns "Rita" but the user has a known person "Rayta" with
 * matching first-name / phonetic / Levenshtein heuristics, the canonical
 * name should win in `people:` and `speakers:` frontmatter, AND the raw
 * misspelling should be appended to that person's `aliases:` so future
 * captures match exactly.
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
    'Rayta Smith': 'rayta',
    'Mike Crittenden': 'mike',
  }
  return map[name] ?? null
})

Object.defineProperty(window, 'api', {
  value: {
    commitFile: commitFileMock,
    getFileContent: getFileContentMock,
    listPeople: listPeopleMock,
    findPersonByName: findPersonByNameMock,
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

describe('CaptureSession name reconciliation', () => {
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

  it('canonicalizes Rita → Rayta in people: and speakers:, then appends "Rita" as alias', async () => {
    listPeopleMock.mockResolvedValue([
      {
        name: 'Rayta Smith',
        slug: 'rayta',
        aliases: [],
        meetingCount: 0,
        lastSeen: null,
        role: '',
        github: '',
        location: '',
        relationship: 'Peer Manager',
      },
    ])
    // The people/rayta.md file the alias-append step will read.
    getFileContentMock.mockImplementation(async (path: string) => {
      if (path === 'people/rayta.md') {
        return `---\nname: Rayta Smith\nslug: rayta\nrelationship: Peer Manager\n---\n\nNotes.\n`
      }
      return ''
    })

    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({
        people_mentioned: ['Rita'],
        attendees: ['Rita'],
      })
    )

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t1"
            initialContent="1:1 with Rita today. Talked about her project."
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
    // Canonical name in speakers (no "Rita")
    expect(ctx!.content).toMatch(/speakers:[\s\S]*Rayta Smith/m)
    expect(ctx!.content).not.toMatch(/speakers:[\s\S]*-\s*Rita\b/m)
    // people: gets the canonical slug, not "rita"
    expect(ctx!.content).toMatch(/people:\s*\n[\s\S]*-\s*rayta/m)
    expect(ctx!.content).not.toMatch(/people:\s*\n[\s\S]*-\s*rita\b/m)

    // The alias-append commit on people/rayta.md
    const alias = await findCommitMatching(p => p === 'people/rayta.md')
    expect(alias).not.toBeNull()
    expect(alias!.content).toMatch(/^aliases:\s*Rita\s*$/m)
  })

  it('does not canonicalize when no plausible match exists (unknown name flows through)', async () => {
    listPeopleMock.mockResolvedValue([])
    getFileContentMock.mockResolvedValue('')

    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({
        people_mentioned: ['Zelda Quirkenbottom'],
        attendees: ['Zelda Quirkenbottom'],
      })
    )

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t2"
            initialContent="Met with Zelda."
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
    // Unmatched names pass through unchanged.
    expect(ctx!.content).toMatch(/speakers:[\s\S]*Zelda Quirkenbottom/m)
    // No alias commits should happen for an unknown person.
    const aliasCalls = commitFileMock.mock.calls.filter(c => typeof c[0] === 'string' && (c[0] as string).startsWith('people/'))
    expect(aliasCalls).toHaveLength(0)
  })
})
