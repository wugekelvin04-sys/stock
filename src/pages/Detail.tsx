import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, ExternalLink, Star } from 'lucide-react'
import { PriceChart } from '../components/PriceChart'
import { AnalysisPanel } from '../components/AnalysisPanel'
import { StockProfilePanel } from '../components/StockProfilePanel'
import { StockCatalystPanel } from '../components/StockCatalystPanel'
import { StockRatingsPanel } from '../components/StockRatingsPanel'
import { StockEarningsPanel } from '../components/StockEarningsPanel'
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
  const [isYesterday, setIsYesterday] = useState(false)

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

  function isTradingHours() {
    const now = new Date()
    const day = now.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })
    if (day === 'Sat' || day === 'Sun') return false
    const h = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }), 10)
    return h >= 4 && h < 20
  }

  // Load chart bars — only called on symbol/period change, not on price refresh
  const loadBars = async (p: Period) => {
    if (!symbol) return
    setLoading(true)
    try {
      let res: CachedResult<HistoryBar[]>
      let showYesterday = false
      if (p === '1d') {
        res = await window.api.market.intraday(symbol) as CachedResult<HistoryBar[]>
        if (!res.data?.length) {
          res = await window.api.market.prevDayIntraday(symbol) as CachedResult<HistoryBar[]>
          showYesterday = true
        }
      } else if (p === '1w') {
        const r = await window.api.market.history(symbol, '1mo') as CachedResult<HistoryBar[]>
        res = { ...r, data: r.data?.slice(-5) ?? [] }
      } else {
        res = await window.api.market.history(symbol, p) as CachedResult<HistoryBar[]>
      }
      setBars(res.data ?? [])
      setFromCache(res.fromCache)
      setIsYesterday(showYesterday)
    } catch (e) {
      toast.error(`${symbol} K线加载失败: ${(e as Error).message.slice(0, 60)}`, '行情错误')
    } finally {
      setLoading(false)
    }
  }

  // Refresh quote + news (lightweight — called on timer and on manual refresh)
  const refreshQuote = async (silent = false) => {
    if (!symbol) return
    if (!silent) setLoading(true)
    try {
      const [quoteRes, newsRes] = await Promise.all([
        window.api.market.quotes([symbol]) as Promise<CachedResult<Quote[]>>,
        window.api.market.news(symbol) as Promise<CachedResult<NewsItem[]>>,
      ])
      setQuote(quoteRes.data?.[0] ?? null)
      setNews(newsRes.data ?? [])
      // For 1d, also refresh intraday bars so chart tracks live price
      if (period === '1d' && !isYesterday) {
        const intradayRes = await window.api.market.intraday(symbol) as CachedResult<HistoryBar[]>
        if (intradayRes.data?.length) setBars(intradayRes.data)
      }
    } catch { /* silent */ } finally {
      if (!silent) setLoading(false)
    }
  }

  // Full reload (manual refresh button)
  const load = async (p: Period) => {
    await Promise.all([loadBars(p), refreshQuote()])
  }

  // Reload bars when symbol or period changes; also fetch quote+news
  useEffect(() => { void load(period) }, [symbol, period]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadWatchStatus() }, [symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  // Timed price refresh: 盘中 5min, 非盘中 15min
  const periodRef = useRef(period)
  const isYesterdayRef = useRef(isYesterday)
  useEffect(() => { periodRef.current = period }, [period])
  useEffect(() => { isYesterdayRef.current = isYesterday }, [isYesterday])

  useEffect(() => {
    if (!symbol) return
    const interval = isTradingHours() ? 5 * 60 * 1000 : 15 * 60 * 1000
    const id = setInterval(() => { void refreshQuote(true) }, interval)
    return () => clearInterval(id)
  }, [symbol]) // eslint-disable-line react-hooks/exhaustive-deps

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

          <button onClick={() => void load(period)} disabled={loading} className="btn">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Period selector + period return */}
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
              {p.value === '1d' && isYesterday ? '昨天' : p.label}
            </button>
          ))}
          {bars.length >= 2 && (() => {
            const first = bars[0].close
            const last = bars[bars.length - 1].close
            const chg = last - first
            const chgPct = (chg / first) * 100
            const up = chg >= 0
            return (
              <span className={`ml-2 text-xs font-medium font-mono ${up ? 'text-accent-up' : 'text-accent-down'}`}>
                {up ? '+' : ''}{fmt(chg)} ({up ? '+' : ''}{fmt(chgPct)}%)
              </span>
            )
          })()}
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
              {/* 基础价格信息 */}
              {quote.open != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">开盘</span>
                  <span className="font-mono text-fg">${fmt(quote.open)}</span>
                </div>
              )}
              {quote.dayHigh != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">今日高</span>
                  <span className="font-mono text-accent-up">${fmt(quote.dayHigh)}</span>
                </div>
              )}
              {quote.dayLow != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">今日低</span>
                  <span className="font-mono text-accent-down">${fmt(quote.dayLow)}</span>
                </div>
              )}
              {quote.previousClose != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">昨收</span>
                  <span className="font-mono text-fg">${fmt(quote.previousClose)}</span>
                </div>
              )}
              {quote.bid != null && quote.ask != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">买/卖</span>
                  <span className="font-mono text-fg">{fmt(quote.bid)} / {fmt(quote.ask)}</span>
                </div>
              )}
              {/* 成交量 */}
              <div className="flex justify-between">
                <span className="text-fg-subtle">成交量</span>
                <span className="font-mono text-fg">{(quote.volume / 1e6).toFixed(2)}M</span>
              </div>
              {quote.avgVolume3M != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">均量(3M)</span>
                  <span className="font-mono text-fg">{(quote.avgVolume3M / 1e6).toFixed(2)}M</span>
                </div>
              )}
              {/* 市值与估值 */}
              {quote.marketCap != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">市值</span>
                  <span className="font-mono text-fg">${(quote.marketCap / 1e9).toFixed(1)}B</span>
                </div>
              )}
              {quote.trailingPE != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">市盈率</span>
                  <span className="font-mono text-fg">{fmt(quote.trailingPE, 1)}x</span>
                </div>
              )}
              {quote.forwardPE != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">远期PE</span>
                  <span className="font-mono text-fg">{fmt(quote.forwardPE, 1)}x</span>
                </div>
              )}
              {quote.eps != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">EPS</span>
                  <span className="font-mono text-fg">${fmt(quote.eps)}</span>
                </div>
              )}
              {quote.dividendYield != null && quote.dividendYield > 0 && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">股息率</span>
                  <span className="font-mono text-fg">{fmt(quote.dividendYield, 2)}%</span>
                </div>
              )}
              {/* 52周 */}
              {quote.fiftyTwoWeekHigh != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">52W高</span>
                  <span className="font-mono text-accent-up">${fmt(quote.fiftyTwoWeekHigh)}</span>
                </div>
              )}
              {quote.fiftyTwoWeekLow != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">52W低</span>
                  <span className="font-mono text-accent-down">${fmt(quote.fiftyTwoWeekLow)}</span>
                </div>
              )}
              {/* 分析师评级 */}
              {quote.analystRating && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">分析师</span>
                  <span className="font-mono text-fg text-xs">{quote.analystRating}</span>
                </div>
              )}
              {/* 盘前/盘后 */}
              {quote.preMarketPrice != null && quote.preMarketChange != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">盘前</span>
                  <span className={`font-mono font-medium ${(quote.preMarketChange ?? 0) >= 0 ? 'text-accent-up' : 'text-accent-down'}`}>
                    ${fmt(quote.preMarketPrice)} ({(quote.preMarketChange ?? 0) >= 0 ? '+' : ''}{fmt(quote.preMarketChange ?? 0)})
                  </span>
                </div>
              )}
              {quote.postMarketPrice != null && quote.postMarketChange != null && (
                <div className="flex justify-between">
                  <span className="text-fg-subtle">盘后</span>
                  <span className={`font-mono font-medium ${(quote.postMarketChange ?? 0) >= 0 ? 'text-accent-up' : 'text-accent-down'}`}>
                    ${fmt(quote.postMarketPrice)} ({(quote.postMarketChange ?? 0) >= 0 ? '+' : ''}{fmt(quote.postMarketChange ?? 0)})
                  </span>
                </div>
              )}
              {/* 持仓信息 */}
              {holding && (
                <>
                  <div className="col-span-3 my-1 border-t border-border" />
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

        {/* Stock Profile & Catalyst */}
        {symbol && <StockProfilePanel symbol={symbol} />}
        {symbol && <StockCatalystPanel symbol={symbol} />}
        {symbol && <StockRatingsPanel symbol={symbol} />}
        {symbol && <StockEarningsPanel symbol={symbol} />}

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
