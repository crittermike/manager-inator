import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChatSessions, type Message } from '../../hooks/useChatSessions'
import { useActiveFile } from '../../hooks/useActiveFile'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const REMARK_PLUGINS = [remarkGfm]
import {
  Send, Bot, StopCircle, X, User, FolderOpen,
  Trash2, Plus, MessageSquare, Copy, Check, FileText, Maximize2
} from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'

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
  const navigate = useNavigate()
  const { activeFile } = useActiveFile()
  const {
    sessions, activeId, activeSession, messages, setActiveId,
    updateSession, deleteSession, newChat,
    streaming, streamedText, generate, cancel, reset, requestIdRef, fullTextRef
  } = useChatSessions()
  const [showHistory, setShowHistory] = useState(false)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)

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

  const getContextHint = (): string => {
    const path = location.pathname
    if (path.startsWith('/report/')) {
      const name = path.replace('/report/', '')
      return `The user is currently viewing the report page for "${name}". They can see this person's profile, recent 1:1 summaries, action items, feedback history, check-ins, and reviews. Help them with anything related to managing this person — prep for 1:1s, draft feedback, analyze patterns, or answer questions about their history.`
    }
    if (path === '/') return 'The user is on the Today view — their daily action plan showing overdue items, upcoming 1:1 prep, and inbox items. Help them prioritize, prep from context, or tackle their to-do list.'
    if (path === '/playbook') return 'The user is on the Playbook — their management cadence system with practices like weekly reflections, monthly check-ins, and skip-levels.'
    if (path === '/search') return 'The user is on the Search page. Help them find context, people, or specific information.'
    if (path === '/my-profile') return 'The user is viewing their Impact Log — a record of their wins and contributions as an engineering manager.'
    if (path.startsWith('/context/')) return 'The user is viewing a context summary. Help them with follow-ups, action items, or analysis of the discussion.'
    if (path.startsWith('/people/')) {
      const slug = path.replace('/people/', '')
      return `The user is viewing the profile for "${slug}" in their people directory.`
    }
    return ''
  }

  const resizeTextarea = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.overflow = 'hidden'
    const h = Math.min(el.scrollHeight, 96)
    el.style.height = h + 'px'
    if (el.scrollHeight > 96) el.style.overflow = 'auto'
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

    let activityContext = ''
    let fileContext = ''
    if (activeFile) {
      fileContext = `\n\nThe user currently has this file open: "${activeFile.title}" (${activeFile.path})\n\nFile contents:\n${activeFile.content}`
    }
    if (location.pathname.startsWith('/report/')) {
      const reportName = location.pathname.replace('/report/', '')
      try {
        const now = new Date()
        const weekAgo = new Date(now)
        weekAgo.setDate(weekAgo.getDate() - 7)
        const startDate = weekAgo.toISOString().split('T')[0]
        const endDate = now.toISOString().split('T')[0]
        const activity = await window.api.fetchActivityForPerson(reportName, startDate, endDate)
        if (activity && activity.items.length > 0) {
          const lines: string[] = [`Recent GitHub activity for ${activity.displayName} (past 7 days):`]
          for (const item of activity.items.slice(0, 10)) {
            const stateEmoji = item.state === 'merged' ? '🟣' : item.state === 'open' ? '🟢' : item.state === 'closed' ? '🔴' : '⚪'
            lines.push(`${stateEmoji} ${item.type.toUpperCase()}: ${item.title} (${item.state})`)
            if (item.reviewComments?.length) {
              lines.push(`  └ ${item.reviewComments.length} review comment(s): "${item.reviewComments[0].body.slice(0, 100)}"`)
            }
            if (item.issueComments?.length) {
              lines.push(`  └ ${item.issueComments.length} comment(s): "${item.issueComments[0].body.slice(0, 100)}"`)
            }
          }
          activityContext = lines.join('\n')
        }
      } catch { /* non-fatal */ }
    }

    try {
      const fullContext = [contextHint, activityContext, fileContext].filter(Boolean).join('\n\n')
      const response = await generate('chat', {
        message: text,
        history: messages.map(m => ({ role: m.role, content: m.content })),
        ...(fullContext ? { pageContext: fullContext } : {})
      })

      updateSession(activeId, s => ({
        ...s,
        messages: [...s.messages, { role: 'assistant', content: response.trim() }],
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
    newChat()
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
    deleteSession(id)
    reset()
  }

  if (!open) return null

  const getSuggestions = (): string[] => {
    const path = location.pathname
    if (path.startsWith('/report/')) {
      const name = path.replace('/report/', '')
      return [
        `Give me a TL;DR on ${name}`,
        `Help me prep for my 1:1 with ${name}`,
        `Draft feedback for ${name}`,
        `What should I watch for with ${name}?`
      ]
    }
    if (path === '/my-profile') {
      return [
        'Summarize my impact this quarter',
        'What themes stand out?',
        'Help me write a self-review',
        'What areas could I grow in?'
      ]
    }
    if (path === '/playbook') {
      return [
        'Which practices need attention?',
        'Suggest a new management practice',
        'How can I improve my 1:1 format?',
        'What am I missing in my cadence?'
      ]
    }
    if (path === '/') {
      return [
        'What should I focus on today?',
        'Help me prioritize my to-do list',
        'Draft a team update email',
        'Any patterns I should worry about?'
      ]
    }
    return [
      'How is my team doing?',
      'Help me prep for 1:1s',
      'Draft some feedback',
      'What should I focus on today?'
    ]
  }

  const suggestions = getSuggestions()

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
            className={`p-1.5 rounded-lg transition-colors ${showHistory ? 'bg-surface-raised text-zinc-300 border border-border' : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised border border-transparent'}`}
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
            onClick={() => {
              onClose()
              navigate('/chat')
            }}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-surface-raised rounded-lg transition-colors"
            aria-label="Open full chat"
            title="Open full chat"
          >
            <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
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
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer group/hist border border-transparent ${
                  s.id === activeId ? 'bg-surface-raised border-border' : 'hover:bg-surface-raised'
                }`}
              >
                <MessageSquare className={`w-3 h-3 shrink-0 ${s.id === activeId ? 'text-zinc-300' : 'text-zinc-600'}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs truncate ${s.id === activeId ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>{s.title}</p>
                  <p className="text-[10px] text-zinc-600">{s.messages.length} msg{s.messages.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteSessionId(s.id) }}
                  className="p-0.5 text-zinc-600 hover:text-danger rounded-lg opacity-0 group-hover/hist:opacity-100 transition-opacity"
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
                  className="text-left p-2.5 bg-surface rounded-lg border border-border hover:border-brand/30 hover:bg-surface-raised/50 transition-all active:scale-[0.97] duration-150 text-[11px] text-zinc-400 hover:text-zinc-300"
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
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                : 'bg-surface border border-border'
            }`}>
              {msg.role === 'assistant' && (
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(msg.content)
                    setCopiedIdx(i)
                    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
                    copyTimerRef.current = setTimeout(() => setCopiedIdx(null), 2000)
                  }}
                  className="absolute top-1.5 right-1.5 p-0.5 rounded bg-surface-raised/80 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/msg:opacity-100 transition-opacity"
                  aria-label="Copy"
                >
                  {copiedIdx === i ? <Check className="w-2.5 h-2.5 text-success" /> : <Copy className="w-2.5 h-2.5" />}
                </button>
              )}
              {msg.role === 'assistant' ? (
                <div className="prose-dark text-xs [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs">
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{msg.content || '_No response received._'}</ReactMarkdown>
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
            <div className={`rounded-xl px-3 py-2 bg-surface border border-border animate-shimmer ${streamedText.trimStart() ? 'max-w-[85%]' : 'w-fit'}`}>
              {streamedText.trimStart() ? (
                <div className="prose-dark text-xs cursor-blink [&_p]:text-xs [&_li]:text-xs">
                  <div className="text-xs whitespace-pre-wrap text-zinc-300">{streamedText.trimStart().replace(/<system_notification>[\s\S]*?<\/system_notification>\s*/g, '')}</div>
                  <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-border/50 text-[10px] text-zinc-500">
                    <span className="w-1 h-1 rounded-full bg-brand animate-pulse" />
                    <span className="truncate">{toolStatus || 'Thinking…'}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1 py-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
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
        {activeFile && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-brand/10 text-brand-light text-[11px] font-medium">
              <FileText className="w-3 h-3" />
              {activeFile.title}
            </div>
            <span className="text-[10px] text-zinc-600">attached as context</span>
          </div>
        )}
        <div className="flex items-center gap-2 bg-zinc-950 rounded-xl border border-border p-1.5 focus-within:border-brand/40 focus-within:ring-1 focus-within:ring-brand/10 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); resizeTextarea() }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your team…"
            aria-label="Ask about your team"
            rows={1}
            className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none px-2 py-0 max-h-24 leading-7 overflow-hidden"
          />
          {streaming ? (
            <button
              onClick={cancel}
              aria-label="Stop generating"
              className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors shrink-0"
            >
              <StopCircle className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              aria-label="Send message"
              className="p-1.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-700 hover:text-zinc-100 transition-all active:scale-[0.97] disabled:opacity-30 shrink-0"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
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
