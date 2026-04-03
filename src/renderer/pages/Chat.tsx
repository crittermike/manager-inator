import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useChatSessions, type ChatSession, type Message } from '../hooks/useChatSessions'
import { useSettings } from '../hooks/useData'
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '../../shared/constants'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import {
  Send, Bot, StopCircle, User, FolderOpen,
  Trash2, Plus, MessageSquare, Copy, Check,
  Search, Pencil, Download, ChevronDown, Sparkles, X,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

function titleFromMessage(content: string): string {
  const trimmed = content.slice(0, 60).trim()
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

function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function groupSessionsByDate(sessions: ChatSession[]): { label: string; sessions: ChatSession[] }[] {
  const today: ChatSession[] = []
  const yesterday: ChatSession[] = []
  const thisWeek: ChatSession[] = []
  const older: ChatSession[] = []

  const now = new Date()
  for (const s of sessions) {
    const d = new Date(s.updatedAt)
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) today.push(s)
    else if (diffDays === 1) yesterday.push(s)
    else if (diffDays < 7) thisWeek.push(s)
    else older.push(s)
  }

  const groups: { label: string; sessions: ChatSession[] }[] = []
  if (today.length) groups.push({ label: 'Today', sessions: today })
  if (yesterday.length) groups.push({ label: 'Yesterday', sessions: yesterday })
  if (thisWeek.length) groups.push({ label: 'This week', sessions: thisWeek })
  if (older.length) groups.push({ label: 'Older', sessions: older })
  return groups
}

function exportChatAsMarkdown(session: ChatSession): string {
  const lines = [`# ${session.title}`, `_${new Date(session.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}_`, '']
  for (const msg of session.messages) {
    lines.push(msg.role === 'user' ? `**You:** ${msg.content}` : `**AI:** ${msg.content}`)
    lines.push('')
  }
  return lines.join('\n')
}

const SUGGESTIONS = [
  'How is my team doing overall?',
  'Help me prep for 1:1s this week',
  'What should I focus on today?',
  'Draft some feedback for a report',
  'Summarize recent team activity',
  'Help me write a weekly reflection',
]

export function Chat() {
  const { settings } = useSettings()
  const {
    sessions, activeId, activeSession, messages, setActiveId,
    updateSession, deleteSession: ctxDeleteSession, newChat, sendMessage,
    streaming, streamedText, generate, cancel, reset, requestIdRef, fullTextRef
  } = useChatSessions()

  const [input, setInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const selectedModel = activeSession?.model || settings?.defaultModel || DEFAULT_MODEL
  const selectedModelLabel = AVAILABLE_MODELS.find(m => m.id === selectedModel)?.name || selectedModel

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }
  }, [])

  useEffect(() => {
    const unsub = window.api.onAiToolStatus((data) => {
      if (requestIdRef.current && data.requestId === requestIdRef.current) {
        setToolStatus(friendlyToolStatus(data.toolName, data.args))
      }
    })
    return unsub
  }, [requestIdRef])

  // Don't cancel on unmount — streaming state is shared via ChatProvider

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, streamedText])

  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingSessionId])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    if (showModelPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showModelPicker])

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        handleNewChat()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'e') {
        e.preventDefault()
        handleExportChat()
      }
    }
    document.addEventListener('keydown', handleKeyboard)
    return () => document.removeEventListener('keydown', handleKeyboard)
  }, [activeId, sessions])

  const resizeTextarea = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.overflow = 'hidden'
    const h = Math.min(el.scrollHeight, 160)
    el.style.height = h + 'px'
    if (el.scrollHeight > 160) el.style.overflow = 'auto'
  }

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || input.trim()
    if (!text || streaming) return

    if (!overrideText) setInput('')
    if (inputRef.current) inputRef.current.style.height = ''
    setToolStatus(null)

    // Delegate to shared context
    await sendMessage(text)
    setToolStatus(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewChat = useCallback(() => {
    newChat(selectedModel)
    setToolStatus(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [newChat, selectedModel])

  const handleSwitchSession = (id: string) => {
    if (streaming || id === activeId) return
    setActiveId(id)
    reset()
    setToolStatus(null)
  }

  const handleDeleteSession = (id: string) => {
    ctxDeleteSession(id)
    reset()
  }

  const handleRenameSession = (id: string, newTitle: string) => {
    const trimmed = newTitle.trim()
    if (trimmed) {
      updateSession(id, s => ({ ...s, title: trimmed }))
    }
    setEditingSessionId(null)
  }

  const handleSelectModel = (modelId: string) => {
    updateSession(activeId, s => ({ ...s, model: modelId }))
    setShowModelPicker(false)
  }

  const handleExportChat = useCallback(() => {
    const session = sessions.find(s => s.id === activeId)
    if (!session || session.messages.length === 0) return
    const md = exportChatAsMarkdown(session)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${session.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [activeId, sessions])

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const q = searchQuery.toLowerCase()
    return sessions.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.messages.some(m => m.content.toLowerCase().includes(q))
    )
  }, [sessions, searchQuery])

  const groupedSessions = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions])

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className={`border-r border-border flex flex-col bg-surface/50 shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden border-r-0'}`}>
        <div className="p-3 space-y-2">
          <button
            onClick={handleNewChat}
            disabled={streaming}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-border text-zinc-300 hover:bg-surface-raised hover:text-zinc-100 rounded-lg text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New chat
          </button>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-8 pr-8 py-2 bg-zinc-950 border border-border rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/10 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {groupedSessions.length === 0 && searchQuery && (
            <div className="text-center py-8">
              <p className="text-xs text-zinc-600">No chats match "{searchQuery}"</p>
            </div>
          )}
          {groupedSessions.map(group => (
            <div key={group.label}>
              <div className="px-2 pt-3 pb-1.5">
                <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">{group.label}</span>
              </div>
              {group.sessions.map(s => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSwitchSession(s.id)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSwitchSession(s.id) }}
                  onDoubleClick={() => { setEditingSessionId(s.id); setEditingTitle(s.title) }}
                  className={`group/item flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors ${
                    s.id === activeId
                      ? 'bg-surface-raised border border-border'
                      : 'hover:bg-surface-raised border border-transparent'
                  }`}
                >
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${s.id === activeId ? 'text-zinc-300' : 'text-zinc-600'}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    {editingSessionId === s.id ? (
                      <input
                        ref={editInputRef}
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onBlur={() => handleRenameSession(s.id, editingTitle)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameSession(s.id, editingTitle)
                          if (e.key === 'Escape') setEditingSessionId(null)
                          e.stopPropagation()
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-full bg-zinc-900 border border-brand/40 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none"
                      />
                    ) : (
                      <>
                        <p className={`text-xs truncate ${s.id === activeId ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>{s.title}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">{s.messages.length} msg{s.messages.length !== 1 ? 's' : ''} · {formatSessionDate(s.updatedAt)}</p>
                      </>
                    )}
                  </div>
                  {editingSessionId !== s.id && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingSessionId(s.id); setEditingTitle(s.title) }}
                        className="p-0.5 text-zinc-600 hover:text-zinc-300 rounded-lg"
                        aria-label="Rename"
                      >
                        <Pencil className="w-3 h-3" aria-hidden="true" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteSessionId(s.id) }}
                        className="p-0.5 text-zinc-600 hover:text-danger rounded-lg"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface/30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" aria-hidden="true" /> : <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />}
            </button>
            <Bot className="w-5 h-5 text-brand shrink-0" aria-hidden="true" />
            <h1 className="text-sm font-medium text-zinc-200 truncate">{activeSession?.title || 'New chat'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={modelPickerRef}>
              <button
                onClick={() => setShowModelPicker(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised hover:bg-surface-overlay rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors border border-border"
              >
                <Sparkles className="w-3 h-3 text-brand" aria-hidden="true" />
                <span className="max-w-[120px] truncate">{selectedModelLabel}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {showModelPicker && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-950 border border-border rounded-xl shadow-2xl shadow-black/50 py-1 z-30 animate-fade-up">
                  {AVAILABLE_MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleSelectModel(m.id)}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                        m.id === selectedModel
                          ? 'bg-brand/10 text-brand-light'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-overlay'
                      }`}
                    >
                        <span>{m.name}</span>
                      {m.id === selectedModel && <Check className="w-3 h-3 text-brand" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {messages.length > 0 && (
              <button
                onClick={handleExportChat}
                className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
                aria-label="Export as markdown"
                title="Export as markdown (Cmd+Shift+E)"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 && !streaming ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-brand/50" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-medium text-zinc-300 mb-2">What can I help with?</h2>
              <p className="text-sm text-zinc-500 mb-8 max-w-md">
                I have access to your data repo and can read meeting notes, feedback logs, check-ins, and more. Ask me anything about your team.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="text-left p-3.5 bg-surface rounded-xl border border-border hover:border-brand/30 hover:bg-surface-raised/50 transition-all active:scale-[0.97] duration-150 text-sm text-zinc-400 hover:text-zinc-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-6 pb-44 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex group/msg ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  <div className={`relative max-w-[80%] rounded-xl px-4 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-brand/15 text-zinc-100 border border-brand/20'
                      : 'bg-surface-raised/50 border border-border/60 text-zinc-300'
                  }`}>
                    {msg.role === 'assistant' && (
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(msg.content)
                          setCopiedIdx(i)
                          if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
                          copyTimerRef.current = setTimeout(() => setCopiedIdx(null), 2000)
                        }}
                        className="absolute -top-2 -right-2 p-1 rounded-md bg-surface border border-border text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/msg:opacity-100 transition-opacity shadow-sm"
                        aria-label="Copy"
                      >
                        {copiedIdx === i ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                    {msg.role === 'assistant' ? (
                      <div className="prose-dark text-sm [&_p]:text-sm [&_p]:my-1.5 [&_li]:text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_pre]:my-2 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_hr]:my-2">
                        <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{msg.content || '_No response received._'}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {streaming && (
                <div className="flex">
                  <div className={`rounded-xl px-4 py-2.5 bg-surface-raised/50 border border-border/60 ${streamedText.trimStart() ? 'max-w-[80%]' : 'w-fit'}`}>
                    {streamedText.trimStart() ? (
                      <div className="prose-dark text-sm [&_p]:text-sm [&_p]:my-1.5 [&_li]:text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_pre]:my-2 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_hr]:my-2 text-zinc-300">
                        <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{streamedText.trimStart().replace(/<system_notification>[\s\S]*?<\/system_notification>\s*/g, '')}</ReactMarkdown>
                        <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-border/40 text-[10px] text-zinc-500">
                          <span className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                          <span>{toolStatus || 'Thinking…'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 py-0.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        {toolStatus && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <FolderOpen className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span className="truncate max-w-[300px]">{toolStatus}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area — floating over messages */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-4 pt-8 bg-gradient-to-t from-zinc-900 via-zinc-900/95 to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <div className="flex items-center gap-3 bg-zinc-950 rounded-2xl border border-border p-2 focus-within:border-brand/40 focus-within:ring-1 focus-within:ring-brand/10 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value); resizeTextarea() }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your team..."
                aria-label="Ask about your team"
                rows={1}
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none px-3 py-2 max-h-40 overflow-hidden"
              />
              {streaming ? (
                <button
                  onClick={cancel}
                  aria-label="Stop generating"
                  className="p-2.5 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors shrink-0"
                >
                  <StopCircle className="w-5 h-5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="p-2.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 hover:text-zinc-100 transition-all active:scale-[0.97] disabled:opacity-30 shrink-0"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-zinc-600 text-center mt-2">
              AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteSessionId !== null}
        title="Delete chat"
        message="This conversation will be permanently deleted."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => { if (deleteSessionId) handleDeleteSession(deleteSessionId); setDeleteSessionId(null) }}
        onCancel={() => setDeleteSessionId(null)}
      />
    </div>
  )
}
