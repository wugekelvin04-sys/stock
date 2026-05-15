import { ipcMain } from 'electron'
import { getQuotes, getHistory, getOptionChain, searchSymbols, getGainers, getLosers, getNews } from '../services/market'
import type { HistoryPeriod } from '../services/market'

export function registerMarketHandlers() {
  ipcMain.handle('market:quotes', (_e, symbols: string[]) => getQuotes(symbols))
  ipcMain.handle('market:history', (_e, symbol: string, period: HistoryPeriod) => getHistory(symbol, period ?? '6mo'))
  ipcMain.handle('market:options', (_e, symbol: string) => getOptionChain(symbol))
  ipcMain.handle('market:search', (_e, query: string) => searchSymbols(query))
  ipcMain.handle('market:gainers', () => getGainers())
  ipcMain.handle('market:losers', () => getLosers())
  ipcMain.handle('market:news', (_e, symbol: string) => getNews(symbol))
}
