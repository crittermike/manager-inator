// @vitest-environment happy-dom
/**
 * Bug #26 regression: Delete should use single confirmation (ConfirmDialog),
 * not double confirmation (inline Yes/No + ConfirmDialog popup).
 */
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

vi.mock('../../src/renderer/hooks/useData', () => ({
  useFileContent: () => ({ content: '# Check-in content', loading: false })
}))

vi.mock('../../src/renderer/components/common/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() })
}))

import { StreamEntryCard } from '../../src/renderer/components/report/StreamEntryCard'

describe('Bug #26: StreamEntryCard delete uses single confirmation', () => {
  const mockOnToggle = vi.fn()
  const mockOnViewContent = vi.fn()
  const mockOnToggleAction = vi.fn()
  const mockOnRetryContent = vi.fn()
  const mockOnCloseContent = vi.fn()
  const mockOnCopyContent = vi.fn()
  const mockOnEditContent = vi.fn()
  const mockOnDeleteContent = vi.fn()
  const mockOnSaveContent = vi.fn()
  const mockOnCancelEdit = vi.fn()
  const mockOnUpdateFeedback = vi.fn()
  const mockOnDeleteFeedback = vi.fn()

  const checkinEntry = {
    id: 'checkin-2026-03',
    type: 'checkin' as const,
    date: '2026-03-01',
    title: 'Monthly check-in — 2026-03',
    preview: 'Check-in preview',
    data: { date: '2026-03', content: '# March check-in' }
  }

  const reviewEntry = {
    id: 'review-2026-H1',
    type: 'review' as const,
    date: '2026-04-01',
    title: 'Performance review — 2026-H1',
    preview: 'Review preview',
    data: { period: '2026-H1', content: '# H1 Review' }
  }

  const prepEntry = {
    id: 'prep-2026-04-07',
    type: 'prep' as const,
    date: '2026-04-07',
    title: '1:1 Prep — 2026-04-07',
    preview: 'Prep preview',
    data: { date: '2026-04-07', content: '# Prep notes' }
  }

  function renderCard(entry: typeof checkinEntry | typeof reviewEntry | typeof prepEntry) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    act(() => {
      root.render(
        <StreamEntryCard
          entry={entry}
          expanded={true}
          onToggle={mockOnToggle}
          name="alice-smith"
          onViewContent={mockOnViewContent}
          onToggleAction={mockOnToggleAction}
          isToggling={null}
          isViewing={false}
          viewingPath={null}
          viewingTitle={null}
          fileContent={null}
          fileLoading={false}
          fileError={undefined}
          onRetryContent={mockOnRetryContent}
          onCloseContent={mockOnCloseContent}
          onCopyContent={mockOnCopyContent}
          copied={false}
          isEditing={false}
          onEditContent={mockOnEditContent}
          onDeleteContent={mockOnDeleteContent}
          onSaveContent={mockOnSaveContent}
          onCancelEdit={mockOnCancelEdit}
          onUpdateFeedback={mockOnUpdateFeedback}
          onDeleteFeedback={mockOnDeleteFeedback}
        />
      )
    })

    return { container, root }
  }

  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true })
    document.body.innerHTML = ''
    mockOnDeleteContent.mockReset()
    mockOnDeleteFeedback.mockReset()
  })

  it('clicking delete on check-in calls onDeleteContent immediately (no inline confirm)', async () => {
    const { container, root } = renderCard(checkinEntry)

    const deleteButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.getAttribute('aria-label') === 'Delete')
    expect(deleteButton).toBeDefined()

    await act(async () => { deleteButton?.click() })

    expect(mockOnDeleteContent).toHaveBeenCalledWith('reports/alice-smith/check-ins/monthly/2026-03.md')

    // No inline Yes/No buttons should exist
    const yesBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Yes')
    expect(yesBtn).toBeUndefined()

    await act(async () => { root.unmount() })
  })

  it('clicking delete on review calls onDeleteContent immediately (no inline confirm)', async () => {
    const { container, root } = renderCard(reviewEntry)

    const deleteButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.getAttribute('aria-label') === 'Delete')
    expect(deleteButton).toBeDefined()

    await act(async () => { deleteButton?.click() })

    expect(mockOnDeleteContent).toHaveBeenCalledWith('reports/alice-smith/reviews/2026-H1.md')

    const yesBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Yes')
    expect(yesBtn).toBeUndefined()

    await act(async () => { root.unmount() })
  })

  it('clicking delete on prep calls onDeleteContent immediately (no inline confirm)', async () => {
    const { container, root } = renderCard(prepEntry)

    const deleteButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.getAttribute('aria-label') === 'Delete')
    expect(deleteButton).toBeDefined()

    await act(async () => { deleteButton?.click() })

    expect(mockOnDeleteContent).toHaveBeenCalledWith('reports/alice-smith/prep/2026-04-07.md')

    const yesBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Yes')
    expect(yesBtn).toBeUndefined()

    await act(async () => { root.unmount() })
  })
})
