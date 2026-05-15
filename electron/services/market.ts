// Behind corporate SSL-inspection proxies, Node fetch rejects self-signed certs.
// Bypass only in dev; production uses system CA bundle via Electron.
if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

// yahoo-finance2 v3: default export is the class constructor, must be instantiated
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const yahooFinance: any = new (require('yahoo-finance2').default)({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
  validation: { logErrors: false, logOptionsErrors: false },
})
import axios from 'axios'
import { withCache, TTL } from './cache'
import { yahooLimiter, finnhubLimiter } from './ratelimit'

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? ''

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Quote {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap?: number
  fetchedAt: number
}

export interface HistoryBar {
  date: string   // YYYY-MM-DD
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OptionContract {
  contractSymbol: string
  strike: number
  expiry: string
  type: 'call' | 'put'
  lastPrice: number
  bid: number
  ask: number
  impliedVolatility: number
  openInterest: number
  delta?: number
}

export interface SearchResult {
  symbol: string
  name: string
  exchange: string
  type: string
}

export interface ScreenerItem {
  symbol: string
  name: string
  price: number
  changePercent: number
  volume: number
}

export interface CachedResult<T> {
  data: T
  fromCache: boolean
  fetchedAt?: number
  staleSince?: number
}

// ── Quotes ────────────────────────────────────────────────────────────────────

export async function getQuotes(symbols: string[]): Promise<CachedResult<Quote[]>> {
  const key = `quotes:${symbols.sort().join(',')}`
  return withCache(key, TTL.QUOTE, async () => {
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any = await yahooFinance.quote(symbols, {}, { validateResult: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = Array.isArray(results) ? results : [results]
    return arr.map((q) => ({
      symbol: q.symbol ?? '',
      name: q.shortName ?? q.longName ?? q.symbol ?? '',
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      volume: q.regularMarketVolume ?? 0,
      marketCap: q.marketCap,
      fetchedAt: Date.now(),
    })) as Quote[]
  }, { allowStale: true })
}

// ── History ───────────────────────────────────────────────────────────────────

export type HistoryPeriod = '1d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y'

export async function getHistory(symbol: string, period: HistoryPeriod = '6mo'): Promise<CachedResult<HistoryBar[]>> {
  const key = `history:${symbol}:${period}`
  // Historical bars for closed periods are immutable — cache much longer.
  // Only the period that includes today's unclosed bar needs a short TTL.
  const ttl = historyCacheTTL(period)
  return withCache(key, ttl, async () => {
    await yahooLimiter.acquire()
    const is1d = period === '1d'
    const period1 = is1d
      ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10) })()
      : periodToDate(period).toISOString().slice(0, 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(symbol, {
      period1,
      interval: is1d ? '5m' : '1d',
    }, { validateResult: false })
    const quotes: any[] = result?.quotes ?? []
    const is1dInterval = period === '1d'
    const mapped = quotes
      .filter((r) => r.close != null)
      .map((r) => {
        const raw = r.date instanceof Date ? r.date.toISOString() : String(r.date ?? '')
        const date = is1dInterval ? raw : raw.slice(0, 10)
        return { date, open: r.open ?? 0, high: r.high ?? 0, low: r.low ?? 0, close: r.close ?? 0, volume: r.volume ?? 0 }
      })
    // Yahoo occasionally returns duplicate timestamps — dedupe keeping last occurrence
    const seen = new Map<string, typeof mapped[0]>()
    for (const bar of mapped) seen.set(bar.date, bar)
    return [...seen.values()].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  }, { allowStale: true })
}

/**
 * TTL strategy for history cache keys:
 * - 1d (intraday 5m): 5 min — market is live
 * - 1mo: 2 h — contains today's bar (may update at close)
 * - 3mo+: 24 h — all bars are fully settled, data is static
 */
function historyCacheTTL(period: HistoryPeriod): number {
  if (period === '1d') return TTL.QUOTE      // 5 min  — 日内实时
  if (period === '1mo') return TTL.HISTORY   // 4 h    — 含今日未收盘 bar
  return TTL.IMMUTABLE                       // 30 天  — 全部已收盘，数据不再变化
}

function periodToDate(period: HistoryPeriod): Date {
  const d = new Date()
  const map: Record<HistoryPeriod, number> = { '1d': 1, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825 }
  d.setDate(d.getDate() - map[period])
  return d
}

export async function getIntraday(symbol: string): Promise<CachedResult<HistoryBar[]>> {
  const key = `intraday:${symbol}`
  return withCache(key, 300, async () => {  // 5分钟缓存
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(symbol, {
      period1: (() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10) })(),
      interval: '5m',
    }, { validateResult: false })
    const quotes: any[] = result?.quotes ?? []
    return quotes
      .filter((r) => r.close != null)
      .map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString() : String(r.date ?? ''),
        open: r.open ?? 0,
        high: r.high ?? 0,
        low: r.low ?? 0,
        close: r.close ?? 0,
        volume: r.volume ?? 0,
      }))
  }, { allowStale: true })
}

// ── Options ───────────────────────────────────────────────────────────────────

export async function getOptionChain(symbol: string): Promise<CachedResult<OptionContract[]>> {
  const key = `options:${symbol}`
  return withCache(key, TTL.OPTION_CHAIN, async () => {
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = await yahooFinance.options(symbol as any)
    const contracts: OptionContract[] = []
    for (const exp of (chain.expirationDates ?? []) as unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail: any = await yahooFinance.options(symbol as any, { date: exp as any } as any)
      await yahooLimiter.acquire()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (detail.options?.[0]?.calls ?? []) as any[]) {
        contracts.push(toContract(c, 'call'))
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (detail.options?.[0]?.puts ?? []) as any[]) {
        contracts.push(toContract(p, 'put'))
      }
    }
    return contracts
  }, { allowStale: true })
}

function toContract(c: Record<string, unknown>, type: 'call' | 'put'): OptionContract {
  return {
    contractSymbol: String(c.contractSymbol ?? ''),
    strike: Number(c.strike ?? 0),
    expiry: c.expiration instanceof Date ? c.expiration.toISOString().slice(0, 10) : String(c.expiration ?? ''),
    type,
    lastPrice: Number(c.lastPrice ?? 0),
    bid: Number(c.bid ?? 0),
    ask: Number(c.ask ?? 0),
    impliedVolatility: Number(c.impliedVolatility ?? 0),
    openInterest: Number(c.openInterest ?? 0),
  }
}

// ── Option Dates / By Date ────────────────────────────────────────────────────

export async function getOptionDates(symbol: string): Promise<string[]> {
  // Expiration date list changes at most daily — cache 4 hours
  const key = `option-dates:${symbol}`
  const result = await withCache(key, TTL.HISTORY, async () => {  // 4 h
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = await yahooFinance.options(symbol as any)
    return (chain.expirationDates ?? []).map((d: unknown) =>
      d instanceof Date ? d.toISOString().slice(0, 10) : String(d)
    ) as string[]
  }, { allowStale: true })
  return result.data
}

export async function getOptionsByDate(symbol: string, date: string): Promise<CachedResult<OptionContract[]>> {
  const key = `options:${symbol}:${date}`
  // Expired option dates are fully settled — cache 7 days; future dates cache 30 min
  const today = new Date().toISOString().slice(0, 10)
  const ttl = date < today ? TTL.IMMUTABLE : TTL.OPTION_CHAIN  // 过期链永久缓存，活跃链 30min
  return withCache(key, ttl, async () => {
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail: any = await yahooFinance.options(symbol as any, { date: new Date(date) } as any)
    const contracts: OptionContract[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (detail.options?.[0]?.calls ?? []) as any[]) {
      contracts.push(toContract(c, 'call'))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (detail.options?.[0]?.puts ?? []) as any[]) {
      contracts.push(toContract(p, 'put'))
    }
    return contracts
  }, { allowStale: true })
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function searchSymbols(query: string): Promise<CachedResult<SearchResult[]>> {
  const key = `search:${query.toLowerCase()}`
  return withCache(key, TTL.SEARCH, async () => {
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await yahooFinance.search(query, { quotesCount: 10, newsCount: 0 }, { validateResult: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((res.quotes ?? []) as any[]).map((q) => ({
      symbol: q.symbol ?? '',
      name: q.shortName ?? q.longName ?? '',
      exchange: q.exchange ?? '',
      type: q.typeDisp ?? q.quoteType ?? '',
    })) as SearchResult[]
  })
}

// ── Screeners ─────────────────────────────────────────────────────────────────

export async function getGainers(): Promise<CachedResult<ScreenerItem[]>> {
  return fetchScreener('day_gainers')
}

export async function getLosers(): Promise<CachedResult<ScreenerItem[]>> {
  return fetchScreener('day_losers')
}

async function fetchScreener(scrId: string): Promise<CachedResult<ScreenerItem[]>> {
  const key = `screener:${scrId}`
  return withCache(key, TTL.SCREENER, async () => {
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await yahooFinance.screener(scrId, { count: 10 }, { validateResult: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((res.quotes ?? []) as any[]).map((q) => ({
      symbol: q.symbol ?? '',
      name: q.shortName ?? q.symbol ?? '',
      price: q.regularMarketPrice ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      volume: q.regularMarketVolume ?? 0,
    })) as ScreenerItem[]
  }, { allowStale: true })
}

// ── News (Finnhub fallback) ────────────────────────────────────────────────────

export interface NewsItem {
  headline: string
  summary: string
  url: string
  datetime: number
  source: string
}

export async function getNews(symbol: string): Promise<CachedResult<NewsItem[]>> {
  const key = `news:${symbol}`
  return withCache(key, TTL.NEWS, async () => {
    if (FINNHUB_KEY) {
      await finnhubLimiter.acquire()
      const to = new Date().toISOString().slice(0, 10)
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const res = await axios.get<NewsItem[]>(
        `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
        { timeout: 8000 },
      )
      return res.data.slice(0, 10)
    }
    // fallback: yahoo news via search
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await yahooFinance.search(symbol, { quotesCount: 0, newsCount: 8 }, { validateResult: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((res.news ?? []) as any[]).map((n) => ({
      headline: n.title ?? '',
      summary: '',
      url: n.link ?? '',
      datetime: n.providerPublishTime instanceof Date ? Math.floor(n.providerPublishTime.getTime() / 1000) : 0,
      source: n.publisher ?? '',
    }))
  }, { allowStale: true })
}
