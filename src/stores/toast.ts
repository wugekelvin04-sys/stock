import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  title?: string
  duration?: number // ms, 0 = sticky
}

interface ToastStore {
  toasts: Toast[]
  show: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (toast) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

// Convenience helpers
export const toast = {
  success: (message: string, title?: string) =>
    useToastStore.getState().show({ type: 'success', message, title }),
  error: (message: string, title?: string) =>
    useToastStore.getState().show({ type: 'error', message, title, duration: 6000 }),
  warning: (message: string, title?: string) =>
    useToastStore.getState().show({ type: 'warning', message, title }),
  info: (message: string, title?: string) =>
    useToastStore.getState().show({ type: 'info', message, title }),
}
