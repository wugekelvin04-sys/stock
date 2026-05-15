import type { StockApi } from './preload'

declare global {
  interface Window {
    api: StockApi
  }
}

export {}
