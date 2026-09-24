// GPS status chip: a coloured dot and two words.

import { Text, View } from 'react-native'
import type { GpsQuality } from '../../store/liveTrackingStore'
import { useTheme } from '../../theme/ThemeProvider'
import type { Palette } from '../../theme/tokens'


interface Appearance {
  dot: string
  label: string
  text: string
}

function tracking(colors: Palette): Record<GpsQuality, Appearance> {
  return {
    acquiring: { dot: colors.textMuted, label: 'GPS searching', text: colors.textMuted },
    good: { dot: colors.accent, label: 'GPS good', text: colors.tint.green.text },
    weak: { dot: colors.warn, label: 'GPS weak', text: colors.tint.amber.text },
    lost: { dot: colors.danger, label: 'GPS lost', text: colors.tint.red.text },
  }
}

function warmup(colors: Palette): Record<GpsQuality, Appearance> {
  return {
    acquiring: { dot: colors.textMuted, label: 'Finding GPS…', text: colors.textMuted },
    good: { dot: colors.accent, label: 'GPS ready', text: colors.tint.green.text },
    weak: { dot: colors.warn, label: 'GPS weak', text: colors.tint.amber.text },
    lost: { dot: colors.danger, label: 'No GPS signal', text: colors.tint.red.text },
  }
}

export default function GpsChip({
  quality,
  variant = 'tracking',
}: {
  quality: GpsQuality
  variant?: 'tracking' | 'warmup'
}) {
  const { colors } = useTheme()

  const { dot, label, text } = (variant === 'warmup' ? warmup(colors) : tracking(colors))[quality]
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '700', color: text }}>
        {label}
      </Text>
    </View>
  )
}
