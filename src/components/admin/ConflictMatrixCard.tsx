// Admin section 6: cross-sport conflict frequency grid.

import { Text, View } from 'react-native'
import ChartCard from '../progress/ChartCard'
import { ChartEmpty } from './AdminSection'
import type { ConflictMatrix } from '../../utils/adminMetrics'
import { sportVisual } from '../../utils/sportMeta'
import { SPACING, TYPE, WEIGHT, RADIUS, mix, onColor } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const CELL_H = 30
const GAP = 3
const ROW_LABEL_W = 58

const MIX_FLOOR = 0.18
const MIX_RANGE = 0.82

function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return MIX_FLOOR + (count / max) * MIX_RANGE
}

function shortLabel(label: string): string {
  return label.slice(0, 3)
}

export default function ConflictMatrixCard({
  matrix,
  windowDays,
  profilesTruncated,
}: {
  matrix: ConflictMatrix
  windowDays: number
  profilesTruncated: boolean
}) {
  const { colors } = useTheme()

  const labels = matrix.sports.map((sport) => sportVisual(sport, colors).label)

  return (
    <ChartCard
      title="Cross-sport conflict frequency"
      subtitle={`All users, last ${windowDays} days`}
      info={
        <View style={{ gap: SPACING.sm }}>
          <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
            Each cell counts how often that pair of sports tripped the conflict engine&apos;s
            sport-overlap check — trained within 48 hours, an interaction level of 2 or 3 in the
            athlete&apos;s own matrix, and a hard enough first session. Only that check is
            counted: the nervous-system check fires on two hard sessions whatever they were, and
            the weekly-budget check involves no pair of sports at all.
          </Text>
          <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
            Recomputed from logged sessions rather than read from stored conflict records —
            admins have no read access to those. So a dismissed conflict still counts here, and
            an athlete who has since changed their sensitivity setting is re-scored at today&apos;s
            one.
          </Text>
          <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
            This is a frequency table, not a confusion matrix. FORMA records no injury or
            performance outcomes, so there is nothing to validate a prediction against and no
            cell here is an error rate.
          </Text>
        </View>
      }
      infoLabel="About the cross-sport conflict grid"
    >
      {(width) =>
        matrix.total === 0 ? (
          <ChartEmpty
            message="No cross-sport clashes detected in this window."
            height={CELL_H * 4}
          />
        ) : (
          <View>
            <Grid matrix={matrix} labels={labels} width={width} />

            {matrix.worst ? (
              <Text
                style={{
                  marginTop: SPACING.base,
                  fontSize: TYPE.small,
                  lineHeight: 19,
                  color: colors.textBody,
                }}
              >
                Most conflicted pairing:{' '}
                <Text style={{ fontWeight: WEIGHT.heavy, color: colors.text }}>
                  {sportVisual(matrix.worst.a, colors).label} +{' '}
                  {sportVisual(matrix.worst.b, colors).label}
                </Text>{' '}
                — {matrix.worst.count} {matrix.worst.count === 1 ? 'conflict' : 'conflicts'} of{' '}
                {matrix.total} in this window.
              </Text>
            ) : null}

            {profilesTruncated ? (
              <Text
                style={{
                  marginTop: SPACING.sm,
                  fontSize: TYPE.caption,
                  lineHeight: 16,
                  color: colors.textSubtle,
                }}
              >
                Scored across {matrix.usersScored} athletes. Each athlete&apos;s own interaction
                matrix is needed to score them, and the profile page is capped — accounts beyond
                it are not counted here.
              </Text>
            ) : null}
          </View>
        )
      }
    </ChartCard>
  )
}

function Grid({
  matrix,
  labels,
  width,
}: {
  matrix: ConflictMatrix
  labels: string[]
  width: number
}) {
  const { colors } = useTheme()

  const n = matrix.sports.length
  const gridW = width - ROW_LABEL_W
  const cellW = (gridW - GAP * (n - 1)) / n

  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: SPACING.xs }}>
        <View style={{ width: ROW_LABEL_W }} />
        {labels.map((label, i) => (
          <View key={label} style={{ width: cellW, marginLeft: i === 0 ? 0 : GAP }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontSize: TYPE.caption, color: colors.textMuted, textAlign: 'center' }}
            >
              {shortLabel(label)}
            </Text>
          </View>
        ))}
      </View>

      {matrix.cells.map((row, i) => (
        <View
          key={matrix.sports[i]}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${labels[i]}: ${row
            .map((count, j) => (i === j ? null : `${labels[j]} ${count}`))
            .filter(Boolean)
            .join(', ')}`}
          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: GAP }}
        >
          <Text
            numberOfLines={1}
            style={{ width: ROW_LABEL_W, fontSize: TYPE.caption, color: colors.textMuted }}
          >
            {shortLabel(labels[i])}
          </Text>

          {row.map((count, j) => {
            const isDiagonal = i === j
            const fill =
              count > 0
                ? mix(colors.warn, colors.surfaceAlt, intensity(count, matrix.max))
                : colors.surfaceAlt
            return (
              <View
                key={matrix.sports[j]}
                style={{
                  width: cellW,
                  height: CELL_H,
                  marginLeft: j === 0 ? 0 : GAP,
                  borderRadius: RADIUS.xs,
                  backgroundColor: isDiagonal ? 'transparent' : fill,
                  borderWidth: isDiagonal ? 1 : 0,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {!isDiagonal && count > 0 ? (
                  <Text
                    style={{
                      fontSize: TYPE.caption,
                      fontWeight: WEIGHT.bold,
                      color: onColor(fill),
                    }}
                  >
                    {count}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}
