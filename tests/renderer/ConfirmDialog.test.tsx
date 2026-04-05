// @vitest-environment happy-dom
import React, { act, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'
import { ConfirmDialog } from '../../src/renderer/components/common/ConfirmDialog'

function ControlledDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>>) {
  const [open, setOpen] = useState(true)
  return (
    <ConfirmDialog
      open={open}
      title="Delete item?"
      message="This action cannot be undone."
      onConfirm={() => { props.onConfirm?.(); setOpen(false) }}
      onCancel={() => { props.onCancel?.(); setOpen(false) }}
      {...props}
      // Keep controlled state
    />
  )
}

describe('ConfirmDialog', () => {
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

  it('renders nothing when open is false', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={false}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders dialog with title and message when open', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Delete item?"
          message="This action cannot be undone."
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.getAttribute('aria-modal')).toBe('true')
    expect(container.querySelector('#dialog-title')!.textContent).toBe('Delete item?')
    expect(container.textContent).toContain('This action cannot be undone.')
  })

  it('uses default button labels', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    const buttons = container.querySelectorAll('button')
    const buttonTexts = Array.from(buttons).map(b => b.textContent)
    expect(buttonTexts).toContain('Confirm')
    expect(buttonTexts).toContain('Cancel')
  })

  it('uses custom button labels', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          confirmLabel="Yes, delete"
          cancelLabel="No, keep"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    const buttons = container.querySelectorAll('button')
    const buttonTexts = Array.from(buttons).map(b => b.textContent)
    expect(buttonTexts).toContain('Yes, delete')
    expect(buttonTexts).toContain('No, keep')
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    // Find the confirm button (last button in the actions row)
    const buttons = container.querySelectorAll('button')
    const confirmBtn = Array.from(buttons).find(b => b.textContent === 'Confirm')!
    await act(async () => { confirmBtn.click() })

    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    const cancelBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Cancel')!
    await act(async () => { cancelBtn.click() })

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when Escape key is pressed', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when backdrop is clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    // The backdrop is the outer fixed div
    const backdrop = container.querySelector('.fixed')!
    await act(async () => { (backdrop as HTMLElement).click() })

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('does not call onCancel when dialog content is clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    // Click the dialog body (not the backdrop)
    const dialog = container.querySelector('[role="dialog"]')!
    await act(async () => { (dialog as HTMLElement).click() })

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel when close button (X) is clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    const closeBtn = container.querySelector('[aria-label="Close dialog"]')!
    await act(async () => { (closeBtn as HTMLElement).click() })

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('has correct ARIA attributes', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Test Title"
          message="Test message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('dialog-title')
    expect(container.querySelector('#dialog-title')!.textContent).toBe('Test Title')
  })

  it('renders danger variant with different styling', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          variant="danger"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    // Danger variant should have the danger background class on the confirm button
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Confirm')!
    expect(confirmBtn.className).toContain('bg-danger')
  })

  it('cleans up keydown listener on close', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    // Close the dialog
    await act(async () => {
      root.render(
        <ConfirmDialog
          open={false}
          title="Title"
          message="Message"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )
    })

    // Press Escape — should not call onCancel again
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(onCancel).not.toHaveBeenCalled()
  })
})
