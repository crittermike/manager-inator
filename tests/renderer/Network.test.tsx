// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Network } from '../../src/renderer/pages/Network'
import { ToastProvider } from '../../src/renderer/components/common/Toast'
import type { PersonEntry } from '../../src/shared/types'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

function person(overrides: Partial<PersonEntry>): PersonEntry {
  return {
    name: 'Default Name',
    slug: 'default-name',
    aliases: [],
    meetingCount: 0,
    lastSeen: '',
    role: '',
    github: '',
    location: '',
    relationship: '',
    ...overrides,
  }
}

async function renderPage(people: PersonEntry[]) {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      listPeople: vi.fn().mockResolvedValue(people),
      getSettingsOptions: vi.fn().mockResolvedValue({ roles: [], relationships: [] }),
      createPerson: vi.fn().mockResolvedValue('new-slug'),
    },
  })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(
      <MemoryRouter>
        <ToastProvider><Network /></ToastProvider>
      </MemoryRouter>
    )
  })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  return { container, root }
}

describe('Network page', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
    document.body.innerHTML = ''
    navigate.mockReset()
  })

  it('renders empty state when no people exist', async () => {
    const { container, root } = await renderPage([])
    expect(container.textContent).toContain('Build your network')
    await act(async () => { root.unmount() })
  })

  it('renders categories with counts and shows selected group', async () => {
    const { container, root } = await renderPage([
      person({ name: 'Pat Peer', slug: 'pat-peer', relationship: 'Peer Manager' }),
      person({ name: 'Sam Stake', slug: 'sam-stake', relationship: 'Stakeholder' }),
      person({ name: 'Direct Dan', slug: 'direct-dan', relationship: 'Direct Report' }),
    ])

    expect(container.textContent).toContain('Peer Managers')
    expect(container.textContent).toContain('Stakeholders')
    expect(container.textContent).toContain('Direct Reports')
    expect(container.textContent).toContain('Pat Peer')
    await act(async () => { root.unmount() })
  })

  it('filters by search query (name)', async () => {
    const { container, root } = await renderPage([
      person({ name: 'Alice Engineer', slug: 'alice', relationship: 'Peer Manager' }),
      person({ name: 'Bob Builder', slug: 'bob', relationship: 'Peer Manager' }),
    ])
    const input = container.querySelector('input[aria-label="Search network"]') as HTMLInputElement
    expect(input).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, 'alice')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toContain('Alice Engineer')
    expect(container.textContent).not.toContain('Bob Builder')
    await act(async () => { root.unmount() })
  })

  it('navigates to /people/<slug> when a person row is clicked', async () => {
    const { container, root } = await renderPage([
      person({ name: 'Pat Peer', slug: 'pat-peer', relationship: 'Peer Manager' }),
    ])
    const rowBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Pat Peer')
    ) as HTMLButtonElement | undefined
    expect(rowBtn).toBeDefined()
    await act(async () => { rowBtn!.click() })
    expect(navigate).toHaveBeenCalledWith('/people/pat-peer')
    await act(async () => { root.unmount() })
  })

  it('opens AddPersonModal when "Add person" header button is clicked', async () => {
    const { container, root } = await renderPage([
      person({ name: 'X', slug: 'x', relationship: 'Peer Manager' }),
    ])
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Add person'
    ) as HTMLButtonElement | undefined
    await act(async () => { addBtn!.click() })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => { root.unmount() })
  })

  it('groups unknown relationships under Other', async () => {
    const { container, root } = await renderPage([
      person({ name: 'Quirky Q', slug: 'q', relationship: 'Vendor Contact' }),
    ])
    expect(container.textContent).toContain('Other')
    expect(container.textContent).toContain('Quirky Q')
    await act(async () => { root.unmount() })
  })
})
