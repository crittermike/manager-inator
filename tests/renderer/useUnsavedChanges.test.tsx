// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

// Mock react-router-dom before importing the hook
const mockBlocker = { state: 'unblocked' as string, proceed: vi.fn(), reset: vi.fn() }
vi.mock('react-router-dom', () => ({
  useBlocker: (fn: () => boolean) => {
    // Store the condition for testing
    ;(mockBlocker as Record<string, unknown>)._shouldBlock = fn()
    return mockBlocker
  },
}))

import { useUnsavedChanges } from '../../src/renderer/hooks/useUnsavedChanges'

function TestComponent({ dirty }: { dirty: boolean }) {
  const { blockerState, proceed, reset } = useUnsavedChanges(dirty)
  return (
    <div>
      <span data-testid="state">{blockerState}</span>
      <button data-testid="proceed" onClick={proceed}>proceed</button>
      <button data-testid="reset" onClick={reset}>reset</button>
    </div>
  )
}

function ToggleComponent() {
  const [dirty, setDirty] = useState(false)
  const { blockerState } = useUnsavedChanges(dirty)
  return (
    <div>
      <span data-testid="state">{blockerState}</span>
      <span data-testid="dirty">{String(dirty)}</span>
      <button data-testid="make-dirty" onClick={() => setDirty(true)}>dirty</button>
      <button data-testid="make-clean" onClick={() => setDirty(false)}>clean</button>
    </div>
  )
}

describe('useUnsavedChanges', () => {
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
    mockBlocker.state = 'unblocked'
    mockBlocker.proceed.mockClear()
    mockBlocker.reset.mockClear()
  })

  it('returns unblocked state when not dirty', async () => {
    await act(async () => {
      root.render(<TestComponent dirty={false} />)
    })

    expect(container.querySelector('[data-testid="state"]')!.textContent).toBe('unblocked')
  })

  it('returns current blocker state', async () => {
    mockBlocker.state = 'blocked'
    await act(async () => {
      root.render(<TestComponent dirty={true} />)
    })

    expect(container.querySelector('[data-testid="state"]')!.textContent).toBe('blocked')
  })

  it('adds beforeunload listener when dirty', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')

    await act(async () => {
      root.render(<TestComponent dirty={true} />)
    })

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    addSpy.mockRestore()
  })

  it('does not add beforeunload listener when clean', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')

    await act(async () => {
      root.render(<TestComponent dirty={false} />)
    })

    const beforeUnloadCalls = addSpy.mock.calls.filter(c => c[0] === 'beforeunload')
    expect(beforeUnloadCalls.length).toBe(0)
    addSpy.mockRestore()
  })

  it('removes beforeunload listener on cleanup', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    await act(async () => {
      root.render(<TestComponent dirty={true} />)
    })

    await act(async () => {
      root.render(<TestComponent dirty={false} />)
    })

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('calls proceed on blocker when state is blocked', async () => {
    mockBlocker.state = 'blocked'
    await act(async () => {
      root.render(<TestComponent dirty={true} />)
    })

    const proceedBtn = container.querySelector('[data-testid="proceed"]') as HTMLButtonElement
    await act(async () => { proceedBtn.click() })

    expect(mockBlocker.proceed).toHaveBeenCalledOnce()
  })

  it('calls reset on blocker when state is blocked', async () => {
    mockBlocker.state = 'blocked'
    await act(async () => {
      root.render(<TestComponent dirty={true} />)
    })

    const resetBtn = container.querySelector('[data-testid="reset"]') as HTMLButtonElement
    await act(async () => { resetBtn.click() })

    expect(mockBlocker.reset).toHaveBeenCalledOnce()
  })

  it('proceed and reset are no-ops when unblocked', async () => {
    mockBlocker.state = 'unblocked'
    await act(async () => {
      root.render(<TestComponent dirty={false} />)
    })

    const proceedBtn = container.querySelector('[data-testid="proceed"]') as HTMLButtonElement
    const resetBtn = container.querySelector('[data-testid="reset"]') as HTMLButtonElement

    await act(async () => { proceedBtn.click() })
    await act(async () => { resetBtn.click() })

    // When unblocked, the hook returns no-op functions, so the real proceed/reset should NOT be called
    expect(mockBlocker.proceed).not.toHaveBeenCalled()
    expect(mockBlocker.reset).not.toHaveBeenCalled()
  })

  it('beforeunload handler sets returnValue', async () => {
    await act(async () => {
      root.render(<TestComponent dirty={true} />)
    })

    const event = new Event('beforeunload') as BeforeUnloadEvent
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() })
    Object.defineProperty(event, 'returnValue', { value: '', writable: true })

    window.dispatchEvent(event)

    expect((event as BeforeUnloadEvent & { returnValue: string }).returnValue).toBe('')
  })

  it('toggles beforeunload listener with dirty state', async () => {
    await act(async () => {
      root.render(<ToggleComponent />)
    })

    const addSpy = vi.spyOn(window, 'addEventListener')

    // Make dirty
    const dirtyBtn = container.querySelector('[data-testid="make-dirty"]') as HTMLButtonElement
    await act(async () => { dirtyBtn.click() })

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    const removeSpy = vi.spyOn(window, 'removeEventListener')

    // Make clean
    const cleanBtn = container.querySelector('[data-testid="make-clean"]') as HTMLButtonElement
    await act(async () => { cleanBtn.click() })

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
