import { app, ipcMain } from 'electron'
import { detectClaude } from '../services/claude'
import { registerMarketHandlers } from './market'
import { registerPortfolioHandlers } from './portfolio'

export function registerIpcHandlers() {
  registerMarketHandlers()
  registerPortfolioHandlers()
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
