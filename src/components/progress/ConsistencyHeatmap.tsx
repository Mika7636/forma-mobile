import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import ChartCard from './ChartCard'
import { formatThousands } from '../../utils/formatting'
import type { HeatmapDay, HeatmapWeek } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'

// The empty -> full ramp lives in the design tokens (`palette.heat`), per
// theme, because it has to invert between them: on dark an empty day is the
// darkest cell and on light it is the lightest. It is read from `colors` inside
// each component rather than captured here — a module-level copy would freeze
// whichever palette happened to be active when this module was first evaluated.
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const GAP = 6
const GUTTER = 20 // left column for the M–S labels
const MIN_CELL = 22
const MAX_CELL = 40

interface ConsistencyHeatmapProps {
  heatmap: HeatmapWeek[]
  delay?: number
}

/**
 * A GitHub-style contribution grid: one column per week, Monday→Sunday down each
 * column, cell colour deepening with the day's training load. Sizes cells to fill
 * the card at 4–8 weeks and clamps them at 12 weeks so the grid scrolls
 * horizontally rather than shrinking to illegibility. Tap a day for its details.
 */
export default function ConsistencyHeatmap({ heatmap, delay = 0 }: ConsistencyHeatmapProps) {
  return (
    <ChartCard
      // Named for the *shape* it draws, not for what it measures. "Training
      // Consistency" is now the streak section above it, and two cards under
      // one name is two cards nobody can refer to.
      title="Training Calendar"
      subtitle="One square per day · darker = harder"
      delay={delay}
      legend={<Scale />}
    >
      {(width) => <Grid heatmap={heatmap} width={width} />}
    </ChartCard>
  )
}

function Grid({ heatmap, width }: { heatmap: HeatmapWeek[]; width: number }) {
  const { colors } = useTheme()

  const [selected, setSelected] = useState<HeatmapDay | null>(null)

  const weeks = heatmap.length
  const avail = width - GUTTER
  const ideal = weeks > 0 ? avail / weeks - GAP : MAX_CELL
  const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, ideal))
  const rowH = cell + GAP

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        {/* Day-of-week gutter, aligned to the cell rows */}
        <View style={{ width: GUTTER }}>
          {DOW.map((d, i) => (
            <View key={i} style={{ height: rowH, justifyContent: 'center' }}>
              <Text style={{ fontSize: 9, color: colors.textSubtle, fontWeight: '600' }}>{d}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: GAP }}
        >
          {heatmap.map((week) => (
            <View key={week.weekStartISO} style={{ gap: GAP }}>
              {week.days.map((day, di) =>
                day ? (
                  <Pressable
                    key={day.dateISO}
                    onPress={() => setSelected(selected?.dateISO === day.dateISO ? null : day)}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 4,
                      backgroundColor: colors.heat[day.level],
                      borderWidth: selected?.dateISO === day.dateISO ? 2 : 0,
                      borderColor: colors.text,
                    }}
                  />
                ) : (
                  // Future day of the current week — hold the slot, draw nothing.
                  <View key={`empty-${di}`} style={{ width: cell, height: cell }} />
                ),
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Selected-day detail (fixed height so tapping doesn't reflow the page) */}
      <View style={{ minHeight: 20, marginTop: 12, justifyContent: 'center' }}>
        {selected ? (
          <Text style={{ fontSize: 13, color: colors.textBody }}>
            <Text style={{ fontWeight: '800', color: colors.text }}>{selected.fullDate}</Text>
            {selected.load > 0 ? (
              <>
                {'  ·  '}
                <Text style={{ fontWeight: '700' }}>{formatThousands(selected.load)}</Text> AU ·{' '}
                <Text style={{ fontWeight: '700' }}>{selected.sessions}</Text>{' '}
                {selected.sessions === 1 ? 'session' : 'sessions'}
              </>
            ) : (
              <Text style={{ color: colors.textSubtle }}>{'  ·  Rest day'}</Text>
            )}
          </Text>
        ) : (
          <Text style={{ fontSize: 12, color: colors.textSubtle }}>Tap a day for details</Text>
        )}
      </View>
    </View>
  )
}

function Scale() {
  const { colors } = useTheme()

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Text style={{ fontSize: 11, color: colors.textSubtle, marginRight: 2 }}>Less</Text>
      {colors.heat.map((c) => (
        <View key={c} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c }} />
      ))}
      <Text style={{ fontSize: 11, color: colors.textSubtle, marginLeft: 2 }}>More</Text>
    </View>
  )
}
