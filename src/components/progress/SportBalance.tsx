// Where the training actually went, by sport.

import { useMemo } from 'react'
import { Text, View } from 'react-native'
import TabIcon from '../ui/TabIcon'
import { formatThousands } from '../../utils/formatting'
import { sportVisual } from '../../utils/sportMeta'
import type { SportPoint } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'

const MIN_SHARE = 5

const CONCENTRATION_LIMIT = 60

const BAR_H = 26

interface SportBalanceProps {
  sports: SportPoint[]
}

export default function SportBalance({ sports }: SportBalanceProps) {
  const { colors } = useTheme()

  const total = sports.reduce((sum, s) => sum + s.load, 0)
  const insight = useMemo(() => buildInsight(sports), [sports])
  const concentrated = sports.length > 1 && (sports[0]?.share ?? 0) > CONCENTRATION_LIMIT

  return (
    <View style={cardStyle(colors)}>
      <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Sport Balance
      </Text>
      <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
        Where your training went
      </Text>

      {total === 0 ? (
        <Text style={{ marginTop: SPACING.base, fontSize: TYPE.small, color: colors.textSubtle }}>
          No training in this range yet.
        </Text>
      ) : (
        <>
          <StackedBar sports={sports} />

          <View style={{ marginTop: SPACING.base, gap: 12 }}>
            {sports.map((sport) => (
              <SportRow key={sport.sport} sport={sport} />
            ))}
          </View>

          {insight ? (
            <Text
              style={{
                marginTop: SPACING.base,
                fontSize: TYPE.small,
                lineHeight: 19,
                fontWeight: WEIGHT.semibold,
                color: colors.accentText,
              }}
            >
              {insight}
            </Text>
          ) : null}

          {concentrated ? <ConcentrationNote /> : null}
        </>
      )}
    </View>
  )
}

function buildInsight(sports: SportPoint[]): string | null {
  if (sports.length === 0) return null
  if (sports.length === 1) {
    return `All of your load came from ${sports[0].label}.`
  }
  const top = sports.slice(0, 2)
  const share = top.reduce((sum, s) => sum + s.share, 0)
  if (share >= 60) {
    return `${top[0].label} and ${top[1].label} account for ${share}% of your load.`
  }
  return `Your load is spread across ${sports.length} sports, led by ${top[0].label} at ${top[0].share}%.`
}

function StackedBar({ sports }: { sports: SportPoint[] }) {
  const { colors } = useTheme()

  const shown = sports.filter((s) => s.share >= MIN_SHARE)
  const remainder = 100 - shown.reduce((sum, s) => sum + s.share, 0)

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={shown.map((s) => `${s.label} ${s.share} percent`).join(', ')}
      style={{
        flexDirection: 'row',
        height: BAR_H,
        borderRadius: RADIUS.sm,
        overflow: 'hidden',
        marginTop: SPACING.base,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {shown.map((sport) => (
        <View
          key={sport.sport}
          style={{ flex: sport.share, backgroundColor: sportVisual(sport.sport, colors).color }}
        />
      ))}
      {remainder > 0.5 ? (
        <View style={{ flex: remainder, backgroundColor: colors.palette.slate }} />
      ) : null}
    </View>
  )
}

function SportRow({ sport }: { sport: SportPoint }) {
  const { colors } = useTheme()
  const color = sportVisual(sport.sport, colors).color

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View
        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 10 }}
      />
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: TYPE.body, fontWeight: WEIGHT.semibold, color: colors.text }}
      >
        {sport.label}
      </Text>
      <Text style={{ fontSize: TYPE.micro, color: colors.textSubtle, marginRight: 12 }}>
        {formatThousands(sport.load)} AU
      </Text>
      <Text
        style={{
          fontSize: TYPE.body,
          fontWeight: WEIGHT.heavy,
          color: colors.text,
          minWidth: 40,
          textAlign: 'right',
        }}
      >
        {sport.share}%
      </Text>
    </View>
  )
}

function ConcentrationNote() {
  const { colors } = useTheme()

  return (
    <View
      style={{
        marginTop: SPACING.md,
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: colors.tint.amber.bg,
        borderWidth: 1,
        borderColor: colors.tint.amber.border,
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <View style={{ marginRight: 9, paddingTop: 1 }}>
        <TabIcon name="alert-triangle" size={16} color={colors.warn} focused />
      </View>
      <Text style={{ flex: 1, fontSize: TYPE.micro, lineHeight: 17, color: colors.textBody }}>
        Most of your load comes from one sport — cross-training could reduce injury risk.
      </Text>
    </View>
  )
}
