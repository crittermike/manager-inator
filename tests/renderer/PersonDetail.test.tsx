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
  options: { actionItems?: ActionItem[]; toggleActionItem?: ReturnType<typeof vi.fn>; contexts?: Array<{ date: string; title: string; filename: string; source?: string }>; commitFile?: ReturnType<typeof vi.fn> } = {}
) {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listPeople: vi.fn().mockResolvedValue(people),
      getFileContent: vi.fn().mockResolvedValue(fileContent),
      getPersonContexts: vi.fn().mockResolvedValue(options.contexts ?? []),
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
      commitFile: options.commitFile ?? vi.fn().mockResolvedValue({ ok: true }),
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

describe('PersonDetail Context list', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
    document.body.innerHTML = ''
    navigate.mockReset()
  })

  it('renders "Context" heading with source labels and filter chips', async () => {
    const { container, root } = await render(
      'rayta',
      [person({ name: 'Rayta', slug: 'rayta' })],
      undefined,
      {
        contexts: [
          { date: '2026-04-01', title: 'Sync', filename: 'a.md', source: 'meeting' },
          { date: '2026-04-02', title: 'Slack thread', filename: 'b.md', source: 'slack' },
        ],
      }
    )
    expect(container.textContent).toContain('Context')
    expect(container.textContent).toContain('Meeting')
    expect(container.textContent).toContain('Slack')
    // filter pills appear when >1 source type present
    const allPill = Array.from(container.querySelectorAll('button')).find(b => /^All\s/.test(b.textContent || ''))
    expect(allPill).toBeTruthy()
    await act(async () => { root.unmount() })
  })

  it('filters context list when a source chip is clicked', async () => {
    const { container, root } = await render(
      'rayta',
      [person({ name: 'Rayta', slug: 'rayta' })],
      undefined,
      {
        contexts: [
          { date: '2026-04-01', title: 'Sync', filename: 'sync.md', source: 'meeting' },
          { date: '2026-04-02', title: 'Slack thread', filename: 'thread.md', source: 'slack' },
        ],
      }
    )
    const slackPill = Array.from(container.querySelectorAll('button')).find(b => /^Slack\s/.test(b.textContent || ''))
    expect(slackPill).toBeTruthy()
    await act(async () => { slackPill!.click() })
    expect(container.textContent).toContain('Slack thread')
    expect(container.textContent).not.toContain('Sync')
    await act(async () => { root.unmount() })
  })
})

describe('PersonDetail Aliases edit', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
    document.body.innerHTML = ''
    navigate.mockReset()
  })

  it('adds an alias chip on Enter and saves it via commitFile', async () => {
    const commitFile = vi.fn().mockResolvedValue({ ok: true })
    const { container, root } = await render(
      'kate-pate',
      [person({ name: 'Kate Pate', slug: 'kate-pate', aliases: [] })],
      '---\nname: Kate Pate\nslug: kate-pate\naliases: \nrole: PM\n---\n# Kate Pate\n',
      { commitFile }
    )
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'Edit profile'
    ) as HTMLButtonElement | undefined
    expect(editBtn).toBeDefined()
    await act(async () => { editBtn!.click() })

    const aliasInput = container.querySelector('input[aria-label="Add alias"]') as HTMLInputElement | null
    expect(aliasInput).toBeTruthy()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(aliasInput!, 'Katherine')
      aliasInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      aliasInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.textContent).toContain('Katherine')

    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Save')
    expect(saveBtn).toBeTruthy()
    await act(async () => { (saveBtn as HTMLButtonElement).click() })
    await act(async () => { await Promise.resolve() })

    expect(commitFile).toHaveBeenCalled()
    const [, savedContent] = commitFile.mock.calls[0]
    expect(savedContent).toContain('aliases: Katherine')
    await act(async () => { root.unmount() })
  })

  it('removes an alias chip via the × button and persists the reduced list', async () => {
    const commitFile = vi.fn().mockResolvedValue({ ok: true })
    const { container, root } = await render(
      'kate-pate',
      [person({ name: 'Kate Pate', slug: 'kate-pate', aliases: ['Katherine', 'Kat'] })],
      '---\nname: Kate Pate\nslug: kate-pate\naliases: Katherine, Kat\nrole: PM\n---\n# Kate Pate\n',
      { commitFile }
    )
    const editBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'Edit profile'
    ) as HTMLButtonElement | undefined
    await act(async () => { editBtn!.click() })

    const removeBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label') === 'Remove alias Katherine'
    ) as HTMLButtonElement | undefined
    expect(removeBtn).toBeTruthy()
    await act(async () => { removeBtn!.click() })

    const saveBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Save')
    await act(async () => { (saveBtn as HTMLButtonElement).click() })
    await act(async () => { await Promise.resolve() })

    expect(commitFile).toHaveBeenCalled()
    const [, savedContent] = commitFile.mock.calls[0]
    expect(savedContent).toContain('aliases: Kat')
    expect(savedContent).not.toContain('Katherine')
    await act(async () => { root.unmount() })
  })
})
