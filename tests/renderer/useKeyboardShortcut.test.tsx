// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { useKeyboardShortcut } from '../../src/renderer/hooks/useKeyboardShortcut'

function TestComponent({ shortcutKey, modifiers, enabled }: {
  shortcutKey: string
  modifiers?: ('meta' | 'ctrl' | 'shift' | 'alt')[]
  enabled?: boolean
}) {
  const [count, setCount] = useState(0)
  useKeyboardShortcut({
    key: shortcutKey,
    modifiers,
    handler: () => setCount(c => c + 1),
    enabled,
  })
  return <span data-testid="count">{count}</span>
}

function ToggleComponent() {
  const [enabled, setEnabled] = useState(true)
  const [count, setCount] = useState(0)
  useKeyboardShortcut({
    key: 'k',
    modifiers: ['meta'],
    handler: () => setCount(c => c + 1),
    enabled,
  })
  return (
    <div>
      <span data-testid="count">{count}</span>
      <button data-testid="toggle" onClick={() => setEnabled(e => !e)}>toggle</button>
    </div>
  )
}

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  })
  window.dispatchEvent(event)
  return event
}

describe('useKeyboardShortcut', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)
  })

  it('fires handler on matching key with default meta modifier', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="k" />)
    })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('0')

    await act(async () => { fireKey('k', { metaKey: true }) })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('1')
  })

  it('does not fire handler when modifier key is missing', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="k" />)
    })

    // Press k without meta — should not fire
    await act(async () => { fireKey('k') })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('0')
  })

  it('does not fire handler when wrong key is pressed', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="k" />)
    })

    await act(async () => { fireKey('j', { metaKey: true }) })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('0')
  })

  it('matches multiple modifiers', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="s" modifiers={['meta', 'shift']} />)
    })

    // Missing shift
    await act(async () => { fireKey('s', { metaKey: true }) })
    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('0')

    // Both modifiers
    await act(async () => { fireKey('s', { metaKey: true, shiftKey: true }) })
    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('1')
  })

  it('works with no modifiers (empty array)', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="Escape" modifiers={[]} />)
    })

    await act(async () => { fireKey('Escape') })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('1')
  })

  it('matches case-insensitively', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="K" />)
    })

    await act(async () => { fireKey('k', { metaKey: true }) })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('1')
  })

  it('does not fire when enabled is false', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="k" enabled={false} />)
    })

    await act(async () => { fireKey('k', { metaKey: true }) })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('0')
  })

  it('stops responding after being toggled off', async () => {
    await act(async () => {
      root.render(<ToggleComponent />)
    })

    // Should work while enabled
    await act(async () => { fireKey('k', { metaKey: true }) })
    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('1')

    // Disable
    const toggleBtn = container.querySelector('[data-testid="toggle"]') as HTMLButtonElement
    await act(async () => { toggleBtn.click() })

    // Should not fire
    await act(async () => { fireKey('k', { metaKey: true }) })
    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('1')

    // Re-enable
    await act(async () => { toggleBtn.click() })

    // Should work again
    await act(async () => { fireKey('k', { metaKey: true }) })
    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('2')
  })

  it('cleans up listener on unmount', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="k" />)
    })

    await act(async () => { root.unmount() })

    // Should not throw or fire
    await act(async () => { fireKey('k', { metaKey: true }) })
  })

  it('supports ctrl modifier', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="c" modifiers={['ctrl']} />)
    })

    await act(async () => { fireKey('c', { ctrlKey: true }) })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('1')
  })

  it('supports alt modifier', async () => {
    await act(async () => {
      root.render(<TestComponent shortcutKey="a" modifiers={['alt']} />)
    })

    await act(async () => { fireKey('a', { altKey: true }) })

    expect(container.querySelector('[data-testid="count"]')!.textContent).toBe('1')
  })
})
