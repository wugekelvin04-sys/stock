import { create } from 'zustand'

const PASSWORD = 'mima'

interface AuthState {
  unlocked: boolean
  unlock: (input: string) => boolean
  lock: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  unlocked: false,
  unlock: (input) => {
    if (input === PASSWORD) {
      set({ unlocked: true })
      return true
    }
    return false
  },
  lock: () => set({ unlocked: false }),
}))
