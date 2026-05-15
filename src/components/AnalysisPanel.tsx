import { useEffect, useRef, useState } from 'react'
import { Zap, Square, AlertCircle, TrendingUp, Phone, BarChart2 } from 'lucide-react'
import type { AnalysisContext, AnalysisMode } from '../../electron/services/claude'

interface Props {
  symbol: string
  context: AnalysisContext
}

type Status = 'idle' | 'running' | 'done' | 'error'

const QUICK_MODES: { mode: AnalysisMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { mode: 'why',   label: '今日归因', icon: <BarChart2 size={11} />, desc: '为什么今天涨/跌' },
  { mode: 'call',  label: 'Call 建议', icon: <Phone size={11} />,    desc: '买 Call 的行权价和时机' },
  { mode: 'trend', label: '趋势预测', icon: <TrendingUp size={11} />, desc: '短中期方向预测' },
  { mode: 'full',  label: '深度分析', icon: <Zap size={11} />,        desc: '完整多维度分析' },
]

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
    } else if (line.match(/^\*\*(.+)\*\*:/)) {
      elements.push(
        <p key={key++} className="text-sm text-fg leading-relaxed">
          {line.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={i} className="text-fg font-semibold">{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
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
    } else if (line.startsWith('> ')) {
      elements.push(
        <p key={key++} className="text-xs text-fg-subtle italic pl-2 border-l border-border my-0.5">
          {line.slice(2)}
        </p>
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
  const [activeMode, setActiveMode] = useState<AnalysisMode | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (status === 'running') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [text, status])

  const sessionIdRef = useRef<string | null>(null)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  useEffect(() => {
    return () => {
      unsubRef.current?.()
      if (sessionIdRef.current) window.api.analysis.cancel(sessionIdRef.current).catch(() => {})
    }
  }, [])

  const start = async (mode: AnalysisMode) => {
    if (status === 'running') return
    setActiveMode(mode)
    setText('')
    setError('')
    setStatus('running')
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
      const { sessionId: sid } = await window.api.analysis.start(symbol, context, mode)
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
              {QUICK_MODES.find(m => m.mode === activeMode)?.label ?? '分析中'}…
            </span>
          )}
          {status === 'done' && (
            <span className="text-xs text-accent-up">完成</span>
          )}
        </div>
        {status === 'running' && (
          <button onClick={cancel} className="btn flex items-center gap-1.5 text-xs">
            <Square size={11} />
            停止
          </button>
        )}
      </div>

      {/* Quick mode buttons */}
      {status !== 'running' && (
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_MODES.map(({ mode, label, icon, desc }) => (
            <button
              key={mode}
              onClick={() => start(mode)}
              title={desc}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors hover:bg-bg-subtle
                ${activeMode === mode && status === 'done'
                  ? 'border-accent/40 bg-accent/5 text-accent'
                  : 'border-border text-fg-subtle hover:text-fg-muted'
                }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {status === 'idle' && (
        <p className="text-center text-xs text-fg-subtle">
          选择分析类型，Claude 会实时搜索后回答
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
