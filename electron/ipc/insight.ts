import { ipcMain } from 'electron'
import { listInsights, getLatestDailyPicks } from '../services/db'

export function registerInsightHandlers() {
  ipcMain.handle('insight:list', (_e, limit = 20) => listInsights(limit))
  ipcMain.handle('insight:daily-picks', () => getLatestDailyPicks())
}
