// When conflicts happened, on the load chart's time axis.

import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import TabIcon from '../ui/TabIcon'
import { PLOT_INSET } from './TrainingLoadChart'
import { severityStyle, worstSeverity } from '../../constants/conflictColors'
import { conflictSportsLabel, detectedAtDate } from '../../utils/conflictInfo'
import { localISODate } from '../../utils/dates'
import type { WeekBucket } from '../../utils/progressMetrics'
import type { Conflict } from '../../types/conflict'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'

const STRIP_H = 26
const MARKER = 9
const WEEK_MS = 7 * 86_400_000

interface ConflictTimelineProps {
  weeks: WeekBucket[]
  conflicts: Conflict[]
  onOpenConflict: (conflicts: Conflict[]) => void
}

export default function ConflictTimeline({
  weeks,
  conflicts,
  onOpenConflict,
}: ConflictTimelineProps) {
  const { colors } = useTheme()

  const marked = useMemo(() => {
    const byBucket = new Map<number, Conflict[]>()
    if (weeks.length === 0) return byBucket
    const starts = weeks.map((w) => new Date(`${w.startISO}T00:00:00`).getTime())
    const ends = starts.map((t, i) => (i < starts.length - 1 ? starts[i + 1] : t + WEEK_MS))
    for (const conflict of conflicts) {
      const at = detectedAtDate(conflict).getTime()
      const index = starts.findIndex((start, i) => at >= start && at < ends[i])
      if (index === -1) continue
      const list = byBucket.get(index) ?? []
      list.push(conflict)
      byBucket.set(index, list)
    }
    return byBucket
  }, [weeks, conflicts])

  const latest = useMemo(() => {
    if (conflicts.length === 0) return null
    return [...conflicts].sort(
      (a, b) => detectedAtDate(b).getTime() - detectedAtDate(a).getTime(),
    )[0]
  }, [conflicts])

  if (!latest || marked.size === 0) return null

  const count = conflicts.length

  return (
    <View style={cardStyle(colors)}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={{ flex: 1, fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}
        >
          Cross-sport conflicts
        </Text>
        <View
          style={{
            backgroundColor: colors.tint.amber.bg,
            borderWidth: 1,
            borderColor: colors.tint.amber.border,
            borderRadius: RADIUS.pill,
            paddingHorizontal: 9,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.heavy, color: colors.tint.amber.text }}
          >
            {count}
          </Text>
        </View>
      </View>

      <Strip weeks={weeks} marked={marked} />

      <ConflictRow conflict={latest} onPress={() => onOpenConflict(conflicts)} />
    </View>
  )
}

function Strip({ weeks, marked }: { weeks: WeekBucket[]; marked: Map<number, Conflict[]> }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: STRIP_H,
        marginTop: SPACING.base,
        paddingLeft: PLOT_INSET.left,
        paddingRight: PLOT_INSET.right,
        borderRadius: RADIUS.xs,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {weeks.map((week, i) => {
        const here = marked.get(i)
        const style = here ? severityStyle(worstSeverity(here), colors) : null
        return (
          <View
            key={week.key}
            accessibilityLabel={here ? `${here.length} flagged in ${week.label}` : undefined}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            {style ? (
              <View
                style={{
                  width: MARKER,
                  height: MARKER,
                  borderRadius: 2,
                  backgroundColor: style.solid,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            ) : (
              <View style={{ width: 1, height: 6, backgroundColor: colors.border }} />
            )}
          </View>
        )
      })}
    </View>
  )
}

function ConflictRow({ conflict, onPress }: { conflict: Conflict; onPress: () => void }) {
  const { colors } = useTheme()
  const style = severityStyle(conflict.severity, colors)
  const when = detectedAtDate(conflict)
  const today = localISODate(new Date())
  const label =
    localISODate(when) === today
      ? 'today'
      : when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Most recent conflict: ${conflictSportsLabel(conflict)}, ${label}. Open details.`}
      style={{
        minHeight: MIN_TOUCH,
        marginTop: SPACING.md,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: style.softBg,
        borderWidth: 1,
        borderColor: style.softBorder,
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <View style={{ marginRight: 10 }}>
        <TabIcon name="alert-triangle" size={17} color={style.solid} focused />
      </View>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: style.deep }}
      >
        {conflictSportsLabel(conflict)}
      </Text>
      <Text style={{ fontSize: TYPE.micro, color: colors.textMuted, marginHorizontal: 8 }}>
        {label}
      </Text>
      <TabIcon name="chevron-right" size={16} color={colors.textMuted} />
    </Pressable>
  )
}
