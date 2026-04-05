// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { ToastProvider, useToast } from '../../src/renderer/components/common/Toast'

function TestHarness({ trigger }: { trigger: (api: ReturnType<typeof useToast>) => void }) {
  const toast = useToast()
  return <button onClick={() => trigger(toast)}>fire</button>
}

function renderWithToast(trigger: (api: ReturnType<typeof useToast>) => void) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  act(() => {
    root.render(
      <ToastProvider>
        <TestHarness trigger={trigger} />
      </ToastProvider>
    )
  })

  return { container, root }
}

function getToastContainer(container: HTMLElement) {
  return container.querySelector('[aria-live]') as HTMLElement | null
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Toast accessibility', () => {
  it('uses role="status" and aria-live="polite" for success toasts', async () => {
    const { container, root } = renderWithToast(api => api.success('Saved'))

    await act(async () => {
      container.querySelector('button')?.click()
    })

    const region = getToastContainer(container)
    expect(region?.getAttribute('role')).toBe('status')
    expect(region?.getAttribute('aria-live')).toBe('polite')
    expect(region?.getAttribute('aria-atomic')).toBe('true')

    await act(async () => { root.unmount() })
  })

  it('uses role="status" and aria-live="polite" for info toasts', async () => {
    const { container, root } = renderWithToast(api => api.info('Note'))

    await act(async () => {
      container.querySelector('button')?.click()
    })

    const region = getToastContainer(container)
    expect(region?.getAttribute('role')).toBe('status')
    expect(region?.getAttribute('aria-live')).toBe('polite')

    await act(async () => { root.unmount() })
  })

  it('uses role="alert" and aria-live="assertive" for error toasts', async () => {
    const { container, root } = renderWithToast(api => api.error('Failed'))

    await act(async () => {
      container.querySelector('button')?.click()
    })

    const region = getToastContainer(container)
    expect(region?.getAttribute('role')).toBe('alert')
    expect(region?.getAttribute('aria-live')).toBe('assertive')
    expect(region?.getAttribute('aria-atomic')).toBe('true')

    await act(async () => { root.unmount() })
  })

  it('uses role="alert" and aria-live="assertive" for warning toasts', async () => {
    const { container, root } = renderWithToast(api => api.warning('Caution'))

    await act(async () => {
      container.querySelector('button')?.click()
    })

    const region = getToastContainer(container)
    expect(region?.getAttribute('role')).toBe('alert')
    expect(region?.getAttribute('aria-live')).toBe('assertive')

    await act(async () => { root.unmount() })
  })

  it('upgrades to role="alert" when error toast appears alongside success', async () => {
    const { container, root } = renderWithToast(api => {
      api.success('Done')
      api.error('Oops')
    })

    await act(async () => {
      container.querySelector('button')?.click()
    })

    const region = getToastContainer(container)
    expect(region?.getAttribute('role')).toBe('alert')
    expect(region?.getAttribute('aria-live')).toBe('assertive')

    await act(async () => { root.unmount() })
  })

  it('renders action button that is focusable', async () => {
    const actionFn = vi.fn()
    const { container, root } = renderWithToast(api =>
      api.success('Deleted', 'Item removed', { label: 'Undo', onClick: actionFn })
    )

    await act(async () => {
      container.querySelector('button')?.click()
    })

    const actionBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'Undo') as HTMLButtonElement | undefined
    expect(actionBtn).toBeDefined()
    expect(actionBtn?.tabIndex).not.toBe(-1)

    await act(async () => { actionBtn?.click() })
    expect(actionFn).toHaveBeenCalledOnce()

    await act(async () => { root.unmount() })
  })

  it('pauses auto-dismiss timer when action button is focused', async () => {
    vi.useFakeTimers()
    const actionFn = vi.fn()
    const { container, root } = renderWithToast(api =>
      api.success('Deleted', 'Item removed', { label: 'Undo', onClick: actionFn })
    )

    await act(async () => {
      container.querySelector('button')?.click()
    })

    const actionBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent === 'Undo') as HTMLButtonElement | undefined
    expect(actionBtn).toBeDefined()

    await act(async () => {
      actionBtn?.focus()
    })

    await act(async () => {
      vi.advanceTimersByTime(12000)
    })

    const toastDuringFocus = container.querySelector('[class*="pointer-events-auto"]')
    expect(toastDuringFocus).not.toBeNull()

    await act(async () => {
      actionBtn?.blur()
    })

    await act(async () => {
      vi.advanceTimersByTime(2500)
    })

    const toastAfterBlur = container.querySelector('[class*="pointer-events-auto"]')
    expect(toastAfterBlur).toBeNull()

    vi.useRealTimers()
    await act(async () => { root.unmount() })
  })

  it('has dismiss button with accessible label', async () => {
    const { container, root } = renderWithToast(api => api.info('Hello'))

    await act(async () => {
      container.querySelector('button')?.click()
    })

    const dismissBtn = container.querySelector('button[aria-label="Dismiss notification"]')
    expect(dismissBtn).not.toBeNull()

    await act(async () => { root.unmount() })
  })

  it('action toasts get minimum 8s duration', async () => {
    vi.useFakeTimers()
    const { container, root } = renderWithToast(api =>
      api.toast({ type: 'success', message: 'Done', duration: 2000, action: { label: 'Undo', onClick: () => {} } })
    )

    await act(async () => {
      container.querySelector('button')?.click()
    })

    await act(async () => {
      vi.advanceTimersByTime(4000)
    })

    const toastStillVisible = container.querySelector('[class*="pointer-events-auto"]')
    expect(toastStillVisible).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(4500)
    })

    const toastAfterFull = container.querySelector('[class*="pointer-events-auto"]')
    expect(toastAfterFull).toBeNull()

    vi.useRealTimers()
    await act(async () => { root.unmount() })
  })
})
