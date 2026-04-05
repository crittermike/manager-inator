import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useAI } from './useAI'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
  model?: string
}

const STORAGE_KEY = 'manager-inator-chats'

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) { console.debug('Failed to parse chat sessions from localStorage:', e); return [] }
}

function saveSessions(sessions: ChatSession[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

function createSession(model?: string): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    model
  }
}

interface ChatContextValue {
  sessions: ChatSession[]
  activeId: string
  activeSession: ChatSession
  messages: Message[]
  setActiveId: (id: string) => void
  updateSession: (id: string, updater: (s: ChatSession) => ChatSession) => void
  deleteSession: (id: string) => void
  newChat: (model?: string) => void
  sendMessage: (text: string, context?: string) => Promise<void>
  // AI state (shared)
  streaming: boolean
  streamedText: string
  generate: (action: string, context: Record<string, unknown>) => Promise<string>
  cancel: () => Promise<void>
  reset: () => void
  requestIdRef: React.MutableRefObject<string | null>
  fullTextRef: React.MutableRefObject<string>
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const loaded = loadSessions()
    return loaded.length > 0 ? loaded : [createSession()]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const loaded = loadSessions()
    return loaded.length > 0 ? loaded[0].id : ''
  })

  // Shared AI hook — one instance for both popup and full page
  const ai = useAI()

  const activeSession = sessions.find(s => s.id === activeId) || sessions[0]
  const messages = activeSession?.messages || []

  // Persist to localStorage
  useEffect(() => { saveSessions(sessions) }, [sessions])

  // If activeId doesn't match any session, fix it
  useEffect(() => {
    if (sessions.length > 0 && !sessions.find(s => s.id === activeId)) {
      setActiveId(sessions[0].id)
    }
  }, [sessions, activeId])

  const updateSession = useCallback((id: string, updater: (s: ChatSession) => ChatSession) => {
    setSessions(prev => prev.map(s => s.id === id ? updater(s) : s))
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      if (filtered.length === 0) {
        const fresh = createSession()
        return [fresh]
      }
      return filtered
    })
    if (activeId === id) {
      setSessions(prev => {
        setActiveId(prev[0]?.id || '')
        return prev
      })
    }
  }, [activeId])

  const newChat = useCallback((model?: string) => {
    if (ai.streaming) return
    const fresh = createSession(model)
    setSessions(prev => [fresh, ...prev])
    setActiveId(fresh.id)
    ai.reset()
  }, [ai])

  // Shared sendMessage — lives in the provider so it survives component unmounts
  const sendMessage = useCallback(async (text: string, context?: string) => {
    if (!text.trim() || ai.streaming) return
    const sessionId = activeId

    // Push user message
    setSessions(prev => prev.map(s => s.id === sessionId ? {
      ...s,
      messages: [...s.messages, { role: 'user' as const, content: text.trim() }],
      title: s.messages.length === 0 ? text.trim().slice(0, 50) : s.title,
      updatedAt: new Date().toISOString()
    } : s))

    ai.reset()

    try {
      const response = await ai.generate('chat', {
        message: text,
        history: (sessions.find(s => s.id === sessionId)?.messages || []).map(m => ({ role: m.role, content: m.content })),
        ...(context ? { pageContext: context } : {})
      })

      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        messages: [...s.messages, { role: 'assistant' as const, content: response.trim() }],
        updatedAt: new Date().toISOString()
      } : s))
    } catch (e) {
      console.error('Chat AI response failed:', e)
      const partial = ai.fullTextRef.current?.trim()
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        messages: [...s.messages, {
          role: 'assistant' as const,
          content: partial
            ? partial + '\n\n*(Response interrupted — the AI may have timed out.)*'
            : 'Sorry, something went wrong. Please try again.'
        }],
        updatedAt: new Date().toISOString()
      } : s))
    }
  }, [activeId, sessions, ai])

  const value: ChatContextValue = {
    sessions,
    activeId,
    activeSession,
    messages,
    setActiveId,
    updateSession,
    deleteSession,
    newChat,
    sendMessage,
    streaming: ai.streaming,
    streamedText: ai.streamedText,
    generate: ai.generate,
    cancel: ai.cancel,
    reset: ai.reset,
    requestIdRef: ai.requestIdRef,
    fullTextRef: ai.fullTextRef,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChatSessions() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatSessions must be used within ChatProvider')
  return ctx
}
