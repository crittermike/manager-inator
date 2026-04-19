// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { StreamEntryRow } from '../../src/renderer/components/report/StreamEntryRow'
import type { StreamEntry } from '../../src/renderer/components/report/StreamEntryCard'

function makeEntry(overrides: Partial<StreamEntry> = {}): StreamEntry {
  return {
    type: 'context',
    id: 'meeting-2026-04-15',
    date: '2026-04-15',
    title: '1:1 with Steve',
    preview: 'Discussed roadmap.',
    source: 'meeting',
    data: {
      filename: '2026-04-15-meeting.md',
      date: '2026-04-15',
      title: '1:1 with Steve',
      summary: 'Discussed roadmap.',
      source: 'meeting',
      tags: [],
      people: [],
      content: '',
    },
    ...overrides,
  } as StreamEntry
}

async function render(node: React.ReactElement) {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  await act(async () => { root.render(node) })
  return { container, root, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

describe('StreamEntryRow', () => {
  it('renders title, preview, and source-derived label', async () => {
    const onSelect = vi.fn()
    const { container, cleanup } = await render(
      <StreamEntryRow entry={makeEntry()} selected={false} onSelect={onSelect} />
    )
    expect(container.textContent).toContain('1:1 with Steve')
    expect(container.textContent).toContain('Discussed roadmap.')
    expect(container.textContent).toContain('Meeting')
    await cleanup()
  })

  it('calls onSelect with the entry id when clicked', async () => {
    const onSelect = vi.fn()
    const { container, cleanup } = await render(
      <StreamEntryRow entry={makeEntry({ id: 'abc' })} selected={false} onSelect={onSelect} />
    )
    const btn = container.querySelector('button') as HTMLButtonElement
    await act(async () => { btn.click() })
    expect(onSelect).toHaveBeenCalledWith('abc')
    await cleanup()
  })

  it('marks the row aria-current when selected', async () => {
    const { container, cleanup } = await render(
      <StreamEntryRow entry={makeEntry()} selected={true} onSelect={() => {}} />
    )
    expect(container.querySelector('button')?.getAttribute('aria-current')).toBe('true')
    await cleanup()
  })

  it('omits aria-current when not selected', async () => {
    const { container, cleanup } = await render(
      <StreamEntryRow entry={makeEntry()} selected={false} onSelect={() => {}} />
    )
    expect(container.querySelector('button')?.hasAttribute('aria-current')).toBe(false)
    await cleanup()
  })

  it('uses type label when context entry has no source', async () => {
    const entry = makeEntry({ source: undefined }) as StreamEntry
    const { container, cleanup } = await render(
      <StreamEntryRow entry={entry} selected={false} onSelect={() => {}} />
    )
    expect(container.textContent).toContain('1:1')
    await cleanup()
  })
})
