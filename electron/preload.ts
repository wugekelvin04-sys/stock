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

  // ── Shell ──────────────────────────────────────────────────────────────────
  openExternal: (url: string) => shell.openExternal(url),
}

contextBridge.exposeInMainWorld('api', api)

export type StockApi = typeof api
