// Best-effort shortcuts into the OS settings screens.

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

export function openAppSettings(): void {
  Linking.openSettings().catch((err) => {
    console.warn('[systemSettings] openSettings failed', err)
  })
}

export function openLocationSettings(): void {
  if (Platform.OS !== 'android') {
    openAppSettings()
    return
  }
  void launch(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS).then((ok) => {
    if (!ok) openAppSettings()
  })
}

export function openBatteryOptimizationSettings(): void {
  if (Platform.OS !== 'android') return
  void launch(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS).then((ok) => {
    if (!ok) openAppSettings()
  })
}
