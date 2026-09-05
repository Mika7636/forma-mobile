// Section 6 — cross-sport conflict frequency.
//
// ## What this grid is, and the thing it is not
//
// It is a frequency table: cell (i, j) is how many times sport i and sport j
// have tripped the conflict engine's sport-overlap check when trained inside 48
// hours of each other, across every athlete in scope. Nothing more.
//
// It is **not** a confusion matrix, and the resemblance is close enough to be
// dangerous — a square grid of the same labels on both axes is exactly what one
// looks like. A confusion matrix requires ground truth: predictions on one axis,
// what actually happened on the other, so that the off-diagonal cells count
// *mistakes*. FORMA records no outcomes. Nothing in this database says whether
// an athlete who trained through a flagged pairing was later injured, flat, or
// perfectly fine, so there is no observation to score a prediction against, no
// cell that could honestly be called a false positive, and no accuracy to
// report. Labelling this grid with classifier language would be claiming a
// validation the data cannot support, which is why the title says what it counts
// and the info panel says the rest.
//
// The diagonal is blank because the check never fires on a sport against itself
// — see `getInteractionLevel`, which returns 0 for a matched pair — so a
// diagonal cell would be a structural zero rendered identically to a measured
// one.
//
// Shaded `surfaceAlt` → `warn`, on the same construction as the activity
// heatmap; see that file's header. Warn rather than accent because a busy cell
// here is a problem, not a success.
//
// The cell carries its own count, so its ink is chosen by `onColor` against the
// mixed fill rather than fixed to `colors.text`. That is not a nicety: on dark,
// `text` is near-white and a full-intensity cell is saturated amber, which
// measures 2.05:1 — the busiest and most important cell on the grid would have
// been the one nobody could read.
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

/**
 * How far toward `warn` a cell is mixed: the faintest a non-empty cell may be,
 * and the range above it.
 *
 * The floor is what keeps "one clash" distinguishable from "none". At a truly
 * proportional mix a single conflict against a busiest cell of thirty would be
 * a two-percent tint — invisible, and therefore read as zero, which is the one
 * distinction this grid most needs to keep.
 */
const MIX_FLOOR = 0.18
const MIX_RANGE = 0.82

/** How far toward `warn` a cell holding `count` of a busiest `max` is mixed. */
function intensity(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return MIX_FLOOR + (count / max) * MIX_RANGE
}

/** Three letters is all a 7-wide axis has room for. */
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
  /** The profile page was capped, so some athletes could not be scored. */
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

            {/* The headline the grid exists to produce. A reader who takes one
                thing from this card should take this line. */}
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
            // The diagonal is a structural blank, not a zero: a sport cannot
            // conflict with itself under this check, so drawing it as an empty
            // cell would make "impossible" look like "never happened".
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
                {/* The count, on the cell. Seven columns leaves room for two
                    digits, and a grid you have to eyeball against a legend to
                    get a number out of is a grid that will be misquoted. The ink
                    is measured against this cell's own fill — see the header. */}
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
