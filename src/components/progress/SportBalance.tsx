import { useMemo } from 'react'
import { Text, View } from 'react-native'
import TabIcon from '../ui/TabIcon'
import { formatThousands } from '../../utils/formatting'
import { sportVisual } from '../../utils/sportMeta'
import type { SportPoint } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'

/** Segments thinner than this are unreadable, so they are pooled into "Other". */
const MIN_SHARE = 5

/** Above this, one sport *is* the training plan — and that is worth saying. */
const CONCENTRATION_LIMIT = 60

const BAR_H = 26

interface SportBalanceProps {
  sports: SportPoint[]
}

/**
 * Where the training actually went, by sport.
 *
 * This is the section FORMA has that a running app does not, so it is built as
 * the screen's second hero rather than as a footnote to the load chart. Every
 * other chart here answers "how much"; this one answers "how much of *what*",
 * and it is the input to the only advice the app gives that an athlete cannot
 * get from a watch — that two of their sports are competing for the same
 * recovery.
 *
 * The conflict that follows from it used to hang off the bottom of this card.
 * It now has its own section underneath (see `ConflictTimeline`), because a
 * flagged pairing is a finding with a *when* and this card has no time axis to
 * put it on.
 */
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

/**
 * The one line of derived meaning under the bar.
 *
 * Names the sports that dominate rather than restating the chart, because the
 * useful fact is concentration: two sports at 71% is a very different training
 * week from five at 20% each, and the bar alone does not say which one you are
 * looking at.
 */
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

/**
 * The horizontal stack — one segment per sport, in that sport's own colour.
 *
 * Rounded on its outer corners only, so it reads as a single object that has
 * been divided rather than as a row of tiles that happen to be touching. That is
 * the difference between "this is my training" and "these are my sports".
 */
function StackedBar({ sports }: { sports: SportPoint[] }) {
  const { colors } = useTheme()

  // Sub-5% slivers become a single neutral tail rather than a row of 1px
  // stripes that read as rendering noise.
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

/** One legend row: colour dot, sport, the raw load behind it, and its share. */
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

/**
 * The warning that follows from a lopsided bar.
 *
 * Not a conflict — the detector has not flagged anything here — but the same
 * kind of fact: a single sport carrying two thirds of the load means one tissue
 * group is absorbing nearly all of it, and that is the shape injuries come from.
 * Warn-tinted rather than danger, because it is a suggestion and not a finding.
 */
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
