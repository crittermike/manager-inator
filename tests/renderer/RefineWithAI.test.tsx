// @vitest-environment happy-dom
import React, { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

const mockGenerate = vi.fn()
const mockReset = vi.fn()
const mockCancel = vi.fn()

vi.mock('../../src/renderer/hooks/useAI', () => ({
  useAI: () => ({
    streaming: false,
    streamedText: '',
    error: null,
    generate: mockGenerate,
    cancel: mockCancel,
    reset: mockReset,
    fullTextRef: { current: '' },
    requestIdRef: { current: null },
  }),
}))

const successToast = vi.fn()
const errorToast = vi.fn()
vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => ({ success: successToast, error: errorToast, info: vi.fn(), warning: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const mockCommitFile = vi.fn()
Object.defineProperty(globalThis.window, 'api', {
  configurable: true,
  writable: true,
  value: { commitFile: mockCommitFile },
})

import { RefineWithAI } from '../../src/renderer/components/common/RefineWithAI'

function setReactValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function findButtonByText(text: string): HTMLButtonElement {
  const btn = Array.from(document.querySelectorAll('button')).find(
    b => b.textContent?.trim() === text || b.textContent?.includes(text)
  )
  if (!btn) {
    const all = Array.from(document.querySelectorAll('button')).map(b => `[${b.textContent?.trim()}]`).join(', ')
    throw new Error(`Could not find button with text: "${text}". Buttons found: ${all}`)
  }
  return btn as HTMLButtonElement
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('RefineWithAI', () => {
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
    mockGenerate.mockReset()
    mockReset.mockReset()
    mockCancel.mockReset()
    mockCommitFile.mockReset()
    successToast.mockReset()
    errorToast.mockReset()
  })

  it('renders the trigger button without showing the modal', async () => {
    await act(async () => {
      root.render(<RefineWithAI filePath="contexts/x.md" currentContent="hello" onSaved={vi.fn()} />)
    })
    expect(container.querySelector('button[aria-label="Refine with AI"]')).not.toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens the modal when the trigger is clicked', async () => {
    await act(async () => {
      root.render(<RefineWithAI filePath="contexts/x.md" currentContent="hello" onSaved={vi.fn()} />)
    })
    await act(async () => {
      ;(container.querySelector('button[aria-label="Refine with AI"]') as HTMLButtonElement).click()
    })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector('textarea')).not.toBeNull()
  })

  it('disables Generate when instruction is empty', async () => {
    await act(async () => {
      root.render(<RefineWithAI filePath="contexts/x.md" currentContent="hello" onSaved={vi.fn()} />)
    })
    await act(async () => {
      ;(container.querySelector('button[aria-label="Refine with AI"]') as HTMLButtonElement).click()
    })
    expect(findButtonByText('Generate').disabled).toBe(true)
  })

  it('calls AI generate with the instruction and current content, then shows diff with Accept', async () => {
    mockGenerate.mockResolvedValue('hello\nNEW LINE')
    await act(async () => {
      root.render(<RefineWithAI filePath="contexts/x.md" currentContent="hello" documentType="context" onSaved={vi.fn()} />)
    })
    await act(async () => {
      ;(container.querySelector('button[aria-label="Refine with AI"]') as HTMLButtonElement).click()
    })
    await act(async () => { setReactValue(document.querySelector('textarea') as HTMLTextAreaElement, 'add a NEW LINE') })
    await act(async () => { findButtonByText('Generate').click() })
    await flush()
    expect(mockGenerate).toHaveBeenCalledWith('refine-document', expect.objectContaining({
      currentContent: 'hello',
      instruction: 'add a NEW LINE',
      documentType: 'context',
    }))
    expect(document.body.textContent).toContain('NEW LINE')
    expect(findButtonByText('Accept')).toBeTruthy()
  })

  it('Accept calls commitFile and onSaved', async () => {
    mockGenerate.mockResolvedValue('updated content')
    mockCommitFile.mockResolvedValue(undefined)
    const onSaved = vi.fn()
    await act(async () => {
      root.render(<RefineWithAI filePath="contexts/x.md" currentContent="old content" onSaved={onSaved} />)
    })
    await act(async () => {
      ;(container.querySelector('button[aria-label="Refine with AI"]') as HTMLButtonElement).click()
    })
    await act(async () => { setReactValue(document.querySelector('textarea') as HTMLTextAreaElement, 'do the thing') })
    await act(async () => { findButtonByText('Generate').click() })
    await flush()
    await act(async () => { findButtonByText('Accept').click() })
    await flush()
    expect(mockCommitFile).toHaveBeenCalledWith(
      'contexts/x.md',
      'updated content',
      expect.stringContaining('Refine via AI')
    )
    expect(onSaved).toHaveBeenCalledWith('updated content')
  })

  it('uses onSaveOverride instead of commitFile when provided', async () => {
    mockGenerate.mockResolvedValue('refined section')
    const customSave = vi.fn().mockResolvedValue(undefined)
    const onSaved = vi.fn()
    await act(async () => {
      root.render(
        <RefineWithAI
          filePath="reports/x/profile.md"
          currentContent="original section"
          onSaved={onSaved}
          onSaveOverride={customSave}
        />
      )
    })
    await act(async () => {
      ;(container.querySelector('button[aria-label="Refine with AI"]') as HTMLButtonElement).click()
    })
    await act(async () => { setReactValue(document.querySelector('textarea') as HTMLTextAreaElement, 'fix it') })
    await act(async () => { findButtonByText('Generate').click() })
    await flush()
    await act(async () => { findButtonByText('Accept').click() })
    await flush()
    expect(customSave).toHaveBeenCalledWith('refined section')
    expect(mockCommitFile).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith('refined section')
  })

  it('Reject closes the dialog without saving', async () => {
    mockGenerate.mockResolvedValue('something else')
    const onSaved = vi.fn()
    await act(async () => {
      root.render(<RefineWithAI filePath="x.md" currentContent="orig" onSaved={onSaved} />)
    })
    await act(async () => {
      ;(container.querySelector('button[aria-label="Refine with AI"]') as HTMLButtonElement).click()
    })
    await act(async () => { setReactValue(document.querySelector('textarea') as HTMLTextAreaElement, 'do it') })
    await act(async () => { findButtonByText('Generate').click() })
    await flush()
    await act(async () => { findButtonByText('Reject').click() })
    expect(mockCommitFile).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('strips a wrapping markdown code fence from AI output before saving', async () => {
    mockGenerate.mockResolvedValue('```markdown\nclean content\n```')
    mockCommitFile.mockResolvedValue(undefined)
    const onSaved = vi.fn()
    await act(async () => {
      root.render(<RefineWithAI filePath="x.md" currentContent="original" onSaved={onSaved} />)
    })
    await act(async () => {
      ;(container.querySelector('button[aria-label="Refine with AI"]') as HTMLButtonElement).click()
    })
    await act(async () => { setReactValue(document.querySelector('textarea') as HTMLTextAreaElement, 'rewrite') })
    await act(async () => { findButtonByText('Generate').click() })
    await flush()
    await act(async () => { findButtonByText('Accept').click() })
    await flush()
    expect(mockCommitFile).toHaveBeenCalledWith('x.md', 'clean content', expect.any(String))
  })
})
