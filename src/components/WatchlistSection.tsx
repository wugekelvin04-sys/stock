import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { WatchGroup, WatchItem } from '../stores/watchlist'

interface QuoteSnap { price: number; changePercent: number; change: number }

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function Spark({ bars, up }: { bars: number[]; up: boolean }) {
  if (bars.length < 2) return <div className="w-14 h-5" />
  const w = 56, h = 20
  const min = Math.min(...bars), max = Math.max(...bars), range = max - min || 1
  const pts = bars.map((p, i) => {
    const x = (i / (bars.length - 1)) * w
    const y = h - ((p - min) / range) * (h - 3) - 1.5
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join('L')
  const color = up ? '#22c55e' : '#ef4444'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path d={`M${pts}`} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function WatchlistSection({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<WatchGroup[]>([])
  const [items, setItems] = useState<Record<number, WatchItem[]>>({})
  const [quotes, setQuotes] = useState<Record<string, QuoteSnap>>({})
  const [sparks, setSparks] = useState<Record<string, number[]>>({})

  const loadData = async () => {
    const gs = await window.api.watchlist.listGroups()
    if (gs.length === 0) { setGroups([]); return }
    setGroups(gs)

    const allItems: Record<number, WatchItem[]> = {}
    const allSymbols = new Set<string>()
    await Promise.all(gs.map(async (g) => {
      const its = await window.api.watchlist.listItems(g.id)
      allItems[g.id] = its
      its.forEach(it => allSymbols.add(it.symbol))
    }))
    setItems(allItems)

    const syms = [...allSymbols]
    if (!syms.length) return

    // quotes
    try {
      const res = await window.api.market.quotes(syms)
      const snap: Record<string, QuoteSnap> = {}
      for (const q of res.data ?? []) {
        snap[q.symbol] = { price: q.price, changePercent: q.changePercent, change: q.change }
      }
      setQuotes(snap)
    } catch { /* silent */ }

    // sparklines (fire-and-forget per symbol)
    for (const sym of syms) {
      window.api.market.intraday(sym).then(res => {
        if (res?.data?.length) {
          setSparks(prev => ({ ...prev, [sym]: res.data.map(b => b.close) }))
        }
      }).catch(() => {})
    }
  }

  useEffect(() => {
    void loadData()
    const t = setInterval(loadData, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const filledGroups = groups.filter(g => (items[g.id]?.length ?? 0) > 0)

  const content = (
    <>
      {filledGroups.length === 0 && (
        <p className="py-6 text-center text-xs text-fg-subtle">暂无自选股，前往自选页添加</p>
      )}
      <div className="space-y-3">
        {filledGroups.map(g => (
          <div key={g.id}>
            {filledGroups.length > 1 && (
              <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">{g.name}</p>
            )}
            <div className="space-y-0">
              {(items[g.id] ?? []).map(it => {
                const q = quotes[it.symbol]
                const up = (q?.changePercent ?? 0) >= 0
                const bars = sparks[it.symbol]
                return (
                  <div
                    key={it.symbol}
                    onClick={() => navigate(`/detail/${it.symbol}`)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-subtle transition-colors"
                  >
                    {/* symbol */}
                    <span className="w-16 shrink-0 font-mono text-xs font-semibold text-fg">{it.symbol}</span>

                    {/* sparkline */}
                    {bars && bars.length > 1
                      ? <Spark bars={bars} up={up} />
                      : <div className="w-14 shrink-0" />
                    }

                    {q ? (
                      <>
                        <div className="flex-1 min-w-0 text-right">
                          <div className="font-mono text-xs text-fg">${fmt(q.price)}</div>
                          <div className="font-mono text-[10px] text-fg-subtle">
                            {q.change >= 0 ? '+' : ''}{fmt(q.change)}
                          </div>
                        </div>
                        <div className={`w-16 text-right font-mono text-xs font-medium ${up ? 'text-accent-up' : 'text-accent-down'}`}>
                          <div className="flex items-center justify-end gap-0.5">
                            {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {up ? '+' : ''}{fmt(q.changePercent)}%
                          </div>
                        </div>
                      </>
                    ) : (
                      <span className="flex-1 text-right text-xs text-fg-subtle">--</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )

  if (embedded) return content

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-fg">自选股</span>
        <button
          onClick={() => navigate('/watchlist')}
          className="flex items-center gap-0.5 text-xs text-fg-subtle hover:text-fg-muted transition-colors"
        >
          管理
        </button>
      </div>
      {content}
    </div>
  )
}
