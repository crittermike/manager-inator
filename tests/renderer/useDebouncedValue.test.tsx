// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { useDebouncedValue } from '../../src/renderer/hooks/useDebouncedValue'

function TestComponent({ value, delay }: { value: string; delay: number }) {
  const debounced = useDebouncedValue(value, delay)
  return <span data-testid="debounced">{debounced}</span>
}

function DynamicComponent({ delay }: { delay: number }) {
  const [value, setValue] = useState('initial')
  const debounced = useDebouncedValue(value, delay)
  return (
    <div>
      <span data-testid="debounced">{debounced}</span>
      <button data-testid="update" onClick={() => setValue('updated')}>update</button>
      <button data-testid="rapid-a" onClick={() => setValue('a')}>a</button>
      <button data-testid="rapid-b" onClick={() => setValue('b')}>b</button>
      <button data-testid="rapid-c" onClick={() => setValue('c')}>c</button>
    </div>
  )
}

describe('useDebouncedValue', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    vi.useFakeTimers()
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial value immediately', async () => {
    await act(async () => {
      root.render(<TestComponent value="hello" delay={300} />)
    })

    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('hello')
  })

  it('does not update until delay elapses', async () => {
    await act(async () => {
      root.render(<DynamicComponent delay={300} />)
    })

    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('initial')

    const btn = container.querySelector('[data-testid="update"]') as HTMLButtonElement
    await act(async () => { btn.click() })

    // Value should still be 'initial' before delay elapses
    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('initial')

    // Advance past the delay
    await act(async () => { vi.advanceTimersByTime(300) })

    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('updated')
  })

  it('resets timer on rapid value changes (only last value fires)', async () => {
    await act(async () => {
      root.render(<DynamicComponent delay={200} />)
    })

    const btnA = container.querySelector('[data-testid="rapid-a"]') as HTMLButtonElement
    const btnB = container.querySelector('[data-testid="rapid-b"]') as HTMLButtonElement
    const btnC = container.querySelector('[data-testid="rapid-c"]') as HTMLButtonElement

    // Fire three rapid changes
    await act(async () => { btnA.click() })
    await act(async () => { vi.advanceTimersByTime(50) })
    await act(async () => { btnB.click() })
    await act(async () => { vi.advanceTimersByTime(50) })
    await act(async () => { btnC.click() })

    // Still shows initial because no timeout has completed
    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('initial')

    // Advance past the delay from the last change
    await act(async () => { vi.advanceTimersByTime(200) })

    // Only the last value should have made it through
    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('c')
  })

  it('updates debounced value when delay is zero', async () => {
    await act(async () => {
      root.render(<DynamicComponent delay={0} />)
    })

    const btn = container.querySelector('[data-testid="update"]') as HTMLButtonElement
    await act(async () => { btn.click() })
    await act(async () => { vi.advanceTimersByTime(0) })

    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('updated')
  })

  it('cleans up timer on unmount', async () => {
    await act(async () => {
      root.render(<DynamicComponent delay={300} />)
    })

    const btn = container.querySelector('[data-testid="update"]') as HTMLButtonElement
    await act(async () => { btn.click() })

    // Unmount before the timer fires
    await act(async () => { root.unmount() })

    // Advance timers — should not throw
    await act(async () => { vi.advanceTimersByTime(300) })
  })

  it('responds to delay changes', async () => {
    await act(async () => {
      root.render(<TestComponent value="test" delay={100} />)
    })

    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('test')

    // Re-render with same value but different delay should not lose the value
    await act(async () => {
      root.render(<TestComponent value="test" delay={500} />)
    })

    expect(container.querySelector('[data-testid="debounced"]')!.textContent).toBe('test')
  })
})
