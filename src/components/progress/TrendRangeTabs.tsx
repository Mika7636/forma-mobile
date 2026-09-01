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

/**
 * The trend chart's zoom control: Daily (last 7 days) or Weekly (last 6 weeks).
 *
 * ## Why it borrows the sport chips' clothes rather than getting its own
 *
 * There are now two pill rows on this screen, and the failure mode for two rows
 * of controls stacked a few hundred pixels apart is that they read as one
 * confusing segmented mess — or, worse, that the louder one wins the eye and the
 * quieter one is never found. Both are the same object here: an outlined pill,
 * accent when selected, hairline and muted when not, filled in neither state.
 * Matching them exactly is what keeps them legible as *two questions of the same
 * kind* — which training, and at what zoom — rather than as a hierarchy.
 *
 * Two differences, both deliberate and both quiet. It sits directly above the
 * card it controls rather than at the top of the page, because it changes one
 * chart and not the screen. And it is a touch smaller and left-aligned in a
 * plain row rather than a scroller, because there will only ever be two of them.
 *
 * ## Why this is not the old Daily / Weekly / Monthly switch
 *
 * That control gave each option its own *window* — a fortnight, a quarter, a
 * year — so the band, the verdict and every axis on the page changed meaning
 * when you touched it. This moves one chart between two zoom levels of the same
 * measure, against a band scaled to match, while the twelve-week window that
 * everything else on the page is computed over stays exactly where it is.
 */
export default function TrendRangeTabs({ value, onChange }: TrendRangeTabsProps) {
  const select = (next: Granularity) => {
    if (next === value) return
    haptics.light()
    onChange(next)
  }

  return (
    <View
      // `tablist` so a screen reader announces these as a set of two rather than
      // as two unrelated buttons that happen to sit side by side.
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
