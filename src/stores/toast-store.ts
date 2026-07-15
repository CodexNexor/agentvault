import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'> & { id?: string }) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? uuid()
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id, type: t.type as ToastType }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
    }, 4200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))
