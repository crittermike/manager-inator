import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAI } from '../../hooks/useAI'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import {
  Send, Bot, StopCircle, X, User, FolderOpen,
  Trash2, Plus, MessageSquare, Copy, Check
} from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'manager-inator-chats'

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveSessions(sessions: ChatSession[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

function createSession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function titleFromMessage(content: string): string {
  const trimmed = content.slice(0, 50).trim()
  return trimmed.length < content.length ? trimmed + '…' : trimmed
}

function friendlyToolStatus(toolName: string, args: Record<string, unknown>): string {
  const path = (args.path as string) || (args.filePath as string) || ''
  if (toolName === 'view' && path) return `Reading ${path}`
  if (toolName === 'ls' && path) return `Browsing ${path}`
  if (toolName === 'ls') return 'Browsing directory'
  if (toolName === 'grep' && path) return `Searching ${path}`
  if (toolName === 'grep') return 'Searching files'
  if (toolName === 'glob') return 'Finding files'
  if (path) return `${toolName}: ${path}`
  return toolName
}

export function AIFloatingPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation()
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const loaded = loadSessions()
    return loaded.length > 0 ? loaded : [createSession()]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const loaded = loadSessions()
    return loaded.length > 0 ? loaded[0].id : sessions[0].id
  })
  const [showHistory, setShowHistory] = useState(false)
  const activeSession = sessions.find(s => s.id === activeId) || sessions[0]
  const messages = activeSession?.messages || []

  const [input, setInput] = useState('')
  const { streaming, streamedText, generate, cancel, reset, requestIdRef, fullTextRef } = useAI()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [toolStatus, setToolStatus] = useState<string | null>(null)

  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  useEffect(() => {
    const unsub = window.api.onAiToolStatus((data) => {
      if (requestIdRef.current && data.requestId === requestIdRef.current) {
        setToolStatus(friendlyToolStatus(data.toolName, data.args))
      }
    })
    return unsub
  }, [requestIdRef])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  useEffect(() => {
    return () => { cancel() }
  }, [cancel])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, streamedText])

  const updateSession = useCallback((id: string, updater: (s: ChatSession) => ChatSession) => {
    setSessions(prev => prev.map(s => s.id === id ? updater(s) : s))
  }, [])

  const getContextHint = (): string => {
    const path = location.pathname
    if (path.startsWith('/report/')) {
      const name = path.replace('/report/', '')
      return `The user is currently viewing ${name}'s person page.`
    }
    if (path === '/') return 'The user is on the Today view.'
    if (path === '/playbook') return 'The user is on the Playbook — their management cadence system.'
    if (path === '/search') return 'The user is on the Search page.'
    return ''
  }

  const resizeTextarea = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }

  const sendMessage = async (overrideText?: string) => {
    const text = overrideText || input.trim()
    if (!text || streaming) return

    if (!overrideText) setInput('')
    if (inputRef.current) inputRef.current.style.height = '36px'

    const isFirstMessage = messages.length === 0
    const newUserMsg: Message = { role: 'user', content: text }

    updateSession(activeId, s => ({
      ...s,
      messages: [...s.messages, newUserMsg],
      title: isFirstMessage ? titleFromMessage(text) : s.title,
      updatedAt: new Date().toISOString()
    }))

    reset()
    setToolStatus(null)

    const contextHint = getContextHint()

    try {
      const response = await generate('chat', {
        message: text,
        history: messages.map(m => ({ role: m.role, content: m.content })),
        ...(contextHint ? { pageContext: contextHint } : {})
      })

      updateSession(activeId, s => ({
        ...s,
        messages: [...s.messages, { role: 'assistant', content: response }],
        updatedAt: new Date().toISOString()
      }))
    } catch {
      const partialContent = fullTextRef.current?.trim()
      if (partialContent) {
        updateSession(activeId, s => ({
          ...s,
          messages: [
            ...s.messages,
            { role: 'assistant', content: partialContent + '\n\n*(Response interrupted — the AI may have timed out.)*' }
          ],
          updatedAt: new Date().toISOString()
        }))
      } else {
        updateSession(activeId, s => ({
          ...s,
          messages: [...s.messages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }],
          updatedAt: new Date().toISOString()
        }))
      }
    } finally {
      setToolStatus(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleNewChat = () => {
    if (streaming) return
    const fresh = createSession()
    setSessions(prev => [fresh, ...prev])
    setActiveId(fresh.id)
    reset()
    setToolStatus(null)
    setShowHistory(false)
    inputRef.current?.focus()
  }

  const handleSwitchSession = (id: string) => {
    if (streaming || id === activeId) return
    setActiveId(id)
    reset()
    setToolStatus(null)
    setShowHistory(false)
  }

  const handleDeleteSession = (id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      if (filtered.length === 0) {
        const fresh = createSession()
        if (id === activeId) setActiveId(fresh.id)
        return [fresh]
      }
      if (id === activeId) setActiveId(filtered[0].id)
      return filtered
    })
    reset()
  }

  if (!open) return null

  const suggestions = [
    'How is my team doing?',
    'Help me prep for 1:1s',
    'Draft some feedback',
    'What patterns do you see?'
  ]

  return (
    <div className="absolute bottom-20 right-6 w-[420px] max-w-[calc(100vw-18rem-3rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-zinc-950 border border-border rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden z-20 animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-brand" aria-hidden="true" />
          <span className="text-sm font-medium text-zinc-200">AI assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'bg-brand/15 text-brand-light' : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised'}`}
            aria-label="Chat history"
            title="Chat history"
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={handleNewChat}
            disabled={streaming}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors disabled:opacity-30"
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* History overlay */}
      {showHistory && (
        <div className="absolute inset-0 top-[49px] bg-zinc-950 z-10 flex flex-col">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">Recent chats</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.map(s => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSwitchSession(s.id)}
                onKeyDown={e => { if (e.key === 'Enter') handleSwitchSession(s.id) }}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer group/hist ${
                  s.id === activeId ? 'bg-brand/10' : 'hover:bg-surface-raised'
                }`}
              >
                <MessageSquare className={`w-3 h-3 shrink-0 ${s.id === activeId ? 'text-brand-light' : 'text-zinc-600'}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs truncate ${s.id === activeId ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>{s.title}</p>
                  <p className="text-[10px] text-zinc-600">{s.messages.length} msg{s.messages.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteSession(s.id) }}
                  className="p-0.5 text-zinc-600 hover:text-danger opacity-0 group-hover/hist:opacity-100 transition-opacity"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !streaming && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center mb-3">
              <Bot className="w-6 h-6 text-brand/60" aria-hidden="true" />
            </div>
            <p className="text-xs text-zinc-500 mb-4 max-w-[280px]">
              Ask about your team, prep for 1:1s, draft feedback, or analyze patterns.
            </p>
            <div className="grid grid-cols-2 gap-1.5 w-full">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left p-2.5 bg-surface rounded-lg border border-border hover:border-brand/30 hover:bg-surface-raised/50 transition-all duration-150 text-[11px] text-zinc-400 hover:text-zinc-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''} group/msg`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3 py-2 relative ${
              msg.role === 'user'
                ? 'bg-brand text-white'
                : 'bg-surface border border-border'
            }`}>
              {msg.role === 'assistant' && (
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(msg.content)
                    setCopiedIdx(i)
                    setTimeout(() => setCopiedIdx(null), 2000)
                  }}
                  className="absolute top-1.5 right-1.5 p-0.5 rounded bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/msg:opacity-100 transition-opacity"
                  aria-label="Copy"
                >
                  {copiedIdx === i ? <Check className="w-2.5 h-2.5 text-success" /> : <Copy className="w-2.5 h-2.5" />}
                </button>
              )}
              {msg.role === 'assistant' ? (
                <div className="prose-dark text-xs [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs">
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-md bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />
              </div>
            )}
          </div>
        ))}

        {streaming && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-md bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
            </div>
            <div className={`rounded-xl px-3 py-2 bg-surface border border-brand/20 animate-shimmer ${streamedText ? 'max-w-[85%]' : 'w-fit'}`}>
              {streamedText ? (
                <div className="prose-dark text-xs cursor-blink [&_p]:text-xs [&_li]:text-xs">
                  <div className="text-xs whitespace-pre-wrap text-zinc-300">{streamedText}</div>
                </div>
              ) : (
                <div className="flex flex-col gap-1 py-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {toolStatus && (
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500 max-w-[200px]">
                      <FolderOpen className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{toolStatus}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 py-2.5 border-t border-border bg-surface/80 backdrop-blur-sm">
        <div className="flex items-end gap-2 bg-zinc-950 rounded-xl border border-border p-1.5 focus-within:border-brand/40 focus-within:ring-1 focus-within:ring-brand/10 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); resizeTextarea() }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your team…"
            aria-label="Ask about your team"
            rows={1}
            className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none px-2 py-1.5 max-h-24"
            style={{ minHeight: '32px' }}
          />
          {streaming ? (
            <button
              onClick={cancel}
              aria-label="Stop generating"
              className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            >
              <StopCircle className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              aria-label="Send message"
              className="p-1.5 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-30 shrink-0"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
