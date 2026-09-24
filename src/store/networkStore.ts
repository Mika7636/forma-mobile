// Connectivity state, for the offline banner and write guards.

import NetInfo from '@react-native-community/netinfo'
import { create } from 'zustand'

export type NetworkStatus = 'unknown' | 'online' | 'offline'

const RECONNECT_BANNER_MS = 2600

interface NetworkState {
  status: NetworkStatus
  reconnecting: boolean
  subscribe: () => () => void
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null

export const useNetworkStore = create<NetworkState>((set, get) => ({
  status: 'unknown',
  reconnecting: false,

  subscribe: () => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false
      const next: NetworkStatus = online ? 'online' : 'offline'
      const previous = get().status

      if (next === previous) return

      if (next === 'online' && previous === 'offline') {
        set({ status: 'online', reconnecting: true })
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => set({ reconnecting: false }), RECONNECT_BANNER_MS)
        return
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      set({ status: next, reconnecting: false })
    })

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      unsubscribe()
    }
  },
}))

export function isOffline(): boolean {
  return useNetworkStore.getState().status === 'offline'
}
