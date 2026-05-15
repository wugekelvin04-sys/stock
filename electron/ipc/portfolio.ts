import { ipcMain } from 'electron'
import { parseFile } from '../services/parser'
import { saveHoldings, listHoldings, deleteHolding, clearHoldings, updateHolding } from '../services/db'
import type { HoldingRecord } from '../services/parser'

export function registerPortfolioHandlers() {
  ipcMain.handle('portfolio:import', async (_e, filePath: string): Promise<HoldingRecord[]> => {
    return parseFile(filePath)
  })

  ipcMain.handle('portfolio:save', (_e, records: HoldingRecord[]) => {
    saveHoldings(records.map((r) => ({
      symbol: r.symbol,
      type: r.type,
      qty: r.qty,
      costBasis: r.costBasis,
      strike: r.strike,
      expiry: r.expiry,
      side: r.side,
      exchange: r.exchange,
    })))
    return { ok: true }
  })

  ipcMain.handle('portfolio:list', () => listHoldings())

  ipcMain.handle('portfolio:update', (_e, id: number, fields: Partial<HoldingRecord>) => {
    updateHolding(id, fields)
    return { ok: true }
  })

  ipcMain.handle('portfolio:delete', (_e, id: number) => {
    deleteHolding(id)
    return { ok: true }
  })

  ipcMain.handle('portfolio:clear', () => {
    clearHoldings()
    return { ok: true }
  })
}
