// Admin section 5: when the userbase trains, as a day/hour heatmap.

import { Text, View } from 'react-native'
import ChartCard from '../progress/ChartCard'
import { ChartEmpty } from './AdminSection'
import type { ActivityHeatmap } from '../../utils/adminMetrics'
import { HOUR_BUCKETS } from '../../utils/adminMetrics'
import { formatThousands } from '../../utils/formatting'
import { RADIUS, SPACING, TYPE, WEIGHT, mix } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const HOUR_LABELS = Array.from({ length: HOUR_BUCKETS }, (_, i) => {
  const span = 24 / HOUR_BUCKETS
  const pad = (h: number) => String(h).padStart(2, '0')
  return `${pad(i * span)}–${pad((i + 1) * span)}`
})

const CELL_H = 30
const GAP = 3
const ROW_LABEL_W = 34

const MIX_FLOOR = 0.16
const MIX_RANGE = 0.84

export default function ActivityHeatmapCard({
  heatmap,
  windowDays,
}: {
  heatmap: ActivityHeatmap
  windowDays: number
}) {
  const { colors } = useTheme()

  return (
    <ChartCard
      title="When people train"
      subtitle={`All users, last ${windowDays} days`}
      info={
        <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
          Read from each session&apos;s own date and time. A live-tracked session carries the
          clock time it was recorded at; a quick-logged one carries the time it was entered, so
          somebody who trains at six and logs it at nine appears in the 08–12 block. Treat the
          evening blocks as &quot;trained or logged then&quot;, not purely as training time.
        </Text>
      }
      infoLabel="About the training activity heatmap"
    >
      {(width) =>
        heatmap.total === 0 ? (
          <ChartEmpty message="No sessions logged in this window." height={CELL_H * 7} />
        ) : (
          <View>
            <Grid heatmap={heatmap} width={width} />
            <Scale max={heatmap.max} />
            <Text style={{ marginTop: SPACING.md, fontSize: TYPE.small, color: colors.textMuted }}>
              <Text style={{ fontWeight: WEIGHT.heavy, color: colors.text }}>
                {formatThousands(heatmap.total)}
              </Text>{' '}
              {heatmap.total === 1 ? 'session' : 'sessions'} placed
              {'  ·  '}busiest block holds{' '}
              <Text style={{ fontWeight: WEIGHT.heavy, color: colors.text }}>{heatmap.max}</Text>
            </Text>
          </View>
        )
      }
    </ChartCard>
  )
}

function Grid({ heatmap, width }: { heatmap: ActivityHeatmap; width: number }) {
  const { colors } = useTheme()

  const gridW = width - ROW_LABEL_W
  const cellW = (gridW - GAP * (HOUR_BUCKETS - 1)) / HOUR_BUCKETS

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: SPACING.xs }}>
        <View style={{ width: ROW_LABEL_W }} />
        {HOUR_LABELS.map((label, i) => (
          <View key={label} style={{ width: cellW, marginLeft: i === 0 ? 0 : GAP }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontSize: TYPE.caption, color: colors.textMuted, textAlign: 'center' }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {heatmap.rows.map((row, dayIndex) => (
        <View
          key={DAY_LABELS[dayIndex]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${DAY_LABELS[dayIndex]}: ${row
            .map((count, i) => `${HOUR_LABELS[i]} ${count}`)
            .join(', ')}`}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: GAP }}
        >
          <Text
            style={{
              width: ROW_LABEL_W,
              fontSize: TYPE.caption,
              color: colors.textMuted,
            }}
          >
            {DAY_LABELS[dayIndex]}
          </Text>

          {row.map((count, hourIndex) => (
            <View
              key={HOUR_LABELS[hourIndex]}
              style={{
                width: cellW,
                height: CELL_H,
                marginLeft: hourIndex === 0 ? 0 : GAP,
                borderRadius: RADIUS.xs,
                backgroundColor: mix(colors.accent, colors.surfaceAlt, intensity(count, heatmap.max)),
              }}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return MIX_FLOOR + (count / max) * MIX_RANGE
}

function Scale({ max }: { max: number }) {
  const { colors } = useTheme()

  const steps = [0, 0.25, 0.5, 0.75, 1]

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md }}>
      <Text style={{ fontSize: TYPE.caption, color: colors.textSubtle, marginRight: SPACING.sm }}>
        None
      </Text>
      {steps.map((step) => (
        <View
          key={step}
          style={{
            width: 20,
            height: 10,
            marginRight: 3,
            borderRadius: 2,
            backgroundColor: mix(
              colors.accent,
              colors.surfaceAlt,
              step === 0 ? 0 : MIX_FLOOR + step * MIX_RANGE,
            ),
          }}
        />
      ))}
      <Text style={{ fontSize: TYPE.caption, color: colors.textSubtle, marginLeft: SPACING.sm }}>
        {max} {max === 1 ? 'session' : 'sessions'}
      </Text>
    </View>
  )
}
