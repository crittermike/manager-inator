import { useState, useRef, useEffect } from 'react'
import { useAI } from '../hooks/useAI'
import { useTeamOverview } from '../hooks/useData'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Sparkles, User, Bot, Trash2, StopCircle, Copy, Check, Download } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const { streaming, streamedText, generate, cancel, reset } = useAI()
  const { overview } = useTeamOverview()
  const reports = overview?.reports ?? []
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const formatConversation = (): string => {
    return messages.map(m =>
      m.role === 'user' ? `**You:** ${m.content}` : `**Assistant:** ${m.content}`
    ).join('\n\n---\n\n')
  }

  useEffect(() => {
    return () => { cancel() }
  }, [cancel])

  const resizeTextarea = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamedText])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return

    const userMessage = input.trim()
    setInput('')
    if (inputRef.current) inputRef.current.style.height = '36px'

    const newUserMsg: Message = { role: 'user', content: userMessage }
    const updatedMessages = [...messages, newUserMsg]
    setMessages(updatedMessages)
    reset()

    // Build context with team info
    const teamContext = reports
      .map((r) => `- ${r.displayName} (${r.name}): meets on ${r.meetingDay}s, status: ${r.status}`)
      .join('\n')

    try {
      const response = await generate('chat', {
        message: `Context: You are helping manage a team with these direct reports:\n${teamContext}\n\nUser question: ${userMessage}`,
        history: updatedMessages.map((m) => ({ role: m.role, content: m.content }))
      })

      setMessages((prev) => [...prev, { role: 'assistant', content: response }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }
      ])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    reset()
  }

  const suggestions = [
    `How is ${reports[0]?.displayName || 'the team'} doing this quarter?`,
    'What should I focus on in my next 1:1s?',
    'Draft positive feedback for a recent accomplishment',
    'What patterns do you see across my team?'
  ]

  return (
    <>
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-6rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand" aria-hidden="true" />
            AI assistant
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Ask anything about your team, performance, or management
          </p>
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
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 bg-surface-raised rounded-lg transition-colors"
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
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

        {/* Streaming response */}
        {streaming && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-brand animate-pulse" aria-hidden="true" />
            </div>
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-surface border border-brand/20">
              <div className="prose-dark text-sm cursor-blink">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamedText || '...'}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
        <div className="sr-only" aria-live="polite">
          {streaming ? 'AI is generating a response...' : ''}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 pt-2 pb-2">
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

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear conversation"
        message="This will delete all messages in this chat session. This cannot be undone."
        confirmLabel="Clear"
        variant="danger"
        onConfirm={() => {
          setShowClearConfirm(false)
          clearChat()
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </>
  )
}
