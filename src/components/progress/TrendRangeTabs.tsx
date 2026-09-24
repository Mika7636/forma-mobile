// The trend chart's zoom control: Daily or Weekly.

import { Pressable, Text, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import type { Granularity } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'

const TABS: { value: Granularity; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
]

interface TrendRangeTabsProps {
  value: Granularity
  onChange: (value: Granularity) => void
}

export default function TrendRangeTabs({ value, onChange }: TrendRangeTabsProps) {
  const select = (next: Granularity) => {
    if (next === value) return
    haptics.light()
    onChange(next)
  }

  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', gap: SPACING.sm }}
    >
      {TABS.map((tab) => (
        <Tab
          key={tab.value}
          label={tab.label}
          selected={value === tab.value}
          onPress={() => select(tab.value)}
        />
      ))}
    </View>
  )
}

function Tab({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={{
        minHeight: MIN_TOUCH - 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 7,
        borderRadius: RADIUS.pill,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.bg,
      }}
    >
      <Text
        style={{
          fontSize: TYPE.small,
          fontWeight: selected ? WEIGHT.bold : WEIGHT.medium,
          color: selected ? colors.accentText : colors.textMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
