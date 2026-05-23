import { ipcMain } from 'electron'
import { getAiSettings, updateAiSettings, getPrefetchSettings, updatePrefetchSettings } from '../services/db'
import type { AiSettingsUpdate, PrefetchSettingsUpdate } from '../services/db'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:ai:get', () => getAiSettings(false))
  ipcMain.handle('settings:ai:update', (_e, update: AiSettingsUpdate) => {
    updateAiSettings(update)
    return getAiSettings(false)
  })
  ipcMain.handle('settings:prefetch:get', () => getPrefetchSettings())
  ipcMain.handle('settings:prefetch:update', (_e, update: PrefetchSettingsUpdate) => {
    updatePrefetchSettings(update)
    return getPrefetchSettings()
  })
}
