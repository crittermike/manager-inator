// @vitest-environment happy-dom
import React, { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReactDOM from 'react-dom/client'

// Mock useAI before importing the provider
const mockGenerate = vi.fn().mockResolvedValue('response')
const mockCancel = vi.fn().mockResolvedValue(undefined)
const mockReset = vi.fn()

vi.mock('../../src/renderer/hooks/useAI', () => ({
  useAI: () => ({
    streaming: false,
    streamedText: '',
    error: null,
    generate: mockGenerate,
    cancel: mockCancel,
    reset: mockReset,
    fullTextRef: { current: '' },
    requestIdRef: { current: null },
  }),
}))

// Mock window.api minimally
const onAiStreamResetUnsub = vi.fn()
;(globalThis as Record<string, unknown>).window = globalThis.window || {}
Object.defineProperty(globalThis.window, 'api', {
  configurable: true,
  value: {
    onAiStreamReset: vi.fn(() => onAiStreamResetUnsub),
  },
})

import { ChatProvider, useChatSessions } from '../../src/renderer/hooks/useChatSessions'

// Helper component that exposes context values for testing
function TestConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useChatSessions>) => void }) {
  const ctx = useChatSessions()
  onRender(ctx)
  return <div data-testid="consumer" />
}

describe('ChatProvider / useChatSessions', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      value: true,
      writable: true,
    })
    localStorage.clear()
    document.body.innerHTML = ''
    mockGenerate.mockClear()
    mockCancel.mockClear()
    mockReset.mockClear()
  })

  function renderWithProvider(onRender: (ctx: ReturnType<typeof useChatSessions>) => void) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)
    act(() => {
      root.render(
        <ChatProvider>
          <TestConsumer onRender={onRender} />
        </ChatProvider>
      )
    })
    return { container, root }
  }

  it('initializes with one default session when localStorage is empty', () => {
    let ctx!: ReturnType<typeof useChatSessions>
    renderWithProvider(c => { ctx = c })
    expect(ctx.sessions).toHaveLength(1)
    expect(ctx.sessions[0].title).toBe('New chat')
    expect(ctx.activeId).toBe(ctx.sessions[0].id)
    expect(ctx.messages).toEqual([])
  })

  it('persists sessions to localStorage', () => {
    let ctx!: ReturnType<typeof useChatSessions>
    renderWithProvider(c => { ctx = c })

    // After initial render, localStorage should contain the session
    const raw = localStorage.getItem('manager-inator-chats')
    expect(raw).toBeTruthy()
    const stored = JSON.parse(raw!)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(ctx.sessions[0].id)
  })

  it('loads sessions from localStorage on mount', () => {
    const preexisting = [{
      id: 'test-id-123',
      title: 'Saved chat',
      messages: [{ role: 'user', content: 'hello' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }]
    localStorage.setItem('manager-inator-chats', JSON.stringify(preexisting))

    let ctx!: ReturnType<typeof useChatSessions>
    renderWithProvider(c => { ctx = c })
    expect(ctx.sessions).toHaveLength(1)
    expect(ctx.sessions[0].id).toBe('test-id-123')
    expect(ctx.sessions[0].title).toBe('Saved chat')
    expect(ctx.activeId).toBe('test-id-123')
    expect(ctx.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('creates a new chat via newChat()', () => {
    let ctx!: ReturnType<typeof useChatSessions>
    const { root, container } = renderWithProvider(c => { ctx = c })
    const originalId = ctx.sessions[0].id

    act(() => { ctx.newChat() })

    // Re-render to capture new state
    act(() => {
      root.render(
        <ChatProvider>
          <TestConsumer onRender={c => { ctx = c }} />
        </ChatProvider>
      )
    })

    expect(ctx.sessions).toHaveLength(2)
    expect(ctx.sessions[0].id).not.toBe(originalId)
    expect(ctx.activeId).toBe(ctx.sessions[0].id)
    expect(mockReset).toHaveBeenCalled()
  })

  it('deletes a session and creates fresh one if last', () => {
    let ctx!: ReturnType<typeof useChatSessions>
    const { root } = renderWithProvider(c => { ctx = c })
    const sessionId = ctx.sessions[0].id

    act(() => { ctx.deleteSession(sessionId) })

    // Re-render to capture new state
    act(() => {
      root.render(
        <ChatProvider>
          <TestConsumer onRender={c => { ctx = c }} />
        </ChatProvider>
      )
    })

    // Should have exactly 1 session (a fresh one)
    expect(ctx.sessions).toHaveLength(1)
    expect(ctx.sessions[0].id).not.toBe(sessionId)
    expect(ctx.sessions[0].title).toBe('New chat')
  })

  it('updates a session in place via updateSession()', () => {
    let ctx!: ReturnType<typeof useChatSessions>
    const { root } = renderWithProvider(c => { ctx = c })
    const sessionId = ctx.sessions[0].id

    act(() => {
      ctx.updateSession(sessionId, s => ({
        ...s,
        title: 'Updated title',
        messages: [...s.messages, { role: 'user', content: 'test message' }],
      }))
    })

    // Re-render to pick up state change
    act(() => {
      root.render(
        <ChatProvider>
          <TestConsumer onRender={c => { ctx = c }} />
        </ChatProvider>
      )
    })

    expect(ctx.sessions[0].title).toBe('Updated title')
    expect(ctx.messages).toEqual([{ role: 'user', content: 'test message' }])
  })

  it('multiple consumers see the same state', () => {
    let ctx1!: ReturnType<typeof useChatSessions>
    let ctx2!: ReturnType<typeof useChatSessions>

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    act(() => {
      root.render(
        <ChatProvider>
          <TestConsumer onRender={c => { ctx1 = c }} />
          <TestConsumer onRender={c => { ctx2 = c }} />
        </ChatProvider>
      )
    })

    // Both consumers should have the same session data
    expect(ctx1.activeId).toBe(ctx2.activeId)
    expect(ctx1.sessions).toEqual(ctx2.sessions)
    expect(ctx1.messages).toEqual(ctx2.messages)

    // Mutating from one should be visible to both after re-render
    act(() => {
      ctx1.updateSession(ctx1.activeId, s => ({
        ...s,
        title: 'Shared update',
      }))
    })

    act(() => {
      root.render(
        <ChatProvider>
          <TestConsumer onRender={c => { ctx1 = c }} />
          <TestConsumer onRender={c => { ctx2 = c }} />
        </ChatProvider>
      )
    })

    expect(ctx1.sessions[0].title).toBe('Shared update')
    expect(ctx2.sessions[0].title).toBe('Shared update')
  })

  it('active session tracks correctly across session switches', () => {
    let ctx!: ReturnType<typeof useChatSessions>
    const { root } = renderWithProvider(c => { ctx = c })

    // Create a second session
    act(() => { ctx.newChat() })
    act(() => {
      root.render(
        <ChatProvider>
          <TestConsumer onRender={c => { ctx = c }} />
        </ChatProvider>
      )
    })

    expect(ctx.sessions).toHaveLength(2)
    const firstId = ctx.sessions[1].id // original, now second
    const secondId = ctx.sessions[0].id // new, now first

    // Active should be the newly created session
    expect(ctx.activeId).toBe(secondId)

    // Switch to the original session
    act(() => { ctx.setActiveId(firstId) })
    act(() => {
      root.render(
        <ChatProvider>
          <TestConsumer onRender={c => { ctx = c }} />
        </ChatProvider>
      )
    })

    expect(ctx.activeId).toBe(firstId)
    expect(ctx.activeSession.id).toBe(firstId)
  })

  it('exposes shared AI state from the single useAI instance', () => {
    let ctx!: ReturnType<typeof useChatSessions>
    renderWithProvider(c => { ctx = c })

    expect(ctx.streaming).toBe(false)
    expect(ctx.streamedText).toBe('')
    expect(typeof ctx.generate).toBe('function')
    expect(typeof ctx.cancel).toBe('function')
    expect(typeof ctx.reset).toBe('function')
    expect(ctx.requestIdRef).toBeDefined()
    expect(ctx.fullTextRef).toBeDefined()
  })

  it('throws when useChatSessions is used outside ChatProvider', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)

    // Suppress React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      act(() => {
        root.render(<TestConsumer onRender={() => {}} />)
      })
    }).toThrow('useChatSessions must be used within ChatProvider')

    spy.mockRestore()
  })
})
