import { ipcMain } from 'electron'
import { getQuotes, getHistory, getOptionChain, getIntraday, getOptionDates, getOptionsByDate, searchSymbols, getGainers, getLosers, getNews } from '../services/market'
import type { HistoryPeriod } from '../services/market'

export function registerMarketHandlers() {
  ipcMain.handle('market:quotes', (_e, symbols: string[]) => getQuotes(symbols))
  ipcMain.handle('market:history', (_e, symbol: string, period: HistoryPeriod) => getHistory(symbol, period ?? '6mo'))
  ipcMain.handle('market:options', (_e, symbol: string) => getOptionChain(symbol))
  ipcMain.handle('market:intraday', (_e, symbol: string) => getIntraday(symbol))
  ipcMain.handle('market:option-dates', (_e, symbol: string) => getOptionDates(symbol))
  ipcMain.handle('market:options-by-date', (_e, symbol: string, date: string) => getOptionsByDate(symbol, date))
  ipcMain.handle('market:search', (_e, query: string) => searchSymbols(query))
  ipcMain.handle('market:gainers', () => getGainers())
  ipcMain.handle('market:losers', () => getLosers())
  ipcMain.handle('market:news', (_e, symbol: string) => getNews(symbol))
}
