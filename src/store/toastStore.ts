// Global toast/snackbar state.
//
// The point of putting this in a store rather than in per-screen `useState` is
// that a toast should outlive the thing that triggered it: closing the session
// editor and confirming "Session deleted" are the same user action, but the
// component that knew about the delete is already unmounted by the time the
// message needs to be on screen. ToastContainer is mounted once at the app root,
// so any code — screen, modal, service, even a store — can call
// `toast.success(...)` and be sure it lands.
import { create } from 'zustand'
import { haptics } from '../utils/haptics'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  /** Optional second line for context ("Check your connection"). */
  description?: string
  /** Milliseconds before auto-dismiss. */
  duration: number
}

export interface ToastOptions {
  description?: string
  duration?: number
  /** Set false to stay silent — e.g. when the caller already fired its own. */
  haptic?: boolean
}

/** Beyond this the stack covers the screen; the oldest is evicted. */
const MAX_VISIBLE = 3

const DEFAULT_DURATION = 3000
/** Errors get longer — they usually carry something the user must read. */
const ERROR_DURATION = 4200

interface ToastState {
  toasts: ToastItem[]
  /**
   * Extra bottom padding so toasts clear the tab bar. MainTabs sets this while
   * it's mounted; auth/onboarding screens leave it at 0. The container can't
   * work this out itself — it lives above NavigationContainer and has no idea
   * whether a tab bar is on screen.
   */
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
      // Re-showing an identical message (double-tapped Save) should refresh the
      // existing toast rather than stack a duplicate on top of itself.
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

/**
 * The call-site API. Usable outside React (services, stores, event handlers),
 * which is the whole reason it reads from `getState()` rather than a hook.
 *
 *   toast.success('Session saved')
 *   toast.error('Could not save session', { description: 'Check your connection.' })
 */
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
