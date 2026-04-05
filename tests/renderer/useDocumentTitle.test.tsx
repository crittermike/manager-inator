// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import ReactDOM from 'react-dom/client'
import { useDocumentTitle } from '../../src/renderer/hooks/useDocumentTitle'

function TestComponent({ title }: { title: string | undefined }) {
  useDocumentTitle(title)
  return <div data-testid="title">{title ?? 'none'}</div>
}

function DynamicTestComponent() {
  const [title, setTitle] = useState<string | undefined>('Initial')
  useDocumentTitle(title)
  return (
    <div>
      <span data-testid="title">{title ?? 'none'}</span>
      <button data-testid="change" onClick={() => setTitle('Updated')}>change</button>
      <button data-testid="clear" onClick={() => setTitle(undefined)}>clear</button>
    </div>
  )
}

describe('useDocumentTitle', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.title = 'Manager-inator'
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)
  })

  it('sets document title with app name suffix', async () => {
    await act(async () => {
      root.render(<TestComponent title="Today" />)
    })

    expect(document.title).toBe('Today — Manager-inator')
  })

  it('falls back to app name when title is undefined', async () => {
    await act(async () => {
      root.render(<TestComponent title={undefined} />)
    })

    expect(document.title).toBe('Manager-inator')
  })

  it('falls back to app name when title is empty string', async () => {
    await act(async () => {
      root.render(<TestComponent title="" />)
    })

    expect(document.title).toBe('Manager-inator')
  })

  it('updates document title when prop changes', async () => {
    await act(async () => {
      root.render(<DynamicTestComponent />)
    })

    expect(document.title).toBe('Initial — Manager-inator')

    const changeBtn = container.querySelector('[data-testid="change"]') as HTMLButtonElement
    await act(async () => {
      changeBtn.click()
    })

    expect(document.title).toBe('Updated — Manager-inator')
  })

  it('resets to app name when title changes to undefined', async () => {
    await act(async () => {
      root.render(<DynamicTestComponent />)
    })

    expect(document.title).toBe('Initial — Manager-inator')

    const clearBtn = container.querySelector('[data-testid="clear"]') as HTMLButtonElement
    await act(async () => {
      clearBtn.click()
    })

    expect(document.title).toBe('Manager-inator')
  })

  it('resets document title on unmount', async () => {
    await act(async () => {
      root.render(<TestComponent title="Settings" />)
    })

    expect(document.title).toBe('Settings — Manager-inator')

    await act(async () => {
      root.unmount()
    })

    expect(document.title).toBe('Manager-inator')
  })
})
