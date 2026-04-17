// @vitest-environment happy-dom
import { act } from 'react'
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

import { OpenInExternal, _resetExternalAppsDetectionCache } from '../../src/renderer/components/common/OpenInExternal'

const mockDetect = vi.fn()
const mockOpenVSCode = vi.fn()
const mockOpenObsidian = vi.fn()
const mockReveal = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  _resetExternalAppsDetectionCache()
  Object.defineProperty(window, 'api', {
    value: {
      detectExternalApps: mockDetect,
      openInVSCode: mockOpenVSCode,
      openInObsidian: mockOpenObsidian,
      revealInFinder: mockReveal
    },
    writable: true
  })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
  mockOpenVSCode.mockResolvedValue(undefined)
  mockOpenObsidian.mockResolvedValue(undefined)
  mockReveal.mockResolvedValue(true)
})

async function flush() {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

async function render(filePath = 'contexts/foo.md') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  await act(async () => {
    root.render(React.createElement(OpenInExternal, { filePath }))
  })
  await flush()
  return { container, root }
}

async function openMenu(container: HTMLElement) {
  const trigger = container.querySelector('button[aria-label="Open in…"]') as HTMLButtonElement
  await act(async () => { trigger.click() })
  await flush()
  return container.querySelector('[role="menu"]') as HTMLElement | null
}

describe('OpenInExternal', () => {
  it('renders nothing when no apps are available', async () => {
    mockDetect.mockResolvedValue({ vscode: false, obsidian: false, finder: false })
    const { container } = await render()
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders a single trigger button when apps are available', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: true, finder: true })
    const { container } = await render()
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].getAttribute('aria-label')).toBe('Open in…')
    expect(buttons[0].getAttribute('title')).toBe('Open in…')
  })

  it('shows menu items only for detected apps', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: false, finder: true })
    const { container } = await render()
    const menu = await openMenu(container)
    expect(menu).not.toBeNull()
    const items = menu!.querySelectorAll('[role="menuitem"]')
    const labels = Array.from(items).map((b) => b.textContent?.trim())
    expect(labels).toContain('Open in VS Code')
    expect(labels).toContain('Reveal in Finder')
    expect(labels).not.toContain('Open in Obsidian')
  })

  it('invokes openInVSCode when its menu item is clicked', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: false, finder: false })
    const { container } = await render('reports/jane/profile.md')
    const menu = await openMenu(container)
    const item = Array.from(menu!.querySelectorAll('[role="menuitem"]')).find((b) => b.textContent?.includes('VS Code')) as HTMLButtonElement
    await act(async () => { item.click() })
    expect(mockOpenVSCode).toHaveBeenCalledWith('reports/jane/profile.md')
  })

  it('invokes openInObsidian when its menu item is clicked', async () => {
    mockDetect.mockResolvedValue({ vscode: false, obsidian: true, finder: false })
    const { container } = await render('contexts/note.md')
    const menu = await openMenu(container)
    const item = Array.from(menu!.querySelectorAll('[role="menuitem"]')).find((b) => b.textContent?.includes('Obsidian')) as HTMLButtonElement
    await act(async () => { item.click() })
    expect(mockOpenObsidian).toHaveBeenCalledWith('contexts/note.md')
  })

  it('invokes revealInFinder when its menu item is clicked', async () => {
    mockDetect.mockResolvedValue({ vscode: false, obsidian: false, finder: true })
    const { container } = await render('weekly-log/2026-04.md')
    const menu = await openMenu(container)
    const item = Array.from(menu!.querySelectorAll('[role="menuitem"]')).find((b) => b.textContent?.includes('Finder')) as HTMLButtonElement
    await act(async () => { item.click() })
    expect(mockReveal).toHaveBeenCalledWith('weekly-log/2026-04.md')
  })

  it('closes the menu after selecting an item', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: false, finder: false })
    const { container } = await render()
    const menu = await openMenu(container)
    const item = menu!.querySelector('[role="menuitem"]') as HTMLButtonElement
    await act(async () => { item.click() })
    await flush()
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })

  it('caches the detection call across multiple instances', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: false, finder: true })
    await render('a.md')
    await render('b.md')
    await render('c.md')
    expect(mockDetect).toHaveBeenCalledTimes(1)
  })

  it('renders an "Open full view" item when onOpenFullView is provided', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: false, finder: false })
    const onFullView = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)
    await act(async () => {
      root.render(React.createElement(OpenInExternal, { filePath: 'a.md', onOpenFullView: onFullView }))
    })
    await flush()
    const menu = await openMenu(container)
    const items = Array.from(menu!.querySelectorAll('[role="menuitem"]'))
    expect(items.map((b) => b.textContent?.trim())).toEqual(['Open full view', 'Open in VS Code'])
    const fullView = items.find((b) => b.textContent?.includes('full view')) as HTMLButtonElement
    await act(async () => { fullView.click() })
    expect(onFullView).toHaveBeenCalled()
  })

  it('renders the trigger when onOpenFullView is provided even with no external apps', async () => {
    mockDetect.mockResolvedValue({ vscode: false, obsidian: false, finder: false })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)
    await act(async () => {
      root.render(React.createElement(OpenInExternal, { filePath: 'a.md', onOpenFullView: vi.fn() }))
    })
    await flush()
    expect(container.querySelector('button[aria-label="Open in…"]')).not.toBeNull()
  })
})
