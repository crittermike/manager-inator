// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

// ── Mocks ──

const mockNavigate = vi.fn()
let mockSearchParams = new URLSearchParams()
const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
const mockSetActiveFile = vi.fn()
let mockFilename = '2026-03-15-weekly-sync.md'

vi.mock('react-router-dom', () => ({
  useParams: () => ({ filename: mockFilename }),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, vi.fn()]
}))

vi.mock('../../src/renderer/hooks/useData', () => ({
  useSettings: () => ({ settings: { userName: 'Mike' }, loading: false })
}))

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => mockToast
}))

vi.mock('../../src/renderer/hooks/useActiveFile', () => ({
  useActiveFile: () => ({ setActiveFile: mockSetActiveFile, activeFile: null })
}))

vi.mock('../../src/renderer/hooks/useAttachedImages', () => ({
  useAttachedImages: () => ({
    stripImageRefs: (s: string) => s || '',
    getImageUrls: () => []
  })
}))

// Mock window.api
const mockGetFileContent = vi.fn()
const mockCommitFile = vi.fn()
const mockSaveMeetingTitle = vi.fn()
const mockSaveMeetingSpeakers = vi.fn()
const mockListPeople = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    getFileContent: mockGetFileContent,
    commitFile: mockCommitFile,
    saveMeetingTitle: mockSaveMeetingTitle,
    saveMeetingSpeakers: mockSaveMeetingSpeakers,
    listPeople: mockListPeople,
    onDataFilesChanged: undefined,
    onAiStreamReset: () => () => {},
    onAiStreamChunk: () => () => {},
    onAiStreamComplete: () => () => {},
    onAiStreamError: () => () => {},
    onAiToolCall: () => () => {},
    onAiToolResult: () => () => {},
    aiGenerate: vi.fn()
  },
  writable: true
})

import { ContextDetail } from '../../src/renderer/pages/ContextDetail'

describe('ContextDetail', () => {
  let container: HTMLDivElement
  let root: ReactDOM.Root

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = new URLSearchParams()
    mockFilename = '2026-03-15-weekly-sync.md'
    mockListPeople.mockResolvedValue([])
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

  const contextContent = `---
title: Weekly Sync
speakers:
  - Alice
  - Bob
source: meeting
---

## Summary

We discussed the roadmap.

## Raw content

Full transcript here...`

  const reviewContent = `---
title: "FY26 H1: Chanakya"
---

# Performance review: Chanakya

Great quarter with solid delivery.`

  describe('context files (dir=contexts)', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams('dir=contexts')
      mockGetFileContent.mockResolvedValue(contextContent)
    })

    it('shows title with edit button', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      const title = container.querySelector('h1')
      expect(title?.textContent).toContain('Weekly Sync')
      const editBtn = title?.querySelector('button[aria-label="Edit title"]')
      expect(editBtn).not.toBeNull()
    })

    it('shows speakers/attendees section', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      // Should have the attendees area (Users icon + names)
      const speakersText = container.textContent
      expect(speakersText).toContain('Bob')
    })

    it('shows Summary and Raw tabs', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      const buttons = Array.from(container.querySelectorAll('button'))
      const tabLabels = buttons.map(b => b.textContent?.trim())
      expect(tabLabels).toContain('Summary')
      expect(tabLabels).toContain('Raw')
    })

    it('shows date when filename has date prefix', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      expect(container.textContent).toContain('2026-03-15')
    })
  })

  describe('non-context files (reviews, check-ins, preps)', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams('dir=reports/chanakya-valluri/reviews')
      mockFilename = 'fy26-h1.md'
      mockGetFileContent.mockResolvedValue(reviewContent)
    })

    it('shows title without edit button', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      const title = container.querySelector('h1')
      expect(title?.textContent).toContain('FY26 H1: Chanakya')
      const editBtn = title?.querySelector('button[aria-label="Edit title"]')
      expect(editBtn).toBeNull()
    })

    it('does not show Summary/Raw tabs', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      const buttons = Array.from(container.querySelectorAll('button'))
      const tabLabels = buttons.map(b => b.textContent?.trim())
      expect(tabLabels).not.toContain('Summary')
      expect(tabLabels).not.toContain('Raw')
    })

    it('does not show speakers/attendees metadata', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      // The speakers edit button should not exist
      const editSpeakersBtn = container.querySelector('button[aria-label="Edit attendees"]')
      expect(editSpeakersBtn).toBeNull()
      // No "No attendees recorded" text
      expect(container.textContent).not.toContain('No attendees recorded')
    })

    it('renders the file content as markdown', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      expect(container.textContent).toContain('Performance review: Chanakya')
      expect(container.textContent).toContain('Great quarter with solid delivery')
    })

    it('shows edit button for content', async () => {
      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      const editBtn = container.querySelector('button[aria-label="Edit content"]')
      expect(editBtn).not.toBeNull()
    })

    it('saves content to the correct non-context path', async () => {
      mockCommitFile.mockResolvedValue(undefined)

      await act(async () => {
        root.render(<ContextDetail />)
      })
      await act(async () => { await Promise.resolve() })

      // Click edit
      const editBtn = container.querySelector('button[aria-label="Edit content"]') as HTMLButtonElement
      await act(async () => { editBtn.click() })

      // Find textarea and modify
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement
      expect(textarea).not.toBeNull()

      await act(async () => {
        textarea.value = 'Updated review content'
        textarea.dispatchEvent(new Event('change', { bubbles: true }))
      })

      // Save
      const saveBtn = container.querySelector('button[aria-label="Save changes"]') as HTMLButtonElement
      await act(async () => { saveBtn.click() })

      expect(mockCommitFile).toHaveBeenCalledWith(
        'reports/chanakya-valluri/reviews/fy26-h1.md',
        expect.any(String),
        expect.stringContaining('fy26-h1.md')
      )
    })
  })
})
