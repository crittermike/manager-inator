// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddPersonModal } from '../../src/renderer/components/layout/AddPersonModal'
import { ToastProvider } from '../../src/renderer/components/common/Toast'

const mockOnClose = vi.fn()
const mockOnCreated = vi.fn()
const mockCreatePerson = vi.fn()

async function renderModal(props: { open?: boolean; initialName?: string; initialRelationship?: string } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(
      <ToastProvider>
        <AddPersonModal
          open={props.open ?? true}
          onClose={mockOnClose}
          onCreated={mockOnCreated}
          initialName={props.initialName}
          initialRelationship={props.initialRelationship}
        />
      </ToastProvider>
    )
  })

  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  return { container, root }
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll('button')).find(
    b => b.textContent?.trim().toLowerCase().includes(text.toLowerCase())
  ) as HTMLButtonElement | null
}

describe('AddPersonModal', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
    document.body.innerHTML = ''
    mockOnClose.mockReset()
    mockOnCreated.mockReset()
    mockCreatePerson.mockReset()
    mockCreatePerson.mockResolvedValue('alex-park')

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getSettingsOptions: vi.fn().mockResolvedValue({ roles: ['EM', 'PM'], relationships: [] }),
        createPerson: mockCreatePerson,
      },
    })
  })

  it('renders the dialog with required fields', async () => {
    const { container, root } = await renderModal()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(container.querySelector('#person-name')).not.toBeNull()
    expect(container.textContent).toContain('Relationship')
    await act(async () => { root.unmount() })
  })

  it('returns nothing when open=false', async () => {
    const { container, root } = await renderModal({ open: false })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('disables submit when name is empty', async () => {
    const { container, root } = await renderModal()
    const submit = findButtonByText(container, 'Add person')
    expect(submit?.disabled).toBe(true)
    await act(async () => { root.unmount() })
  })

  it('calls createPerson and fires onCreated on submit', async () => {
    const { container, root } = await renderModal({ initialName: 'Alex Park' })
    const submit = findButtonByText(container, 'Add person')
    expect(submit).not.toBeNull()
    expect(submit?.disabled).toBe(false)

    await act(async () => { submit!.click() })
    await act(async () => { await Promise.resolve() })

    expect(mockCreatePerson).toHaveBeenCalledWith('Alex Park', expect.objectContaining({ relationship: 'Peer Manager' }))
    expect(mockOnCreated).toHaveBeenCalledWith('alex-park')
    expect(mockOnClose).toHaveBeenCalled()
    await act(async () => { root.unmount() })
  })

  it('shows error message when createPerson rejects', async () => {
    mockCreatePerson.mockRejectedValueOnce(new Error('Person already exists'))
    const { container, root } = await renderModal({ initialName: 'Dup Name' })
    const submit = findButtonByText(container, 'Add person')

    await act(async () => { submit!.click() })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    expect(container.textContent).toContain('Person already exists')
    expect(mockOnCreated).not.toHaveBeenCalled()
    await act(async () => { root.unmount() })
  })

  it('honors initialRelationship', async () => {
    const { container, root } = await renderModal({ initialName: 'Tara Lin', initialRelationship: 'Mentor' })
    const submit = findButtonByText(container, 'Add person')

    await act(async () => { submit!.click() })
    await act(async () => { await Promise.resolve() })

    expect(mockCreatePerson).toHaveBeenCalledWith('Tara Lin', expect.objectContaining({ relationship: 'Mentor' }))
    await act(async () => { root.unmount() })
  })
})
