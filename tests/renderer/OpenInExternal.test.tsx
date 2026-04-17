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

describe('OpenInExternal', () => {
  it('renders nothing when no apps are available', async () => {
    mockDetect.mockResolvedValue({ vscode: false, obsidian: false, finder: false })
    const { container } = await render()
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders only buttons for detected apps', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: false, finder: true })
    const { container } = await render()
    expect(container.querySelector('button[aria-label="Open in VS Code"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Open in Obsidian"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Reveal in Finder"]')).not.toBeNull()
  })

  it('renders all three when everything is detected', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: true, finder: true })
    const { container } = await render()
    expect(container.querySelectorAll('button').length).toBe(3)
  })

  it('invokes openInVSCode with the filePath when clicked', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: false, finder: false })
    const { container } = await render('reports/jane/profile.md')
    const btn = container.querySelector('button[aria-label="Open in VS Code"]') as HTMLButtonElement
    await act(async () => { btn.click() })
    expect(mockOpenVSCode).toHaveBeenCalledWith('reports/jane/profile.md')
  })

  it('invokes openInObsidian with the filePath when clicked', async () => {
    mockDetect.mockResolvedValue({ vscode: false, obsidian: true, finder: false })
    const { container } = await render('contexts/note.md')
    const btn = container.querySelector('button[aria-label="Open in Obsidian"]') as HTMLButtonElement
    await act(async () => { btn.click() })
    expect(mockOpenObsidian).toHaveBeenCalledWith('contexts/note.md')
  })

  it('invokes revealInFinder when clicked', async () => {
    mockDetect.mockResolvedValue({ vscode: false, obsidian: false, finder: true })
    const { container } = await render('weekly-log/2026-04.md')
    const btn = container.querySelector('button[aria-label="Reveal in Finder"]') as HTMLButtonElement
    await act(async () => { btn.click() })
    expect(mockReveal).toHaveBeenCalledWith('weekly-log/2026-04.md')
  })

  it('caches the detection call across multiple instances', async () => {
    mockDetect.mockResolvedValue({ vscode: true, obsidian: false, finder: true })
    await render('a.md')
    await render('b.md')
    await render('c.md')
    expect(mockDetect).toHaveBeenCalledTimes(1)
  })
})
