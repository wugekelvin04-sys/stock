import { useEffect, useRef, useState } from 'react'
import { Zap, Square, AlertCircle } from 'lucide-react'
import type { AnalysisContext } from '../../electron/services/claude'

interface Props {
  symbol: string
  context: AnalysisContext
}

type Status = 'idle' | 'running' | 'done' | 'error'

// Parse markdown-style ## headings into sections for styled display
function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0

  for (const line of lines) {
    if (line.startsWith('## ')) {
      elements.push(
        <h4 key={key++} className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-fg-muted first:mt-0">
          {line.slice(3)}
        </h4>
      )
    } else if (line.startsWith('### ')) {
      elements.push(
        <h5 key={key++} className="mt-2 mb-0.5 text-xs font-semibold text-fg">
          {line.slice(4)}
        </h5>
      )
    } else if (line.match(/^[-*] /)) {
      elements.push(
        <li key={key++} className="ml-3 text-sm text-fg-muted list-disc">
          {line.slice(2)}
        </li>
      )
    } else if (line.match(/^\d+\. /)) {
      elements.push(
        <li key={key++} className="ml-3 text-sm text-fg-muted list-decimal">
          {line.replace(/^\d+\. /, '')}
        </li>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-1" />)
    } else {
      elements.push(
        <p key={key++} className="text-sm text-fg-muted leading-relaxed">
          {line}
        </p>
      )
    }
  }
  return elements
}

export function AnalysisPanel({ symbol, context }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  // auto-scroll as tokens stream in
  useEffect(() => {
    if (status === 'running') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [text, status])

  // cleanup on unmount
  useEffect(() => {
    return () => {
      unsubRef.current?.()
      if (sessionId) window.api.analysis.cancel(sessionId).catch(() => {})
    }
  }, [sessionId])

  const start = async () => {
    if (status === 'running') return
    setText('')
    setError('')
    setStatus('running')

    // unsubscribe any previous listener
    unsubRef.current?.()

    const unsub = window.api.analysis.onChunk((chunk) => {
      if (chunk.type === 'token' && chunk.text) {
        setText((prev) => prev + chunk.text)
      } else if (chunk.type === 'done') {
        setStatus('done')
      } else if (chunk.type === 'error') {
        setError(chunk.error ?? '未知错误')
        setStatus('error')
      }
    })
    unsubRef.current = unsub

    try {
      const { sessionId: sid } = await window.api.analysis.start(symbol, context)
      setSessionId(sid)
    } catch (e) {
      setError((e as Error).message)
      setStatus('error')
      unsub()
    }
  }

  const cancel = async () => {
    if (sessionId) await window.api.analysis.cancel(sessionId)
    unsubRef.current?.()
    setStatus('idle')
  }

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          <span className="text-sm font-semibold text-fg">AI 分析</span>
          {status === 'running' && (
            <span className="flex items-center gap-1 text-xs text-fg-subtle">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              分析中…
            </span>
          )}
          {status === 'done' && (
            <span className="text-xs text-accent-up">完成</span>
          )}
        </div>
        <div className="flex gap-2">
          {status === 'running' ? (
            <button onClick={cancel} className="btn flex items-center gap-1.5 text-xs">
              <Square size={11} />
              停止
            </button>
          ) : (
            <button onClick={start} className="btn btn-primary flex items-center gap-1.5 text-xs">
              <Zap size={11} />
              {status === 'idle' ? '一键分析' : '重新分析'}
            </button>
          )}
        </div>
      </div>

      {status === 'idle' && (
        <p className="py-4 text-center text-xs text-fg-subtle">
          点击"一键分析"让 Claude 对 {symbol} 做深度解读
        </p>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-accent-down/10 p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-accent-down" />
          <p className="text-xs text-accent-down">{error}</p>
        </div>
      )}

      {(status === 'running' || status === 'done') && text && (
        <div className="max-h-96 overflow-y-auto rounded-lg bg-bg p-3">
          <div className="space-y-0.5">
            {renderMarkdown(text)}
            {status === 'running' && (
              <span className="inline-block h-3.5 w-0.5 animate-pulse bg-fg-muted align-middle" />
            )}
          </div>
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
