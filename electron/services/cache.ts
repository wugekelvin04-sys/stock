import { cacheGet, cacheSet, cacheGetStale } from './db'

export const TTL = {
  QUOTE: 300,           // 5 min  — 实时报价
  SCREENER: 900,        // 15 min — 涨跌幅榜
  OPTION_CHAIN: 1800,   // 30 min — 当日未到期期权链
  NEWS: 3600,           // 1 h    — 新闻
  HISTORY: 4 * 3600,    // 4 h    — 含当日未收盘 bar 的日线（1mo）
  FUNDAMENTALS: 86400,  // 24 h   — 基本面 / 历史日线
  SEARCH: 3600,         // 1 h    — 搜索结果
  IMMUTABLE: 10 * 365 * 86400, // ~10年 — 已收盘历史 bar / 已到期期权链（数据永不变）
} as const

export async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  opts: { allowStale?: boolean } = {},
): Promise<{ data: T; fromCache: boolean; fetchedAt?: number }> {
  const cached = cacheGet(key)
  if (cached !== null) {
    return { data: cached as T, fromCache: true }
  }

  try {
    const data = await fetcher()
    cacheSet(key, data, ttl)
    return { data, fromCache: false, fetchedAt: Date.now() }
  } catch (err) {
    if (opts.allowStale) {
      const stale = cacheGetStale(key)
      if (stale !== null) {
        console.warn(`[cache] using stale data for ${key}:`, (err as Error).message)
        return { data: stale as T, fromCache: true }
      }
    }
    throw err
  }
}
