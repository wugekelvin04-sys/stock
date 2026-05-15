import { ipcMain } from 'electron'
import { listWatchGroups, addWatchGroup, deleteWatchGroup, listWatchItems, addWatchItem, removeWatchItem, isWatched } from '../services/db'

export function registerWatchlistHandlers() {
  ipcMain.handle('watchlist:list-groups', () => listWatchGroups())
  ipcMain.handle('watchlist:add-group', (_e, name: string) => addWatchGroup(name))
  ipcMain.handle('watchlist:delete-group', (_e, id: number) => { deleteWatchGroup(id); return { ok: true } })
  ipcMain.handle('watchlist:list-items', (_e, groupId: number) => listWatchItems(groupId))
  ipcMain.handle('watchlist:add-item', (_e, groupId: number, symbol: string) => { addWatchItem(groupId, symbol); return { ok: true } })
  ipcMain.handle('watchlist:remove-item', (_e, groupId: number, symbol: string) => { removeWatchItem(groupId, symbol); return { ok: true } })
  ipcMain.handle('watchlist:is-watched', (_e, symbol: string) => isWatched(symbol))
}
