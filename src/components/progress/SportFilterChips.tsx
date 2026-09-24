// The sport filter pills at the top of Progress.

import { Pressable, ScrollView, Text, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import { sportVisual } from '../../utils/sportMeta'
import type { SportFilter } from '../../utils/progressMetrics'
import type { SportType } from '../../types/session'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'

interface SportFilterChipsProps {
  sports: SportType[]
  value: SportFilter
  onChange: (value: SportFilter) => void
}

export default function SportFilterChips({ sports, value, onChange }: SportFilterChipsProps) {
  const select = (next: SportFilter) => {
    if (next === value) return
    haptics.light()
    onChange(next)
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: SPACING.base, gap: SPACING.sm }}
      style={{ marginHorizontal: -SPACING.base }}
    >
      <Chip label="All" selected={value === 'all'} onPress={() => select('all')} />
      {sports.map((sport) => (
        <Chip
          key={sport}
          label={sport}
          selected={value === sport}
          onPress={() => select(sport)}
          sport={sport}
        />
      ))}
    </ScrollView>
  )
}

function Chip({
  label,
  sport,
  selected,
  onPress,
}: {
  label: string
  sport?: SportType
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()

  const visual = sport ? sportVisual(sport, colors) : null

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Show ${visual?.label ?? 'all sports'}`}
      style={{
        minHeight: MIN_TOUCH - 8,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: RADIUS.pill,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.bg,
      }}
    >
      {visual ? (
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: visual.color,
            marginRight: 7,
          }}
        />
      ) : null}
      <Text
        style={{
          fontSize: TYPE.body,
          fontWeight: selected ? WEIGHT.bold : WEIGHT.medium,
          color: selected ? colors.accentText : colors.textMuted,
        }}
      >
        {visual?.label ?? label}
      </Text>
    </Pressable>
  )
}
