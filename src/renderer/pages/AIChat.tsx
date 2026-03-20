import { useState, useRef, useEffect } from 'react'
import { useAI } from '../hooks/useAI'
import { useReportProfiles } from '../hooks/useData'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Sparkles, User, Bot, Trash2, StopCircle } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const { streaming, streamedText, generate, cancel, reset } = useAI()
  const { profiles } = useReportProfiles()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamedText])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    reset()

    // Build context with team info
    const teamContext = profiles
      .map((p) => `- ${p.displayName} (${p.name}): ${p.role}, meets on ${p.meetingDay}s`)
      .join('\n')

    try {
      const response = await generate('chat', {
        message: `Context: You are helping manage a team with these direct reports:\n${teamContext}\n\nUser question: ${userMessage}`,
        history: messages.map((m) => ({ role: m.role, content: m.content }))
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
    `How is ${profiles[0]?.displayName || 'the team'} doing this quarter?`,
    'What should I focus on in my next 1:1s?',
    'Draft positive feedback for a recent accomplishment',
    'What patterns do you see across my team?'
  ]

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-6rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand" />
            AI assistant
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Ask anything about your team, performance, or management
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 bg-surface-raised rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && !streaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
              <Bot className="w-7 h-7 text-brand" />
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
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-brand" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-brand text-white'
                  : 'bg-surface border border-border'
              }`}
            >
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
                <User className="w-4 h-4 text-zinc-300" />
              </div>
            )}
          </div>
        ))}

        {/* Streaming response */}
        {streaming && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-brand animate-pulse" />
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
      </div>

      {/* Input */}
      <div className="shrink-0 pt-2 pb-2">
        <div className="flex items-end gap-2 bg-surface rounded-2xl border border-border p-2 focus-within:border-brand/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your team..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none px-2 py-1.5 max-h-32"
            style={{ minHeight: '36px' }}
          />
          {streaming ? (
            <button
              onClick={cancel}
              className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="p-2 bg-brand text-white rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-30 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
