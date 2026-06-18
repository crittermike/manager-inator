// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PersonDetail } from '../../src/renderer/pages/PersonDetail'
import { ToastProvider } from '../../src/renderer/components/common/Toast'
import { ActiveFileProvider } from '../../src/renderer/hooks/useActiveFile'
import type { PersonEntry } from '../../src/shared/types'

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

async function render(slug: string, people: PersonEntry[], fileContent = '---\nname: x\n---\n# Body') {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listPeople: vi.fn().mockResolvedValue(people),
      getFileContent: vi.fn().mockResolvedValue(fileContent),
      getPersonContexts: vi.fn().mockResolvedValue([]),
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
