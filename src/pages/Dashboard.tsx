import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { SectionCard } from '../components/SectionCard'
import { TickerRow } from '../components/TickerRow'
import { HourlyInsight } from '../components/HourlyInsight'
import { WatchlistSection } from '../components/WatchlistSection'
import { toast } from '../stores/toast'
import type { ScreenerItem, CachedResult } from '../../electron/services/market'

interface DailyPick { symbol: string; reason: string }
interface DailyPicksResult { date: string; picks: DailyPick[] }

export function Dashboard() {
  const [gainers, setGainers] = useState<CachedResult<ScreenerItem[]> | null>(null)
  const [losers, setLosers] = useState<CachedResult<ScreenerItem[]> | null>(null)
  const [picks, setPicks] = useState<DailyPicksResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [gainersRefreshing, setGainersRefreshing] = useState(false)
  const [losersRefreshing, setLosersRefreshing] = useState(false)
  const [picksRefreshing, setPicksRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({})

  async function loadSparklines(symbols: string[]) {
    // Fetch all in parallel (deduplicated, no hard cap so both gainers+losers get lines)
    await Promise.all(symbols.map(async (sym) => {
      try {
        const result = await window.api.market.intraday(sym)
        if (result?.data?.length) {
          setSparklines(prev => ({ ...prev, [sym]: result.data.map(b => b.close) }))
        }
      } catch {
        // silently ignore
      }
    }))
  }

  const load = async () => {
    setLoading(true)
    try {
      const [g, l, p] = await Promise.all([
        window.api.market.gainers(),
        window.api.market.losers(),
        window.api.insight.dailyPicks(),
      ])
      setGainers(g)
      setLosers(l)
      if (p) setPicks(p)
      setLastRefresh(Date.now())

      // Load sparklines separately for gainers and losers (each up to 10)
      const gainerSyms = (g?.data ?? []).map(i => i.symbol)
      const loserSyms = (l?.data ?? []).map(i => i.symbol)
      void loadSparklines([...new Set([...gainerSyms, ...loserSyms])])
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      if (msg.includes('rate') || msg.includes('429')) {
        toast.warning('数据请求过于频繁，稍后重试', '限流')
      } else {
        toast.error(`行情加载失败: ${msg.slice(0, 60)}`, '网络错误')
      }
    } finally {
      setLoading(false)
    }
  }

  const refreshGainers = async () => {
    setGainersRefreshing(true)
    try {
      const g = await window.api.market.gainers()
      setGainers(g)
      setLastRefresh(Date.now())
      void loadSparklines((g?.data ?? []).map(i => i.symbol))
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      toast.error(`涨幅榜刷新失败: ${msg.slice(0, 60)}`, '网络错误')
    } finally {
      setGainersRefreshing(false)
    }
  }

  const refreshLosers = async () => {
    setLosersRefreshing(true)
    try {
      const l = await window.api.market.losers()
      setLosers(l)
      setLastRefresh(Date.now())
      void loadSparklines((l?.data ?? []).map(i => i.symbol))
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      toast.error(`跌幅榜刷新失败: ${msg.slice(0, 60)}`, '网络错误')
    } finally {
      setLosersRefreshing(false)
    }
  }

  const refreshPicks = async () => {
    setPicksRefreshing(true)
    try {
      const p = await window.api.insight.dailyPicks()
      if (p) setPicks(p)
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      toast.error(`机会榜刷新失败: ${msg.slice(0, 60)}`, '网络错误')
    } finally {
      setPicksRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
    const t = setInterval(load, 15 * 60 * 1000)
    // listen for scheduler push
    const unsub = window.api.insight.onDailyPicksUpdated((payload) => setPicks(payload))
    return () => { clearInterval(t); unsub() }
  }, [])

  function timeAgo(ms: number) {
    const diff = Math.floor((Date.now() - ms) / 60000)
    if (diff < 1) return '刚刚'
    if (diff < 60) return `${diff} 分钟前`
    return `${Math.floor(diff / 60)} 小时前`
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header
        className="flex items-center justify-between border-b border-border px-5 py-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-fg">市场总览</span>
          {lastRefresh && <span className="text-xs text-fg-subtle">{timeAgo(lastRefresh)}</span>}
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="btn flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 涨幅榜 */}
          <SectionCard
            title="涨幅榜"
            subtitle="今日涨幅最高"
            loading={loading && !gainers}
            fromCache={gainers?.fromCache}
            fetchedAt={gainers?.fetchedAt}
            onRefresh={refreshGainers}
            refreshing={gainersRefreshing}
          >
            {gainers?.data.length ? (
              <div className="-mx-1 space-y-0.5">
                {gainers.data.map((item, i) => (
                  <TickerRow
                    key={item.symbol}
                    rank={i + 1}
                    symbol={item.symbol}
                    name={item.name}
                    price={item.price}
                    changePercent={item.changePercent}
                    volume={item.volume}
                    sparkPrices={sparklines[item.symbol]}
                  />
                ))}
              </div>
            ) : !loading ? (
              <p className="py-4 text-center text-xs text-fg-subtle">暂无数据</p>
            ) : null}
          </SectionCard>

          {/* 跌幅榜 */}
          <SectionCard
            title="跌幅榜"
            subtitle="今日跌幅最大"
            loading={loading && !losers}
            fromCache={losers?.fromCache}
            fetchedAt={losers?.fetchedAt}
            onRefresh={refreshLosers}
            refreshing={losersRefreshing}
          >
            {losers?.data.length ? (
              <div className="-mx-1 space-y-0.5">
                {losers.data.map((item, i) => (
                  <TickerRow
                    key={item.symbol}
                    rank={i + 1}
                    symbol={item.symbol}
                    name={item.name}
                    price={item.price}
                    changePercent={item.changePercent}
                    volume={item.volume}
                    sparkPrices={sparklines[item.symbol]}
                  />
                ))}
              </div>
            ) : !loading ? (
              <p className="py-4 text-center text-xs text-fg-subtle">暂无数据</p>
            ) : null}
          </SectionCard>

          {/* 机会榜 */}
          <SectionCard
            title="今日机会榜"
            subtitle={picks ? `AI 精选 · ${picks.date}` : '每日 09:00 ET 开盘前 AI 筛选'}
            onRefresh={refreshPicks}
            refreshing={picksRefreshing}
          >
            {picks?.picks.length ? (
              <div className="-mx-1 space-y-0.5">
                {picks.picks.map((item, i) => (
                  <TickerRow
                    key={item.symbol}
                    rank={i + 1}
                    symbol={item.symbol}
                    name=""
                    price={0}
                    changePercent={0}
                    reason={item.reason}
                  />
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-xs text-fg-subtle">每个交易日开盘前 Claude 自动筛选</p>
                <p className="mt-1 text-xs text-fg-subtle">结合隔夜新闻 + 技术面 + 板块轮动</p>
              </div>
            )}
          </SectionCard>
        </div>

        {/* 自选股快览 */}
        <WatchlistSection />

        {/* 整点 Insight 时间线 */}
        <HourlyInsight />
      </div>
    </div>
  )
}
