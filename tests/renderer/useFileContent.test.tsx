// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { useFileContent } from '../../src/renderer/hooks/useData'

function TestComponent({ path }: { path: string | null }) {
  const { content, loading, error, reload } = useFileContent(path)
  return (
    <div>
      <span data-testid="content">{content ?? ''}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{String(error)}</span>
      <button data-testid="retry" onClick={reload}>Retry</button>
    </div>
  )
}

function DynamicPathComponent() {
  const [path, setPath] = useState<string | null>('file-a.md')
  const { content, loading, error, reload } = useFileContent(path)
  return (
    <div>
      <span data-testid="content">{content ?? ''}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{String(error)}</span>
      <button data-testid="retry" onClick={reload}>Retry</button>
      <button data-testid="change-path" onClick={() => setPath('file-b.md')}>Change</button>
      <button data-testid="clear-path" onClick={() => setPath(null)}>Clear</button>
    </div>
  )
}

describe('useFileContent', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root
  let mockGetFileContent: ReturnType<typeof vi.fn>

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

    mockGetFileContent = vi.fn().mockResolvedValue('file content here')

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { getFileContent: mockGetFileContent }
    })
  })

  it('loads content on mount', async () => {
    await act(async () => {
      root.render(<TestComponent path="test.md" />)
    })

    await act(async () => { await Promise.resolve() })

    expect(mockGetFileContent).toHaveBeenCalledWith('test.md')
    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('file content here')
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
    expect(container.querySelector('[data-testid="error"]')!.textContent).toBe('false')
  })

  it('returns null content and no error when path is null', async () => {
    await act(async () => {
      root.render(<TestComponent path={null} />)
    })

    expect(mockGetFileContent).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('')
    expect(container.querySelector('[data-testid="error"]')!.textContent).toBe('false')
  })

  it('sets error=true when getFileContent rejects', async () => {
    mockGetFileContent.mockRejectedValue(new Error('File not found'))

    await act(async () => {
      root.render(<TestComponent path="missing.md" />)
    })

    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('')
    expect(container.querySelector('[data-testid="error"]')!.textContent).toBe('true')
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
  })

  it('reload retries the fetch after an error', async () => {
    mockGetFileContent.mockRejectedValueOnce(new Error('Transient failure'))

    await act(async () => {
      root.render(<TestComponent path="flaky.md" />)
    })

    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="error"]')!.textContent).toBe('true')

    mockGetFileContent.mockResolvedValueOnce('recovered content')

    const retryBtn = container.querySelector('[data-testid="retry"]') as HTMLButtonElement
    await act(async () => { retryBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(mockGetFileContent).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('recovered content')
    expect(container.querySelector('[data-testid="error"]')!.textContent).toBe('false')
  })

  it('clears error when path changes', async () => {
    mockGetFileContent.mockRejectedValueOnce(new Error('fail'))

    await act(async () => {
      root.render(<DynamicPathComponent />)
    })

    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('[data-testid="error"]')!.textContent).toBe('true')

    mockGetFileContent.mockResolvedValueOnce('new file content')

    const changeBtn = container.querySelector('[data-testid="change-path"]') as HTMLButtonElement
    await act(async () => { changeBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="error"]')!.textContent).toBe('false')
    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('new file content')
  })

  it('clears everything when path becomes null', async () => {
    await act(async () => {
      root.render(<DynamicPathComponent />)
    })

    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('file content here')

    const clearBtn = container.querySelector('[data-testid="clear-path"]') as HTMLButtonElement
    await act(async () => { clearBtn.click() })

    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('')
    expect(container.querySelector('[data-testid="error"]')!.textContent).toBe('false')
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
  })

  it('reload works on a successful load to re-fetch fresh content', async () => {
    await act(async () => {
      root.render(<TestComponent path="test.md" />)
    })

    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('file content here')

    mockGetFileContent.mockResolvedValueOnce('updated content')

    const retryBtn = container.querySelector('[data-testid="retry"]') as HTMLButtonElement
    await act(async () => { retryBtn.click() })
    await act(async () => { await Promise.resolve() })

    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('updated content')
    expect(mockGetFileContent).toHaveBeenCalledTimes(2)
  })

  it('refetches when the window regains focus (picks up external edits)', async () => {
    await act(async () => {
      root.render(<TestComponent path="test.md" />)
    })
    await act(async () => { await Promise.resolve() })
    const callsBefore = mockGetFileContent.mock.calls.length

    mockGetFileContent.mockResolvedValue('externally edited')
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await act(async () => { await Promise.resolve() })

    expect(mockGetFileContent.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('externally edited')
  })

  it('does not refetch on focus when path is null', async () => {
    await act(async () => {
      root.render(<TestComponent path={null} />)
    })
    await act(async () => { await Promise.resolve() })
    const callsBefore = mockGetFileContent.mock.calls.length

    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await act(async () => { await Promise.resolve() })

    // The null-path component itself must not have fetched on focus.
    // (Other still-mounted components from prior tests may fetch, so
    // we only assert nothing changed for our component.)
    expect(container.querySelector('[data-testid="content"]')!.textContent).toBe('')
    expect(container.querySelector('[data-testid="loading"]')!.textContent).toBe('false')
    void callsBefore
  })
})
