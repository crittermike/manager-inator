import { useState, useRef, useEffect, useCallback } from 'react'
import { useAI } from '../hooks/useAI'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send, Sparkles, User, Bot, Trash2, StopCircle, Copy, Check,
  Download, FolderOpen, Plus, MessageSquare, ChevronLeft, ChevronRight
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
const SIDEBAR_KEY = 'manager-inator-chat-sidebar'

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
  const trimmed = content.slice(0, 60).trim()
  return trimmed.length < content.length ? trimmed + '...' : trimmed
}

function friendlyToolStatus(toolName: string, args: Record<string, unknown>): string {
  const path = (args.path as string) || (args.filePath as string) || ''
  if (toolName === 'read_file' && path) return `Reading ${path}`
  if (toolName === 'list_directory' && path) return `Browsing ${path}`
  if (toolName === 'list_directory') return 'Browsing directory'
  if (path) return `${toolName}: ${path}`
  return toolName
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AIChat() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const loaded = loadSessions()
    return loaded.length > 0 ? loaded : [createSession()]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const loaded = loadSessions()
    return loaded.length > 0 ? loaded[0].id : sessions[0].id
  })
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== 'closed' } catch { return true }
  })

  const activeSession = sessions.find(s => s.id === activeId) || sessions[0]
  const messages = activeSession?.messages || []

  const [input, setInput] = useState('')
  const { streaming, streamedText, generate, cancel, reset, requestIdRef } = useAI()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [toolStatus, setToolStatus] = useState<string | null>(null)

  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed')
  }, [sidebarOpen])

  useEffect(() => {
    const unsub = window.api.onAiToolStatus((data) => {
      if (requestIdRef.current && data.requestId === requestIdRef.current) {
        setToolStatus(friendlyToolStatus(data.toolName, data.args))
      }
    })
    return unsub
  }, [requestIdRef])

  useEffect(() => {
    return () => { cancel() }
  }, [cancel])

  const updateSession = useCallback((id: string, updater: (s: ChatSession) => ChatSession) => {
    setSessions(prev => prev.map(s => s.id === id ? updater(s) : s))
  }, [])

  const formatConversation = (): string => {
    return messages.map(m =>
      m.role === 'user' ? `**You:** ${m.content}` : `**Assistant:** ${m.content}`
    ).join('\n\n---\n\n')
  }

  const resizeTextarea = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, streamedText])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return

    const userMessage = input.trim()
    setInput('')
    if (inputRef.current) inputRef.current.style.height = '36px'

    const isFirstMessage = messages.length === 0
    const newUserMsg: Message = { role: 'user', content: userMessage }

    updateSession(activeId, s => ({
      ...s,
      messages: [...s.messages, newUserMsg],
      title: isFirstMessage ? titleFromMessage(userMessage) : s.title,
      updatedAt: new Date().toISOString()
    }))

    reset()
    setToolStatus(null)

    try {
      const response = await generate('chat', {
        message: userMessage,
        history: messages.map((m) => ({ role: m.role, content: m.content }))
      })

      updateSession(activeId, s => ({
        ...s,
        messages: [...s.messages, { role: 'assistant', content: response }],
        updatedAt: new Date().toISOString()
      }))
    } catch {
      updateSession(activeId, s => ({
        ...s,
        messages: [...s.messages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }],
        updatedAt: new Date().toISOString()
      }))
    } finally {
      setToolStatus(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleNewChat = () => {
    if (streaming) return
    const fresh = createSession()
    setSessions(prev => [fresh, ...prev])
    setActiveId(fresh.id)
    reset()
    setToolStatus(null)
    inputRef.current?.focus()
  }

  const handleSwitchSession = (id: string) => {
    if (streaming || id === activeId) return
    setActiveId(id)
    reset()
    setToolStatus(null)
  }

  const handleDeleteSession = (id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      if (filtered.length === 0) {
        const fresh = createSession()
        if (id === activeId) setActiveId(fresh.id)
        return [fresh]
      }
      if (id === activeId) {
        setActiveId(filtered[0].id)
      }
      return filtered
    })
    reset()
    setShowDeleteConfirm(null)
  }

  const suggestions = [
    'How is my team doing overall?',
    'What should I focus on in my next 1:1s?',
    'Draft positive feedback for a recent accomplishment',
    'What patterns do you see across my team?'
  ]

  return (
    <>
    <div className="flex h-screen animate-fade-in">
      {/* Session sidebar */}
      <div className={`shrink-0 flex flex-col border-r border-border bg-surface transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'}`}>
        <div className="drag-region pt-14 px-3 pb-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider no-drag">Chats</span>
          <button
            onClick={handleNewChat}
            disabled={streaming}
            className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-surface-raised rounded-lg transition-colors disabled:opacity-30 no-drag"
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.map(s => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSwitchSession(s.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSwitchSession(s.id) } }}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer group/session ${
                s.id === activeId
                  ? 'bg-brand/10 border-r-2 border-brand'
                  : 'hover:bg-surface-raised'
              }`}
            >
              <MessageSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.id === activeId ? 'text-brand-light' : 'text-zinc-600'}`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className={`text-xs truncate ${s.id === activeId ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>
                  {s.title}
                </p>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  {s.messages.length > 0 ? `${s.messages.length} msg${s.messages.length !== 1 ? 's' : ''} · ${formatTimestamp(s.updatedAt)}` : 'Empty'}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(s.id) }}
                className="p-0.5 text-zinc-600 hover:text-danger opacity-0 group-hover/session:opacity-100 transition-opacity shrink-0 mt-0.5"
                aria-label={`Delete chat: ${s.title}`}
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Title bar drag region */}
        <div className="drag-region h-14 shrink-0" />
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
              aria-label={sidebarOpen ? 'Collapse chat history' : 'Show chat history'}
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
            </button>
            <div>
              <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand" aria-hidden="true" />
                AI assistant
              </h1>
            </div>
          </div>
          {messages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(formatConversation())
                  setCopiedAll(true)
                  setTimeout(() => setCopiedAll(false), 2000)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 bg-surface-raised rounded-lg transition-colors"
                aria-label="Copy entire conversation"
              >
                {copiedAll ? <Check className="w-3 h-3 text-success" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                Copy all
              </button>
              <button
                onClick={() => {
                  const text = formatConversation()
                  const blob = new Blob([text], { type: 'text/markdown' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `chat-${new Date().toISOString().split('T')[0]}.md`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 bg-surface-raised rounded-lg transition-colors"
                aria-label="Download conversation as Markdown"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                Download
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-4 pb-4 px-6">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
                <Bot className="w-7 h-7 text-brand" aria-hidden="true" />
              </div>
              <p className="text-sm text-zinc-400 mb-6 max-w-md">
                I can help you with performance management, prep for 1:1s, draft
                feedback, analyze patterns, or answer questions about your team.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s)
                      inputRef.current?.focus()
                    }}
                    className="text-left p-3 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised transition-all text-xs text-zinc-400"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''} group/msg`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-brand" aria-hidden="true" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 relative ${
                  msg.role === 'user'
                    ? 'bg-brand text-white'
                    : 'bg-surface border border-border'
                }`}
              >
                {msg.role === 'assistant' && (
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(msg.content)
                      setCopiedIdx(i)
                      setTimeout(() => setCopiedIdx(null), 2000)
                    }}
                    className="absolute top-2 right-2 p-1 rounded-md bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/msg:opacity-100 focus:opacity-100 transition-opacity"
                    aria-label="Copy message"
                  >
                    {copiedIdx === i ? <Check className="w-3 h-3 text-success" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
                  </button>
                )}
                {msg.role === 'assistant' ? (
                  <div className="prose-dark text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-zinc-300" aria-hidden="true" />
                </div>
              )}
            </div>
          ))}

          {streaming && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-brand" aria-hidden="true" />
              </div>
              <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-surface border border-brand/20">
                {streamedText ? (
                  <div className="prose-dark text-sm cursor-blink">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamedText}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 py-1">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-brand/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    {toolStatus && (
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <FolderOpen className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{toolStatus}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
          <div className="sr-only" aria-live="polite">
            {streaming ? 'AI is generating a response...' : ''}
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 pt-2 pb-2 px-6">
          <div className="flex items-end gap-2 bg-surface rounded-2xl border border-border p-2 focus-within:border-brand/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); resizeTextarea() }}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your team..."
              aria-label="Ask about your team"
              rows={1}
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none px-2 py-1.5 max-h-32"
              style={{ minHeight: '36px' }}
            />
            {streaming ? (
              <button
                onClick={cancel}
                aria-label="Stop generating"
                className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
              >
                <StopCircle className="w-5 h-5" aria-hidden="true" />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                aria-label="Send message"
                className="p-2 bg-brand text-white rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-30 shrink-0"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

      <ConfirmDialog
        open={!!showDeleteConfirm}
        title="Delete chat"
        message="This will permanently delete this chat session. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => showDeleteConfirm && handleDeleteSession(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </>
  )
}
