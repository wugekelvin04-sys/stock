import { ipcMain, BrowserWindow } from 'electron'
import { listInsights, getLatestDailyPicks, getLatestSectorPicks } from '../services/db'
import { triggerDailyPicks, triggerSectorPicks } from '../services/scheduler'

export function registerInsightHandlers() {
  ipcMain.handle('insight:list', (_e, limit = 20) => listInsights(limit))
  ipcMain.handle('insight:daily-picks', () => getLatestDailyPicks())
  ipcMain.handle('insight:sector-picks', () => getLatestSectorPicks())

  ipcMain.handle('insight:run-picks', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    triggerDailyPicks((text) => {
      win?.webContents.send('insight:picks-progress', text)
    }).then(() => {
      win?.webContents.send('insight:picks-done', { ok: true })
    }).catch((err: Error) => {
      win?.webContents.send('insight:picks-done', { ok: false, error: err.message })
    })
    return { started: true }
  })

  ipcMain.handle('insight:run-sector-picks', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    triggerSectorPicks((text) => {
      win?.webContents.send('insight:sector-picks-progress', text)
    }).then(() => {
      win?.webContents.send('insight:sector-picks-done', { ok: true })
    }).catch((err: Error) => {
      win?.webContents.send('insight:sector-picks-done', { ok: false, error: err.message })
    })
    return { started: true }
  })
}
