/**
 * Shortcuts into the OS settings screens live tracking depends on.
 *
 * Every one of these is best-effort and never throws: they are called from
 * `Alert` buttons and `Pressable` handlers where a rejection would be an
 * unhandled promise — fatal in a release build — and where failing to open a
 * settings page is an inconvenience, not something worth crashing over.
 *
 * `Linking.openSettings()` only ever opens *the app's own* settings page. That
 * is the right destination for a revoked permission, and the wrong one for the
 * device-wide location toggle or the battery-optimisation allowlist, which live
 * elsewhere in Settings entirely. Those need explicit Android intents, hence
 * expo-intent-launcher.
 */
import { Linking, Platform } from 'react-native'
import * as IntentLauncher from 'expo-intent-launcher'

async function launch(action: IntentLauncher.ActivityAction): Promise<boolean> {
  try {
    await IntentLauncher.startActivityAsync(action)
    return true
  } catch (err) {
    console.warn('[systemSettings] intent failed', action, err)
    return false
  }
}

/** FORMA's own settings page — where a denied permission is re-granted. */
export function openAppSettings(): void {
  Linking.openSettings().catch((err) => {
    console.warn('[systemSettings] openSettings failed', err)
  })
}

/**
 * The device's Location settings, where the master GPS toggle lives.
 *
 * On iOS there is no way to deep-link to Privacy → Location Services, so the
 * app's own page (which carries its location row) is the closest thing.
 */
export function openLocationSettings(): void {
  if (Platform.OS !== 'android') {
    openAppSettings()
    return
  }
  void launch(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS).then((ok) => {
    if (!ok) openAppSettings()
  })
}

/**
 * Android's battery-optimisation allowlist.
 *
 * `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` opens the *list* of apps and
 * their optimisation state. Its sibling `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
 * pops a one-tap dialog instead, but Google Play policy restricts that one to a
 * short list of app categories and rejects builds that use it otherwise, so the
 * list is the safe destination: two extra taps, no review risk.
 *
 * This is the single most effective thing an athlete on a Samsung, Xiaomi, Oppo
 * or OnePlus device can do for background tracking — those OEMs put apps into a
 * deep sleep that stops even a foreground service from getting location updates.
 */
export function openBatteryOptimizationSettings(): void {
  if (Platform.OS !== 'android') return
  void launch(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS).then((ok) => {
    if (!ok) openAppSettings()
  })
}
