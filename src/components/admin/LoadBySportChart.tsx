// Section 4 — total training load by sport, as horizontal bars.
//
// ## Why this is not the donut again
//
// It is the same sessions and a different quantity. Load is duration × RPE, so a
// sport's share of the *load* and its share of the *sessions* come apart
// wherever session length or intensity varies between them — twelve half-hour
// gym visits against four long rides is the ordinary case, not a corner one, and
// the pair of charts read together is the actual insight: which sports the
// userbase does *often*, against which ones it spends its training stress on.
//
// One chart carrying both would have to decide what a wedge's angle meant, and
// whichever it picked the other quantity would be the one somebody misread.
//
// ## Why horizontal
//
// The category labels are sport names — "Combat Sports", "Strength Training" —
// and vertical bars would either truncate them, rotate them, or set them at a
// size nobody reads. Horizontal bars give every label a full line at body size
// and the bar grows away from it, which is also the direction the sorted order
// reads in.
import { Text, View } from 'react-native'
import ChartCard from '../progress/ChartCard'
import { ChartEmpty } from './AdminSection'
import type { SportLoadBar } from '../../utils/adminMetrics'
import { sportVisual } from '../../utils/sportMeta'
import type { SportType } from '../../types/session'
import { formatThousands } from '../../utils/formatting'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/** Track height. Chunky enough to carry a sport's colour legibly. */
const BAR_H = 10

export default function LoadBySportChart({
  bars,
  windowDays,
}: {
  bars: SportLoadBar[]
  windowDays: number
}) {
  const { colors } = useTheme()

  const total = bars.reduce((sum, b) => sum + b.load, 0)

  return (
    <ChartCard
      title="Training load by sport"
      subtitle={`All users, last ${windowDays} days`}
      info={
        <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
          Load is session duration multiplied by RPE, in arbitrary units (AU) — the same figure
          the Progress screen charts for an individual athlete. A sport can rank high here on few
          sessions if those sessions are long or hard, which is exactly where this chart and the
          one above it disagree most usefully.
        </Text>
      }
      infoLabel="About the load by sport chart"
    >
      {() =>
        total === 0 ? (
          <ChartEmpty message="No training load recorded in this window." height={132} />
        ) : (
          <View style={{ gap: SPACING.md }}>
            {bars.map((bar) => (
              <LoadRow key={bar.sport} bar={bar} share={bar.load / total} />
            ))}
          </View>
        )
      }
    </ChartCard>
  )
}

function LoadRow({ bar, share }: { bar: SportLoadBar; share: number }) {
  const { colors } = useTheme()

  const color = sportVisual(bar.sport as SportType, colors).color

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${bar.label}: ${Math.round(bar.load)} AU from ${bar.sessions} sessions, ${Math.round(share * 100)} percent of total load`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 5 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontSize: TYPE.small, color: colors.textBody }}
        >
          {bar.label}
        </Text>
        <Text
          style={{
            fontSize: TYPE.small,
            fontWeight: WEIGHT.semibold,
            color: colors.text,
            marginLeft: SPACING.sm,
          }}
        >
          {formatThousands(bar.load)} AU
        </Text>
      </View>

      {/* The track is drawn in full, so a short bar reads as a small share of a
          known whole rather than as a stub floating on the card. */}
      <View
        style={{
          height: BAR_H,
          borderRadius: RADIUS.pill,
          backgroundColor: colors.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            // Scaled against the largest bar rather than against the total, so
            // the longest one always fills the track. Scaling to the total would
            // leave every bar in a seven-sport spread under a fifth of the width
            // and make the chart unreadable precisely when it has the most to
            // say. The percentage below carries the share-of-total instead.
            width: `${Math.max(bar.fraction, 0.01) * 100}%`,
            height: '100%',
            borderRadius: RADIUS.pill,
            backgroundColor: color,
          }}
        />
      </View>

      <Text style={{ marginTop: 4, fontSize: TYPE.caption, color: colors.textSubtle }}>
        {Math.round(share * 100)}% of total load
        {'  ·  '}
        {formatThousands(bar.sessions)} {bar.sessions === 1 ? 'session' : 'sessions'}
      </Text>
    </View>
  )
}
