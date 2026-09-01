import { Text, View } from 'react-native'
import TabIcon, { type TabIconName } from '../ui/TabIcon'
import type { ModelReadout as ModelReadoutData, ModelStat } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACING, TYPE, WEIGHT, type Palette } from '../../theme/tokens'

interface ModelReadoutProps {
  model: ModelReadoutData
}

/**
 * Fitness, Fatigue and Form — where they are now, and where they were six weeks
 * ago — directly under the Weekly chart.
 *
 * ## Why it lives here and not in the Advanced expander
 *
 * The full CTL/ATL/Form chart is still down there and is not moving. What this
 * block does is different in kind: the chart shows the athlete three series and
 * asks them to work out the relationship, and this states the relationship. The
 * question "am I building or digging a hole?" is the one people actually open
 * this screen with, and answering it only behind a disclosure labelled
 * "Advanced" meant the answer reached the people who least needed telling.
 *
 * ## Why only on the Weekly tab
 *
 * Not tidiness — arithmetic. CTL is a 42-day rolling average, so over seven days
 * it barely moves, and a delta computed across a window shorter than the average
 * itself is mostly reporting the average's own inertia. Six weeks is the first
 * point at which these three have done something worth a sentence.
 *
 * ## Why the deltas are not colour-coded good/bad
 *
 * Up is good for fitness, bad for fatigue, and genuinely ambiguous for form — a
 * negative form score is what a productive training block looks like from the
 * inside. Painting the arrows green and red would assert a judgement the numbers
 * do not support in two of the three cases. The arrow says which way it moved;
 * the sentence underneath is where the judgement belongs, because that is the
 * only place with enough room to be conditional about it.
 */
export default function ModelReadout({ model }: ModelReadoutProps) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        marginTop: SPACING.base,
        paddingTop: SPACING.base,
        // A rule rather than a card. This belongs to the chart above it — it is
        // the same six weeks, read a second way — and boxing it would make it a
        // separate finding that happens to sit nearby.
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        <Stat stat={model.fitness} />
        <Stat stat={model.fatigue} />
        <Stat stat={model.form} />
      </View>

      <Text
        style={{
          marginTop: SPACING.md,
          fontSize: TYPE.small,
          lineHeight: 18,
          color: colors.textBody,
        }}
      >
        {model.summary}
      </Text>
    </View>
  )
}

/** Which glyph and ink a delta gets. Direction only — see the header note. */
function deltaStyle(delta: number, colors: Palette) {
  if (delta > 0) return { icon: 'trending' as TabIconName, ink: colors.textBody }
  if (delta < 0) return { icon: 'trending-down' as TabIconName, ink: colors.textBody }
  return { icon: null, ink: colors.textSubtle }
}

function Stat({ stat }: { stat: ModelStat }) {
  const { colors } = useTheme()

  const style = deltaStyle(stat.delta, colors)
  const signed = stat.delta > 0 ? `+${stat.delta}` : String(stat.delta)

  return (
    <View
      // One stat is one utterance. Read as separate texts it comes out as
      // "Fitness, 64, plus 12", which is close enough to be worse than nothing.
      accessible
      accessibilityLabel={
        stat.delta === 0
          ? `${stat.label}, ${stat.value}, unchanged over six weeks`
          : `${stat.label}, ${stat.value}, ${stat.delta > 0 ? 'up' : 'down'} ${Math.abs(
              stat.delta,
            )} over six weeks`
      }
      style={{ flex: 1, minWidth: 0, paddingRight: SPACING.sm }}
    >
      <Text numberOfLines={1} style={{ fontSize: TYPE.caption, color: colors.textMuted }}>
        {stat.label}
        <Text style={{ color: colors.textSubtle }}> {stat.abbrev}</Text>
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: TYPE.subtitle,
            fontWeight: WEIGHT.bold,
            color: colors.text,
          }}
        >
          {stat.value}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 5 }}>
          {style.icon ? <TabIcon name={style.icon} size={11} color={style.ink} focused /> : null}
          <Text
            numberOfLines={1}
            style={{
              marginLeft: style.icon ? 2 : 0,
              fontSize: TYPE.caption,
              fontWeight: WEIGHT.semibold,
              color: style.ink,
            }}
          >
            {stat.delta === 0 ? '—' : signed}
          </Text>
        </View>
      </View>
    </View>
  )
}
