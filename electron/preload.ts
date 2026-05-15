import { contextBridge, ipcRenderer } from 'electron'

const api = {
  ping: (msg: string) => ipcRenderer.invoke('app:ping', msg) as Promise<string>,
  getClaudeInfo: () => ipcRenderer.invoke('claude:info') as Promise<{ ok: boolean; version?: string; path?: string; error?: string }>,
  getAppInfo: () => ipcRenderer.invoke('app:info') as Promise<{ version: string; platform: string; arch: string; node: string; electron: string }>,
}

contextBridge.exposeInMainWorld('api', api)

export type StockApi = typeof api
