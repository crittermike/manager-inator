// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PersonDetail } from '../../src/renderer/pages/PersonDetail'
import { ToastProvider } from '../../src/renderer/components/common/Toast'
import { ActiveFileProvider } from '../../src/renderer/hooks/useActiveFile'
import type { ActionItem, PersonEntry } from '../../src/shared/types'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

function person(overrides: Partial<PersonEntry>): PersonEntry {
  return {
    name: 'Jamie Friend',
    slug: 'jamie-friend',
    aliases: [],
    meetingCount: 0,
    lastSeen: '',
    role: 'PM',
    github: '',
    location: '',
    relationship: 'Peer Manager',
    ...overrides,
  }
}

async function render(
  slug: string,
  people: PersonEntry[],
  fileContent = '---\nname: x\n---\n# Body',
  options: { actionItems?: ActionItem[]; toggleActionItem?: ReturnType<typeof vi.fn> } = {}
) {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listPeople: vi.fn().mockResolvedValue(people),
      getFileContent: vi.fn().mockResolvedValue(fileContent),
      getPersonContexts: vi.fn().mockResolvedValue([]),
      getPersonActionItems: vi.fn().mockResolvedValue(options.actionItems ?? []),
      toggleActionItem: options.toggleActionItem ?? vi.fn().mockResolvedValue({ ok: true }),
      getSettingsOptions: vi.fn().mockResolvedValue({ roles: [], relationships: ['Peer Manager', 'Stakeholder'] }),
      onAIStream: vi.fn(() => () => {}),
      onAIComplete: vi.fn(() => () => {}),
      onAIError: vi.fn(() => () => {}),
      onAiStreamReset: vi.fn(() => () => {}),
      onAiStreamChunk: vi.fn(() => () => {}),
      onAiStreamDone: vi.fn(() => () => {}),
      onAiStreamError: vi.fn(() => () => {}),
      detectExternalApps: vi.fn().mockResolvedValue({ vscode: false, obsidian: false, finder: true }),
      generateAI: vi.fn(),
      cancelAI: vi.fn(),
    },
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/people/${slug}`]}>
        <ToastProvider>
          <ActiveFileProvider>
            <Routes>
              <Route path="/people/:slug" element={<PersonDetail />} />
            </Routes>
          </ActiveFileProvider>
        </ToastProvider>
      </MemoryRouter>
    )
  })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  return { container, root }
}

describe('PersonDetail Direct Report badge', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
    document.body.innerHTML = ''
    navigate.mockReset()
  })

  it('does NOT show "Open in Team" badge for non-direct-reports', async () => {
    const { container, root } = await render('jamie-friend', [
      person({ relationship: 'Peer Manager' }),
    ])
    expect(container.textContent).not.toContain('Open in Team')
    await act(async () => { root.unmount() })
  })

  it('shows "Open in Team" badge when relationship === Direct Report', async () => {
    const { container, root } = await render('alice', [
      person({ name: 'Alice', slug: 'alice', relationship: 'Direct Report' }),
    ])
    const badge = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Open in Team')
    ) as HTMLButtonElement | undefined
    expect(badge).toBeDefined()
    await act(async () => { badge!.click() })
    expect(navigate).toHaveBeenCalledWith('/report/alice')
    await act(async () => { root.unmount() })
  })
})

function actionItem(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    text: 'Send the spec',
    owner: 'Mike',
    completed: false,
    sourceFile: 'contexts/2026-04-15-rayta-sync.md',
    sourceLine: '- [ ] **Mike**: Send the spec',
    sourceLineNumber: 10,
    ...overrides,
  }
}

describe('PersonDetail Action Items', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
    document.body.innerHTML = ''
    navigate.mockReset()
  })

  it('does not render the Action Items section when there are no items', async () => {
    const { container, root } = await render('rayta', [person({ name: 'Rayta', slug: 'rayta' })])
    expect(container.textContent).not.toContain('Action Items')
    await act(async () => { root.unmount() })
  })

  it('renders open action items with their text and owner', async () => {
    const { container, root } = await render(
      'rayta',
      [person({ name: 'Rayta', slug: 'rayta' })],
      undefined,
      {
        actionItems: [
          actionItem({ text: 'Send Rayta the spec', owner: 'Mike' }),
          actionItem({ text: 'Already done', owner: 'Rayta', completed: true, sourceLineNumber: 12 }),
        ],
      }
    )
    expect(container.textContent).toContain('Action Items')
    expect(container.textContent).toContain('Send Rayta the spec')
    expect(container.textContent).toContain('Mike')
    // Completed item hidden by default
    expect(container.textContent).not.toContain('Already done')
    await act(async () => { root.unmount() })
  })

  it('toggles "Show completed" to reveal completed items', async () => {
    const { container, root } = await render(
      'rayta',
      [person({ name: 'Rayta', slug: 'rayta' })],
      undefined,
      {
        actionItems: [
          actionItem({ text: 'Open one', owner: 'Mike' }),
          actionItem({ text: 'Done one', owner: 'Rayta', completed: true, sourceLineNumber: 12 }),
        ],
      }
    )
    const showBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Show completed')
    ) as HTMLButtonElement | undefined
    expect(showBtn).toBeDefined()
    await act(async () => { showBtn!.click() })
    expect(container.textContent).toContain('Done one')
    await act(async () => { root.unmount() })
  })

  it('calls toggleActionItem with sourceFile + sourceLineNumber when checkbox is clicked', async () => {
    const toggleSpy = vi.fn().mockResolvedValue({ ok: true })
    const { container, root } = await render(
      'rayta',
      [person({ name: 'Rayta', slug: 'rayta' })],
      undefined,
      {
        actionItems: [actionItem({ text: 'Toggle me', sourceLineNumber: 7 })],
        toggleActionItem: toggleSpy,
      }
    )
    const checkbox = Array.from(container.querySelectorAll('button[aria-label="Mark as done"]'))
      .find(b => b.closest('div')?.textContent?.includes('Toggle me')) as HTMLButtonElement | undefined
    expect(checkbox).toBeTruthy()
    await act(async () => { checkbox!.click() })
    expect(toggleSpy).toHaveBeenCalledWith('contexts/2026-04-15-rayta-sync.md', 7)
    await act(async () => { root.unmount() })
  })
})
