// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
const mockSetSearchParams = vi.fn()
let currentSearchParams = new URLSearchParams()
let mockSearchResults: Array<{ filename: string; directory: 'contexts' | 'notes' | 'people'; title: string; snippet: string; date?: string; source: 'slack' | 'meeting' | 'other' }> = [
  { filename: '2026-03-18-slack-unblock.md', directory: 'contexts', title: 'Slack unblock', snippet: 'A Slack thread about a blocker', date: '2026-03-18', source: 'slack' },
  { filename: '2026-03-20-weekly-sync.md', directory: 'contexts', title: 'Weekly sync', snippet: 'Meeting notes and follow-ups', date: '2026-03-20', source: 'meeting' },
  { filename: 'weekly-review.md', directory: 'notes', title: 'Weekly review', snippet: 'Private note about the week', date: '2026', source: 'other' }
]

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [currentSearchParams, mockSetSearchParams]
}))

import { SearchPage } from '../../src/renderer/pages/Search'

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll('button')).find(button => button.textContent?.replace(/\s+/g, ' ').trim().includes(text)) as HTMLButtonElement | null
}

async function renderSearchPage() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<SearchPage />)
  })

  return { container, root }
}

async function waitForSearch() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 350))
    await Promise.resolve()
  })
}

describe('SearchPage source filters', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    mockNavigate.mockReset()
    mockSetSearchParams.mockReset()
    currentSearchParams = new URLSearchParams('q=week')

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listContexts: vi.fn().mockResolvedValue([
          { date: '2026-03-20', source: 'meeting', title: 'Weekly sync', filename: '2026-03-20-weekly-sync.md', processed: true }
        ]),
        listPeople: vi.fn().mockResolvedValue([
          { slug: 'alice-smith', name: 'Alice Smith', role: 'Senior Engineer', location: 'Remote', aliases: ['Ali'], relationship: 'Direct Report', meetingCount: 2 }
        ]),
        searchContent: vi.fn().mockImplementation(async () => mockSearchResults)
      }
    })
  })

  it('shows source-specific filters after searching', async () => {
    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const filterButtons = Array.from(container.querySelectorAll('button'))
      .map(button => button.textContent?.replace(/\s+/g, '').trim() || '')
    expect(filterButtons).toEqual(expect.arrayContaining(['All', 'Slack1', 'GitHub0', 'Email0', 'Meeting1', 'Note1', 'People0']))

    await act(async () => {
      root.unmount()
    })
  })

  it('renders source labels on search results', async () => {
    const { container, root } = await renderSearchPage()
    await waitForSearch()

    expect(container.textContent).toContain('Slack unblock')
    expect(container.textContent).toContain('Weekly sync')
    expect(container.textContent).toContain('Weekly review')
    expect(container.textContent).toContain('Slack')
    expect(container.textContent).toContain('Meeting')
    expect(container.textContent).toContain('Note')

    await act(async () => {
      root.unmount()
    })
  })

  it('filters results down to a selected source type', async () => {
    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const noteFilter = getButtonByText(container, 'Note')
    expect(noteFilter).not.toBeNull()

    await act(async () => {
      noteFilter?.click()
    })

    expect(container.textContent).toContain('Weekly review')
    expect(container.textContent).not.toContain('Slack unblock')
    expect(container.textContent).not.toContain('Weekly sync')

    await act(async () => {
      root.unmount()
    })
  })

  it('deduplicates person results returned from both people and content search paths', async () => {
    mockSearchResults = [
      { filename: 'aaron-cathcart.md', directory: 'people', title: 'Aaron Cathcart', snippet: 'Aaron Cathcart aaron-cathcart Senior Director', source: 'other', date: '2026-03-20' }
    ]
    currentSearchParams = new URLSearchParams('q=aaron')

    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const aaronRows = Array.from(container.querySelectorAll('button')).filter(button => button.textContent?.includes('Aaron Cathcart'))
    expect(aaronRows).toHaveLength(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('navigates immediately when a meeting query param is provided', async () => {
    currentSearchParams = new URLSearchParams('meeting=2026-03-20-weekly-sync.md')

    const { root } = await renderSearchPage()

    expect(mockNavigate).toHaveBeenCalledWith('/context/2026-03-20-weekly-sync.md?dir=contexts', { replace: true })

    await act(async () => {
      root.unmount()
    })
  })

  it('prefills the search input from the q param and triggers search', async () => {
    currentSearchParams = new URLSearchParams('q=weekly')
    const searchContent = vi.fn().mockImplementation(async () => mockSearchResults)

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listContexts: vi.fn().mockResolvedValue([
          { date: '2026-03-20', source: 'meeting', title: 'Weekly sync', filename: '2026-03-20-weekly-sync.md', processed: true }
        ]),
        listPeople: vi.fn().mockResolvedValue([
          { slug: 'alice-smith', name: 'Alice Smith', role: 'Senior Engineer', location: 'Remote', aliases: ['Ali'], relationship: 'Direct Report', meetingCount: 2 }
        ]),
        searchContent
      }
    })

    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('weekly')
    expect(searchContent).toHaveBeenCalledWith('weekly')

    await act(async () => {
      root.unmount()
    })
  })

  it('navigates to weekly-log for note results', async () => {
    mockSearchResults = [
      { filename: 'weekly-review.md', directory: 'notes', title: 'Weekly review', snippet: 'Private note about the week', date: '2026', source: 'other' }
    ]
    currentSearchParams = new URLSearchParams('q=review')

    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const noteResult = Array.from(container.querySelectorAll('button[data-search-result]'))
      .find(button => button.textContent?.includes('Weekly review')) as HTMLButtonElement | undefined
    expect(noteResult).not.toBeNull()

    await act(async () => {
      noteResult?.click()
    })

    expect(mockNavigate).toHaveBeenCalledWith('/context/weekly-review.md?dir=weekly-log')

    await act(async () => {
      root.unmount()
    })
  })

  it('deduplicates direct reports returned from both people and content search paths by slug', async () => {
    currentSearchParams = new URLSearchParams('q=alice')

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listContexts: vi.fn().mockResolvedValue([]),
        listPeople: vi.fn().mockResolvedValue([
          { slug: 'alice-smith', name: 'Alice Smith', role: 'Senior Engineer', location: 'Remote', aliases: ['Ali'], relationship: 'Direct Report', meetingCount: 2 }
        ]),
        searchContent: vi.fn().mockResolvedValue([
          { filename: 'alice-smith.md', directory: 'people', title: 'Alice Smith', snippet: 'Alice Smith alice-smith Senior Engineer', date: '2026-03-20', source: 'other' }
        ])
      }
    })

    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const aliceRows = Array.from(container.querySelectorAll('button[data-search-result]')).filter(button => button.textContent?.includes('Alice Smith'))
    expect(aliceRows).toHaveLength(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('deduplicates context results returned from both title matches and content search by filename', async () => {
    currentSearchParams = new URLSearchParams('q=sync')

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listContexts: vi.fn().mockResolvedValue([
          { date: '2026-03-20', source: 'meeting', title: 'Weekly sync', filename: '2026-03-20-weekly-sync.md', processed: true }
        ]),
        listPeople: vi.fn().mockResolvedValue([]),
        searchContent: vi.fn().mockResolvedValue([
          { filename: '2026-03-20-weekly-sync.md', directory: 'contexts', title: 'Weekly sync', snippet: 'Meeting notes and follow-ups', date: '2026-03-20', source: 'meeting' }
        ])
      }
    })

    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const syncRows = Array.from(container.querySelectorAll('button[data-search-result]')).filter(button => button.textContent?.includes('Weekly sync'))
    expect(syncRows).toHaveLength(1)

    const filterButtons = Array.from(container.querySelectorAll('button')).map(button => button.textContent?.replace(/\s+/g, '').trim() || '')
    expect(filterButtons).toEqual(expect.arrayContaining(['Meeting1']))

    await act(async () => {
      root.unmount()
    })
  })
})

describe('SearchPage accessibility', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })
    document.body.innerHTML = ''
    mockNavigate.mockReset()
    mockSetSearchParams.mockReset()
    currentSearchParams = new URLSearchParams()

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listContexts: vi.fn().mockResolvedValue([
          { date: '2026-03-20', source: 'meeting', title: 'Weekly sync', filename: '2026-03-20-weekly-sync.md', processed: true }
        ]),
        listPeople: vi.fn().mockResolvedValue([
          { slug: 'alice-smith', name: 'Alice Smith', role: 'Senior Engineer', location: 'Remote', aliases: ['Ali'], relationship: 'Direct Report', meetingCount: 2, lastSeen: '2026-03-20', github: '' }
        ]),
        searchContent: vi.fn().mockResolvedValue([
          { filename: '2026-03-18-slack-unblock.md', directory: 'contexts', title: 'Slack unblock', snippet: 'A Slack thread about a blocker', date: '2026-03-18', source: 'slack' },
          { filename: '2026-03-20-weekly-sync.md', directory: 'contexts', title: 'Weekly sync', snippet: 'Meeting notes', date: '2026-03-20', source: 'meeting' }
        ])
      }
    })
  })

  it('search input has combobox role and aria-controls pointing to results', async () => {
    const { container, root } = await renderSearchPage()

    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-controls')).toBe('search-results')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')

    await act(async () => { root.unmount() })
  })

  it('results container has listbox role and aria-label', async () => {
    currentSearchParams = new URLSearchParams('q=slack')
    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const listbox = container.querySelector('#search-results')
    expect(listbox).not.toBeNull()
    expect(listbox!.getAttribute('role')).toBe('listbox')
    expect(listbox!.getAttribute('aria-label')).toBe('Search results')

    await act(async () => { root.unmount() })
  })

  it('result items have option role and aria-selected', async () => {
    currentSearchParams = new URLSearchParams('q=slack')
    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const options = container.querySelectorAll('[role="option"]')
    expect(options.length).toBeGreaterThan(0)

    for (const option of Array.from(options)) {
      expect(option.getAttribute('aria-selected')).toBe('false')
    }

    await act(async () => { root.unmount() })
  })

  it('arrow key navigation updates aria-selected and aria-activedescendant', async () => {
    currentSearchParams = new URLSearchParams('q=slack')
    const { container, root } = await renderSearchPage()
    await waitForSearch()

    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-activedescendant')).toBeNull()

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })

    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-0')
    const firstOption = container.querySelector('#search-result-0')
    expect(firstOption?.getAttribute('aria-selected')).toBe('true')

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })

    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-1')
    const secondOption = container.querySelector('#search-result-1')
    expect(secondOption?.getAttribute('aria-selected')).toBe('true')
    expect(firstOption?.getAttribute('aria-selected')).toBe('false')

    await act(async () => { root.unmount() })
  })

  it('aria-expanded reflects whether results are visible', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listContexts: vi.fn().mockResolvedValue([]),
        listPeople: vi.fn().mockResolvedValue([]),
        searchContent: vi.fn().mockResolvedValue([
          { filename: '2026-03-18-slack-unblock.md', directory: 'contexts', title: 'Slack unblock', snippet: 'A Slack thread about a blocker', date: '2026-03-18', source: 'slack' }
        ])
      }
    })

    const { container, root } = await renderSearchPage()

    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(input, 'slack')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await waitForSearch()

    expect(input.getAttribute('aria-expanded')).toBe('true')

    await act(async () => { root.unmount() })
  })

  it('searching indicator is wrapped in an aria-live region', async () => {
    currentSearchParams = new URLSearchParams('q=slack')
    const { container, root } = await renderSearchPage()

    const liveRegion = container.querySelector('[aria-live]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion!.getAttribute('aria-atomic')).toBe('true')

    await act(async () => { root.unmount() })
  })

  it('results container has aria-busy while searching', async () => {
    currentSearchParams = new URLSearchParams('q=test')

    let resolveSearch: (value: unknown[]) => void
    const searchPromise = new Promise<unknown[]>(resolve => { resolveSearch = resolve })

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listContexts: vi.fn().mockResolvedValue([
          { date: '2026-03-20', source: 'meeting', title: 'test meeting', filename: 'test-meeting.md', processed: true }
        ]),
        listPeople: vi.fn().mockResolvedValue([]),
        searchContent: vi.fn().mockReturnValue(searchPromise)
      }
    })

    const { container, root } = await renderSearchPage()

    // Title-match results appear immediately, so listbox renders
    // After debounce fires, searchContent is called and aria-busy should be true
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350))
    })

    const listbox = container.querySelector('#search-results')
    if (listbox) {
      expect(listbox.getAttribute('aria-busy')).toBe('true')
    }

    // Resolve search and verify aria-busy clears
    await act(async () => {
      resolveSearch!([])
      await Promise.resolve()
    })

    const listboxAfter = container.querySelector('#search-results')
    if (listboxAfter) {
      expect(listboxAfter.getAttribute('aria-busy')).toBe('false')
    }

    await act(async () => { root.unmount() })
  })

  it('uses useDebouncedValue — searchContent is not called immediately on keystroke', async () => {
    const searchContent = vi.fn().mockResolvedValue([])

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listContexts: vi.fn().mockResolvedValue([]),
        listPeople: vi.fn().mockResolvedValue([]),
        searchContent
      }
    })

    const { container, root } = await renderSearchPage()
    searchContent.mockClear()

    const input = container.querySelector('input') as HTMLInputElement
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      nativeInputValueSetter?.call(input, 'hello')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Immediately after typing, searchContent should NOT be called
    expect(searchContent).not.toHaveBeenCalled()

    // After debounce delay, it should fire
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350))
    })

    expect(searchContent).toHaveBeenCalledWith('hello')

    await act(async () => { root.unmount() })
  })

  it('people browse view uses listbox with option roles', async () => {
    const { container, root } = await renderSearchPage()

    // Click People filter to show browse view
    const peopleFilter = getButtonByText(container, 'People')
    await act(async () => { peopleFilter?.click() })

    const listbox = container.querySelector('#search-results')
    expect(listbox).not.toBeNull()
    expect(listbox!.getAttribute('role')).toBe('listbox')

    const options = container.querySelectorAll('[role="option"]')
    expect(options.length).toBeGreaterThan(0)
    expect(options[0].textContent).toContain('Alice Smith')

    await act(async () => { root.unmount() })
  })
})
