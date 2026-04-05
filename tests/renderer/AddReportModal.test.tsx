// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddReportModal } from '../../src/renderer/components/layout/AddReportModal'
import { ToastProvider } from '../../src/renderer/components/common/Toast'

const mockOnClose = vi.fn()
const mockOnCreated = vi.fn()

async function renderModal(open = true) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<ToastProvider><AddReportModal open={open} onClose={mockOnClose} onCreated={mockOnCreated} /></ToastProvider>)
  })

  await act(async () => {
    await Promise.resolve()
  })

  return { container, root }
}

describe('AddReportModal chrome', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })

    document.body.innerHTML = ''
    mockOnClose.mockReset()
    mockOnCreated.mockReset()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getSettingsOptions: vi.fn().mockResolvedValue({ roles: ['Senior Engineer'] }),
        createReport: vi.fn().mockResolvedValue('jane-smith')
      }
    })
  })

  it('renders the refined backdrop, panel shell, and field chrome', async () => {
    const { container, root } = await renderModal(true)

    const backdrop = container.querySelector('.backdrop-blur-sm') as HTMLDivElement | null
    expect(backdrop).not.toBeNull()

    const panel = Array.from(container.querySelectorAll('div')).find(node => node.className.includes('rounded-3xl')) as HTMLDivElement | undefined
    expect(panel?.className).toContain('bg-zinc-950/95')
    expect(panel?.textContent).toContain('Create the profile now, fill in anything else later.')

    const nameInput = container.querySelector('input#report-name') as HTMLInputElement | null
    expect(nameInput?.className).toContain('shadow-inner')
    expect(nameInput?.className).toContain('focus:ring-brand/15')

    await act(async () => {
      root.unmount()
    })
  })
})
