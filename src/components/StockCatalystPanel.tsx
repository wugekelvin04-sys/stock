import { useEffect, useRef, useState } from 'react'
import { Zap, RefreshCw, Square, TrendingUp, TrendingDown, ExternalLink, ChevronDown } from 'lucide-react'

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function cleanText(t: string) {
  return t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim()
}

interface ParsedSource { title: string; url: string }
type Impact = 'strong' | 'medium' | 'weak' | 'none'
interface CatalystItem { text: string; impact: Impact; date: string }

function parseImpact(raw: string): { impact: Impact; date: string; text: string } {
  // 匹配 [强/中/弱] 后可选 [MM-DD] 或 [MM] 或 [?]
  const m = raw.match(/^\[(强|中|弱)\]\s*(?:\[([^\]]+)\])?\s*/)
  if (!m) return { impact: 'none', date: '', text: raw }
  const map: Record<string, Impact> = { '强': 'strong', '中': 'medium', '弱': 'weak' }
  const rawDate = m[2] ?? ''
  // 过滤掉含 x/? 的无效日期
  const date = /^[\d-]+$/.test(rawDate) ? rawDate : rawDate === '?' ? '' : rawDate.replace(/-?xx?/gi, '')
  return { impact: map[m[1]], date: date.replace(/^-|-$/, ''), text: raw.slice(m[0].length) }
}

function parseContent(raw: string): { bullish: CatalystItem[]; bearish: CatalystItem[]; sources: ParsedSource[] } {
  const bullish: CatalystItem[] = []
  const bearish: CatalystItem[] = []
  const sources: ParsedSource[] = []

  // Extract all markdown links globally (handles multi-line [title]\n(url) too)
  const normalized = raw.replace(/\]\s*\n\s*\(/g, '](')
  const linkRe = /\[(.+?)\]\((https?:\/\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(normalized)) !== null) {
    sources.push({ title: m[1], url: m[2] })
  }

  // 把行内 ## 标题拆成独立行，防止 AI 把旁白和标题写在同一行
  const expanded = raw.replace(/(##\s*近期利[好空]|##\s*sources)/gi, '\n$1')
  const lines = expanded.split('\n')
  let section: 'none' | 'bull' | 'bear' | 'src' = 'none'

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#+\s*近期利好/.test(trimmed)) { section = 'bull'; continue }
    if (/^#+\s*近期利空/.test(trimmed)) { section = 'bear'; continue }
    if (/^#+\s*sources/i.test(trimmed) || /^sources[:：]?$/i.test(trimmed)) { section = 'src'; continue }
    if (/^#/.test(trimmed)) { section = 'none'; continue }
    if (section === 'src') continue
    if (/^---+$/.test(trimmed)) continue
    if (trimmed.startsWith('>')) continue
    if (/^\[.+\]\(https?:\/\//.test(trimmed)) continue

    const raw2 = cleanText(trimmed.replace(/^[-*]\s*/, ''))
    if (!raw2) continue
    const { impact, date, text } = parseImpact(raw2)
    // 去重：前16字相同视为重复
    const key = text.slice(0, 16)
    if (section === 'bull' && !bullish.some(b => b.text.slice(0, 16) === key)) bullish.push({ impact, date, text })
    else if (section === 'bear' && !bearish.some(b => b.text.slice(0, 16) === key)) bearish.push({ impact, date, text })
  }

  return { bullish, bearish, sources }
}

function ImpactBadge({ impact, side }: { impact: Impact; side: 'bull' | 'bear' }) {
  const label = impact === 'strong' ? '强' : impact === 'medium' ? '中' : impact === 'weak' ? '弱' : ''
  if (!label) return <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle/40" />
  const cls = side === 'bull'
    ? impact === 'strong' ? 'bg-accent-up/20 text-accent-up border-accent-up/30'
      : impact === 'medium' ? 'bg-accent-up/10 text-accent-up/70 border-accent-up/20'
      : 'bg-bg-subtle text-fg-subtle border-border'
    : impact === 'strong' ? 'bg-accent-down/20 text-accent-down border-accent-down/30'
      : impact === 'medium' ? 'bg-accent-down/10 text-accent-down/70 border-accent-down/20'
      : 'bg-bg-subtle text-fg-subtle border-border'
  return (
    <span className={`mt-0.5 shrink-0 rounded border px-1 py-px text-[9px] font-semibold leading-none ${cls}`}>
      {label}
    </span>
  )
}

export function StockCatalystPanel({ symbol }: { symbol: string }) {
  const [rawContent, setRawContent] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [date, setDate] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(true)

  const generate = async () => {
    setStreaming(true)
    setRawContent('')
    setShowSources(false)
    unsubRef.current?.()

    let mySessionId: string | null = null

    const unsub = window.api.stock.onCatalystChunk((chunk) => {
      if (!activeRef.current) return
      if (mySessionId && chunk.sessionId && chunk.sessionId !== mySessionId) return
      if (chunk.type === 'token' && chunk.text) setRawContent(p => p + chunk.text)
      else if (chunk.type === 'done') { setStreaming(false); setDate(todayET()) }
      else if (chunk.type === 'error') setStreaming(false)
    })
    unsubRef.current = unsub

    try {
      const { sessionId } = await window.api.stock.catalystGenerate(symbol)
      mySessionId = sessionId
    } catch {
      setStreaming(false)
      unsub()
    }
  }

  useEffect(() => {
    activeRef.current = true
    setRawContent('')
    setDate(null)
    setStreaming(false)
    setShowSources(false)
    unsubRef.current?.()

    window.api.stock.catalystGet(symbol).then(c => {
      if (!activeRef.current) return
      if (c && c.date === todayET()) {
        setRawContent(c.content)
        setDate(c.date)
      } else {
        void generate()
      }
    })

    return () => {
      activeRef.current = false
      unsubRef.current?.()
    }
  }, [symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSources) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowSources(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSources])

  const { bullish, bearish, sources } = parseContent(rawContent)

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-yellow-400" />
          <span className="text-sm font-semibold text-fg">利好 / 利空</span>
          {date && !streaming && <span className="text-[10px] text-fg-subtle">{date}</span>}
          {streaming && <span className="flex items-center gap-1 text-xs text-fg-subtle"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />分析中…</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Sources dropdown */}
          {sources.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowSources(p => !p)}
                className="btn flex items-center gap-1 text-xs py-0.5"
              >
                来源 <ChevronDown size={10} className={`transition-transform ${showSources ? 'rotate-180' : ''}`} />
              </button>
              {showSources && (
                <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-bg-elevated shadow-xl">
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    {sources.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => window.api.openExternal(s.url)}
                        className="flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-bg-subtle transition-colors"
                      >
                        <ExternalLink size={10} className="mt-0.5 shrink-0 text-fg-subtle" />
                        <span className="text-[11px] text-fg-muted leading-snug line-clamp-2">{s.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {streaming
            ? <button onClick={() => { unsubRef.current?.(); setStreaming(false) }} className="btn flex items-center gap-1 text-xs py-0.5"><Square size={10} />停止</button>
            : <button onClick={generate} className="btn flex items-center gap-1 text-xs py-0.5"><RefreshCw size={10} />刷新</button>
          }
        </div>
      </div>

      {streaming && !rawContent && (
        <p className="text-xs text-fg-subtle">正在搜索最新市场数据…<span className="inline-block h-3 w-0.5 animate-pulse bg-fg-muted align-middle ml-0.5" /></p>
      )}

      {(bullish.length > 0 || bearish.length > 0 || streaming) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingUp size={11} className="text-accent-up" />
              <span className="text-[11px] font-semibold text-accent-up">利好</span>
            </div>
            <ul className="space-y-1.5">
              {bullish.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <ImpactBadge impact={item.impact} side="bull" />
                  <span className="text-[11px] text-fg-muted leading-snug flex-1">{item.text}</span>
                  {item.date && <span className="shrink-0 text-[9px] text-fg-subtle font-mono mt-0.5">{item.date}</span>}
                </li>
              ))}
              {streaming && bullish.length === 0 && <li className="text-[11px] text-fg-subtle">…</li>}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingDown size={11} className="text-accent-down" />
              <span className="text-[11px] font-semibold text-accent-down">利空</span>
            </div>
            <ul className="space-y-1.5">
              {bearish.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <ImpactBadge impact={item.impact} side="bear" />
                  <span className="text-[11px] text-fg-muted leading-snug flex-1">{item.text}</span>
                  {item.date && <span className="shrink-0 text-[9px] text-fg-subtle font-mono mt-0.5">{item.date}</span>}
                </li>
              ))}
              {streaming && bearish.length === 0 && <li className="text-[11px] text-fg-subtle">…</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
