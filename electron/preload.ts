import { contextBridge, ipcRenderer, shell } from 'electron'
import type { HistoryPeriod, Quote, HistoryBar, OptionContract, SearchResult, ScreenerItem, NewsItem, CachedResult } from './services/market'
import type { HoldingRecord } from './services/parser'
import type { HoldingRow } from './services/db'
import type { AnalysisContext, AnalysisChunk } from './services/claude'

const api = {
  // ── App ────────────────────────────────────────────────────────────────────
  ping: (msg: string) => ipcRenderer.invoke('app:ping', msg) as Promise<string>,
  getClaudeInfo: () => ipcRenderer.invoke('claude:info') as Promise<{ ok: boolean; version?: string; path?: string; error?: string }>,
  getAppInfo: () => ipcRenderer.invoke('app:info') as Promise<{ version: string; platform: string; arch: string; node: string; electron: string }>,

  // ── Market ─────────────────────────────────────────────────────────────────
  market: {
    quotes: (symbols: string[]) => ipcRenderer.invoke('market:quotes', symbols) as Promise<CachedResult<Quote[]>>,
    history: (symbol: string, period?: HistoryPeriod) => ipcRenderer.invoke('market:history', symbol, period) as Promise<CachedResult<HistoryBar[]>>,
    options: (symbol: string) => ipcRenderer.invoke('market:options', symbol) as Promise<CachedResult<OptionContract[]>>,
    search: (query: string) => ipcRenderer.invoke('market:search', query) as Promise<CachedResult<SearchResult[]>>,
    gainers: () => ipcRenderer.invoke('market:gainers') as Promise<CachedResult<ScreenerItem[]>>,
    losers: () => ipcRenderer.invoke('market:losers') as Promise<CachedResult<ScreenerItem[]>>,
    news: (symbol: string) => ipcRenderer.invoke('market:news', symbol) as Promise<CachedResult<NewsItem[]>>,
    intraday: (symbol: string) => ipcRenderer.invoke('market:intraday', symbol) as Promise<CachedResult<HistoryBar[]>>,
    optionDates: (symbol: string) => ipcRenderer.invoke('market:option-dates', symbol) as Promise<string[]>,
    optionsByDate: (symbol: string, date: string) => ipcRenderer.invoke('market:options-by-date', symbol, date) as Promise<CachedResult<import('./services/market').OptionContract[]>>,
  },

  // ── Portfolio ──────────────────────────────────────────────────────────────
  portfolio: {
    import: (filePath: string) => ipcRenderer.invoke('portfolio:import', filePath) as Promise<HoldingRecord[]>,
    save: (records: HoldingRecord[]) => ipcRenderer.invoke('portfolio:save', records) as Promise<{ ok: boolean }>,
    list: () => ipcRenderer.invoke('portfolio:list') as Promise<HoldingRow[]>,
    delete: (id: number) => ipcRenderer.invoke('portfolio:delete', id) as Promise<{ ok: boolean }>,
    clear: () => ipcRenderer.invoke('portfolio:clear') as Promise<{ ok: boolean }>,
  },

  // ── Analysis ───────────────────────────────────────────────────────────────
  analysis: {
    start: (symbol: string, context: AnalysisContext) =>
      ipcRenderer.invoke('analysis:start', symbol, context) as Promise<{ sessionId: string }>,
    cancel: (sessionId: string) =>
      ipcRenderer.invoke('analysis:cancel', sessionId) as Promise<{ ok: boolean }>,
    onChunk: (cb: (chunk: AnalysisChunk) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: AnalysisChunk) => cb(chunk)
      ipcRenderer.on('analysis:chunk', handler)
      return () => ipcRenderer.off('analysis:chunk', handler)
    },
  },

  // ── Insight ────────────────────────────────────────────────────────────────
  insight: {
    list: (limit?: number) => ipcRenderer.invoke('insight:list', limit) as Promise<{ id: number; triggered_at: number; content: string }[]>,
    dailyPicks: () => ipcRenderer.invoke('insight:daily-picks') as Promise<{ date: string; picks: { symbol: string; reason: string }[] } | null>,
    onInsightUpdated: (cb: (payload: { content: string; triggeredAt: number }) => void) => {
      const h = (_e: Electron.IpcRendererEvent, payload: { content: string; triggeredAt: number }) => cb(payload)
      ipcRenderer.on('scheduler:insight-updated', h)
      return () => ipcRenderer.off('scheduler:insight-updated', h)
    },
    onDailyPicksUpdated: (cb: (payload: { date: string; picks: { symbol: string; reason: string }[] }) => void) => {
      const h = (_e: Electron.IpcRendererEvent, payload: { date: string; picks: { symbol: string; reason: string }[] }) => cb(payload)
      ipcRenderer.on('scheduler:daily-picks-updated', h)
      return () => ipcRenderer.off('scheduler:daily-picks-updated', h)
    },
  },

  // ── Watchlist ──────────────────────────────────────────────────────────────
  watchlist: {
    listGroups: () => ipcRenderer.invoke('watchlist:list-groups') as Promise<import('./services/db').WatchGroup[]>,
    addGroup: (name: string) => ipcRenderer.invoke('watchlist:add-group', name) as Promise<import('./services/db').WatchGroup>,
    deleteGroup: (id: number) => ipcRenderer.invoke('watchlist:delete-group', id) as Promise<{ ok: boolean }>,
    listItems: (groupId: number) => ipcRenderer.invoke('watchlist:list-items', groupId) as Promise<import('./services/db').WatchItem[]>,
    addItem: (groupId: number, symbol: string) => ipcRenderer.invoke('watchlist:add-item', groupId, symbol) as Promise<{ ok: boolean }>,
    removeItem: (groupId: number, symbol: string) => ipcRenderer.invoke('watchlist:remove-item', groupId, symbol) as Promise<{ ok: boolean }>,
    isWatched: (symbol: string) => ipcRenderer.invoke('watchlist:is-watched', symbol) as Promise<{ groupId: number; groupName: string }[]>,
  },

  // ── Shell ──────────────────────────────────────────────────────────────────
  openExternal: (url: string) => shell.openExternal(url),
}

contextBridge.exposeInMainWorld('api', api)

export type StockApi = typeof api
