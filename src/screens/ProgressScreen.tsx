// Progress Analytics.
//
// The screen leads with one question — "am I training about the right amount?"
// — answered in a sentence, then as a compact row of the period's numbers, then
// as bars against the range the athlete's current fitness supports. Under the
// chart come the two sections a running app structurally cannot show: which
// sports the load came from, and how many weeks in a row the *amount* was right.
// The CTL/ATL/Form model still runs underneath all of it (conflict detection
// reads the same numbers); it is simply no longer what the athlete is asked to
// read. It lives verbatim in the Advanced expander at the foot of the page.
import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import AdvancedSection from '../components/progress/AdvancedSection'
import CalorieChart from '../components/progress/CalorieChart'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import ConflictTimeline from '../components/progress/ConflictTimeline'
import ConsistencyHeatmap from '../components/progress/ConsistencyHeatmap'
import FitnessChart from '../components/progress/FitnessChart'
import GranularitySelector from '../components/progress/GranularitySelector'
import ProgressSkeleton from '../components/progress/ProgressSkeleton'
import ProgressStats from '../components/progress/ProgressStats'
import SportBalance from '../components/progress/SportBalance'
import TrainingConsistency from '../components/progress/TrainingConsistency'
import TrainingLoadChart, { LoadVerdictHeader } from '../components/progress/TrainingLoadChart'
import EmptyState from '../components/ui/EmptyState'
import { useConflictHistory } from '../hooks/useConflictHistory'
import { useProgressData } from '../hooks/useProgressData'
import { useSessionHistory } from '../hooks/useSessionHistory'
import { PROGRESS_UNLOCK_SESSIONS } from '../utils/calibration'
import { detectedAtDate } from '../utils/conflictInfo'
import { haptics } from '../utils/haptics'
import type { Conflict } from '../types/conflict'
import type { Granularity } from '../utils/progressMetrics'
import type { ProgressScreenProps } from '../navigation/types'
import { SPACING, TYPE, WEIGHT } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { useTabContentPadding } from '../hooks/useTabContentPadding'

/**
 * The active range, spelled out.
 *
 * Shown because the tabs no longer say how long a period is: "Monthly" tells you
 * the grain but not that you are looking at a year. Includes the year when the
 * range crosses one, which the twelve-month view always does.
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

  const [granularity, setGranularity] = useState<Granularity>('weekly')
  const { data, totalSessions, loading, refresh } = useProgressData(granularity)
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

  const rangeLabel = formatRange(data.rangeStart, data.rangeEnd)

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
        {/* Header */}
        <View>
          <Text style={{ fontSize: TYPE.display, fontWeight: WEIGHT.heavy, color: colors.text }}>
            Progress
          </Text>
          <Text style={{ marginTop: 2, fontSize: TYPE.body, color: colors.textMuted }}>
            {rangeLabel}
          </Text>
        </View>

        <GranularitySelector value={granularity} onChange={setGranularity} />

        {loading ? (
          <ProgressSkeleton />
        ) : (
          <>
            <LoadVerdictHeader verdict={data.verdict} />

            {/* The period's figures, unboxed, directly above the chart they
                summarise — so the eye lands on the numbers and then on the
                shape they came in. */}
            <ProgressStats stats={data.stats} baseDelay={40} />

            <TrainingLoadChart
              buckets={data.buckets}
              band={data.band}
              verdict={data.verdict}
              granularity={granularity}
              rangeLabel={rangeLabel}
              delay={100}
            />

            <SportBalance sports={data.sports} delay={140} />

            {/* Only present when the engine actually flagged something in this
                period; renders nothing otherwise. */}
            <ConflictTimeline
              buckets={data.buckets}
              conflicts={rangeConflicts}
              onOpenConflict={setOpenConflicts}
              delay={180}
            />

            <TrainingConsistency consistency={data.consistency} delay={220} />

            <CalorieChart buckets={data.buckets} delay={260} />
            <ConsistencyHeatmap heatmap={data.heatmap} delay={300} />

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
