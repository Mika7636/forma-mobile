// Global toast state, and the toast() helper.

import { create } from 'zustand'
import { haptics } from '../utils/haptics'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  description?: string
  duration: number
}

export interface ToastOptions {
  description?: string
  duration?: number
  haptic?: boolean
}

const MAX_VISIBLE = 3

const DEFAULT_DURATION = 3000
const ERROR_DURATION = 4200

interface ToastState {
  toasts: ToastItem[]
  bottomOffset: number
  show: (type: ToastType, message: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
  clear: () => void
  setBottomOffset: (offset: number) => void
}

let seq = 0

const HAPTIC_FOR: Record<ToastType, () => void> = {
  success: haptics.success,
  error: haptics.error,
  warning: haptics.warning,
  info: haptics.light,
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  bottomOffset: 0,

  show: (type, message, options = {}) => {
    const id = `toast-${++seq}`
    const item: ToastItem = {
      id,
      type,
      message,
      description: options.description,
      duration: options.duration ?? (type === 'error' ? ERROR_DURATION : DEFAULT_DURATION),
    }

    if (options.haptic !== false) HAPTIC_FOR[type]()

    set((state) => {
      const withoutDuplicate = state.toasts.filter(
        (t) => !(t.type === type && t.message === message),
      )
      return { toasts: [...withoutDuplicate, item].slice(-MAX_VISIBLE) }
    })

    return id
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),

  setBottomOffset: (bottomOffset) => set({ bottomOffset }),
}))

export const toast = {
  success: (message: string, options?: ToastOptions) =>
    useToastStore.getState().show('success', message, options),
  error: (message: string, options?: ToastOptions) =>
    useToastStore.getState().show('error', message, options),
  warning: (message: string, options?: ToastOptions) =>
    useToastStore.getState().show('warning', message, options),
  info: (message: string, options?: ToastOptions) =>
    useToastStore.getState().show('info', message, options),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
} as const
