// @vitest-environment happy-dom
/**
 * Integration coverage for the meeting-attendee wiring in CaptureSession.
 *
 * The previous behavior dumped every name from `people_mentioned` into the
 * `speakers:` frontmatter, causing meetings to appear under reports who were
 * merely discussed (not present). The fix:
 *
 *   speakers = currentUser ∪ deterministicSpeakersFromContent ∪ ai.attendees
 *
 * `people_mentioned` is still used to drive the `people:` slug list, but no
 * longer pollutes `speakers:`.
 *
 * These tests stub the AI to return controlled `attendees` vs `people_mentioned`
 * payloads, mount a CaptureSession, and assert what gets passed to
 * `window.api.commitFile` for the context file.
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
const findPersonByNameMock = vi.fn().mockImplementation(async (name: string) => {
  // Trivial slug map for the test reports.
  const map: Record<string, string> = {
    'Steve Richert': 'steve',
    'Tara Kintner': 'tara',
    'Mike Crittenden': 'mike',
  }
  return map[name] ?? null
})

Object.defineProperty(window, 'api', {
  value: {
    commitFile: commitFileMock,
    getFileContent: vi.fn().mockResolvedValue(''),
    getOpenActionItemsForPeople: vi.fn().mockResolvedValue([]),
    findPersonByName: findPersonByNameMock,
    deleteFile: vi.fn(),
    resolveAndToggleActionItem: vi.fn().mockResolvedValue(undefined),
    onDataFilesChanged: undefined,
    onAiFilesChanged: undefined,
  },
  writable: true,
})

import { CaptureSession } from '../../src/renderer/components/common/CaptureSession'

const reports = [
  { name: 'steve', displayName: 'Steve Richert' },
  { name: 'tara', displayName: 'Tara Kintner' },
]

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

async function findContextCommit(): Promise<{ path: string; content: string } | null> {
  for (let i = 0; i < 50; i++) {
    const call = commitFileMock.mock.calls.find(c => typeof c[0] === 'string' && (c[0] as string).startsWith('contexts/'))
    if (call) return { path: call[0] as string, content: call[1] as string }
    await new Promise(r => setTimeout(r, 20))
  }
  return null
}

describe('CaptureSession attendees vs mentions', () => {
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

  it('does not include people_mentioned in speakers: when attendees is empty', async () => {
    // AI says: Tara was discussed (people_mentioned) but did NOT attend (attendees empty).
    // Previous bug: Tara would have ended up in speakers:.
    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({ people_mentioned: ['Tara Kintner'], attendees: [] })
    )

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t1"
            initialContent="Free-form meeting notes. We talked about Tara's work."
            sourceHint="meeting"
            reports={reports}
            onStatusChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </Wrapper>
      )
    })

    const commit = await findContextCommit()
    expect(commit).not.toBeNull()
    // No speakers: block at all — no attendee data anywhere means the
    // capture should fall back to people: matching (safe default), not invent
    // a speaker list.
    expect(commit!.content).not.toMatch(/^speakers:/m)
    // But Tara still ends up under people: so PersonDetail can find the note.
    expect(commit!.content).toMatch(/people:\s*\n\s+- tara/m)
  })

  it('uses ai.attendees (not people_mentioned) to build speakers:', async () => {
    // AI: Steve attended, Tara was discussed but absent.
    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({
        people_mentioned: ['Tara Kintner', 'Steve Richert'],
        attendees: ['Steve Richert'],
      })
    )

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t2"
            initialContent="1:1 notes with Steve, discussed how Tara is ramping up."
            sourceHint="meeting"
            reports={reports}
            onStatusChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </Wrapper>
      )
    })

    const commit = await findContextCommit()
    expect(commit).not.toBeNull()
    // speakers includes the manager + the actual attendee Steve.
    expect(commit!.content).toMatch(/speakers:\s*\n\s+- Mike Crittenden\s*\n\s+- Steve Richert/m)
    // speakers does NOT include Tara (she was only mentioned).
    expect(commit!.content).not.toMatch(/speakers:[\s\S]*Tara Kintner/m)
    // people: still includes both names (mentioned + attended).
    expect(commit!.content).toMatch(/people:\s*\n[\s\S]*- tara/m)
    expect(commit!.content).toMatch(/people:\s*\n[\s\S]*- steve/m)
  })

  it('extracts deterministic speakers from cleaned transcript prefixes when AI omits them', async () => {
    // AI is empty on both fields (worst case): we rely entirely on the
    // **Name:** prefixes already in the cleaned transcript content.
    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({ people_mentioned: [], attendees: [] })
    )

    const transcript = `**Mike Crittenden:** Hey, how's it going this week?

**Steve Richert:** Going well, shipped the auth refactor.

**Mike Crittenden:** Nice. Anything blocking?

**Steve Richert:** Just the deploy infra question.`

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t3"
            initialContent={transcript}
            sourceHint="meeting"
            reports={reports}
            onStatusChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </Wrapper>
      )
    })

    const commit = await findContextCommit()
    expect(commit).not.toBeNull()
    // Both deterministic speakers show up (current user is dedup'd against Mike Crittenden).
    expect(commit!.content).toMatch(/speakers:\s*\n\s+- Mike Crittenden\s*\n\s+- Steve Richert/m)
  })

  it('unions deterministic transcript speakers with AI attendees, deduplicating', async () => {
    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({
        people_mentioned: ['Tara Kintner'],
        // AI picks up a silent attendee that didn't have a transcript line.
        attendees: ['Steve Richert', 'mike crittenden'],
      })
    )

    const transcript = `**Mike Crittenden:** Welcome everyone.

**Steve Richert:** Glad to be here.`

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t4"
            initialContent={transcript}
            sourceHint="meeting"
            reports={reports}
            onStatusChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </Wrapper>
      )
    })

    const commit = await findContextCommit()
    expect(commit).not.toBeNull()
    // Dedup keeps the first-seen casing (Mike Crittenden from the current
    // user / transcript), and Tara is never added to speakers despite being
    // in people_mentioned.
    expect(commit!.content).toMatch(/speakers:\s*\n\s+- Mike Crittenden\s*\n\s+- Steve Richert\s*\n---/m)
    expect(commit!.content).not.toMatch(/speakers:[\s\S]*Tara/m)
  })

  it('skips speakers: entirely for non-meeting sources', async () => {
    generateMock.mockResolvedValueOnce(
      buildClassifyResponse({
        source: 'slack',
        people_mentioned: ['Steve Richert'],
        attendees: ['Steve Richert'], // even if AI mistakenly fills it
      })
    )

    await act(async () => {
      root.render(
        <Wrapper>
          <CaptureSession
            id="t5"
            initialContent="some slack thread"
            sourceHint="slack"
            reports={reports}
            onStatusChange={vi.fn()}
            onRemove={vi.fn()}
          />
        </Wrapper>
      )
    })

    const commit = await findContextCommit()
    expect(commit).not.toBeNull()
    expect(commit!.content).not.toMatch(/^speakers:/m)
  })
})
