// Progress Analytics.
//
// ## One window, one question
//
// The screen used to open with a Daily / Weekly / Monthly switch. Each option
// defined its own window — a fortnight, a quarter, a year — so every axis, the
// band, and the verdict all changed meaning the moment it was touched, and
// nothing the athlete saw could be compared with anything they had seen a
// moment before. Three readings, all true, none comparable.
//
// It is now one fixed window: the last twelve weeks, one bar per week, forever.
// A fixed axis is what makes a chart legible over time — next week's chart is
// this chart with one more bar on it, and the athlete comes to know the shape of
// their own quarter. What varies instead is *which* training is in view, via the
// sport chips at the top, which changes the subject without moving the frame.
//
// The order down the page answers one question at a time: what have I done this
// week, how does the last quarter look, is that sensible, how consistent have I
// been, where did it come from, and did any of it clash. The CTL/ATL/Form model
// still runs underneath all of it (conflict detection reads the same numbers);
// it lives verbatim in the Advanced expander at the foot of the page.
import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import AdvancedSection from '../components/progress/AdvancedSection'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import ConflictTimeline from '../components/progress/ConflictTimeline'
import FitnessChart from '../components/progress/FitnessChart'
import ProgressSkeleton from '../components/progress/ProgressSkeleton'
import SportBalance from '../components/progress/SportBalance'
import SportFilterChips from '../components/progress/SportFilterChips'
import ThisWeekBlock from '../components/progress/ThisWeekBlock'
import TrainingConsistency from '../components/progress/TrainingConsistency'
import TrainingLoadChart from '../components/progress/TrainingLoadChart'
import EmptyState from '../components/ui/EmptyState'
import { useConflictHistory } from '../hooks/useConflictHistory'
import { useProgressData } from '../hooks/useProgressData'
import { useSessionHistory } from '../hooks/useSessionHistory'
import { PROGRESS_UNLOCK_SESSIONS } from '../utils/calibration'
import { detectedAtDate } from '../utils/conflictInfo'
import { haptics } from '../utils/haptics'
import type { Conflict } from '../types/conflict'
import type { SportFilter } from '../utils/progressMetrics'
import type { ProgressScreenProps } from '../navigation/types'
import { SPACING, TYPE, WEIGHT } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { useTabContentPadding } from '../hooks/useTabContentPadding'

/**
 * The window, spelled out under the title.
 *
 * Worth stating even though it never changes: "Progress" alone does not say how
 * far back you are looking, and the dates are how the athlete places the bars
 * against their own memory of the block.
 */
function formatRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear()
  const startText = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const endText = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  return `${startText} – ${endText}`
}

export default function ProgressScreen({ navigation }: ProgressScreenProps) {
  const { colors } = useTheme()
  // Reserve room for the tab bar, which is drawn over the end of this list —
  // tab-bar height plus the gesture-bar inset, plus the page's own end margin.
  const tabPadding = useTabContentPadding()

  const [sport, setSport] = useState<SportFilter>('all')
  const { data, totalSessions, loading, refresh } = useProgressData(sport)
  const [refreshing, setRefreshing] = useState(false)

  // The conflict timeline links straight into the conflict that a sport pairing
  // caused, so it needs the full history (resolved included) rather than the
  // dashboard's unresolved-only feed — a conflict from six weeks ago is still
  // the reason those two sports are worth looking at together.
  const { conflicts: allConflicts } = useConflictHistory()
  const { sessions } = useSessionHistory()
  const [openConflicts, setOpenConflicts] = useState<Conflict[] | null>(null)

  const rangeConflicts = useMemo(() => {
    const from = data.rangeStart.getTime()
    const to = data.rangeEnd.getTime() + 86_400_000
    return allConflicts.filter((c) => {
      const at = detectedAtDate(c).getTime()
      return at >= from && at < to
    })
  }, [allConflicts, data.rangeStart, data.rangeEnd])

  const onRefresh = useCallback(async () => {
    haptics.medium()
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  const goToLog = useCallback(() => {
    navigation.navigate('Log')
  }, [navigation])

  // Sparse data makes trend charts misleading, so keep the cold-start guard until
  // there's enough history to say something honest. Only after the first snapshot
  // (so we never flash the guard over data that's about to load).
  if (!loading && totalSessions < PROGRESS_UNLOCK_SESSIONS) {
    return <ProgressLockedGuard logged={totalSessions} onLogSession={goToLog} />
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />
      <ScrollView
        contentContainerStyle={{
          padding: SPACING.base,
          paddingBottom: tabPadding,
          gap: SPACING.base,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <View>
          <Text style={{ fontSize: TYPE.display, fontWeight: WEIGHT.heavy, color: colors.text }}>
            Progress
          </Text>
          <Text style={{ marginTop: 2, fontSize: TYPE.body, color: colors.textMuted }}>
            {formatRange(data.rangeStart, data.rangeEnd)}
          </Text>
        </View>

        <SportFilterChips sports={data.availableSports} value={sport} onChange={setSport} />

        {loading ? (
          <ProgressSkeleton />
        ) : (
          <>
            <ThisWeekBlock summary={data.thisWeek} />

            <TrainingLoadChart weeks={data.weeks} band={data.band} verdict={data.verdict} />

            <TrainingConsistency weeks={data.weeks} streak={data.streak} />

            <SportBalance sports={data.sports} />

            {/* Only present when the engine actually flagged something in the
                window; renders nothing otherwise. */}
            <ConflictTimeline
              weeks={data.weeks}
              conflicts={rangeConflicts}
              onOpenConflict={setOpenConflicts}
            />

            <AdvancedSection
              title="Advanced — training model"
              subtitle="Fitness, Fatigue and Form, the way the engine sees them"
            >
              <FitnessChart daily={data.daily} />
            </AdvancedSection>
          </>
        )}
      </ScrollView>

      <ConflictDetailSheet
        conflicts={openConflicts}
        sessions={sessions}
        onClose={() => setOpenConflicts(null)}
      />
    </SafeAreaView>
  )
}

/**
 * Cold-start guard shown until the user has logged {@link PROGRESS_UNLOCK_SESSIONS}
 * sessions — the same "keep logging" state introduced in the Week 5 fix, with an
 * "X of 5" unlock meter.
 */
function ProgressLockedGuard({
  logged,
  onLogSession,
}: {
  logged: number
  onLogSession: () => void
}) {
  const { colors } = useTheme()

  const target = PROGRESS_UNLOCK_SESSIONS

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />
      <View style={{ flex: 1, justifyContent: 'center', padding: SPACING.lg }}>
        <EmptyState
          icon="trending"
          title="Keep logging!"
          message={`Progress charts unlock after ${target} sessions, once there's enough history to show a meaningful trend.`}
          progress={{
            current: logged,
            target,
            label: `${logged} of ${target} sessions`,
          }}
          actionLabel="Log a Session"
          onAction={onLogSession}
        />
      </View>
    </SafeAreaView>
  )
}
