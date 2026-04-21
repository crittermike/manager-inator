// @vitest-environment happy-dom
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ReactDOM from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlanDetail } from '../../src/renderer/pages/PlanDetail'
import { ToastProvider } from '../../src/renderer/components/common/Toast'
import { TeamOverviewProvider } from '../../src/renderer/hooks/useData'
import type { Plan } from '../../src/shared/types'

const samplePlan = (overrides: Partial<Plan> = {}): Plan => ({
  slug: 'fy26',
  name: 'FY26 Plan',
  iterations: [],
  people: [],
  projects: [],
  assignments: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

let lastSavedPlan: Plan | null = null

async function render(slug = 'fy26') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/plans/${slug}`]}>
        <ToastProvider>
          <TeamOverviewProvider>
            <Routes>
              <Route path="/plans/:slug" element={<PlanDetail />} />
              <Route path="/plans" element={<div data-testid="list-route" />} />
            </Routes>
          </TeamOverviewProvider>
        </ToastProvider>
      </MemoryRouter>
    )
  })
  // Allow load + render passes to flush
  for (let i = 0; i < 5; i++) {
    await act(async () => { await Promise.resolve() })
  }
  return { container, root }
}

describe('PlanDetail page', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    document.body.innerHTML = ''
    lastSavedPlan = null
  })

  function installApi(plan: Plan | null, save?: (p: Plan) => Promise<void>) {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getPlan: vi.fn().mockResolvedValue(plan),
        savePlan: vi.fn(async (p: Plan) => {
          lastSavedPlan = p
          if (save) await save(p)
        }),
        deletePlan: vi.fn().mockResolvedValue(undefined),
        getTeamOverview: vi.fn().mockResolvedValue({ reports: [] }),
      },
    })
  }

  it('renders not-found message when plan is missing', async () => {
    installApi(null)
    const { container } = await render('missing')
    expect(container.textContent).toContain('Plan not found')
  })

  it('renders plan name and empty grid prompts', async () => {
    installApi(samplePlan({ name: 'My Roadmap' }))
    const { container } = await render()
    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement
    expect(titleInput.value).toBe('My Roadmap')
    expect(container.textContent).toContain('No iterations yet')
    expect(container.textContent).toContain('No people on this plan yet')
  })

  it('adds an iteration with two default columns', async () => {
    vi.useFakeTimers()
    installApi(samplePlan())
    const { container } = await render()
    const addItBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('+ Iteration'))!
    await act(async () => { addItBtn.click() })
    // Drain debounced save (600ms)
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(lastSavedPlan?.iterations).toHaveLength(1)
    expect(lastSavedPlan?.iterations[0].columns).toHaveLength(2)
    vi.useRealTimers()
  })

  it('adds a project with auto-assigned color and counts planned/estimated', async () => {
    vi.useFakeTimers()
    installApi(samplePlan({
      iterations: [{ id: 'it1', columns: [{ id: 'c1', label: 'W1' }, { id: 'c2', label: 'W2' }] }],
      people: [{ id: 'pe1', name: 'Steve' }],
    }))
    const { container } = await render()
    const addProjBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === '+ Add project')!
    await act(async () => { addProjBtn.click() })
    await act(async () => { await vi.advanceTimersByTimeAsync(700) })
    expect(lastSavedPlan?.projects).toHaveLength(1)
    expect(lastSavedPlan?.projects[0].color).toBe('amber')
    vi.useRealTimers()
  })

  it('counts planned weeks correctly per project', async () => {
    installApi(samplePlan({
      iterations: [{ id: 'it1', columns: [{ id: 'c1', label: 'W1' }, { id: 'c2', label: 'W2' }] }],
      people: [{ id: 'pe1', name: 'Steve' }],
      projects: [{ id: 'pr1', name: 'Foo', color: 'amber', estWeeks: 4 }],
      assignments: [
        { personId: 'pe1', columnId: 'c1', projectId: 'pr1' },
        { personId: 'pe1', columnId: 'c2', projectId: 'pr1' },
      ],
    }))
    const { container } = await render()
    expect(container.textContent).toContain('2 / 4 wk')
  })
})
