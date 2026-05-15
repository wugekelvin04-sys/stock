import { useEffect, useRef, useState, useMemo } from 'react'
import { RefreshCw, Sparkles, Star, ChevronRight, TrendingUp, TrendingDown, ChevronDown, Send, Square, Bot, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WatchlistSection } from '../components/WatchlistSection'
import { toast } from '../stores/toast'
import type { ScreenerItem, IndexItem, CachedResult } from '../../electron/services/market'
import type { HoldingRow, SectorPick } from '../../electron/services/db'
import type { ChatMessage } from '../../electron/services/claude'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function pct(n: number | null | undefined) {
  if (n == null) return null
  const s = (Math.abs(n) < 10 ? n.toFixed(2) : n.toFixed(1)) + '%'
  return n >= 0 ? '+' + s : s
}
function isTradingHours() {
  const now = new Date()
  const day = now.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })
  if (day === 'Sat' || day === 'Sun') return false
  const h = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }), 10)
  return h >= 4 && h < 20
}
function timeAgo(ms: number) {
  const diff = Math.floor((Date.now() - ms) / 60000)
  if (diff < 1) return '刚刚'
  if (diff < 60) return `${diff}m ago`
  return `${Math.floor(diff / 60)}h ago`
}

// ── IndexCard ─────────────────────────────────────────────────────────────────

function IndexSparkline({ bars, up }: { bars: number[]; up: boolean }) {
  const path = useMemo(() => {
    if (bars.length < 2) return ''
    const w = 100, h = 32
    const min = Math.min(...bars), max = Math.max(...bars), range = max - min || 1
    const pts = bars.map((p, i) => {
      const x = (i / (bars.length - 1)) * w
      const y = h - ((p - min) / range) * (h - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return 'M' + pts.join('L')
  }, [bars])

  if (!path) return null
  const color = up ? '#22c55e' : '#ef4444'
  const lastX = 100
  const min = Math.min(...bars), max = Math.max(...bars), range = max - min || 1
  const lastY = 32 - ((bars[bars.length - 1] - min) / range) * (32 - 4) - 2

  return (
    <svg width={100} height={32} viewBox="0 0 100 32" className="overflow-visible">
      <defs>
        <linearGradient id={`gi-${up ? 'up' : 'dn'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path}L${lastX},32L0,32Z`} fill={`url(#gi-${up ? 'up' : 'dn'})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  )
}

function IndexCard({ idx, bars }: { idx: IndexItem; bars: number[] }) {
  const up = idx.changePercent >= 0
  const isVIX = idx.symbol === '^VIX'
  const displayPrice = idx.price < 100
    ? idx.price.toFixed(2)
    : idx.price.toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <div className={`flex-1 rounded-xl border bg-bg-elevated px-3.5 py-2.5 flex items-center gap-3 min-w-0 ${
      up ? 'border-accent-up/20' : 'border-accent-down/20'
    }`}>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-fg-subtle">{idx.name}</p>
        <p className="font-mono text-base font-semibold text-fg leading-tight">{displayPrice}</p>
        <div className={`flex items-center gap-1 text-[11px] font-mono font-medium mt-0.5 ${up ? 'text-accent-up' : 'text-accent-down'}`}>
          {!isVIX && (up ? <TrendingUp size={9} /> : <TrendingDown size={9} />)}
          <span>{up ? '+' : ''}{idx.change.toFixed(2)}</span>
          <span className="text-fg-subtle/50">·</span>
          <span>{up ? '+' : ''}{idx.changePercent.toFixed(2)}%</span>
        </div>
      </div>
      {bars.length > 1 && <IndexSparkline bars={bars} up={up} />}
    </div>
  )
}

// ── Inline Chat ───────────────────────────────────────────────────────────────

const CHAT_SUGGESTIONS = [
  '今天大盘走势如何？', '帮我分析一下当前市场热点', '现在该关注哪些板块？',
]

function InlineChat() {
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
            const err = `⚠️ ${chunk.error}`
            if (last?.role === 'assistant') return [...prev.slice(0, -1), { role: 'assistant', text: last.text + '\n\n' + err }]
            return [...prev, { role: 'assistant', text: err }]
          })
        }
        setStreaming(false)
        sessionIdRef.current = null
      }
    })
    return () => { unsub() }
  }, [])

  async function send(text = input.trim()) {
    if (!text || streaming) return
    setInput('')
    setHistory(prev => [...prev, { role: 'user', text }])
    setStreaming(true)
    try {
      const { sessionId } = await window.api.chat.send(text, history)
      sessionIdRef.current = sessionId
    } catch (e) {
      setHistory(prev => [...prev, { role: 'assistant', text: `⚠️ ${(e as Error).message}` }])
      setStreaming(false)
    }
  }

  function cancel() {
    if (sessionIdRef.current) void window.api.chat.cancel(sessionIdRef.current)
    setStreaming(false)
    sessionIdRef.current = null
  }

  return (
    <div className="flex h-[180px] shrink-0 flex-col border-b border-border overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-2">
        <Bot size={12} className="text-accent" />
        <span className="text-xs font-semibold text-fg">问 Claude</span>
        {history.length > 0 && (
          <button onClick={() => { cancel(); setHistory([]) }} className="ml-auto text-[10px] text-fg-subtle hover:text-fg-muted transition-colors">清空</button>
        )}
      </div>

      {/* Messages (only when there's content) */}
      {history.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 space-y-2">
          {history.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`max-w-[90%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-accent/10 text-fg border border-accent/20'
                  : 'bg-bg-subtle text-fg'
              }`}>
                {msg.text}
                {streaming && i === history.length - 1 && msg.role === 'assistant' && (
                  <span className="inline-block h-3 w-0.5 animate-pulse bg-accent align-middle ml-0.5" />
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Suggestions when empty */}
      {history.length === 0 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2">
          {CHAT_SUGGESTIONS.map(s => (
            <button key={s} onClick={() => void send(s)}
              className="shrink-0 rounded-md border border-border bg-bg-subtle px-2 py-1 text-[10px] text-fg-muted hover:text-fg hover:border-accent/30 transition-colors whitespace-nowrap">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder="输入问题… (Enter 发送)"
          disabled={streaming}
          className="flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[11px] text-fg placeholder:text-fg-subtle focus:border-accent/40 focus:outline-none transition-colors disabled:opacity-50"
        />
        {streaming ? (
          <button onClick={cancel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-down/15 border border-accent-down/30 text-accent-down hover:bg-accent-down/25 transition-colors">
            <Square size={11} />
          </button>
        ) : (
          <button onClick={() => void send()} disabled={!input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-colors disabled:opacity-30">
            <Send size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── ScreenerRow ───────────────────────────────────────────────────────────────

function ScreenerRow({ rank, item, spark }: { rank: number; item: ScreenerItem; spark?: number[] }) {
  const navigate = useNavigate()
  const up = item.changePercent >= 0
  return (
    <div onClick={() => navigate(`/detail/${item.symbol}`)}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-bg-subtle transition-colors">
      <span className="w-4 shrink-0 text-center text-[11px] font-mono text-fg-subtle">{rank}</span>
      <span className="flex-1 font-mono text-xs font-semibold text-fg">{item.symbol}</span>
      {spark && spark.length > 1 && (
        <svg width={44} height={18} viewBox="0 0 44 18" className="shrink-0">
          {(() => {
            const min = Math.min(...spark), max = Math.max(...spark), range = max - min || 1
            const pts = spark.map((p, i) => {
              const x = (i / (spark.length - 1)) * 44
              const y = 18 - ((p - min) / range) * 14 - 2
              return `${x.toFixed(1)},${y.toFixed(1)}`
            }).join('L')
            return <path d={`M${pts}`} fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          })()}
        </svg>
      )}
      <span className="font-mono text-xs text-fg-muted">${fmt(item.price)}</span>
      <span className={`w-14 text-right text-xs font-mono font-medium ${up ? 'text-accent-up' : 'text-accent-down'}`}>
        {up ? '+' : ''}{fmt(item.changePercent)}%
      </span>
    </div>
  )
}

// ── AI Sector Panel ───────────────────────────────────────────────────────────

function SectorPanel({ picks, stockQuotes, running, progress, onRefresh, date }: {
  picks: SectorPick[]
  stockQuotes: Record<string, { price: number; changePercent: number }>
  running: boolean
  progress: string
  onRefresh: () => void
  date: string | null
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-fg">板块榜</span>
          {date && <span className="text-[10px] text-fg-subtle">{date}</span>}
        </div>
        <button onClick={onRefresh} disabled={running}
          className="btn flex items-center gap-1 py-0.5 text-[11px] disabled:opacity-50">
          {running
            ? <Sparkles size={10} className="animate-pulse text-accent" />
            : <RotateCcw size={10} />}
          {running ? 'AI分析中…' : '刷新'}
        </button>
      </div>

      {/* Progress stream */}
      {running && (
        <div className="mx-2 mb-1 rounded-lg bg-bg-subtle p-2 text-[10px] text-fg-muted leading-relaxed whitespace-pre-wrap max-h-20 overflow-y-auto">
          {progress || '正在分析今日板块走势…'}
          <span className="inline-block h-2.5 w-0.5 animate-pulse bg-accent align-middle ml-0.5" />
        </div>
      )}

      {/* Sector list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {!running && picks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-1.5">
            <Sparkles size={16} className="text-fg-subtle" />
            <p className="text-[11px] text-fg-subtle">点击"刷新"让 Claude 分析板块</p>
          </div>
        )}
        {picks.map((sector) => {
          const isOpen = expanded === sector.etf
          return (
            <div key={sector.etf} className="rounded-lg overflow-hidden">
              {/* Sector header row */}
              <div
                onClick={() => setExpanded(isOpen ? null : sector.etf)}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors rounded-lg
                  ${isOpen ? 'bg-bg-subtle' : 'hover:bg-bg-subtle'}`}
              >
                {/* Name + hint */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-fg">{sector.name}</span>
                    <span className="font-mono text-[9px] text-fg-subtle border border-border rounded px-1">{sector.etf}</span>
                  </div>
                  <p className="text-[10px] text-fg-subtle leading-snug truncate mt-0.5">{sector.changeHint}</p>
                </div>
                <ChevronDown size={10} className={`shrink-0 text-fg-subtle/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </div>

              {/* Expanded: stock cards */}
              {isOpen && sector.stocks.length > 0 && (
                <div className="px-1 pb-1.5 pt-0.5 grid grid-cols-3 gap-1">
                  {sector.stocks.map(stock => {
                    const q = stockQuotes[stock.symbol]
                    const up = (q?.changePercent ?? 0) >= 0
                    return (
                      <div
                        key={stock.symbol}
                        onClick={() => navigate(`/detail/${stock.symbol}`)}
                        className={`flex flex-col cursor-pointer rounded-lg px-2 py-1.5 border transition-colors hover:brightness-110
                          ${up ? 'border-accent-up/20 bg-accent-up/5' : 'border-accent-down/20 bg-accent-down/5'}`}
                      >
                        <span className="font-mono text-[11px] font-semibold text-fg leading-none">{stock.symbol}</span>
                        {q ? (
                          <>
                            <span className="font-mono text-[10px] text-fg-muted mt-1">
                              ${q.price >= 100 ? q.price.toFixed(1) : q.price.toFixed(2)}
                            </span>
                            <span className={`font-mono text-[10px] font-semibold mt-0.5 ${up ? 'text-accent-up' : 'text-accent-down'}`}>
                              {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] text-fg-subtle mt-1">…</span>
                        )}
                        <p className="mt-1 text-[9px] text-fg-subtle leading-tight line-clamp-2">{stock.reason}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Holding row ───────────────────────────────────────────────────────────────

function HoldingRow({ row, quote }: { row: HoldingRow; quote?: { price: number; change: number; changePercent: number } }) {
  const navigate = useNavigate()
  const isOption = row.type === 'option'
  const multiplier = isOption ? 100 : 1
  const qty = row.qty
  const avgCost = row.costBasis
  const mktPrice = quote?.price
  const totalCost = avgCost * qty * multiplier
  const totalVal = mktPrice != null ? mktPrice * qty * multiplier : null
  const totalPnl = totalVal != null ? totalVal - totalCost : null
  const totalPnlPct = totalCost > 0 && totalPnl != null ? (totalPnl / totalCost) * 100 : null
  const dayPnl = quote?.change != null ? quote.change * qty * multiplier : null
  const dayPct = quote?.changePercent

  const pnlUp = (totalPnl ?? 0) >= 0
  const dayUp = (dayPnl ?? 0) >= 0

  const label = isOption
    ? `${row.symbol} ${row.side?.toUpperCase()} $${row.strike} ${row.expiry?.slice(5)}`
    : row.symbol

  function fmtMoney(v: number) {
    const abs = Math.abs(v)
    const s = abs >= 10000 ? (abs / 1000).toFixed(1) + 'K' : abs >= 1 ? abs.toFixed(2) : abs.toFixed(3)
    return (v >= 0 ? '+' : '-') + '$' + s
  }

  return (
    <div onClick={() => navigate(`/detail/${row.symbol}`)}
      className="cursor-pointer rounded-lg px-2.5 py-2 hover:bg-bg-subtle transition-colors border border-transparent hover:border-border/50">
      {/* Row 1: symbol + market price + day change */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs font-semibold text-fg flex-1 min-w-0 truncate">{label}</span>
        {mktPrice != null && (
          <span className="font-mono text-xs text-fg-muted shrink-0">
            ${mktPrice >= 100 ? mktPrice.toFixed(1) : mktPrice.toFixed(2)}
          </span>
        )}
        {dayPct != null && (
          <span className={`font-mono text-[11px] font-medium shrink-0 ${dayUp ? 'text-accent-up' : 'text-accent-down'}`}>
            {dayUp ? '+' : ''}{dayPct.toFixed(2)}%
          </span>
        )}
      </div>
      {/* Row 2: qty · avg cost · total value */}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-fg-subtle">{qty}{isOption ? ' 张' : ' 股'}</span>
        <span className="text-[10px] text-fg-subtle/60">·</span>
        <span className="text-[10px] text-fg-subtle">均 ${fmt(avgCost)}</span>
        {totalVal != null && (
          <>
            <span className="text-[10px] text-fg-subtle/60">·</span>
            <span className="font-mono text-[10px] text-fg-muted">
              ${totalVal >= 10000 ? (totalVal / 1000).toFixed(1) + 'K' : fmt(totalVal)}
            </span>
          </>
        )}
      </div>
      {/* Row 3: day P&L + total P&L */}
      {(dayPnl != null || totalPnl != null) && (
        <div className="flex items-center gap-3 mt-0.5">
          {dayPnl != null && (
            <span className={`text-[10px] font-mono ${dayUp ? 'text-accent-up' : 'text-accent-down'}`}>
              今日 {fmtMoney(dayPnl)}
            </span>
          )}
          {totalPnl != null && (
            <span className={`text-[10px] font-mono ${pnlUp ? 'text-accent-up' : 'text-accent-down'}`}>
              持仓 {fmtMoney(totalPnl)}{totalPnlPct != null ? ` (${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%)` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── PickRow ───────────────────────────────────────────────────────────────────

interface PickQuote { price: number; changePercent: number; weekPct: number | null; monthPct: number | null; isYesterday: boolean }

function PickRow({ rank, symbol, reason, quote }: { rank: number; symbol: string; reason: string; quote?: PickQuote }) {
  const navigate = useNavigate()
  const up = (quote?.changePercent ?? 0) >= 0
  return (
    <div onClick={() => navigate(`/detail/${symbol}`)}
      className="group cursor-pointer rounded-lg px-2 py-1 transition-colors hover:bg-bg-subtle">
      <div className="flex items-center gap-1.5">
        <span className="w-3.5 shrink-0 text-center text-[11px] font-mono text-fg-subtle">{rank}</span>
        <span className="font-mono text-xs font-semibold text-fg">{symbol}</span>
        {quote?.price != null && <span className="font-mono text-[11px] text-fg-muted">${quote.price.toFixed(2)}</span>}
        {quote?.changePercent != null && (
          <span className={`text-[11px] font-mono font-medium ${up ? 'text-accent-up' : 'text-accent-down'}`}>
            {pct(quote.changePercent)}
            {quote.isYesterday && <span className="text-[9px] text-fg-subtle ml-0.5">昨</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {quote?.weekPct != null && (
            <span className={`text-[10px] font-mono ${quote.weekPct >= 0 ? 'text-accent-up/60' : 'text-accent-down/60'}`}>
              5d {pct(quote.weekPct)}
            </span>
          )}
          {quote?.monthPct != null && (
            <span className={`text-[10px] font-mono ${quote.monthPct >= 0 ? 'text-accent-up/60' : 'text-accent-down/60'}`}>
              1m {pct(quote.monthPct)}
            </span>
          )}
        </div>
      </div>
      <p className="pl-5 text-[10px] text-fg-subtle leading-snug">{reason}</p>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

interface DailyPick { symbol: string; reason: string }
interface DailyPicksResult { date: string; picks: DailyPick[] }

export function Dashboard() {
  const navigate = useNavigate()
  const [gainers, setGainers] = useState<CachedResult<ScreenerItem[]> | null>(null)
  const [losers, setLosers] = useState<CachedResult<ScreenerItem[]> | null>(null)
  const [indices, setIndices] = useState<IndexItem[]>([])
  const [indexBars, setIndexBars] = useState<Record<string, number[]>>({})
  const [picks, setPicks] = useState<DailyPicksResult | null>(null)
  const [picksQuotes, setPicksQuotes] = useState<Record<string, PickQuote>>({})
  const [picksRunning, setPicksRunning] = useState(false)
  const [picksProgress, setPicksProgress] = useState('')
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({})
  const [holdings, setHoldings] = useState<HoldingRow[]>([])
  const [holdingQuotes, setHoldingQuotes] = useState<Record<string, { price: number; change: number; changePercent: number }>>({})
  // AI sector picks
  const [sectorPicks, setSectorPicks] = useState<SectorPick[]>([])
  const [sectorPicksDate, setSectorPicksDate] = useState<string | null>(null)
  const [sectorPicksRunning, setSectorPicksRunning] = useState(false)
  const [sectorPicksProgress, setSectorPicksProgress] = useState('')
  const [sectorStockQuotes, setSectorStockQuotes] = useState<Record<string, { price: number; changePercent: number }>>({})
  const sectorPicksUnsubRef = useRef<(() => void) | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)
  const picksUnsubRef = useRef<(() => void) | null>(null)

  async function loadIndexBars(syms: string[]) {
    const etHour = parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }), 10)
    const snap: Record<string, number[]> = {}
    await Promise.all(syms.map(async (sym) => {
      try {
        const res = etHour < 4
          ? await window.api.market.prevDayIntraday(sym)
          : await window.api.market.intraday(sym)
        if (res?.data?.length) snap[sym] = res.data.map(b => b.close)
      } catch { /* silent */ }
    }))
    setIndexBars(prev => ({ ...prev, ...snap }))
  }

  // ── refs: always-current symbol lists for interval callback ─────────────────
  const picksRef = useRef<DailyPicksResult | null>(null)
  const sectorPicksRef = useRef<SectorPick[]>([])
  const holdingsRef = useRef<HoldingRow[]>([])
  const gainerSymsRef = useRef<string[]>([])
  const loserSymsRef = useRef<string[]>([])

  useEffect(() => { picksRef.current = picks }, [picks])
  useEffect(() => { sectorPicksRef.current = sectorPicks }, [sectorPicks])
  useEffect(() => { holdingsRef.current = holdings }, [holdings])

  // ── unified quote refresh: one batch call for everything on screen ───────────
  async function refreshAllQuotes() {
    const etHour = parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }), 10)
    const isYesterday = etHour < 4

    const pickSyms = picksRef.current?.picks.map(i => i.symbol) ?? []
    const sectorSyms = sectorPicksRef.current.flatMap(s => s.stocks.map(st => st.symbol))
    const holdingSyms = holdingsRef.current.map(r => r.symbol)
    const screenerSyms = [...gainerSymsRef.current, ...loserSymsRef.current]
    const allSyms = [...new Set([...pickSyms, ...sectorSyms, ...holdingSyms, ...screenerSyms])]
    if (!allSyms.length) return

    try {
      const quotesRes = await window.api.market.quotes(allSyms)
      const qmap: Record<string, { price: number; change: number; changePercent: number }> = {}
      for (const q of quotesRes.data ?? []) {
        qmap[q.symbol] = { price: q.price, change: q.change, changePercent: q.changePercent }
      }

      // holdings
      if (holdingSyms.length) {
        const hq: Record<string, { price: number; change: number; changePercent: number }> = {}
        for (const s of holdingSyms) if (qmap[s]) hq[s] = qmap[s]
        setHoldingQuotes(hq)
      }

      // sector stock quotes
      if (sectorSyms.length) {
        const sq: Record<string, { price: number; changePercent: number }> = {}
        for (const s of sectorSyms) if (qmap[s]) sq[s] = { price: qmap[s].price, changePercent: qmap[s].changePercent }
        setSectorStockQuotes(sq)
      }

      // picks quotes (price + changePercent only; week/month pct loaded once on first picks load)
      if (pickSyms.length) {
        setPicksQuotes(prev => {
          const next = { ...prev }
          for (const s of pickSyms) {
            if (qmap[s]) next[s] = { ...(prev[s] ?? { weekPct: null, monthPct: null }), price: qmap[s].price, changePercent: qmap[s].changePercent, isYesterday }
          }
          return next
        })
      }
    } catch { /* silent */ }
  }

  // Load picks week/month history once (expensive — only on first picks load, not on every refresh)
  async function loadPicksHistory(symbols: string[]) {
    if (!symbols.length) return
    try {
      const histRes = await Promise.all(symbols.map(s => window.api.market.history(s, '1mo').catch(() => null)))
      setPicksQuotes(prev => {
        const next = { ...prev }
        symbols.forEach((s, idx) => {
          const bars = histRes[idx]?.data ?? []
          const weekBar = bars.length >= 5 ? bars[bars.length - 5] : bars[0]
          const monthBar = bars[0]
          const cur = next[s]
          if (cur) {
            next[s] = {
              ...cur,
              weekPct: weekBar ? ((cur.price - weekBar.close) / weekBar.close) * 100 : null,
              monthPct: monthBar ? ((cur.price - monthBar.close) / monthBar.close) * 100 : null,
            }
          }
        })
        return next
      })
    } catch { /* silent */ }
  }

  async function loadSparklines(symbols: string[]) {
    await Promise.all(symbols.map(async (sym) => {
      try {
        const result = await window.api.market.intraday(sym)
        if (result?.data?.length) setSparklines(prev => ({ ...prev, [sym]: result.data.map(b => b.close) }))
      } catch { /* silent */ }
    }))
  }

  async function loadHoldings() {
    try {
      const rows = await window.api.portfolio.list()
      setHoldings(rows)
      holdingsRef.current = rows
    } catch { /* silent */ }
  }

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [g, l, idxRes] = await Promise.all([
        window.api.market.gainers(),
        window.api.market.losers(),
        window.api.market.indices(),
      ])
      setGainers(g); setLosers(l)
      gainerSymsRef.current = (g?.data ?? []).map(i => i.symbol)
      loserSymsRef.current = (l?.data ?? []).map(i => i.symbol)
      if (idxRes?.data) { setIndices(idxRes.data); void loadIndexBars(idxRes.data.map(i => i.symbol)) }
      setLastRefresh(Date.now())
      void loadSparklines([...new Set([...gainerSymsRef.current, ...loserSymsRef.current])])
      // One unified quote pass for everything currently on screen
      void refreshAllQuotes()
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      if (msg.includes('rate') || msg.includes('429')) toast.warning('数据请求过于频繁', '限流')
      else toast.error(`行情加载失败: ${msg.slice(0, 60)}`, '网络错误')
    } finally { setLoading(false); setRefreshing(false) }
  }

  const runPicks = async () => {
    if (picksRunning) return
    setPicksRunning(true); setPicksProgress('')
    picksUnsubRef.current?.()
    const unsubProg = window.api.insight.onPicksProgress(t => setPicksProgress(p => p + t))
    const unsubDone = window.api.insight.onPicksDone(result => {
      unsubProg(); unsubDone()
      picksUnsubRef.current = null
      setPicksRunning(false); setPicksProgress('')
      if (!result.ok) toast.error(result.error ?? '分析失败', '机会榜')
    })
    picksUnsubRef.current = () => { unsubProg(); unsubDone() }
    try { await window.api.insight.runPicks() } catch (e) {
      unsubProg(); unsubDone(); picksUnsubRef.current = null
      setPicksRunning(false); setPicksProgress('')
      toast.error((e as Error).message, '机会榜')
    }
  }

  const runSectorPicks = () => {
    if (sectorPicksRunning) return
    setSectorPicksRunning(true)
    setSectorPicksProgress('')
    sectorPicksUnsubRef.current?.()
    const unsubProg = window.api.insight.onSectorPicksProgress(t => setSectorPicksProgress(p => p + t))
    const unsubDone = window.api.insight.onSectorPicksDone(result => {
      unsubProg(); unsubDone()
      sectorPicksUnsubRef.current = null
      setSectorPicksRunning(false); setSectorPicksProgress('')
      if (!result.ok) toast.error(result.error ?? '板块分析失败', '板块榜')
    })
    sectorPicksUnsubRef.current = () => { unsubProg(); unsubDone() }
    window.api.insight.runSectorPicks().catch((e: Error) => {
      unsubProg(); unsubDone()
      sectorPicksUnsubRef.current = null
      setSectorPicksRunning(false); setSectorPicksProgress('')
      toast.error(e.message, '板块榜')
    })
  }

  useEffect(() => { picksRef.current = picks }, [picks])
  useEffect(() => { sectorPicksRef.current = sectorPicks }, [sectorPicks])

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    // Load today's picks from DB first so refs are populated before refreshAllQuotes
    window.api.insight.dailyPicks().then(p => {
      if (p) {
        setPicks(p)
        picksRef.current = p
      }
    }).catch(() => {})

    // Initial load: market screener + indices + one unified quote pass
    void load().then(() => {
      // Auto-run picks only if today has no analysis yet
      if (!picksRef.current || picksRef.current.date !== today) void runPicks()
      else void loadPicksHistory(picksRef.current.picks.map(i => i.symbol))
    })
    void loadHoldings()

    // Sector picks: load from DB, auto-run only if today has no analysis yet
    window.api.insight.sectorPicks().then(sp => {
      if (sp) {
        setSectorPicks(sp.picks)
        setSectorPicksDate(sp.date)
        sectorPicksRef.current = sp.picks
        if (sp.date !== today) runSectorPicks()
        else void refreshAllQuotes() // prices for today's cached picks
      } else {
        runSectorPicks()
      }
    }).catch(() => {})

    // Timed refresh:盘中 5min / 非盘中 15min
    // One call to refreshAllQuotes covers everything: holdings, picks, sector stocks, screener
    const interval = isTradingHours() ? 5 * 60 * 1000 : 15 * 60 * 1000
    const t = setInterval(() => {
      void load(true)        // screener + indices + sparklines + refreshAllQuotes inside
      void loadHoldings()    // re-sync holding list (imports may have changed)
    }, interval)

    // Push from scheduler (cron auto-ran analysis)
    const unsub = window.api.insight.onDailyPicksUpdated(payload => {
      setPicks(payload)
      picksRef.current = payload
      void refreshAllQuotes()
      void loadPicksHistory(payload.picks.map(p => p.symbol))
    })
    const unsubSector = window.api.insight.onSectorPicksUpdated(payload => {
      setSectorPicks(payload.picks)
      setSectorPicksDate(payload.date)
      sectorPicksRef.current = payload.picks
      void refreshAllQuotes()
    })

    return () => {
      clearInterval(t)
      unsub()
      unsubSector()
      picksUnsubRef.current?.()
      sectorPicksUnsubRef.current?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const gainerList = gainers?.data ?? []
  const loserList = losers?.data ?? []
  const stockHoldings = holdings.filter(h => h.type === 'stock')
  const optionHoldings = holdings.filter(h => h.type === 'option')

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      {/* Titlebar */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="text-sm font-semibold text-fg">市场总览</span>
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {lastRefresh && <span className="text-[11px] text-fg-subtle">{timeAgo(lastRefresh)}</span>}
          <button onClick={() => void load()} disabled={loading || refreshing} className="btn flex items-center gap-1.5 py-1 text-xs">
            <RefreshCw size={11} className={loading || refreshing ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </header>

      {/* Index bar */}
      {indices.length > 0 && (
        <div className="shrink-0 flex gap-2.5 border-b border-border px-5 py-2.5">
          {indices.map(idx => <IndexCard key={idx.symbol} idx={idx} bars={indexBars[idx.symbol] ?? []} />)}
        </div>
      )}

      {/* Main 3-column layout */}
      <div className="flex min-h-0 flex-1 divide-x divide-border overflow-hidden">

        {/* 左列：涨幅榜 + 跌幅榜 */}
        <div className="flex w-[240px] shrink-0 flex-col divide-y divide-border overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between px-3 py-1.5">
              <span className="text-xs font-semibold text-fg">涨幅榜</span>
              <TrendingUp size={12} className="text-accent-up" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
              {loading && !gainerList.length
                ? <div className="flex justify-center pt-8"><div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" /></div>
                : gainerList.map((item, i) => <ScreenerRow key={item.symbol} rank={i + 1} item={item} spark={sparklines[item.symbol]} />)}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between px-3 py-1.5">
              <span className="text-xs font-semibold text-fg">跌幅榜</span>
              <TrendingDown size={12} className="text-accent-down" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
              {loading && !loserList.length
                ? <div className="flex justify-center pt-8"><div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" /></div>
                : loserList.map((item, i) => <ScreenerRow key={item.symbol} rank={i + 1} item={item} spark={sparklines[item.symbol]} />)}
            </div>
          </div>
        </div>

        {/* 中列：Claude 问答 + 自选/持仓 + 板块榜 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

          {/* 顶部：Claude 自由提问 */}
          <InlineChat />

          {/* 下方：持仓+自选（3/4）| 板块榜（1/4） */}
          <div className="flex min-h-0 flex-1 divide-x divide-border overflow-hidden">

            {/* 持仓 + 自选 竖排，占 3/4 宽度 */}
            <div className="flex min-w-0 flex-[3] flex-col divide-y divide-border overflow-hidden">

              {/* 持仓 */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex shrink-0 items-center justify-between px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-fg">持仓</span>
                    {holdings.length > 0 && (
                      <span className="text-[10px] text-fg-subtle">{holdings.length} 只</span>
                    )}
                    {/* Total portfolio value */}
                    {holdings.length > 0 && (() => {
                      const total = holdings.reduce((sum, h) => {
                        const q = holdingQuotes[h.symbol]
                        const m = h.type === 'option' ? 100 : 1
                        return sum + (q ? q.price * h.qty * m : h.costBasis * h.qty * m)
                      }, 0)
                      const cost = holdings.reduce((sum, h) => sum + h.costBasis * h.qty * (h.type === 'option' ? 100 : 1), 0)
                      const pnl = total - cost
                      const up = pnl >= 0
                      return (
                        <span className={`font-mono text-[10px] font-medium ${up ? 'text-accent-up' : 'text-accent-down'}`}>
                          ${total >= 10000 ? (total / 1000).toFixed(1) + 'K' : fmt(total)}
                          <span className="ml-1 opacity-70">{up ? '+' : ''}{((pnl / cost) * 100).toFixed(1)}%</span>
                        </span>
                      )
                    })()}
                  </div>
                  <button onClick={() => navigate('/portfolio')}
                    className="flex items-center gap-0.5 text-[10px] text-fg-subtle hover:text-fg-muted transition-colors">
                    详情 <ChevronRight size={10} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                  {holdings.length === 0 ? (
                    <p className="py-4 text-center text-[11px] text-fg-subtle">暂无持仓，前往持仓页导入</p>
                  ) : (
                    <>
                      {stockHoldings.map(row => (
                        <HoldingRow key={row.id} row={row} quote={holdingQuotes[row.symbol]} />
                      ))}
                      {optionHoldings.length > 0 && (
                        <>
                          <p className="px-2 pt-1 pb-0.5 text-[10px] text-fg-subtle uppercase tracking-wider">期权</p>
                          {optionHoldings.map(row => (
                            <HoldingRow key={row.id} row={row} quote={holdingQuotes[row.symbol]} />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 自选股 */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex shrink-0 items-center justify-between px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Star size={11} className="text-yellow-400" />
                    <span className="text-xs font-semibold text-fg">自选股</span>
                  </div>
                  <button onClick={() => navigate('/watchlist')}
                    className="flex items-center gap-0.5 text-[10px] text-fg-subtle hover:text-fg-muted transition-colors">
                    管理 <ChevronRight size={10} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                  <WatchlistSection embedded />
                </div>
              </div>
            </div>

            {/* 板块榜（AI推荐），占 1/4 宽度 */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <SectorPanel
                picks={sectorPicks}
                stockQuotes={sectorStockQuotes}
                running={sectorPicksRunning}
                progress={sectorPicksProgress}
                onRefresh={runSectorPicks}
                date={sectorPicksDate}
              />
            </div>
          </div>
        </div>

        {/* 右列：机会榜 */}
        <div className="flex w-[280px] shrink-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between px-3 py-1.5">
            <div>
              <span className="text-xs font-semibold text-fg">今日机会榜</span>
              {picks && <span className="ml-1.5 text-[10px] text-fg-subtle">{picks.date}</span>}
            </div>
            <button onClick={runPicks} disabled={picksRunning}
              className="btn flex items-center gap-1 py-0.5 text-[11px] disabled:opacity-50">
              <Sparkles size={10} className={picksRunning ? 'animate-pulse text-accent' : ''} />
              {picksRunning ? '分析中…' : '分析'}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {picksRunning ? (
              <div className="rounded-lg bg-bg-subtle mx-1 p-2.5 text-[11px] text-fg-muted leading-relaxed whitespace-pre-wrap">
                {picksProgress || '正在搜索最新市场数据…'}
                <span className="inline-block h-3 w-0.5 animate-pulse bg-accent align-middle ml-0.5" />
              </div>
            ) : picks?.picks.length ? (
              <div className="space-y-0">
                {picks.picks.map((item, i) => (
                  <PickRow key={item.symbol} rank={i + 1} symbol={item.symbol} reason={item.reason} quote={picksQuotes[item.symbol]} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-1">
                <Sparkles size={18} className="text-fg-subtle" />
                <p className="text-[11px] text-fg-subtle">点击"分析"让 Claude 筛选今日机会</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
