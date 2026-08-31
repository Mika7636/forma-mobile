// The line at the top of the week: what FORMA thinks of the week as planned.
//
// This is the first thing a brand-new account ever sees the conflict engine say.
// It has to work with zero logged sessions, so it is derived entirely from the
// plans on the calendar and the user's own sport-interaction matrix — nothing in
// it needs a history to exist.
//
// Two states, both of which say something. A week with clashes lists them, one
// short line per pair, in the severity's hue. A week without says so, which is
// the more common case and just as much a result: "no clashes" is the answer the
// athlete came for, and a component that renders nothing would leave them
// wondering whether the check had run at all.
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { plannedSeverityStyle, worstSeverity } from '../../constants/conflictColors'
import { haptics } from '../../utils/haptics'
import type { PlannedConflict } from '../../types/conflict'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/** Lines listed before the rest collapse into a "+N more". */
const MAX_LINES = 2

interface PlannedConflictSummaryProps {
  /** Clashes among the plans in the week on screen. */
  conflicts: PlannedConflict[]
  /** Plans in that week, so an empty week can be told apart from a clean one. */
  plannedCount: number
  /** Opens the detail for one clash — the same sheet the day card uses. */
  onPress: (conflicts: PlannedConflict[]) => void
}

export default function PlannedConflictSummary({
  conflicts,
  plannedCount,
  onPress,
}: PlannedConflictSummaryProps) {
  const { colors } = useTheme()

  // Nothing planned yet: the Planner's own empty state is doing the teaching,
  // and a second "no conflicts" panel above it would be noise about nothing.
  if (plannedCount === 0) return null

  if (conflicts.length === 0) {
    return (
      <Animated.View
        entering={FadeIn.duration(220)}
        accessibilityRole="summary"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: SPACING.md,
          paddingVertical: SPACING.sm + 2,
          paddingHorizontal: SPACING.md,
          borderRadius: RADIUS.md,
          backgroundColor: colors.accentSoft,
          borderWidth: 1,
          borderColor: colors.accentBorder,
        }}
      >
        <Text style={{ fontSize: 14 }}>✅</Text>
        <Text
          style={{
            flex: 1,
            marginLeft: SPACING.sm,
            fontSize: TYPE.small,
            lineHeight: 18,
            color: colors.textBody,
          }}
        >
          <Text style={{ fontWeight: WEIGHT.heavy, color: colors.accentText }}>
            This week looks clean.
          </Text>{' '}
          No recovery clashes between the sessions you&apos;ve planned.
        </Text>
      </Animated.View>
    )
  }

  const worst = plannedSeverityStyle(worstSeverity(conflicts), colors)
  const shown = conflicts.slice(0, MAX_LINES)
  const overflow = conflicts.length - shown.length

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      accessibilityRole="alert"
      style={{
        marginTop: SPACING.md,
        borderRadius: RADIUS.md,
        backgroundColor: worst.softBg,
        borderWidth: 1,
        borderColor: worst.softBorder,
        // Dashed rails are for solid, already-logged conflicts; a planned one
        // gets a hairline and the calendar glyph instead, so the two never read
        // as the same object at a glance across the app.
        borderLeftWidth: 4,
        borderLeftColor: worst.solid,
      }}
    >
      <Pressable
        onPress={() => {
          haptics.light()
          onPress(conflicts)
        }}
        accessibilityRole="button"
        accessibilityLabel={`${conflicts.length} planned conflict${
          conflicts.length === 1 ? '' : 's'
        } this week. Tap for details.`}
        style={{ paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 14 }}>{worst.icon}</Text>
          <Text
            style={{
              marginLeft: SPACING.sm,
              fontSize: TYPE.small,
              fontWeight: WEIGHT.heavy,
              color: worst.deep,
            }}
          >
            {conflicts.length} planned conflict{conflicts.length === 1 ? '' : 's'} this week
          </Text>
        </View>

        {shown.map((conflict) => {
          const style = plannedSeverityStyle(conflict.severity, colors)
          return (
            <View
              key={conflict.id}
              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  borderWidth: 1.5,
                  borderColor: style.solid,
                  marginLeft: 2,
                  marginRight: SPACING.sm,
                }}
              />
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontSize: TYPE.micro, color: colors.textBody }}
              >
                {conflict.summary}
              </Text>
            </View>
          )
        })}

        <Text style={{ marginTop: 6, fontSize: TYPE.caption, color: colors.textMuted }}>
          {overflow > 0 ? `+${overflow} more · ` : ''}Tap to see what to change
        </Text>
      </Pressable>
    </Animated.View>
  )
}
