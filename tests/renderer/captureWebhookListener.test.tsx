// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => mockToast
}))

vi.mock('../../src/renderer/hooks/useData', () => ({
  useTeamOverview: () => ({ overview: { reports: [] }, loading: false, refresh: vi.fn() }),
  useSettings: () => ({ settings: { userName: 'Mike' }, loading: false })
}))

vi.mock('../../src/renderer/hooks/useAI', () => ({
  useAI: () => ({
    streaming: false,
    streamedText: '',
    generate: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves; keep status=processing */ })),
    cancel: vi.fn(),
    reset: vi.fn()
  })
}))

vi.mock('../../src/renderer/hooks/useActiveFile', () => ({
  useActiveFile: () => ({ setActiveFile: vi.fn(), activeFile: null })
}))

Object.defineProperty(window, 'api', {
  value: {
    commitFile: vi.fn().mockResolvedValue(undefined),
    commitBinaryFile: vi.fn().mockResolvedValue(undefined),
    getFileContent: vi.fn().mockResolvedValue(''),
    getOpenActionItemsForPeople: vi.fn().mockResolvedValue([]),
    onDataFilesChanged: undefined,
    onAiFilesChanged: undefined,
  },
  writable: true,
  configurable: true
})

import { CapturePanel } from '../../src/renderer/components/common/CapturePanel'
import { MemoryRouter } from 'react-router-dom'
const Wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

describe('CapturePanel webhook integration', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true, value: true, writable: true,
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = ReactDOM.createRoot(container)
  })

  afterEach(async () => {
    await act(() => root.unmount())
    container.remove()
  })

  it('creates a processing session when webhook-capture-content event fires', async () => {
    await act(async () => {
      root.render(
        <Wrapper>
          <CapturePanel open={true} onClose={vi.fn()} />
        </Wrapper>
      )
    })

    await act(async () => {
      window.dispatchEvent(new CustomEvent('webhook-capture-content', {
        detail: { content: '# Standup\n\nAlice: hi', sourceHint: 'meeting' }
      }))
    })

    // The session list shows the captured content snippet
    expect(container.textContent).toContain('Standup')
  })

  it('runs cleanTranscript on .vtt fileName', async () => {
    await act(async () => {
      root.render(
        <Wrapper>
          <CapturePanel open={true} onClose={vi.fn()} />
        </Wrapper>
      )
    })

    const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
<v Alice>Hello there</v>
`

    await act(async () => {
      window.dispatchEvent(new CustomEvent('webhook-capture-content', {
        detail: { content: vtt, fileName: 'meeting.vtt' }
      }))
    })

    // After cleanup, raw VTT noise like "WEBVTT" and timestamps should be gone
    const text = container.textContent || ''
    expect(text).not.toContain('WEBVTT')
    expect(text).not.toContain('00:00:00.000')
    expect(text).toContain('Hello there')
  })

  it('ignores empty webhook-capture-content events', async () => {
    await act(async () => {
      root.render(
        <Wrapper>
          <CapturePanel open={true} onClose={vi.fn()} />
        </Wrapper>
      )
    })
    const before = container.innerHTML
    await act(async () => {
      window.dispatchEvent(new CustomEvent('webhook-capture-content', { detail: undefined }))
    })
    expect(container.innerHTML).toBe(before)
  })
})
