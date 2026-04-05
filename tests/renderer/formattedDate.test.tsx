// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { FormattedDate } from '../../src/renderer/components/common/FormattedDate'

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

function render(el: React.ReactElement) {
  act(() => {
    createRoot(container).render(el)
  })
}

describe('FormattedDate', () => {
  it('renders a <time> element with datetime attribute for string dates', () => {
    render(<FormattedDate date="2025-06-15" />)
    const time = container.querySelector('time')
    expect(time).toBeTruthy()
    expect(time!.getAttribute('datetime')).toBe('2025-06-15')
  })

  it('renders a <time> element with datetime attribute for Date objects', () => {
    render(<FormattedDate date={new Date(2025, 5, 15)} />)
    const time = container.querySelector('time')
    expect(time).toBeTruthy()
    expect(time!.getAttribute('datetime')).toBe('2025-06-15')
  })

  it('shows full date in title attribute for tooltip', () => {
    render(<FormattedDate date="2025-06-15" />)
    const time = container.querySelector('time')
    expect(time!.getAttribute('title')).toContain('June')
    expect(time!.getAttribute('title')).toContain('15')
    expect(time!.getAttribute('title')).toContain('2025')
  })

  it('applies className prop', () => {
    render(<FormattedDate date="2025-06-15" className="text-xs text-zinc-600" />)
    const time = container.querySelector('time')
    expect(time!.className).toBe('text-xs text-zinc-600')
  })

  it('applies transform function to display text', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15))
    render(<FormattedDate date={new Date(2025, 5, 15)} transform={t => t.toLowerCase()} />)
    const time = container.querySelector('time')
    expect(time!.textContent).toBe('today')
    vi.useRealTimers()
  })

  it('renders relative text for recent dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 16))
    render(<FormattedDate date="2025-06-15" />)
    const time = container.querySelector('time')
    expect(time!.textContent).toBe('Yesterday')
    vi.useRealTimers()
  })

  it('falls back to <span> for invalid date strings', () => {
    render(<FormattedDate date="not-a-date" />)
    const span = container.querySelector('span')
    expect(span).toBeTruthy()
    expect(span!.textContent).toBe('not-a-date')
    expect(container.querySelector('time')).toBeNull()
  })

  it('falls back to empty <span> for invalid Date objects', () => {
    render(<FormattedDate date={new Date('invalid')} />)
    const span = container.querySelector('span')
    expect(span).toBeTruthy()
    expect(span!.textContent).toBe('')
    expect(container.querySelector('time')).toBeNull()
  })

  it('title shows weekday for valid dates', () => {
    render(<FormattedDate date="2025-06-15" />)
    const time = container.querySelector('time')
    expect(time!.getAttribute('title')).toContain('Sunday')
  })

  it('displays absolute date for old dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 5))
    render(<FormattedDate date="2025-01-10" />)
    const time = container.querySelector('time')
    expect(time!.textContent).toContain('Jan')
    expect(time!.textContent).toContain('10')
    expect(time!.textContent).toContain('2025')
    vi.useRealTimers()
  })

  it('omits year from display when same year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 1))
    render(<FormattedDate date="2025-03-10" />)
    const time = container.querySelector('time')
    expect(time!.textContent).toContain('Mar')
    expect(time!.textContent).toContain('10')
    expect(time!.textContent).not.toContain('2025')
    vi.useRealTimers()
  })

  it('className is applied on fallback span too', () => {
    render(<FormattedDate date="bad" className="my-class" />)
    const span = container.querySelector('span')
    expect(span!.className).toBe('my-class')
  })
})
