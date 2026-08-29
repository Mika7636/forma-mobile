// Progress Analytics — the screen where the sports-science becomes a picture:
// Fitness building, Fatigue spiking, Form recovering, plus where the effort went
// and how consistent the week-to-week ramp has been. All charts share one
// 4/8/12-week window chosen at the top.
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import CalorieChart from '../components/progress/CalorieChart'
import ConsistencyHeatmap from '../components/progress/ConsistencyHeatmap'
import DateRangeSelector, { type RangeWeeks } from '../components/progress/DateRangeSelector'
import FitnessChart from '../components/progress/FitnessChart'
import ProgressSkeleton from '../components/progress/ProgressSkeleton'
import ProgressStats from '../components/progress/ProgressStats'
import SportChart from '../components/progress/SportChart'
import WeeklyLoadChart from '../components/progress/WeeklyLoadChart'
import EmptyState from '../components/ui/EmptyState'
import { useProgressData } from '../hooks/useProgressData'
import { PROGRESS_UNLOCK_SESSIONS } from '../utils/calibration'
import { haptics } from '../utils/haptics'
import type { ProgressScreenProps } from '../navigation/types'
import { SPACING, TYPE } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { useTabContentPadding } from '../hooks/useTabContentPadding'

/** "Jun 2 – Aug 8" for the header subtitle. */
function formatRange(start: Date, end: Date): string {
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' })
  const tail = `${end.getDate()}`
  return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    ? `${month(start)} ${start.getDate()} – ${tail}`
    : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`
}

export default function ProgressScreen({ navigation }: ProgressScreenProps) {
  const { colors } = useTheme()
  // Reserve room for the tab bar, which is drawn over the end of this list.
  const tabPadding = useTabContentPadding()

  const [weeks, setWeeks] = useState<RangeWeeks>(8)
  const { data, totalSessions, loading, refresh } = useProgressData(weeks)
  const [refreshing, setRefreshing] = useState(false)

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
        contentContainerStyle={{ padding: SPACING.base, paddingBottom: tabPadding, gap: SPACING.base }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* Header */}
        <View>
          <Text style={{ fontSize: TYPE.display, fontWeight: '800', color: colors.text }}>
            Progress
          </Text>
          <Text style={{ marginTop: 2, fontSize: TYPE.body, color: colors.textMuted }}>
            {formatRange(data.rangeStart, data.rangeEnd)} · last {weeks} weeks
          </Text>
        </View>

        <DateRangeSelector value={weeks} onChange={setWeeks} />

        {loading ? (
          <ProgressSkeleton />
        ) : (
          <>
            <ProgressStats stats={data.stats} />
            <FitnessChart daily={data.daily} delay={60} />
            <SportChart sports={data.sports} delay={100} />
            <WeeklyLoadChart weekly={data.weekly} delay={140} />
            <CalorieChart weekly={data.weekly} delay={180} />
            <ConsistencyHeatmap heatmap={data.heatmap} delay={220} />
          </>
        )}
      </ScrollView>
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
          emoji="📈"
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
