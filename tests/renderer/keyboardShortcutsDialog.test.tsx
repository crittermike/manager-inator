// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyboardShortcutsDialog } from '../../src/renderer/components/common/KeyboardShortcutsDialog'

let container: HTMLDivElement
let root: ReactDOM.Root
const onClose = vi.fn()

function render(open: boolean) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = ReactDOM.createRoot(container)

  act(() => {
    root.render(<KeyboardShortcutsDialog open={open} onClose={onClose} />)
  })
}

describe('KeyboardShortcutsDialog', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
    onClose.mockReset()
  })

  it('renders nothing when open is false', () => {
    render(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    act(() => { root.unmount() })
  })

  it('renders a dialog when open is true', () => {
    render(true)
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('shortcuts-dialog-title')
    act(() => { root.unmount() })
  })

  it('has a title element linked by aria-labelledby', () => {
    render(true)
    const title = document.getElementById('shortcuts-dialog-title')
    expect(title).not.toBeNull()
    expect(title?.textContent).toBe('Keyboard shortcuts')
    act(() => { root.unmount() })
  })

  it('displays all three shortcut sections', () => {
    render(true)
    const headings = Array.from(document.querySelectorAll('h3')).map(h => h.textContent)
    expect(headings).toContain('General')
    expect(headings).toContain('Chat')
    expect(headings).toContain('Lists')
    act(() => { root.unmount() })
  })

  it('displays expected shortcuts in General section', () => {
    render(true)
    const labels = Array.from(document.querySelectorAll('.text-zinc-400')).map(el => el.textContent)
    expect(labels).toContain('Search')
    expect(labels).toContain('Capture')
    expect(labels).toContain('Settings')
    expect(labels).toContain('Switch views')
    expect(labels).toContain('Submit / save')
    expect(labels).toContain('Show shortcuts')
    act(() => { root.unmount() })
  })

  it('renders kbd elements for shortcut keys', () => {
    render(true)
    const kbds = document.querySelectorAll('kbd')
    expect(kbds.length).toBeGreaterThan(0)
    const kbdTexts = Array.from(kbds).map(k => k.textContent)
    expect(kbdTexts).toContain('cmd+k')
    act(() => { root.unmount() })
  })

  it('calls onClose when clicking the backdrop', () => {
    render(true)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    act(() => {
      dialog.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => { root.unmount() })
  })

  it('does not call onClose when clicking dialog content', () => {
    render(true)
    const content = document.querySelector('.bg-zinc-900') as HTMLElement
    act(() => {
      content.click()
    })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { root.unmount() })
  })

  it('calls onClose when pressing Escape', () => {
    render(true)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalled()
    act(() => { root.unmount() })
  })

  it('has a close button with aria-label', () => {
    render(true)
    const closeBtn = document.querySelector('button[aria-label="Close"]')
    expect(closeBtn).not.toBeNull()
    act(() => {
      (closeBtn as HTMLButtonElement).click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => { root.unmount() })
  })

  it('has aria-hidden on decorative icon', () => {
    render(true)
    const svgs = document.querySelectorAll('svg')
    svgs.forEach(svg => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
    act(() => { root.unmount() })
  })
})
