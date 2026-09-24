// Keeps the user's lastActiveAt roughly current while the app is used.

import { useEffect } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { touchLastActive } from '../services/lastActive'
import { useAuthStore } from '../store/authStore'

export function useLastActiveHeartbeat(): void {
  const uid = useAuthStore((s) => s.user?.uid)

  useEffect(() => {
    if (!uid) return

    void touchLastActive(uid)

    let previous: AppStateStatus = AppState.currentState
    const subscription = AppState.addEventListener('change', (next) => {
      const resumed = previous !== 'active' && next === 'active'
      previous = next
      if (resumed) void touchLastActive(uid)
    })

    return () => subscription.remove()
  }, [uid])
}
