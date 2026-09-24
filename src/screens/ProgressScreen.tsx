// Progress analytics.

import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import AdvancedSection from '../components/progress/AdvancedSection'
import BuildingBaselineBlock from '../components/progress/BuildingBaselineBlock'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import ConflictTimeline from '../components/progress/ConflictTimeline'
import FitnessChart from '../components/progress/FitnessChart'
import ProgressPrimer from '../components/progress/ProgressPrimer'
import ProgressSkeleton from '../components/progress/ProgressSkeleton'
import SportBalance from '../components/progress/SportBalance'
import SportFilterChips from '../components/progress/SportFilterChips'
import ThisWeekBlock from '../components/progress/ThisWeekBlock'
import TrainingConsistency from '../components/progress/TrainingConsistency'
import TrainingLoadChart from '../components/progress/TrainingLoadChart'
import TrendRangeTabs from '../components/progress/TrendRangeTabs'
import { useConflictHistory } from '../hooks/useConflictHistory'
import { useProgressData } from '../hooks/useProgressData'
import { useSessionHistory } from '../hooks/useSessionHistory'
import {
  PROGRESS_UNLOCK_SESSIONS,
  getBaselineState,
  type BaselineState,
} from '../utils/calibration'
import { detectedAtDate } from '../utils/conflictInfo'
import { haptics } from '../utils/haptics'
import type { Conflict } from '../types/conflict'
import type { Granularity, SportFilter } from '../utils/progressMetrics'
import type { ProgressScreenProps } from '../navigation/types'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { useTabContentPadding } from '../hooks/useTabContentPadding'

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
  const tabPadding = useTabContentPadding()

  const [sport, setSport] = useState<SportFilter>('all')
  const [granularity, setGranularity] = useState<Granularity>('weekly')
  const { data, totalSessions, loading, refresh } = useProgressData(sport)
  const [refreshing, setRefreshing] = useState(false)

  const { conflicts: allConflicts } = useConflictHistory()
  const { sessions, trainingDays, totalSessions: loggedSessions } = useSessionHistory()
  const baseline = getBaselineState({ trainingDays, sessionsLogged: loggedSessions })
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

  if (!loading && totalSessions < PROGRESS_UNLOCK_SESSIONS) {
    return <ProgressPrimer logged={totalSessions} onLogSession={goToLog} />
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

            {baseline.building ? (
              <SettlingRangeNote baseline={baseline} />
            ) : null}

            <TrendRangeTabs value={granularity} onChange={setGranularity} />

            <TrainingLoadChart
              series={data.trends[granularity]}
              model={granularity === 'weekly' && !baseline.building ? data.model : null}
            />

            <TrainingConsistency weeks={data.weeks} streak={data.streak} />

            <SportBalance sports={data.sports} />

            <ConflictTimeline
              weeks={data.weeks}
              conflicts={rangeConflicts}
              onOpenConflict={setOpenConflicts}
            />

            <AdvancedSection
              title="Advanced — training model"
              subtitle="Fitness, Fatigue and Form, the way the engine sees them"
            >
              {baseline.building ? (
                <BuildingBaselineBlock baseline={baseline} />
              ) : (
                <FitnessChart daily={data.daily} />
              )}
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

function SettlingRangeNote({ baseline }: { baseline: BaselineState }) {
  const { colors } = useTheme()
  const { daysCovered, target } = baseline

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.sm + 2,
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.md,
        backgroundColor: colors.infoSoft,
        borderWidth: 1,
        borderColor: colors.infoBorder,
      }}
    >
      <Text style={{ fontSize: TYPE.body }}>🌱</Text>
      <Text
        style={{
          flex: 1,
          marginLeft: SPACING.sm,
          fontSize: TYPE.small,
          lineHeight: 18,
          color: colors.textBody,
        }}
      >
        <Text style={{ fontWeight: WEIGHT.heavy, color: colors.infoText }}>
          Your range is still settling
        </Text>{' '}
        — {daysCovered} of {target} training days. The bars are your real training; the
        band they&apos;re measured against will shift as FORMA learns what you absorb.
      </Text>
    </View>
  )
}
