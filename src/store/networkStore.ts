// Connectivity state, surfaced so the UI can tell the user what's going on
// instead of silently appearing to lose their data.
//
// Firestore already handles the mechanics: every read in FORMA is a snapshot
// listener served from the SDK's cache while offline, and writes queue up and
// flush on reconnect. What it can't do is *say* any of that — so a session
// logged on the bus looks, to the user, exactly like a session that failed.
// This store exists to close that gap.
//
// Caveat worth knowing (see src/config/firebase.ts): the SDK is configured with
// `memoryLocalCache()`, so the queued-writes guarantee holds for as long as the
// app process is alive. Force-quitting while offline drops anything unsent.
import NetInfo from '@react-native-community/netinfo'
import { create } from 'zustand'

export type NetworkStatus = 'unknown' | 'online' | 'offline'

/** How long "Back online — syncing…" stays up before the banner retracts. */
const RECONNECT_BANNER_MS = 2600

interface NetworkState {
  status: NetworkStatus
  /** True for a moment after coming back, so the banner can confirm the recovery. */
  reconnecting: boolean
  /** Attaches the NetInfo listener. Returns an unsubscribe. Called once, at the root. */
  subscribe: () => () => void
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null

export const useNetworkStore = create<NetworkState>((set, get) => ({
  status: 'unknown',
  reconnecting: false,

  subscribe: () => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null until NetInfo has finished probing, and a
      // null must not be read as "offline" — that would flash the banner on
      // every cold start. Only an explicit `false` counts as unreachable.
      const online = state.isConnected === true && state.isInternetReachable !== false
      const next: NetworkStatus = online ? 'online' : 'offline'
      const previous = get().status

      if (next === previous) return

      if (next === 'online' && previous === 'offline') {
        // Came back: show the recovery message briefly, then retract.
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

/** Readable outside React — e.g. to tailor an error message after a failed write. */
export function isOffline(): boolean {
  return useNetworkStore.getState().status === 'offline'
}
