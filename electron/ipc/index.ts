import { app, ipcMain } from 'electron'
import { detectClaude } from '../services/claude'
import { registerMarketHandlers } from './market'
import { registerPortfolioHandlers } from './portfolio'
import { registerAnalysisHandlers } from './analysis'
import { registerInsightHandlers } from './insight'
import { registerWatchlistHandlers } from './watchlist'
import { registerChatHandlers } from './chat'
import { registerStockHandlers } from './stock'
import { registerSettingsHandlers } from './settings'

export function registerIpcHandlers() {
  registerMarketHandlers()
  registerPortfolioHandlers()
  registerAnalysisHandlers()
  registerInsightHandlers()
  registerWatchlistHandlers()
  registerChatHandlers()
  registerStockHandlers()
  registerSettingsHandlers()
  ipcMain.handle('app:ping', async (_e, msg: string) => `pong: ${msg ?? ''}`)

  ipcMain.handle('claude:info', async () => detectClaude())

  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    electron: process.versions.electron,
  }))
}
