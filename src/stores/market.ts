import { create } from 'zustand'
import type { Quote, ScreenerItem } from '../../electron/services/market'

interface MarketState {
  gainers: ScreenerItem[]
  losers: ScreenerItem[]
  quotes: Record<string, Quote>
  lastUpdated: number | null
  setGainers: (items: ScreenerItem[]) => void
  setLosers: (items: ScreenerItem[]) => void
  setQuotes: (quotes: Quote[]) => void
}

export const useMarketStore = create<MarketState>((set) => ({
  gainers: [],
  losers: [],
  quotes: {},
  lastUpdated: null,
  setGainers: (items) => set({ gainers: items }),
  setLosers: (items) => set({ losers: items }),
  setQuotes: (quotes) =>
    set((s) => ({
      quotes: { ...s.quotes, ...Object.fromEntries(quotes.map((q) => [q.symbol, q])) },
      lastUpdated: Date.now(),
    })),
}))
