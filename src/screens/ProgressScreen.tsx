// Progress Analytics — the screen where the sports-science becomes a picture:
// Fitness building, Fatigue spiking, Form recovering, plus where the effort went
// and how consistent the week-to-week ramp has been. All charts share one
// 4/8/12-week window chosen at the top.
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeIn } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import CalorieChart from '../components/progress/CalorieChart'
import ConsistencyHeatmap from '../components/progress/ConsistencyHeatmap'
import DateRangeSelector, { type RangeWeeks } from '../components/progress/DateRangeSelector'
import FitnessChart from '../components/progress/FitnessChart'
import ProgressSkeleton from '../components/progress/ProgressSkeleton'
import ProgressStats from '../components/progress/ProgressStats'
import SportChart from '../components/progress/SportChart'
import WeeklyLoadChart from '../components/progress/WeeklyLoadChart'
import PrimaryButton from '../components/ui/PrimaryButton'
import { COLORS } from '../constants/theme'
import { useProgressData } from '../hooks/useProgressData'
import { PROGRESS_UNLOCK_SESSIONS } from '../utils/calibration'
import type { ProgressScreenProps } from '../navigation/types'

/** Warm off-white page background — a touch softer than the field grey. */
const PAGE_BG = '#FAFAF8'

/** "Jun 2 – Aug 8" for the header subtitle. */
function formatRange(start: Date, end: Date): string {
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' })
  const tail = `${end.getDate()}`
  return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    ? `${month(start)} ${start.getDate()} – ${tail}`
    : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`
}

export default function ProgressScreen({ navigation }: ProgressScreenProps) {
  const [weeks, setWeeks] = useState<RangeWeeks>(8)
  const { data, totalSessions, loading, refresh } = useProgressData(weeks)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  const goToLog = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    navigation.navigate('Log')
  }, [navigation])

  // Sparse data makes trend charts misleading, so keep the cold-start guard until
  // there's enough history to say something honest. Only after the first snapshot
  // (so we never flash the guard over data that's about to load).
  if (!loading && totalSessions < PROGRESS_UNLOCK_SESSIONS) {
    return <ProgressLockedGuard logged={totalSessions} onLogSession={goToLog} />
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.teal} colors={[COLORS.teal]} />
        }
      >
        {/* Header */}
        <View>
          <Text style={{ fontSize: 30, fontWeight: '800', color: COLORS.ink }}>Progress</Text>
          <Text style={{ marginTop: 2, fontSize: 14, color: COLORS.muted }}>
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
  const target = PROGRESS_UNLOCK_SESSIONS
  const fraction = Math.max(0, Math.min(logged / target, 1))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }} edges={['top']}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Animated.View
          entering={FadeIn.duration(300)}
          style={{
            alignItems: 'center',
            backgroundColor: COLORS.white,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingVertical: 40,
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: COLORS.tealSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 40 }}>📈</Text>
          </View>

          <Text style={{ marginTop: 18, fontSize: 22, fontWeight: '800', color: COLORS.ink }}>
            Keep logging!
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 14,
              lineHeight: 20,
              color: COLORS.muted,
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            Progress charts unlock after {target} sessions, once there&apos;s enough history to
            show a meaningful trend.
          </Text>

          <View style={{ marginTop: 22, alignSelf: 'stretch' }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: COLORS.body,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              {logged} of {target} sessions
            </Text>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: COLORS.border, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${fraction * 100}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: COLORS.teal,
                }}
              />
            </View>
          </View>

          <View style={{ marginTop: 22, alignSelf: 'stretch' }}>
            <PrimaryButton label="Log a Session" onPress={onLogSession} />
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}
