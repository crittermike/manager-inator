// @vitest-environment happy-dom
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}

const basePeople = [
  {
    slug: 'aaron-cathcart',
    name: 'Aaron Cathcart',
    role: 'Senior Director',
    github: 'aaroncathcart',
    location: 'Seattle, WA',
    relationship: 'Skip-level',
    aliases: [],
    meetingCount: 24,
    lastSeen: '2026-03-30'
  }
]

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ slug: undefined })
}))

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => mockToast
}))

vi.mock('../../src/renderer/hooks/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({ blockerState: 'idle', proceed: vi.fn(), reset: vi.fn() })
}))

vi.mock('../../src/renderer/hooks/useKeyboardShortcut', () => ({
  useKeyboardShortcut: () => {}
}))

vi.mock('../../src/renderer/components/common/ConfirmDialog', () => ({
  ConfirmDialog: () => null
}))

import { People } from '../../src/renderer/pages/People'

type TestApi = {
  listPeople: ReturnType<typeof vi.fn>
  getSettingsOptions: ReturnType<typeof vi.fn>
  findPersonByName: ReturnType<typeof vi.fn>
  getFileContent: ReturnType<typeof vi.fn>
  getPersonMeetings: ReturnType<typeof vi.fn>
  commitFile: ReturnType<typeof vi.fn>
  createReport: ReturnType<typeof vi.fn>
}

let testApi: TestApi

async function renderPeople() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)

  await act(async () => {
    root.render(<People />)
  })

  await act(async () => {
    await Promise.resolve()
  })

  return { container, root }
}

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes(text)) as HTMLButtonElement | null
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!valueSetter) throw new Error('Missing input value setter')

  await act(async () => {
    valueSetter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('People page collision handling', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })

    document.body.innerHTML = ''
    mockNavigate.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()

    testApi = {
      listPeople: vi.fn().mockResolvedValue(basePeople),
      getSettingsOptions: vi.fn().mockResolvedValue({ roles: [], relationships: [] }),
      findPersonByName: vi.fn().mockResolvedValue(null),
      getFileContent: vi.fn().mockImplementation(async (path: string) => {
        if (path === 'people/aaron-cathcart.md') return '# Aaron Cathcart\n\nHUG: https://example.com'
        throw new Error('File not found')
      }),
      getPersonMeetings: vi.fn().mockResolvedValue([]),
      commitFile: vi.fn().mockResolvedValue(undefined),
      createReport: vi.fn().mockResolvedValue('aaron-waggener')
    }

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: testApi
    })
  })

  it('allows creating a different full-name profile when first names collide', async () => {
    const { container, root } = await renderPeople()

    await act(async () => {
      getButtonByText(container, 'Add person')?.click()
    })

    const input = container.querySelector('input[aria-label="Full name"]') as HTMLInputElement
    await setInputValue(input, 'Aaron Waggener')

    await act(async () => {
      getButtonByText(container, 'Create')?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(testApi.findPersonByName).toHaveBeenCalledWith('Aaron Waggener')
    expect(testApi.commitFile).toHaveBeenCalledWith(
      'people/aaron-waggener.md',
      expect.stringContaining('name: Aaron Waggener'),
      'Add person: Aaron Waggener'
    )
    expect(mockToast.error).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('shows the actual conflicting person name in duplicate errors', async () => {
    testApi.findPersonByName = vi.fn().mockResolvedValue('aaron-cathcart')
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: testApi
    })

    const { container, root } = await renderPeople()

    await act(async () => {
      getButtonByText(container, 'Add person')?.click()
    })

    const input = container.querySelector('input[aria-label="Full name"]') as HTMLInputElement
    await setInputValue(input, 'Aaron Waggener')

    await act(async () => {
      getButtonByText(container, 'Create')?.click()
      await Promise.resolve()
    })

    expect(mockToast.error).toHaveBeenCalledWith('A profile for "Aaron Cathcart" already exists')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not render the top-level heading twice in the person detail body', async () => {
    const { container, root } = await renderPeople()

    await act(async () => {
      getButtonByText(container, 'Aaron Cathcart')?.click()
      await Promise.resolve()
    })

    const headings = Array.from(container.querySelectorAll('h1')).map(node => node.textContent?.trim())
    expect(headings.filter(text => text === 'Aaron Cathcart')).toHaveLength(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('renders the selected person header with badge-style metadata and quieter edit action', async () => {
    const { container, root } = await renderPeople()

    await act(async () => {
      getButtonByText(container, 'Aaron Cathcart')?.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Senior Director')
    expect(container.textContent).toContain('@aaroncathcart')
    expect(container.textContent).toContain('Seattle, WA')
    expect(container.textContent).toContain('Skip-level')

    const editButton = getButtonByText(container, 'Edit profile')
    expect(editButton).not.toBeNull()
    expect(editButton?.className).toContain('border')
    expect(editButton?.className).toContain('bg-transparent')

    await act(async () => {
      root.unmount()
    })
  })
})

describe('People search filtering', () => {
  const searchablePeople = [
    {
      slug: 'aaron-cathcart',
      name: 'Aaron Cathcart',
      role: 'Senior Director',
      github: 'aaroncathcart',
      location: 'Seattle, WA',
      relationship: 'Skip-level',
      aliases: ['AC'],
      meetingCount: 24,
      lastSeen: '2026-03-30'
    },
    {
      slug: 'bela-kumar',
      name: 'Bela Kumar',
      role: 'Staff Engineer',
      github: 'belakumar',
      location: 'Austin, TX',
      relationship: 'Direct report',
      aliases: ['BK', 'Bee'],
      meetingCount: 10,
      lastSeen: '2026-03-28'
    },
    {
      slug: 'carla-jones',
      name: 'Carla Jones',
      role: 'Product Manager',
      github: 'carlaj',
      location: 'New York, NY',
      relationship: 'Cross-functional',
      aliases: [],
      meetingCount: 5,
      lastSeen: '2026-03-25'
    }
  ]

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true
    })

    document.body.innerHTML = ''
    mockNavigate.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
    mockToast.info.mockReset()
    mockToast.warning.mockReset()

    testApi = {
      listPeople: vi.fn().mockResolvedValue(searchablePeople),
      getSettingsOptions: vi.fn().mockResolvedValue({ roles: [], relationships: [] }),
      findPersonByName: vi.fn().mockResolvedValue(null),
      getFileContent: vi.fn().mockRejectedValue(new Error('File not found')),
      getPersonMeetings: vi.fn().mockResolvedValue([]),
      commitFile: vi.fn().mockResolvedValue(undefined),
      createReport: vi.fn().mockResolvedValue('test')
    }

    Object.defineProperty(window, 'api', {
      configurable: true,
      value: testApi
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function renderAndSearch(query: string) {
    const { container, root } = await renderPeople()

    const searchInput = container.querySelector('input[aria-label="Search people"]') as HTMLInputElement
    expect(searchInput).not.toBeNull()

    await setInputValue(searchInput, query)

    // Advance past debounce delay (300ms)
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
    })

    const visibleNames = Array.from(container.querySelectorAll('button'))
      .map(b => b.textContent?.trim())
      .filter(t => searchablePeople.some(p => t?.includes(p.name)))

    return { container, root, visibleNames }
  }

  it('filters people by name', async () => {
    const { root, visibleNames } = await renderAndSearch('Bela')
    expect(visibleNames.some(n => n?.includes('Bela Kumar'))).toBe(true)
    expect(visibleNames.some(n => n?.includes('Aaron Cathcart'))).toBe(false)
    expect(visibleNames.some(n => n?.includes('Carla Jones'))).toBe(false)
    await act(async () => { root.unmount() })
  })

  it('filters people by role', async () => {
    const { root, visibleNames } = await renderAndSearch('Staff Engineer')
    expect(visibleNames.some(n => n?.includes('Bela Kumar'))).toBe(true)
    expect(visibleNames.some(n => n?.includes('Aaron Cathcart'))).toBe(false)
    await act(async () => { root.unmount() })
  })

  it('filters people by github handle', async () => {
    const { root, visibleNames } = await renderAndSearch('carlaj')
    expect(visibleNames.some(n => n?.includes('Carla Jones'))).toBe(true)
    expect(visibleNames.some(n => n?.includes('Aaron Cathcart'))).toBe(false)
    expect(visibleNames.some(n => n?.includes('Bela Kumar'))).toBe(false)
    await act(async () => { root.unmount() })
  })

  it('filters people by alias', async () => {
    const { root, visibleNames } = await renderAndSearch('Bee')
    expect(visibleNames.some(n => n?.includes('Bela Kumar'))).toBe(true)
    expect(visibleNames.some(n => n?.includes('Aaron Cathcart'))).toBe(false)
    expect(visibleNames.some(n => n?.includes('Carla Jones'))).toBe(false)
    await act(async () => { root.unmount() })
  })
})
