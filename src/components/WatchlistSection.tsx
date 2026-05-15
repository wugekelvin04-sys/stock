import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import type { WatchGroup, WatchItem } from '../stores/watchlist'

interface QuoteSnap { price: number; changePercent: number }

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function WatchlistSection() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<WatchGroup[]>([])
  const [items, setItems] = useState<Record<number, WatchItem[]>>({})
  const [quotes, setQuotes] = useState<Record<string, QuoteSnap>>({})

  const loadData = async () => {
    const gs = await window.api.watchlist.listGroups()
    if (gs.length === 0) return
    setGroups(gs)

    const allItems: Record<number, WatchItem[]> = {}
    const allSymbols = new Set<string>()
    await Promise.all(gs.map(async (g) => {
      const its = await window.api.watchlist.listItems(g.id)
      allItems[g.id] = its
      its.forEach(it => allSymbols.add(it.symbol))
    }))
    setItems(allItems)

    if (allSymbols.size > 0) {
      try {
        const res = await window.api.market.quotes([...allSymbols])
        const snap: Record<string, QuoteSnap> = {}
        for (const q of res.data ?? []) {
          snap[q.symbol] = { price: q.price, changePercent: q.changePercent }
        }
        setQuotes(snap)
      } catch { /* silent */ }
    }
  }

  useEffect(() => {
    void loadData()
    const t = setInterval(loadData, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  if (groups.length === 0) return null

  // Only show groups that have items
  const filledGroups = groups.filter(g => (items[g.id]?.length ?? 0) > 0)
  if (filledGroups.length === 0) return null

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-yellow-400" />
          <span className="text-sm font-semibold text-fg">自选股</span>
        </div>
        <button
          onClick={() => navigate('/watchlist')}
          className="flex items-center gap-0.5 text-xs text-fg-subtle hover:text-fg-muted transition-colors"
        >
          管理
          <ChevronRight size={12} />
        </button>
      </div>

      <div className="space-y-4">
        {filledGroups.map(g => (
          <div key={g.id}>
            {filledGroups.length > 1 && (
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{g.name}</p>
            )}
            <div className="-mx-1 space-y-0.5">
              {(items[g.id] ?? []).map(it => {
                const q = quotes[it.symbol]
                const up = (q?.changePercent ?? 0) >= 0
                return (
                  <div
                    key={it.symbol}
                    onClick={() => navigate(`/detail/${it.symbol}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-bg-subtle transition-colors"
                  >
                    <span className="min-w-0 flex-1 font-mono text-sm font-semibold text-fg">{it.symbol}</span>
                    {q ? (
                      <>
                        <span className="font-mono text-sm text-fg">${fmt(q.price)}</span>
                        <div className={`flex w-16 items-center justify-end gap-1 text-xs font-medium ${up ? 'text-accent-up' : 'text-accent-down'}`}>
                          {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {up ? '+' : ''}{fmt(q.changePercent)}%
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-fg-subtle">--</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
