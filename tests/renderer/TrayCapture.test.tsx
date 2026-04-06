// @vitest-environment happy-dom
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

import type { IpcApi } from '../../src/shared/types'
import { TrayCapture } from '../../src/renderer/components/TrayCapture'

type TrayCaptureApi = Pick<IpcApi, 'trayCaptureSubmit' | 'trayCaptureClose' | 'onTrayCaptureReset'>

let resetCallback: (() => void) | null = null

const trayCaptureSubmit = vi.fn(async (_content: string) => {})
const trayCaptureClose = vi.fn(async () => {})
const onTrayCaptureReset = vi.fn((callback: () => void) => {
  resetCallback = callback
  return () => {
    resetCallback = null
  }
})

async function mountTrayCapture() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<TrayCapture />)
    await Promise.resolve()
  })

  const textarea = container.querySelector('textarea')
  const button = container.querySelector('button')

  if (!textarea || !(textarea instanceof HTMLTextAreaElement)) {
    throw new Error('Textarea not found')
  }

  if (!button || !(button instanceof HTMLButtonElement)) {
    throw new Error('Button not found')
  }

  return {
    container,
    textarea,
    button,
    unmount: async () => {
      await act(async () => {
        root.unmount()
        await Promise.resolve()
      })
      container.remove()
    }
  }
}

async function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!valueSetter) {
    throw new Error('Textarea value setter not found')
  }

  await act(async () => {
    valueSetter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
}

describe('TrayCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllTimers()
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
    resetCallback = null
    trayCaptureSubmit.mockClear()
    trayCaptureClose.mockClear()
    onTrayCaptureReset.mockClear()

    const api: TrayCaptureApi = {
      trayCaptureSubmit,
      trayCaptureClose,
      onTrayCaptureReset
    }

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: api
    })
  })

  it('renders textarea, submit button, and capture hint', async () => {
    const { container, textarea, button, unmount } = await mountTrayCapture()

    expect(textarea).toBeTruthy()
    expect(button).toBeTruthy()
    expect(button.textContent).toContain('Capture')
    expect(button.textContent).toContain('cmd+enter')

    await unmount()
  })

  it('disables submit button when textarea is empty', async () => {
    const { button, unmount } = await mountTrayCapture()

    expect(button.disabled).toBe(true)

    await unmount()
  })

  it('enables submit button when textarea has content', async () => {
    const { textarea, button, unmount } = await mountTrayCapture()

    await setTextareaValue(textarea, 'hello world')

    expect(button.disabled).toBe(false)

    await unmount()
  })

  it('submits content, shows sent state, clears content, and closes after 300ms', async () => {
    const { container, textarea, button, unmount } = await mountTrayCapture()

    await setTextareaValue(textarea, 'hello world')

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(trayCaptureSubmit).toHaveBeenCalledTimes(1)
    expect(trayCaptureSubmit).toHaveBeenCalledWith('hello world')
    expect(container.textContent).toContain('Sent!')
    expect(textarea.value).toBe('')
    expect(trayCaptureClose).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(299)
      await Promise.resolve()
    })
    expect(trayCaptureClose).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(trayCaptureClose).toHaveBeenCalledTimes(1)

    await unmount()
  })

  it('trims whitespace before submit', async () => {
    const { textarea, button, unmount } = await mountTrayCapture()

    await setTextareaValue(textarea, '  hello  ')

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(trayCaptureSubmit).toHaveBeenCalledWith('hello')

    await unmount()
  })

  it('does nothing when submit clicked with empty content', async () => {
    const { button, unmount } = await mountTrayCapture()

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(trayCaptureSubmit).not.toHaveBeenCalled()

    await unmount()
  })

  it('does not submit again when already sent', async () => {
    const { textarea, button, unmount } = await mountTrayCapture()

    await setTextareaValue(textarea, 'hello')

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(trayCaptureSubmit).toHaveBeenCalledTimes(1)

    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(trayCaptureSubmit).toHaveBeenCalledTimes(1)

    await unmount()
  })

  it('submits on cmd+enter keyboard shortcut', async () => {
    const { textarea, unmount } = await mountTrayCapture()

    await setTextareaValue(textarea, 'from keyboard')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(trayCaptureSubmit).toHaveBeenCalledTimes(1)
    expect(trayCaptureSubmit).toHaveBeenCalledWith('from keyboard')

    await unmount()
  })

  it('submits on Ctrl+Enter keyboard shortcut', async () => {
    const { textarea, unmount } = await mountTrayCapture()

    await setTextareaValue(textarea, 'from ctrl enter')

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(trayCaptureSubmit).toHaveBeenCalledTimes(1)
    expect(trayCaptureSubmit).toHaveBeenCalledWith('from ctrl enter')

    await unmount()
  })

  it('closes on Escape keyboard shortcut', async () => {
    const { unmount } = await mountTrayCapture()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(trayCaptureClose).toHaveBeenCalled()

    await unmount()
  })

  it('resets content and sent state when reset callback is invoked', async () => {
    const { container, textarea, button, unmount } = await mountTrayCapture()

    await setTextareaValue(textarea, 'hello')
    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Sent!')
    expect(textarea.value).toBe('')

    await setTextareaValue(textarea, 'new value')
    expect(button.disabled).toBe(true)

    if (!resetCallback) {
      throw new Error('Reset callback was not registered')
    }
    const callback = resetCallback

    await act(async () => {
      callback()
      await Promise.resolve()
    })

    expect(container.textContent).not.toContain('Sent!')
    expect(textarea.value).toBe('')
    expect(button.disabled).toBe(true)

    await unmount()
  })

  it('auto-focuses textarea on mount', async () => {
    const { textarea, unmount } = await mountTrayCapture()

    expect(document.activeElement).toBe(textarea)

    await unmount()
  })
})
