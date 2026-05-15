import { create } from 'zustand'

export interface WatchGroup { id: number; name: string; sortOrder: number }
export interface WatchItem { id: number; groupId: number; symbol: string; sortOrder: number }

interface WatchlistStore {
  groups: WatchGroup[]
  items: Record<number, WatchItem[]>  // groupId → items
  loading: boolean
  reload: () => Promise<void>
  addGroup: (name: string) => Promise<void>
  deleteGroup: (id: number) => Promise<void>
  addItem: (groupId: number, symbol: string) => Promise<void>
  removeItem: (groupId: number, symbol: string) => Promise<void>
}

export const useWatchlistStore = create<WatchlistStore>((set, get) => ({
  groups: [],
  items: {},
  loading: false,
  reload: async () => {
    set({ loading: true })
    try {
      const groups = await window.api.watchlist.listGroups()
      const items: Record<number, WatchItem[]> = {}
      await Promise.all(groups.map(async (g) => {
        items[g.id] = await window.api.watchlist.listItems(g.id)
      }))
      set({ groups, items })
    } finally {
      set({ loading: false })
    }
  },
  addGroup: async (name) => {
    await window.api.watchlist.addGroup(name)
    await get().reload()
  },
  deleteGroup: async (id) => {
    await window.api.watchlist.deleteGroup(id)
    await get().reload()
  },
  addItem: async (groupId, symbol) => {
    await window.api.watchlist.addItem(groupId, symbol)
    await get().reload()
  },
  removeItem: async (groupId, symbol) => {
    await window.api.watchlist.removeItem(groupId, symbol)
    await get().reload()
  },
}))
