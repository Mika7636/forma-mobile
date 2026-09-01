import { useEffect } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { touchLastActive } from '../services/lastActive'
import { useAuthStore } from '../store/authStore'

/**
 * Keeps `/users/{uid}.lastActiveAt` roughly current while the app is in use.
 *
 * Mounted once, in `AppStack` — i.e. for a signed-in athlete who has finished
 * onboarding, which is the only population "last active" is a meaningful
 * statement about. Somebody halfway through the setup wizard has not started
 * using FORMA yet.
 *
 * Fires on mount (a cold start *is* a foreground) and on every
 * background→active edge. The once-an-hour throttle lives in the service, so
 * calling this as often as the OS likes is free.
 */
export function useLastActiveHeartbeat(): void {
  const uid = useAuthStore((s) => s.user?.uid)

  useEffect(() => {
    if (!uid) return

    void touchLastActive(uid)

    // Only a real background→active edge counts. `inactive` is the iOS state for
    // a half-swiped app switcher and a control-centre pull; treating those as a
    // resume would fire on gestures the athlete didn't complete.
    let previous: AppStateStatus = AppState.currentState
    const subscription = AppState.addEventListener('change', (next) => {
      const resumed = previous !== 'active' && next === 'active'
      previous = next
      if (resumed) void touchLastActive(uid)
    })

    return () => subscription.remove()
  }, [uid])
}
