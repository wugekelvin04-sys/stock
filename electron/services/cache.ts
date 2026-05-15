import { cacheGet, cacheSet, cacheGetStale } from './db'

export const TTL = {
  QUOTE: 300,        // 5 min
  SCREENER: 900,     // 15 min
  OPTION_CHAIN: 1800,// 30 min
  NEWS: 1800,        // 30 min
  FUNDAMENTALS: 86400, // 24 h
  HISTORY: 3600,     // 1 h (日K变化不频繁)
  SEARCH: 600,       // 10 min
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
