import { useEffect, useRef, useState } from 'react'
import { Send, Square, Bot, User, Sparkles, RotateCcw } from 'lucide-react'
import type { ChatMessage } from '../../electron/services/claude'

// Simple markdown-ish renderer: bold, inline code, blockquote, headers
function RenderText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <p key={i} className="mt-2 text-xs font-semibold text-fg">{line.slice(3)}</p>
        if (line.startsWith('# '))  return <p key={i} className="mt-2 text-sm font-bold text-fg">{line.slice(2)}</p>
        if (line.startsWith('> '))  return <p key={i} className="border-l-2 border-accent/40 pl-2 text-[11px] text-fg-subtle italic">{line.slice(2)}</p>
        if (line === '') return <div key={i} className="h-1" />
        // inline bold + code
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
        return (
          <p key={i} className="text-[12px] text-fg leading-relaxed">
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**'))
                return <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>
              if (p.startsWith('`') && p.endsWith('`'))
                return <code key={j} className="rounded bg-bg-subtle px-1 font-mono text-[11px] text-accent">{p.slice(1, -1)}</code>
              return p
            })}
          </p>
        )
      })}
    </div>
  )
}

const SUGGESTIONS = [
  '今天大盘走势如何？主要受什么驱动？',
  '帮我分析一下 NVDA 最新的基本面',
  '现在买科技股还是等回调？',
  '解释一下什么是 0DTE 期权策略',
  '美联储利率对股市的影响是什么？',
]

export function Chat() {
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  // Register chunk listener once on mount
  useEffect(() => {
    const unsub = window.api.chat.onChunk((chunk) => {
      if (chunk.sessionId !== sessionIdRef.current) return
      if (chunk.type === 'token' && chunk.text) {
        setHistory(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', text: last.text + chunk.text }]
          }
          return [...prev, { role: 'assistant' as const, text: chunk.text ?? '' }]
        })
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 10)
      } else if (chunk.type === 'done' || chunk.type === 'error') {
        if (chunk.type === 'error') {
          setHistory(prev => {
            const last = prev[prev.length - 1]
            const errText = `\n\n⚠️ ${chunk.error}`
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', text: last.text + errText }]
            }
            return [...prev, { role: 'assistant', text: errText }]
          })
        }
        setStreaming(false)
        setSessionId(null)
      }
    })
    unsubRef.current = unsub
    return () => { unsub(); unsubRef.current = null }
  }, [])

  async function send(text = input.trim()) {
    if (!text || streaming) return
    setInput('')
    const userMsg: ChatMessage = { role: 'user', text }
    // Only pass completed messages to history (not the current streaming one)
    const historyForPrompt = history.filter(m => m.role === 'user' || (m.role === 'assistant' && m.text.length > 0))
    setHistory(prev => [...prev, userMsg])
    setStreaming(true)
    try {
      const { sessionId: sid } = await window.api.chat.send(text, historyForPrompt)
      setSessionId(sid)
    } catch (e) {
      setHistory(prev => [...prev, { role: 'assistant', text: `⚠️ ${(e as Error).message}` }])
      setStreaming(false)
    }
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function cancel() {
    if (sessionIdRef.current) {
      void window.api.chat.cancel(sessionIdRef.current)
    }
    setStreaming(false)
    setSessionId(null)
  }

  function clear() {
    cancel()
    setHistory([])
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      {/* Header */}
      <header
        className="flex shrink-0 items-center justify-between border-b border-border px-5 py-2.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-accent" />
          <span className="text-sm font-semibold text-fg">Claude 助手</span>
          <span className="text-[11px] text-fg-subtle">· 美股投资问答</span>
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {history.length > 0 && (
            <button onClick={clear} className="btn flex items-center gap-1.5 py-1 text-xs" title="清空对话">
              <RotateCcw size={11} />
              清空
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {history.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-2xl border border-border bg-bg-elevated p-4">
                <Sparkles size={28} className="text-accent" />
              </div>
              <p className="text-sm font-medium text-fg">有什么想问的？</p>
              <p className="text-xs text-fg-subtle">可以搜索最新消息，分析股票，解答投资问题</p>
            </div>
            <div className="grid w-full max-w-lg grid-cols-1 gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:border-accent/30 hover:bg-bg-subtle hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {history.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full border ${
                  msg.role === 'user'
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-border bg-bg-elevated text-fg-muted'
                }`}>
                  {msg.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                </div>
                <div className={`min-w-0 max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-accent/10 border border-accent/20'
                    : 'bg-bg-elevated border border-border'
                }`}>
                  {msg.role === 'user'
                    ? <p className="text-[12px] text-fg leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    : <RenderText text={msg.text} />
                  }
                  {/* Streaming cursor */}
                  {streaming && i === history.length - 1 && msg.role === 'assistant' && (
                    <span className="inline-block h-3 w-0.5 animate-pulse bg-accent align-middle ml-0.5" />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border px-5 py-3">
        <div className="mx-auto max-w-2xl flex items-end gap-2">
          <div className="flex-1 rounded-xl border border-border bg-bg-elevated focus-within:border-accent/40 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="输入问题… (Enter 发送，Shift+Enter 换行)"
              rows={1}
              disabled={streaming}
              className="w-full resize-none rounded-xl bg-transparent px-3.5 py-2.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none disabled:opacity-50"
              style={{ maxHeight: '120px', overflowY: 'auto', lineHeight: '1.5' }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
            />
          </div>
          {streaming ? (
            <button
              onClick={cancel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-down/15 border border-accent-down/30 text-accent-down transition-colors hover:bg-accent-down/25"
              title="停止"
            >
              <Square size={13} />
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 border border-accent/30 text-accent transition-colors hover:bg-accent/25 disabled:opacity-30 disabled:cursor-not-allowed"
              title="发送 (Enter)"
            >
              <Send size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
