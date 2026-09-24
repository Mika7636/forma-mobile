// Admin section 3: sessions by sport, as a donut.

import { Text, View } from 'react-native'
import Svg, { G, Path } from 'react-native-svg'
import ChartCard from '../progress/ChartCard'
import { ChartEmpty } from './AdminSection'
import type { SportSlice } from '../../utils/adminMetrics'
import { OTHER_SLICE_SHARE } from '../../utils/adminMetrics'
import { sportVisual } from '../../utils/sportMeta'
import type { SportType } from '../../types/session'
import { formatThousands } from '../../utils/formatting'
import { SPACING, TYPE, WEIGHT, type Palette } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const SIZE = 168
const INNER_RATIO = 0.62

const GAP_DEGREES = 1.4

function sliceColor(slice: SportSlice, colors: Palette): string {
  return slice.isOther ? colors.textMuted : sportVisual(slice.key as SportType, colors).color
}

function donutSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number,
): string {
  const sweep = endDeg - startDeg
  if (sweep >= 359.999) {
    return (
      `M ${cx} ${cy - rOuter} A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy + rOuter} ` +
      `A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy - rOuter} Z ` +
      `M ${cx} ${cy - rInner} A ${rInner} ${rInner} 0 1 0 ${cx} ${cy + rInner} ` +
      `A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner} Z`
    )
  }

  const point = (r: number, deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }
  const large = sweep > 180 ? 1 : 0
  const o1 = point(rOuter, startDeg)
  const o2 = point(rOuter, endDeg)
  const i2 = point(rInner, endDeg)
  const i1 = point(rInner, startDeg)

  return (
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)} ` +
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)} ` +
    `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)} ` +
    `A ${rInner} ${rInner} 0 ${large} 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)} Z`
  )
}

export default function SportDistributionChart({
  slices,
  windowDays,
}: {
  slices: SportSlice[]
  windowDays: number
}) {
  const { colors } = useTheme()

  const total = slices.reduce((sum, s) => sum + s.count, 0)

  return (
    <ChartCard
      title="Sessions by sport"
      subtitle={`All users, last ${windowDays} days`}
      info={
        <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
          Each slice is a share of every session logged across the userbase in the window. Sports
          under {Math.round(OTHER_SLICE_SHARE * 100)}% of the total are merged into Other, which
          names them in its legend row — a wedge that thin is unreadable and unhittable, and it
          still costs a full row to label.
        </Text>
      }
      infoLabel="About the sport distribution chart"
    >
      {() =>
        total === 0 ? (
          <ChartEmpty message="No sessions logged in this window." height={SIZE} />
        ) : (
          <View>
            <View style={{ alignItems: 'center' }}>
              <Donut slices={slices} total={total} />
            </View>
            <Legend slices={slices} />
          </View>
        )
      }
    </ChartCard>
  )
}

function Donut({ slices, total }: { slices: SportSlice[]; total: number }) {
  const { colors } = useTheme()

  const cx = SIZE / 2
  const cy = SIZE / 2
  const rOuter = SIZE / 2
  const rInner = rOuter * INNER_RATIO

  const gap = slices.length > 1 ? GAP_DEGREES : 0
  let cursor = 0

  const description = slices
    .map((s) => `${s.label}: ${s.count}, ${Math.round(s.share * 100)}%`)
    .join(', ')

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={description}>
      <Svg width={SIZE} height={SIZE}>
        <G>
          {slices.map((slice) => {
            const sweep = slice.share * 360
            const start = cursor + gap / 2
            const end = cursor + sweep - gap / 2
            cursor += sweep
            const safeEnd = Math.max(end, start + 0.4)
            return (
              <Path
                key={slice.key}
                d={donutSlice(cx, cy, rOuter, rInner, start, safeEnd)}
                fill={sliceColor(slice, colors)}
              />
            )
          })}
        </G>
      </Svg>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: TYPE.heading, fontWeight: WEIGHT.heavy, color: colors.text }}>
          {formatThousands(total)}
        </Text>
        <Text style={{ fontSize: TYPE.caption, color: colors.textMuted }}>
          {total === 1 ? 'session' : 'sessions'}
        </Text>
      </View>
    </View>
  )
}

function Legend({ slices }: { slices: SportSlice[] }) {
  const { colors } = useTheme()

  return (
    <View style={{ marginTop: SPACING.base, gap: SPACING.sm }}>
      {slices.map((slice) => (
        <View key={slice.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: sliceColor(slice, colors),
              marginRight: SPACING.sm,
            }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: TYPE.small, color: colors.textBody }}>
              {slice.label}
            </Text>
            {slice.merged.length > 0 ? (
              <Text numberOfLines={2} style={{ fontSize: TYPE.caption, color: colors.textSubtle }}>
                {slice.merged.join(', ')}
              </Text>
            ) : null}
          </View>
          <Text
            style={{
              fontSize: TYPE.small,
              fontWeight: WEIGHT.semibold,
              color: colors.text,
              marginLeft: SPACING.sm,
            }}
          >
            {formatThousands(slice.count)}
          </Text>
          <Text
            style={{
              width: 46,
              textAlign: 'right',
              fontSize: TYPE.small,
              color: colors.textMuted,
            }}
          >
            {Math.round(slice.share * 100)}%
          </Text>
        </View>
      ))}
    </View>
  )
}
