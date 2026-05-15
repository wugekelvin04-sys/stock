import { create } from 'zustand'
import type { HoldingRow } from '../../electron/services/db'

interface PortfolioState {
  holdings: HoldingRow[]
  loading: boolean
  setHoldings: (h: HoldingRow[]) => void
  setLoading: (v: boolean) => void
  reload: () => Promise<void>
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  holdings: [],
  loading: false,
  setHoldings: (holdings) => set({ holdings }),
  setLoading: (loading) => set({ loading }),
  reload: async () => {
    set({ loading: true })
    try {
      const holdings = await window.api.portfolio.list()
      set({ holdings })
    } finally {
      set({ loading: false })
    }
  },
}))
