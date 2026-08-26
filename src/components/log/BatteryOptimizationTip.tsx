/**
 * A one-time, dismissible nudge to exempt FORMA from battery optimisation.
 *
 * ## Why this exists at all
 *
 * A foreground service is supposed to be enough to keep location updates coming
 * with the screen off. On stock Android it is. On Samsung (and Xiaomi, Oppo,
 * OnePlus, Huawei) it frequently is not: those OEMs layer their own "deep
 * sleep" / "adaptive battery" policies on top, and an app they decide is idle
 * stops receiving fixes even with a live foreground service and every permission
 * granted. From inside the app this is indistinguishable from a phone that has
 * simply lost signal, and it is the single most common reason a background-
 * tracked run comes back short.
 *
 * There is no API to detect or fix it. The only remedy is the user putting FORMA
 * on the battery-optimisation allowlist themselves, so the honest thing is to
 * ask once, explain why, and take them to the right screen.
 *
 * ## Why once
 *
 * A tip that reappears every session is an ad. The dismissal is persisted in
 * AsyncStorage so it survives restarts; tapping through to Settings dismisses it
 * too, because at that point the user has either fixed it or decided not to.
 */
import { useEffect, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { COLORS } from '../../constants/theme'
import { haptics } from '../../utils/haptics'
import { openBatteryOptimizationSettings } from '../../utils/systemSettings'
import { COLOR } from '../../theme/tokens'

const STORAGE_KEY = 'forma.tip.batteryOptimization.dismissed'

export default function BatteryOptimizationTip() {
  // Starts hidden and is revealed only once the stored flag has been read.
  // The other order flashes the tip on every mount for users who dismissed it
  // months ago, which is worse than showing it a beat late.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'android') return
    let cancelled = false
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((seen) => {
        if (!cancelled && seen == null) setVisible(true)
      })
      .catch((err) => {
        // Storage unavailable: show the tip. Over-showing a dismissible hint is
        // a much cheaper mistake than swallowing the one thing that fixes
        // screen-off tracking on a Samsung.
        console.warn('[BatteryOptimizationTip] read failed', err)
        if (!cancelled) setVisible(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (Platform.OS !== 'android' || !visible) return null

  const dismiss = () => {
    setVisible(false)
    void AsyncStorage.setItem(STORAGE_KEY, String(Date.now())).catch((err) => {
      console.warn('[BatteryOptimizationTip] write failed', err)
    })
  }

  return (
    <View
      style={{
        marginTop: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: COLOR.surfaceAlt,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLOR.border,
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 8,
      }}
    >
      <Pressable
        onPress={() => {
          haptics.light()
          openBatteryOptimizationSettings()
          // Dismiss on the way out: they've been shown the screen, and nagging
          // afterwards can't tell whether they acted on it.
          dismiss()
        }}
        style={{ flex: 1 }}
        hitSlop={6}
      >
        <Text style={{ color: COLORS.onAccent, fontSize: 13, fontWeight: '700' }}>
          🔋 Samsung and some other phones stop background tracking
        </Text>
        <Text style={{ marginTop: 4, color: COLORS.subtle, fontSize: 12, lineHeight: 17 }}>
          Tap here to disable battery optimisation for FORMA, so your route keeps
          recording with the screen off.
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          haptics.light()
          dismiss()
        }}
        hitSlop={10}
        style={{ paddingHorizontal: 6, paddingVertical: 2 }}
      >
        <Text style={{ color: COLORS.subtle, fontSize: 16, fontWeight: '700' }}>✕</Text>
      </Pressable>
    </View>
  )
}
