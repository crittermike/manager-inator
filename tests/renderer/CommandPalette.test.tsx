// @vitest-environment happy-dom
import { act } from 'react'
import { createElement } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

const mockOverview = {
  reports: [
    { name: 'alice-smith', displayName: 'Alice Smith', role: 'Senior Engineer' },
    { name: 'bob-jones', displayName: 'Bob Jones', role: 'Staff Engineer' }
  ]
}

vi.mock('../../src/renderer/hooks/useData', () => ({
  useTeamOverview: () => ({ overview: mockOverview, loading: false, error: null, refresh: vi.fn() })
}))

import { CommandPalette } from '../../src/renderer/components/common/CommandPalette'

function openPalette() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  )
}

async function renderPalette(props: { onOpenCapture?: () => void; onOpenAI?: () => void } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(createElement(CommandPalette, props))
  })

  await act(async () => {
    openPalette()
  })

  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  return { container, root }
}

describe('CommandPalette accessibility', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    mockNavigate.mockReset()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listPeople: vi.fn().mockResolvedValue([
          { slug: 'carol-chen', name: 'Carol Chen', role: 'Engineer', location: 'NYC', aliases: [], relationship: 'Other', meetingCount: 3 }
        ])
      }
    })
  })

  it('input has role="combobox" with aria-controls and aria-autocomplete', async () => {
    const { container, root } = await renderPalette()

    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-controls')).toBe('palette-listbox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')

    await act(async () => { root.unmount() })
  })

  it('aria-expanded reflects whether results exist', async () => {
    const { container, root } = await renderPalette()

    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-expanded')).toBe('true')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'zzzznonexistent')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(input.getAttribute('aria-expanded')).toBe('false')

    await act(async () => { root.unmount() })
  })

  it('results list has role="listbox" with proper id', async () => {
    const { container, root } = await renderPalette()

    const listbox = container.querySelector('#palette-listbox')
    expect(listbox).not.toBeNull()
    expect(listbox!.getAttribute('role')).toBe('listbox')
    expect(listbox!.getAttribute('aria-label')).toBe('Command palette results')

    await act(async () => { root.unmount() })
  })

  it('each item has role="option" with aria-selected and unique id', async () => {
    const { container, root } = await renderPalette()

    const options = container.querySelectorAll('[role="option"]')
    expect(options.length).toBeGreaterThan(0)

    const ids = new Set<string>()
    options.forEach(opt => {
      expect(opt.getAttribute('id')).toBeTruthy()
      expect(opt.getAttribute('aria-selected')).toBeTruthy()
      ids.add(opt.getAttribute('id')!)
    })
    expect(ids.size).toBe(options.length)

    await act(async () => { root.unmount() })
  })

  it('first item has aria-selected="true" by default', async () => {
    const { container, root } = await renderPalette()

    const options = container.querySelectorAll('[role="option"]')
    expect(options[0].getAttribute('aria-selected')).toBe('true')

    for (let i = 1; i < options.length; i++) {
      expect(options[i].getAttribute('aria-selected')).toBe('false')
    }

    await act(async () => { root.unmount() })
  })

  it('sections have role="group" with aria-label', async () => {
    const { container, root } = await renderPalette()

    const groups = container.querySelectorAll('[role="group"]')
    expect(groups.length).toBeGreaterThan(0)

    groups.forEach(group => {
      expect(group.getAttribute('aria-label')).toBeTruthy()
    })

    await act(async () => { root.unmount() })
  })

  it('aria-activedescendant updates on ArrowDown', async () => {
    const { container, root } = await renderPalette()

    const input = container.querySelector('input') as HTMLInputElement
    const firstOption = container.querySelector('[role="option"]')
    const firstId = firstOption!.getAttribute('id')

    expect(input.getAttribute('aria-activedescendant')).toBe(firstId)

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })

    const options = container.querySelectorAll('[role="option"]')
    const secondId = options[1].getAttribute('id')
    expect(input.getAttribute('aria-activedescendant')).toBe(secondId)
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(options[0].getAttribute('aria-selected')).toBe('false')

    await act(async () => { root.unmount() })
  })

  it('aria-activedescendant updates on ArrowUp with wrapping', async () => {
    const { container, root } = await renderPalette()

    const input = container.querySelector('input') as HTMLInputElement

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })

    const options = container.querySelectorAll('[role="option"]')
    const lastOption = options[options.length - 1]
    expect(input.getAttribute('aria-activedescendant')).toBe(lastOption.getAttribute('id'))
    expect(lastOption.getAttribute('aria-selected')).toBe('true')

    await act(async () => { root.unmount() })
  })

  it('has an aria-live region for screen readers', async () => {
    const { container, root } = await renderPalette()

    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion!.getAttribute('aria-atomic')).toBe('true')
    expect(liveRegion!.textContent).toMatch(/\d+ results? available/)

    await act(async () => { root.unmount() })
  })

  it('live region announces "No results" when query matches nothing', async () => {
    const { container, root } = await renderPalette()

    const input = container.querySelector('input') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'xyznonexistent')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion!.textContent).toContain('No results for')

    await act(async () => { root.unmount() })
  })

  it('dialog has aria-modal and aria-label', async () => {
    const { container, root } = await renderPalette()

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.getAttribute('aria-modal')).toBe('true')
    expect(dialog!.getAttribute('aria-label')).toBe('Command palette')

    await act(async () => { root.unmount() })
  })

  it('Enter on highlighted item navigates and closes', async () => {
    const { container, root } = await renderPalette()

    const input = container.querySelector('input') as HTMLInputElement

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(mockNavigate).toHaveBeenCalledWith('/')

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).toBeNull()

    await act(async () => { root.unmount() })
  })

  it('Escape closes the palette', async () => {
    const { container, root } = await renderPalette()

    const input = container.querySelector('input') as HTMLInputElement
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).toBeNull()

    await act(async () => { root.unmount() })
  })

  it('filtering narrows results and resets highlight to 0', async () => {
    const { container, root } = await renderPalette()

    const input = container.querySelector('input') as HTMLInputElement

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'Alice')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const options = container.querySelectorAll('[role="option"]')
    expect(options.length).toBeGreaterThan(0)
    options.forEach(opt => {
      expect(opt.textContent?.toLowerCase()).toContain('alice')
    })

    expect(options[0].getAttribute('aria-selected')).toBe('true')

    await act(async () => { root.unmount() })
  })

  it('action items trigger callbacks instead of navigation', async () => {
    const onOpenCapture = vi.fn()
    const { container, root } = await renderPalette({ onOpenCapture })

    const input = container.querySelector('input') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'Capture context')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onOpenCapture).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()

    await act(async () => { root.unmount() })
  })

  it('section headers are aria-hidden (announced via group label)', async () => {
    const { container, root } = await renderPalette()

    const groups = container.querySelectorAll('[role="group"]')
    groups.forEach(group => {
      const header = group.querySelector('.uppercase')
      expect(header?.getAttribute('aria-hidden')).toBe('true')
    })

    await act(async () => { root.unmount() })
  })
})
