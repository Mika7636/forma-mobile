// Section 5 — when the userbase actually trains.
//
// Seven rows of four-hour blocks. Two coarse axes on purpose: 7 × 24 would be
// 168 cells across a phone's width, each about two points wide, and at that size
// a heatmap stops being a picture of anything. Four-hour blocks are also roughly
// how people describe training time to themselves — early morning, lunchtime,
// after work — so a bright column has a plain-language reading.
//
// ## The shading, and why it is a computed mix rather than a ramp of constants
//
// A cell runs from `surfaceAlt` to `accent` with intensity, mixed at render time
// by {@link mix}. Two reasons it is not a hand-written ramp of hex values: the
// blend then comes out right in both themes without a second palette entry, and
// the empty cell is genuinely the page's own empty-surface token rather than an
// approximation of it that drifts the next time the palette is retuned.
//
// It is a real background colour rather than a translucent overlay, which is the
// same choice the conflict grid makes and for a reason that bites there — a fill
// that exists only in the compositor is a fill nothing can measure, and
// `onColor` has to measure one to pick type for it. This grid carries no text on
// its cells today; matching the construction is what stops that from becoming a
// contrast bug on the day it does.
//
// The floor matters. A cell holding one session at a truly proportional mix
// would be invisible, which reads as zero — so any non-empty cell starts at a
// visible minimum and the ramp runs from there. The difference between "none"
// and "barely any" is the most interesting distinction on this grid, and it is
// exactly the one a purely linear scale destroys.
import { Text, View } from 'react-native'
import ChartCard from '../progress/ChartCard'
import { ChartEmpty } from './AdminSection'
import type { ActivityHeatmap } from '../../utils/adminMetrics'
import { HOUR_BUCKETS } from '../../utils/adminMetrics'
import { formatThousands } from '../../utils/formatting'
import { RADIUS, SPACING, TYPE, WEIGHT, mix } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/** Monday-first, matching `mondayFirstIndex`, which builds the rows. */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "00–04", "04–08", … derived from the bucket count so the two cannot drift. */
const HOUR_LABELS = Array.from({ length: HOUR_BUCKETS }, (_, i) => {
  const span = 24 / HOUR_BUCKETS
  const pad = (h: number) => String(h).padStart(2, '0')
  return `${pad(i * span)}–${pad((i + 1) * span)}`
})

const CELL_H = 30
const GAP = 3
const ROW_LABEL_W = 34

/** How far toward `accent` the faintest non-empty cell is mixed, and the range. */
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
      {/* Column headers. Above the grid rather than below it, because the row
          labels are on the left and a reader lands on the top-left corner. */}
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
                // The accent mixed into the empty surface at this cell's
                // intensity; at zero that resolves to `surfaceAlt` exactly.
                backgroundColor: mix(colors.accent, colors.surfaceAlt, intensity(count, heatmap.max)),
              }}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

/** How far toward `accent` a cell holding `count` of a busiest `max` is mixed. */
function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return MIX_FLOOR + (count / max) * MIX_RANGE
}

/**
 * The legend: the ramp itself, its two ends named.
 *
 * A swatch strip rather than a numeric key, because the grid encodes a
 * continuous quantity and five labelled buckets would imply thresholds the data
 * does not have. The endpoints are what a reader needs to decode a cell.
 */
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
            // The same mix the cells use, so a swatch and the cell it stands for
            // are the same colour by construction rather than by coincidence.
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
