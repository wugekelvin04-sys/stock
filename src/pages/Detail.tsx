import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, ExternalLink, Star } from 'lucide-react'
import { PriceChart } from '../components/PriceChart'
import { AnalysisPanel } from '../components/AnalysisPanel'
import { OptionsChain } from '../components/OptionsChain'
import { usePortfolioStore } from '../stores/portfolio'
import { toast } from '../stores/toast'
import type { HistoryBar, Quote, NewsItem, CachedResult } from '../../electron/services/market'

type Period = '1d' | '1w' | '1mo' | '3mo' | '6mo' | '1y' | '2y'
const PERIODS: { label: string; value: Period }[] = [
  { label: '今天', value: '1d' },
  { label: '本周', value: '1w' },
  { label: '1月', value: '1mo' },
  { label: '3月', value: '3mo' },
  { label: '6月', value: '6mo' },
  { label: '1年', value: '1y' },
  { label: '2年', value: '2y' },
]

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function timeAgo(ts: number) {
  const m = Math.floor((Date.now() / 1000 - ts) / 60)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  return `${Math.floor(m / 60)} 小时前`
}

interface WatchedGroup { groupId: number; groupName: string }
interface Group { id: number; name: string }

export function Detail() {
  const { symbol } = useParams<{ symbol: string }>()
  const navigate = useNavigate()
  const { holdings } = usePortfolioStore()

  const [period, setPeriod] = useState<Period>('1d')
  const [bars, setBars] = useState<HistoryBar[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fromCache, setFromCache] = useState(false)

  // Watchlist state
  const [watchedGroups, setWatchedGroups] = useState<WatchedGroup[]>([])
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [starOpen, setStarOpen] = useState(false)
  const starBtnRef = useRef<HTMLDivElement>(null)

  const holding = useMemo(
    () => holdings.find((h) => h.symbol === symbol),
    [holdings, symbol],
  )

  const isWatched = watchedGroups.length > 0

  const loadWatchStatus = async () => {
    if (!symbol) return
    const [watched, groups] = await Promise.all([
      window.api.watchlist.isWatched(symbol),
      window.api.watchlist.listGroups(),
    ])
    setWatchedGroups(watched)
    setAllGroups(groups)
  }

  const load = async (p: Period) => {
    if (!symbol) return
    setLoading(true)
    try {
      let histPromise: Promise<CachedResult<HistoryBar[]>>
      if (p === '1d') {
        histPromise = window.api.market.intraday(symbol) as Promise<CachedResult<HistoryBar[]>>
      } else if (p === '1w') {
        histPromise = (window.api.market.history(symbol, '1mo') as Promise<CachedResult<HistoryBar[]>>).then(
          (res) => ({ ...res, data: res.data?.slice(-5) ?? [] }),
        )
      } else {
        histPromise = window.api.market.history(symbol, p) as Promise<CachedResult<HistoryBar[]>>
      }
      const [histRes, quoteRes, newsRes] = await Promise.all([
        histPromise,
        window.api.market.quotes([symbol]) as Promise<CachedResult<Quote[]>>,
        window.api.market.news(symbol) as Promise<CachedResult<NewsItem[]>>,
      ])
      setBars(histRes.data ?? [])
      setQuote(quoteRes.data?.[0] ?? null)
      setNews(newsRes.data ?? [])
      setFromCache(histRes.fromCache)
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      toast.error(`${symbol} 数据加载失败: ${msg.slice(0, 60)}`, '行情错误')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(period) }, [symbol, period])
  useEffect(() => { void loadWatchStatus() }, [symbol])

  // Close star dropdown on outside click
  useEffect(() => {
    if (!starOpen) return
    const handler = (e: MouseEvent) => {
      if (starBtnRef.current && !starBtnRef.current.contains(e.target as Node)) {
        setStarOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [starOpen])

  const handleAddToGroup = async (groupId: number) => {
    if (!symbol) return
    await window.api.watchlist.addItem(groupId, symbol)
    setStarOpen(false)
    await loadWatchStatus()
    toast.success(`已加入自选`, symbol)
  }

  const handleRemoveFromGroup = async (groupId: number) => {
    if (!symbol) return
    await window.api.watchlist.removeItem(groupId, symbol)
    setStarOpen(false)
    await loadWatchStatus()
    toast.info(`已从自选移除`, symbol)
  }

  const analysisContext = useMemo(() => ({
    price: quote?.price,
    changePercent: quote?.changePercent,
    costBasis: holding?.costBasis,
    hasOptions: holdings.some((h) => h.type === 'option' && h.symbol === symbol),
    recentNews: news.slice(0, 5).map((n) => n.headline),
  }), [quote, holding, holdings, news, symbol])

  const up = (quote?.changePercent ?? 0) >= 0

  // Groups not yet containing this symbol
  const unwatchedGroups = allGroups.filter(g => !watchedGroups.some(w => w.groupId === g.id))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center gap-3 border-b border-border px-5 py-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          onClick={() => navigate(-1)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="btn"
        >
          <ArrowLeft size={14} />
        </button>

        <div className="flex flex-1 items-baseline gap-3">
          <span className="font-mono text-lg font-bold text-fg">{symbol}</span>
          {quote && (
            <>
              <span className="font-mono text-base text-fg">${fmt(quote.price)}</span>
              <span className={`text-sm font-medium ${up ? 'text-accent-up' : 'text-accent-down'}`}>
                {up ? '+' : ''}{fmt(quote.changePercent)}%
              </span>
              <span className={`text-sm ${up ? 'text-accent-up' : 'text-accent-down'}`}>
                ({up ? '+' : ''}${fmt(quote.change)})
              </span>
            </>
          )}
          {holding && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">持仓</span>
          )}
        </div>

        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {fromCache && <span className="text-xs text-fg-subtle">缓存</span>}

          {/* Star / watchlist button */}
          <div className="relative" ref={starBtnRef}>
            <button
              onClick={() => setStarOpen(o => !o)}
              className={`btn flex items-center gap-1 ${isWatched ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10 hover:bg-yellow-400/20' : ''}`}
              title={isWatched ? '已收藏' : '加入自选'}
            >
              <Star size={13} className={isWatched ? 'fill-yellow-400' : ''} />
            </button>

            {starOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-bg-elevated shadow-xl">
                {watchedGroups.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[11px] text-fg-subtle uppercase tracking-wider">已收藏</p>
                    {watchedGroups.map(g => (
                      <button
                        key={g.groupId}
                        onClick={() => handleRemoveFromGroup(g.groupId)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-fg hover:bg-bg-subtle transition-colors"
                      >
                        <span>{g.groupName}</span>
                        <span className="text-xs text-accent-down">移除</span>
                      </button>
                    ))}
                  </>
                )}
                {unwatchedGroups.length > 0 && (
                  <>
                    {watchedGroups.length > 0 && <div className="my-1 border-t border-border" />}
                    <p className="px-3 pt-2 pb-1 text-[11px] text-fg-subtle uppercase tracking-wider">加入分组</p>
                    {unwatchedGroups.map(g => (
                      <button
                        key={g.id}
                        onClick={() => handleAddToGroup(g.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-bg-subtle transition-colors"
                      >
                        <Star size={12} />
                        {g.name}
                      </button>
                    ))}
                  </>
                )}
                {allGroups.length === 0 && (
                  <button
                    onClick={() => { setStarOpen(false); navigate('/watchlist') }}
                    className="w-full px-3 py-2 text-left text-sm text-fg-muted hover:bg-bg-subtle transition-colors"
                  >
                    先创建自选分组 →
                  </button>
                )}
              </div>
            )}
          </div>

          <button onClick={() => load(period)} disabled={loading} className="btn">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Period selector */}
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                period === p.value
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="card p-0 overflow-hidden">
          {loading && bars.length === 0 ? (
            <div className="flex h-[340px] items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />
            </div>
          ) : (
            <PriceChart
              bars={bars}
              costBasis={holding?.costBasis}
              height={340}
              mode={period === '1d' ? 'line' : 'candle'}
            />
          )}
        </div>

        {/* Chart legend */}
        {period !== '1d' && (
          <div className="flex items-center gap-4 text-xs text-fg-subtle">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#3b82f6]" /> MA20
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#f59e0b]" /> MA50
            </span>
            {holding && (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded border-dashed border-t border-[#a855f7]" /> 成本线
              </span>
            )}
          </div>
        )}
        {period === '1d' && (
          <div className="flex items-center gap-4 text-xs text-fg-subtle">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#f59e0b]" /> 盘前
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#3b82f6]" /> 盘中
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-[#a855f7]" /> 盘后
            </span>
          </div>
        )}

        {/* Quote stats */}
        {quote && (
          <div className="card">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">行情快照</h3>
            <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-fg-subtle">成交量</span>
                <span className="font-mono text-fg">{(quote.volume / 1e6).toFixed(1)}M</span>
              </div>
              {quote.marketCap && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">市值</span>
                  <span className="font-mono text-fg">${(quote.marketCap / 1e9).toFixed(1)}B</span>
                </div>
              )}
              {holding && (
                <>
                  <div className="flex justify-between">
                    <span className="text-fg-subtle">持仓量</span>
                    <span className="font-mono text-fg">{holding.qty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-subtle">成本</span>
                    <span className="font-mono text-fg">${fmt(holding.costBasis)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-subtle">盈亏</span>
                    <span className={`font-mono font-medium ${quote.price >= holding.costBasis ? 'text-accent-up' : 'text-accent-down'}`}>
                      {quote.price >= holding.costBasis ? '+' : ''}
                      {fmt((quote.price - holding.costBasis) / holding.costBasis * 100)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI Analysis */}
        {symbol && <AnalysisPanel symbol={symbol} context={analysisContext} />}

        {/* Options Chain */}
        {symbol && <OptionsChain symbol={symbol} currentPrice={quote?.price} />}

        {/* News */}
        {news.length > 0 && (
          <div className="card">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">近期新闻</h3>
            <div className="space-y-3">
              {news.map((item, i) => (
                <div key={i} className="group">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start justify-between gap-2 hover:text-accent transition-colors"
                    onClick={(e) => {
                      e.preventDefault()
                      window.api.openExternal(item.url)
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg group-hover:text-accent leading-snug">{item.headline}</p>
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        {item.source} · {timeAgo(item.datetime)}
                      </p>
                    </div>
                    <ExternalLink size={12} className="mt-0.5 shrink-0 text-fg-subtle" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
