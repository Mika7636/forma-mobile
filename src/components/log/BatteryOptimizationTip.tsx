// Dismissible nudge to exempt FORMA from battery optimisation.

import { useEffect, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { haptics } from '../../utils/haptics'
import { openBatteryOptimizationSettings } from '../../utils/systemSettings'
import { useTheme } from '../../theme/ThemeProvider'
const STORAGE_KEY = 'forma.tip.batteryOptimization.dismissed'

export default function BatteryOptimizationTip() {
  const { colors } = useTheme()

  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'android') return
    let cancelled = false
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((seen) => {
        if (!cancelled && seen == null) setVisible(true)
      })
      .catch((err) => {
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
        backgroundColor: colors.surfaceAlt,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 8,
      }}
    >
      <Pressable
        onPress={() => {
          haptics.light()
          openBatteryOptimizationSettings()
          dismiss()
        }}
        style={{ flex: 1 }}
        hitSlop={6}
      >
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
          🔋 Samsung and some other phones stop background tracking
        </Text>
        <Text style={{ marginTop: 4, color: colors.textSubtle, fontSize: 12, lineHeight: 17 }}>
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
        <Text style={{ color: colors.textSubtle, fontSize: 16, fontWeight: '700' }}>✕</Text>
      </Pressable>
    </View>
  )
}
