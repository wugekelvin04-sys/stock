import { contextBridge, ipcRenderer, shell } from 'electron'
import type { HistoryPeriod, Quote, HistoryBar, OptionContract, SearchResult, ScreenerItem, NewsItem, CachedResult, SectorItem, IndexItem } from './services/market'
import type { SectorPick } from './services/db'
import type { HoldingRecord, ImportHint } from './services/parser'
import type { HoldingRow } from './services/db'
import type { AnalysisContext, AnalysisChunk, AnalysisMode, ChatMessage } from './services/claude'

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
    prevDayIntraday: (symbol: string) => ipcRenderer.invoke('market:prev-day-intraday', symbol) as Promise<CachedResult<HistoryBar[]>>,
    optionDates: (symbol: string) => ipcRenderer.invoke('market:option-dates', symbol) as Promise<string[]>,
    optionsByDate: (symbol: string, date: string) => ipcRenderer.invoke('market:options-by-date', symbol, date) as Promise<CachedResult<import('./services/market').OptionContract[]>>,
    indices: () => ipcRenderer.invoke('market:indices') as Promise<CachedResult<IndexItem[]>>,
    sectors: () => ipcRenderer.invoke('market:sectors') as Promise<CachedResult<SectorItem[]>>,
  },

  // ── Portfolio ──────────────────────────────────────────────────────────────
  portfolio: {
    import: (filePath: string, hint?: ImportHint) => ipcRenderer.invoke('portfolio:import', filePath, hint) as Promise<HoldingRecord[]>,
    save: (records: HoldingRecord[]) => ipcRenderer.invoke('portfolio:save', records) as Promise<{ ok: boolean }>,
    list: () => ipcRenderer.invoke('portfolio:list') as Promise<HoldingRow[]>,
    update: (id: number, fields: Partial<import('./services/parser').HoldingRecord>) => ipcRenderer.invoke('portfolio:update', id, fields) as Promise<{ ok: boolean }>,
    delete: (id: number) => ipcRenderer.invoke('portfolio:delete', id) as Promise<{ ok: boolean }>,
    clear: () => ipcRenderer.invoke('portfolio:clear') as Promise<{ ok: boolean }>,
  },

  // ── Analysis ───────────────────────────────────────────────────────────────
  analysis: {
    start: (symbol: string, context: AnalysisContext, mode?: AnalysisMode) =>
      ipcRenderer.invoke('analysis:start', symbol, context, mode) as Promise<{ sessionId: string }>,
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
    runPicks: () => ipcRenderer.invoke('insight:run-picks') as Promise<{ ok: boolean; error?: string }>,
    sectorPicks: () => ipcRenderer.invoke('insight:sector-picks') as Promise<{ date: string; picks: SectorPick[] } | null>,
    runSectorPicks: () => ipcRenderer.invoke('insight:run-sector-picks') as Promise<{ started: boolean }>,
    onSectorPicksUpdated: (cb: (payload: { date: string; picks: SectorPick[] }) => void) => {
      const h = (_e: Electron.IpcRendererEvent, payload: { date: string; picks: SectorPick[] }) => cb(payload)
      ipcRenderer.on('scheduler:sector-picks-updated', h)
      return () => ipcRenderer.off('scheduler:sector-picks-updated', h)
    },
    onSectorPicksProgress: (cb: (text: string) => void) => {
      const h = (_e: Electron.IpcRendererEvent, text: string) => cb(text)
      ipcRenderer.on('insight:sector-picks-progress', h)
      return () => ipcRenderer.off('insight:sector-picks-progress', h)
    },
    onSectorPicksDone: (cb: (result: { ok: boolean; error?: string }) => void) => {
      const h = (_e: Electron.IpcRendererEvent, result: { ok: boolean; error?: string }) => cb(result)
      ipcRenderer.on('insight:sector-picks-done', h)
      return () => ipcRenderer.off('insight:sector-picks-done', h)
    },
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
    onPicksProgress: (cb: (text: string) => void) => {
      const h = (_e: Electron.IpcRendererEvent, text: string) => cb(text)
      ipcRenderer.on('insight:picks-progress', h)
      return () => ipcRenderer.off('insight:picks-progress', h)
    },
    onPicksDone: (cb: (result: { ok: boolean; error?: string }) => void) => {
      const h = (_e: Electron.IpcRendererEvent, result: { ok: boolean; error?: string }) => cb(result)
      ipcRenderer.on('insight:picks-done', h)
      return () => ipcRenderer.off('insight:picks-done', h)
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

  // ── Chat ───────────────────────────────────────────────────────────────────
  chat: {
    send: (userMessage: string, history: ChatMessage[]) =>
      ipcRenderer.invoke('chat:send', userMessage, history) as Promise<{ sessionId: string }>,
    cancel: (sessionId: string) =>
      ipcRenderer.invoke('chat:cancel', sessionId) as Promise<{ ok: boolean }>,
    onChunk: (cb: (chunk: AnalysisChunk) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: AnalysisChunk) => cb(chunk)
      ipcRenderer.on('chat:chunk', handler)
      return () => ipcRenderer.off('chat:chunk', handler)
    },
  },

  // ── Stock info ─────────────────────────────────────────────────────────────
  stock: {
    profileGet: (symbol: string) => ipcRenderer.invoke('stock:profile:get', symbol) as Promise<import('./services/db').StockProfile | null>,
    profileGenerate: (symbol: string) => ipcRenderer.invoke('stock:profile:generate', symbol) as Promise<{ sessionId: string }>,
    catalystGet: (symbol: string) => ipcRenderer.invoke('stock:catalyst:get', symbol) as Promise<import('./services/db').StockCatalyst | null>,
    catalystGenerate: (symbol: string) => ipcRenderer.invoke('stock:catalyst:generate', symbol) as Promise<{ sessionId: string }>,
    onProfileChunk: (cb: (chunk: import('./services/claude').AnalysisChunk) => void) => {
      ipcRenderer.removeAllListeners('stock:profile:chunk')
      const h = (_e: Electron.IpcRendererEvent, chunk: import('./services/claude').AnalysisChunk) => cb(chunk)
      ipcRenderer.on('stock:profile:chunk', h)
      return () => ipcRenderer.removeAllListeners('stock:profile:chunk')
    },
    onCatalystChunk: (cb: (chunk: import('./services/claude').AnalysisChunk) => void) => {
      ipcRenderer.removeAllListeners('stock:catalyst:chunk')
      const h = (_e: Electron.IpcRendererEvent, chunk: import('./services/claude').AnalysisChunk) => cb(chunk)
      ipcRenderer.on('stock:catalyst:chunk', h)
      return () => ipcRenderer.removeAllListeners('stock:catalyst:chunk')
    },
    ratingsGet: (symbol: string) => ipcRenderer.invoke('stock:ratings:get', symbol) as Promise<import('./services/db').StockRatings | null>,
    ratingsGenerate: (symbol: string) => ipcRenderer.invoke('stock:ratings:generate', symbol) as Promise<{ sessionId: string }>,
    onRatingsChunk: (cb: (chunk: import('./services/claude').AnalysisChunk) => void) => {
      ipcRenderer.removeAllListeners('stock:ratings:chunk')
      const h = (_e: Electron.IpcRendererEvent, chunk: import('./services/claude').AnalysisChunk) => cb(chunk)
      ipcRenderer.on('stock:ratings:chunk', h)
      return () => ipcRenderer.removeAllListeners('stock:ratings:chunk')
    },
    earningsGet: (symbol: string) => ipcRenderer.invoke('stock:earnings:get', symbol) as Promise<import('./services/db').StockEarnings | null>,
    earningsGenerate: (symbol: string) => ipcRenderer.invoke('stock:earnings:generate', symbol) as Promise<{ sessionId: string }>,
    onEarningsChunk: (cb: (chunk: import('./services/claude').AnalysisChunk) => void) => {
      ipcRenderer.removeAllListeners('stock:earnings:chunk')
      const h = (_e: Electron.IpcRendererEvent, chunk: import('./services/claude').AnalysisChunk) => cb(chunk)
      ipcRenderer.on('stock:earnings:chunk', h)
      return () => ipcRenderer.removeAllListeners('stock:earnings:chunk')
    },
  },

  // ── Prefetch tasks ─────────────────────────────────────────────────────────
  prefetch: {
    onStatus: (cb: (s: { running: boolean; total: number; done: number }) => void) => {
      const h = (_e: Electron.IpcRendererEvent, s: { running: boolean; total: number; done: number }) => cb(s)
      ipcRenderer.on('prefetch:status', h)
      return () => ipcRenderer.off('prefetch:status', h)
    },
    onProgress: (cb: (p: { symbol: string; type: string; status: string }) => void) => {
      const h = (_e: Electron.IpcRendererEvent, p: { symbol: string; type: string; status: string }) => cb(p)
      ipcRenderer.on('prefetch:progress', h)
      return () => ipcRenderer.off('prefetch:progress', h)
    },
  },

  // ── Shell ──────────────────────────────────────────────────────────────────
  openExternal: (url: string) => shell.openExternal(url),
}

contextBridge.exposeInMainWorld('api', api)

export type StockApi = typeof api
