// @vitest-environment happy-dom
import React, { act, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { useListNavigation } from '../../src/renderer/hooks/useListNavigation'

function TestList({ items, onSelect, enabled }: {
  items: string[]
  onSelect: (index: number) => void
  enabled?: boolean
}) {
  const { getItemProps } = useListNavigation({
    itemCount: items.length,
    onSelect,
    enabled,
  })

  return (
    <div data-testid="list">
      {items.map((item, i) => (
        <div key={item} {...getItemProps(i)} data-testid={`item-${i}`}>
          {item}
        </div>
      ))}
    </div>
  )
}

function DynamicList() {
  const [items, setItems] = useState(['A', 'B', 'C'])
  const [selected, setSelected] = useState<number | null>(null)
  const { getItemProps } = useListNavigation({
    itemCount: items.length,
    onSelect: setSelected,
  })

  return (
    <div>
      <span data-testid="selected">{selected !== null ? selected : 'none'}</span>
      <div data-testid="list">
        {items.map((item, i) => (
          <div key={item} {...getItemProps(i)} data-testid={`item-${i}`}>
            {item}
          </div>
        ))}
      </div>
      <button data-testid="add" onClick={() => setItems(prev => [...prev, 'D'])}>Add</button>
      <button data-testid="remove" onClick={() => setItems(prev => prev.slice(0, 2))}>Remove</button>
    </div>
  )
}

function fireKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('useListNavigation', () => {
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

  afterEach(async () => {
    await act(async () => { root.unmount() })
  })

  it('assigns data-nav-index to items via getItemProps', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    const items = container.querySelectorAll('[data-nav-index]')
    expect(items.length).toBe(3)
    expect(items[0].getAttribute('data-nav-index')).toBe('0')
    expect(items[1].getAttribute('data-nav-index')).toBe('1')
    expect(items[2].getAttribute('data-nav-index')).toBe('2')
  })

  it('moves focus down with j key', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    await act(async () => { fireKey('j') })

    const item0 = container.querySelector('[data-nav-index="0"]')!
    expect(item0.classList.contains('nav-focused')).toBe(true)
  })

  it('moves focus up with k key', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    // Navigate down twice
    await act(async () => { fireKey('j') })
    await act(async () => { fireKey('j') })

    // Now at index 1
    const item1 = container.querySelector('[data-nav-index="1"]')!
    expect(item1.classList.contains('nav-focused')).toBe(true)

    // Navigate up
    await act(async () => { fireKey('k') })

    const item0 = container.querySelector('[data-nav-index="0"]')!
    expect(item0.classList.contains('nav-focused')).toBe(true)
    expect(item1.classList.contains('nav-focused')).toBe(false)
  })

  it('wraps around when pressing j at the bottom', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    // Navigate down 3 times (past end)
    await act(async () => { fireKey('j') }) // 0
    await act(async () => { fireKey('j') }) // 1
    await act(async () => { fireKey('j') }) // 2
    await act(async () => { fireKey('j') }) // wraps to 0

    const item0 = container.querySelector('[data-nav-index="0"]')!
    expect(item0.classList.contains('nav-focused')).toBe(true)
  })

  it('wraps around when pressing k at the top', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    // Navigate to first item, then up
    await act(async () => { fireKey('j') }) // 0
    await act(async () => { fireKey('k') }) // wraps to 2

    const item2 = container.querySelector('[data-nav-index="2"]')!
    expect(item2.classList.contains('nav-focused')).toBe(true)
  })

  it('calls onSelect with index on Enter', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    // Navigate to item 1
    await act(async () => { fireKey('j') }) // 0
    await act(async () => { fireKey('j') }) // 1

    await act(async () => { fireKey('Enter') })

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('does not call onSelect on Enter when no item is focused', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    // Press Enter without navigating first (focus index is -1)
    await act(async () => { fireKey('Enter') })

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('removes focus on Escape', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    // Navigate to first item
    await act(async () => { fireKey('j') })
    expect(container.querySelector('.nav-focused')).not.toBeNull()

    // Press Escape
    await act(async () => { fireKey('Escape') })

    expect(container.querySelector('.nav-focused')).toBeNull()
  })

  it('does not respond when enabled is false', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} enabled={false} />)
    })

    await act(async () => { fireKey('j') })

    expect(container.querySelector('.nav-focused')).toBeNull()
  })

  it('ignores keys when focus is in an input', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(
        <div>
          <input data-testid="input" />
          <TestList items={['A', 'B', 'C']} onSelect={onSelect} />
        </div>
      )
    })

    const input = container.querySelector('[data-testid="input"]') as HTMLInputElement

    // Dispatch keydown from the input element
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })

    expect(container.querySelector('.nav-focused')).toBeNull()
  })

  it('ignores keys when focus is in a textarea', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(
        <div>
          <textarea data-testid="textarea" />
          <TestList items={['A', 'B', 'C']} onSelect={onSelect} />
        </div>
      )
    })

    const textarea = container.querySelector('[data-testid="textarea"]') as HTMLTextAreaElement

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
    })

    expect(container.querySelector('.nav-focused')).toBeNull()
  })

  it('resets focus when item count changes', async () => {
    await act(async () => {
      root.render(<DynamicList />)
    })

    // Navigate to an item
    await act(async () => { fireKey('j') })
    expect(container.querySelector('.nav-focused')).not.toBeNull()

    // Add an item — itemCount changes
    const addBtn = container.querySelector('[data-testid="add"]') as HTMLButtonElement
    await act(async () => { addBtn.click() })

    // Focus should be reset
    expect(container.querySelector('.nav-focused')).toBeNull()
  })

  it('cleans up listener on unmount', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={['A', 'B', 'C']} onSelect={onSelect} />)
    })

    await act(async () => { root.unmount() })

    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)

    fireKey('j')
  })

  it('does not render when itemCount is 0', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      root.render(<TestList items={[]} onSelect={onSelect} />)
    })

    // Should not crash or add listeners
    await act(async () => { fireKey('j') })
    expect(container.querySelector('.nav-focused')).toBeNull()
  })

  it('tracks selected index in dynamic list', async () => {
    await act(async () => {
      root.render(<DynamicList />)
    })

    // Navigate and select
    await act(async () => { fireKey('j') }) // 0
    await act(async () => { fireKey('j') }) // 1
    await act(async () => { fireKey('Enter') })

    expect(container.querySelector('[data-testid="selected"]')!.textContent).toBe('1')
  })
})
