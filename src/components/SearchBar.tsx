import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, TrendingUp } from 'lucide-react'

interface Props {
  onClose: () => void
}

interface SearchItem {
  symbol: string
  name: string
  exchange: string
  type: string
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function SearchBar({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchItem[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    inputRef.current?.focus()
    window.api.portfolio.list().then(() => {}) // warm up
    // load history
    ;(async () => {
      // history stored in search_history via IPC — use market:search with empty to get history
      // for now read from localStorage as lightweight solution
      const h = JSON.parse(localStorage.getItem('search_history') ?? '[]') as string[]
      setHistory(h.slice(0, 6))
    })()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    window.api.market.search(debouncedQuery)
      .then((r) => setResults((r.data ?? []) as SearchItem[]))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  const items = query.trim() ? results : history.map((q) => ({ symbol: q, name: '', exchange: '', type: 'history' }))

  const go = useCallback((symbol: string) => {
    // save history
    const h = [symbol, ...history.filter((x) => x !== symbol)].slice(0, 20)
    localStorage.setItem('search_history', JSON.stringify(h))
    onClose()
    navigate(`/detail/${symbol}`)
  }, [history, navigate, onClose])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && items[selected]) go(items[selected].symbol)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={16} className="shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={handleKey}
            placeholder="搜索股票代码或公司名…"
            className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          {loading && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />}
          <kbd className="kbd">Esc</kbd>
        </div>

        {/* Results */}
        {items.length > 0 && (
          <ul className="max-h-72 overflow-y-auto py-1">
            {!query.trim() && <li className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">最近搜索</li>}
            {items.map((item, i) => (
              <li
                key={item.symbol + i}
                onClick={() => go(item.symbol)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2 ${i === selected ? 'bg-bg-subtle' : 'hover:bg-bg-subtle'}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle">
                  {item.type === 'history' ? <Clock size={13} /> : <TrendingUp size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-sm font-semibold text-fg">{item.symbol}</span>
                  {item.name && <span className="ml-2 truncate text-xs text-fg-muted">{item.name}</span>}
                </span>
                {item.exchange && <span className="text-[11px] text-fg-subtle">{item.exchange}</span>}
              </li>
            ))}
          </ul>
        )}

        {query.trim() && !loading && results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-fg-subtle">未找到 "{query}"</p>
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
          <span><kbd className="kbd">↑↓</kbd> 导航</span>
          <span><kbd className="kbd">↵</kbd> 跳转</span>
          <span><kbd className="kbd">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
