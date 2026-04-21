// @vitest-environment happy-dom
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Plans } from '../../src/renderer/pages/Plans'
import { ToastProvider } from '../../src/renderer/components/common/Toast'

async function renderPlans() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/plans']}>
        <ToastProvider>
          <Routes>
            <Route path="/plans" element={<Plans />} />
            <Route path="/plans/:slug" element={<div data-testid="detail-route" />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    )
  })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  return { container, root }
}

describe('Plans page', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
  })

  it('shows empty state when no plans exist', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { listPlans: vi.fn().mockResolvedValue([]) },
    })
    const { container } = await renderPlans()
    expect(container.textContent).toContain('No plans yet')
  })

  it('shows existing plans sorted from API response', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listPlans: vi.fn().mockResolvedValue([
          { slug: 'fy26', name: 'FY26 Roadmap', updatedAt: new Date().toISOString() },
          { slug: 'q1', name: 'Q1 Goals', updatedAt: new Date().toISOString() },
        ]),
      },
    })
    const { container } = await renderPlans()
    expect(container.textContent).toContain('FY26 Roadmap')
    expect(container.textContent).toContain('Q1 Goals')
  })

  it('creates a new plan via the inline form and navigates to detail', async () => {
    const create = vi.fn().mockResolvedValue({
      slug: 'my-plan',
      name: 'My Plan',
      iterations: [], people: [], projects: [], assignments: [],
      createdAt: '', updatedAt: '',
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        listPlans: vi.fn().mockResolvedValue([]),
        createPlan: create,
      },
    })
    const { container } = await renderPlans()
    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    expect(input).toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'My Plan')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(create).toHaveBeenCalledWith('My Plan')
    expect(document.querySelector('[data-testid="detail-route"]')).toBeTruthy()
  })

  it('uses fallback name when input is empty', async () => {
    const create = vi.fn().mockResolvedValue({
      slug: 'untitled-plan',
      name: 'Untitled plan',
      iterations: [], people: [], projects: [], assignments: [],
      createdAt: '', updatedAt: '',
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { listPlans: vi.fn().mockResolvedValue([]), createPlan: create },
    })
    const { container } = await renderPlans()
    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await act(async () => { await Promise.resolve() })
    expect(create).toHaveBeenCalledWith('Untitled plan')
  })
})
