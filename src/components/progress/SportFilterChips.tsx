import { Pressable, ScrollView, Text, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import { sportVisual } from '../../utils/sportMeta'
import type { SportFilter } from '../../utils/progressMetrics'
import type { SportType } from '../../types/session'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'

interface SportFilterChipsProps {
  /** Sports with training in the window, busiest first. */
  sports: SportType[]
  value: SportFilter
  onChange: (value: SportFilter) => void
}

/**
 * The row of filter pills at the top of the Progress screen.
 *
 * ## What these replaced, and why it is not the same control
 *
 * This sits where a Daily / Weekly / Monthly switch used to be. That control
 * looked like a filter and behaved like three different screens: each option
 * defined its own *window* — a fortnight, a quarter, a year — so the bars, the
 * band and the verdict all changed meaning when you touched it, and nothing the
 * athlete saw could be compared with anything they had seen a moment before.
 *
 * The window is now fixed at twelve weeks and never moves. What varies instead
 * is *which training you are looking at*, which is a question an athlete
 * actually has ("how has my running been going?") and which leaves every axis
 * on the page exactly where it was.
 *
 * Only sports the athlete has actually trained in this window get a chip. A
 * fixed list of all seven would offer four filters that lead to an empty screen.
 */
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
      // The row is edge-to-edge so chips can scroll out under the screen margin,
      // but the content keeps the page's own gutter.
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

/**
 * One pill.
 *
 * Selected is accent-outlined with accent type; unselected is a plain hairline
 * with muted type. Deliberately an *outline* in both states rather than a filled
 * selected pill: filled chips read as buttons that will do something, and these
 * describe what you are already looking at.
 */
function Chip({
  label,
  sport,
  selected,
  onPress,
}: {
  label: string
  /** When given, the chip carries that sport's colour as a leading dot. */
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
