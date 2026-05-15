import { ipcMain, BrowserWindow } from 'electron'
import { startAnalysis, cancelAnalysis } from '../services/claude'
import type { AnalysisContext, AnalysisMode } from '../services/claude'

export function registerAnalysisHandlers() {
  ipcMain.handle('analysis:start', async (e, symbol: string, context: AnalysisContext, mode?: AnalysisMode) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('No window found')
    return startAnalysis(symbol, context, win, mode)
  })

  ipcMain.handle('analysis:cancel', (_e, sessionId: string) => {
    cancelAnalysis(sessionId)
    return { ok: true }
  })
}
