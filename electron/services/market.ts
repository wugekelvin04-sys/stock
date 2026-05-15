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

// ── Symbol normalization ──────────────────────────────────────────────────────
// Yahoo Finance uses BRK-B / BF-B style; users often type BRKB / BFB / BRK.B
const DOTDASH_MAP: Record<string, string> = {
  'BRKA': 'BRK-A', 'BRKB': 'BRK-B',
  'BFA':  'BF-A',  'BFB':  'BF-B',
}
function normalizeSymbol(s: string): string {
  const up = s.toUpperCase().trim()
  if (DOTDASH_MAP[up]) return DOTDASH_MAP[up]
  // BRK.B → BRK-B
  if (up.includes('.')) return up.replace('.', '-')
  return up
}
function normalizeSymbols(syms: string[]): string[] { return syms.map(normalizeSymbol) }

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
  // extended fields
  open?: number
  dayHigh?: number
  dayLow?: number
  previousClose?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  avgVolume3M?: number
  trailingPE?: number
  forwardPE?: number
  eps?: number
  dividendYield?: number
  bid?: number
  ask?: number
  preMarketPrice?: number
  preMarketChange?: number
  postMarketPrice?: number
  postMarketChange?: number
  analystRating?: string
  marketState?: string
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
  volume: number
  inTheMoney?: boolean
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

export interface SectorItem {
  symbol: string   // ETF ticker
  name: string     // sector name
  price: number
  changePercent: number
}

export interface IndexItem {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

export interface CachedResult<T> {
  data: T
  fromCache: boolean
  fetchedAt?: number
  staleSince?: number
}

// ── Quotes ────────────────────────────────────────────────────────────────────

export async function getQuotes(symbols: string[]): Promise<CachedResult<Quote[]>> {
  const normalized = normalizeSymbols(symbols)
  const key = `quotes:${normalized.sort().join(',')}`
  return withCache(key, TTL.QUOTE, async () => {
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any = await yahooFinance.quote(normalized, {}, { validateResult: false })
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
      open: q.regularMarketOpen,
      dayHigh: q.regularMarketDayHigh,
      dayLow: q.regularMarketDayLow,
      previousClose: q.regularMarketPreviousClose,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      avgVolume3M: q.averageDailyVolume3Month,
      trailingPE: q.trailingPE,
      forwardPE: q.forwardPE,
      eps: q.epsTrailingTwelveMonths,
      dividendYield: q.dividendYield,
      bid: q.bid,
      ask: q.ask,
      preMarketPrice: q.preMarketPrice,
      preMarketChange: q.preMarketChange,
      postMarketPrice: q.postMarketPrice,
      postMarketChange: q.postMarketChange,
      analystRating: q.averageAnalystRating,
      marketState: q.marketState,
    })) as Quote[]
  }, { allowStale: true })
}

// ── History ───────────────────────────────────────────────────────────────────

export type HistoryPeriod = '1d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y'

export async function getHistory(symbol: string, period: HistoryPeriod = '6mo'): Promise<CachedResult<HistoryBar[]>> {
  symbol = normalizeSymbol(symbol)
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

function historyCacheTTL(period: HistoryPeriod): number {
  if (period === '1d') return TTL.QUOTE   // 5 min — 日内分钟线，实时刷新
  // 1mo 含今日 bar；收盘后（ET 16:00+）今日 bar 也定了，走永久缓存
  if (period === '1mo') {
    const etHour = parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }), 10)
    return etHour >= 16 ? TTL.IMMUTABLE : TTL.HISTORY
  }
  return TTL.IMMUTABLE  // 3mo+ 全部已收盘，永久缓存
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
      includePrePost: true,
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

export async function getPrevDayIntraday(symbol: string): Promise<CachedResult<HistoryBar[]>> {
  // Find last trading day (skip weekends)
  const prev = new Date()
  prev.setHours(0, 0, 0, 0)
  do { prev.setDate(prev.getDate() - 1) } while (prev.getDay() === 0 || prev.getDay() === 6)
  const dateStr = prev.toISOString().slice(0, 10)
  const key = `intraday-prev:${symbol}:${dateStr}`
  return withCache(key, TTL.IMMUTABLE, async () => {
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(symbol, {
      period1: dateStr,
      period2: (() => { const d = new Date(prev); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })(),
      interval: '5m',
      includePrePost: true,
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
    volume: Number(c.volume ?? 0),
    inTheMoney: Boolean(c.inTheMoney),
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

// ── Indices ───────────────────────────────────────────────────────────────────

const INDEX_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^VIX']
const INDEX_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': '纳斯达克',
  '^DJI': '道琼斯',
  '^VIX': 'VIX',
}

export async function getIndices(): Promise<CachedResult<IndexItem[]>> {
  return withCache('market:indices', TTL.SCREENER, async () => {
    await yahooLimiter.acquire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any[] = await yahooFinance.quote(INDEX_SYMBOLS, {}, { validateResult: false }) as any[]
    const quotes = Array.isArray(res) ? res : [res]
    return quotes.map((q) => ({
      symbol: q.symbol ?? '',
      name: INDEX_NAMES[q.symbol] ?? q.shortName ?? q.symbol,
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
    })) as IndexItem[]
  }, { allowStale: true })
}

// ── Sector ETFs ───────────────────────────────────────────────────────────────

const SECTOR_ETFS = [
  { symbol: 'SOXX', name: '半导体' },
  { symbol: 'QQQ',  name: 'AI科技' },
  { symbol: 'CLOU', name: 'AI基建' },
  { symbol: 'ITA',  name: '军工' },
  { symbol: 'NLR',  name: '核电' },
  { symbol: 'XLE',  name: '石油能源' },
  { symbol: 'XBI',  name: '生物医药' },
  { symbol: 'KWEB', name: '中概' },
  { symbol: 'XLF',  name: '金融' },
  { symbol: 'XRT',  name: '零售消费' },
  { symbol: 'XLRE', name: '房地产' },
]

export async function getSectors(): Promise<CachedResult<SectorItem[]>> {
  return withCache('market:sectors', TTL.SCREENER, async () => {
    await yahooLimiter.acquire()
    const syms = SECTOR_ETFS.map(e => e.symbol)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any[] = await yahooFinance.quote(syms, {}, { validateResult: false }) as any[]
    const quotes = Array.isArray(res) ? res : [res]
    const nameMap = Object.fromEntries(SECTOR_ETFS.map(e => [e.symbol, e.name]))
    return quotes
      .map((q) => ({
        symbol: q.symbol ?? '',
        name: nameMap[q.symbol] ?? q.symbol,
        price: q.regularMarketPrice ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
      }))
      .sort((a, b) => b.changePercent - a.changePercent) as SectorItem[]
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
