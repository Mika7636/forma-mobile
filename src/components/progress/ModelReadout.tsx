// Fitness, Fatigue and Form now versus six weeks ago.

import { Text, View } from 'react-native'
import TabIcon, { type TabIconName } from '../ui/TabIcon'
import type { ModelReadout as ModelReadoutData, ModelStat } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACING, TYPE, WEIGHT, type Palette } from '../../theme/tokens'

interface ModelReadoutProps {
  model: ModelReadoutData
}

export default function ModelReadout({ model }: ModelReadoutProps) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        marginTop: SPACING.base,
        paddingTop: SPACING.base,
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
