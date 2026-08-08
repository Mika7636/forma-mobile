// Weekly Planner — the whole training week on one surface. Swipe (or tap the
// arrows) to move between weeks, tap a chip to open its detail sheet, swipe a
// chip to delete, and tap any day's "+ Add Session" to log straight onto it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeIn,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import DayCard from '../components/planner/DayCard'
import SessionDetailModal from '../components/session/SessionDetailModal'
import { COLORS } from '../constants/theme'
import { DEFAULT_BUDGET_HOURS } from '../constants/training'
import { useWeeklyPlan, type PlannerDay } from '../hooks/useWeeklyPlan'
import { deleteSession, resolveConflict } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { localISODate } from '../utils/dates'
import type { Conflict } from '../types/conflict'
import type { Session } from '../types/session'
import type { PlannerScreenProps } from '../navigation/types'

/** Horizontal drag needed to commit a week change. */
const SWIPE_THRESHOLD = 80
/** How far the day list slides during a week transition. */
const SLIDE_DISTANCE = 70

/** "Jul 21 – 27, 2026", collapsing the repeated month/year where it can. */
function formatRange(start: Date, end: Date): string {
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' })
  if (start.getFullYear() !== end.getFullYear()) {
    return `${month(start)} ${start.getDate()}, ${start.getFullYear()} – ${month(end)} ${end.getDate()}, ${end.getFullYear()}`
  }
  const tail = `${end.getDate()}, ${end.getFullYear()}`
  return start.getMonth() === end.getMonth()
    ? `${month(start)} ${start.getDate()} – ${tail}`
    : `${month(start)} ${start.getDate()} – ${month(end)} ${tail}`
}

function budgetColor(ratio: number): string {
  if (ratio > 1) return COLORS.danger
  if (ratio >= 0.8) return '#F59E0B'
  return COLORS.teal
}

export default function PlannerScreen({ navigation }: PlannerScreenProps) {
  const uid = useAuthStore((s) => s.user?.uid)
  const budgetHours = useAuthStore((s) => s.profile?.weeklyBudgetHours) ?? DEFAULT_BUDGET_HOURS

  const [weekOffset, setWeekOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Session | null>(null)
  const [conflictSheet, setConflictSheet] = useState<Conflict[] | null>(null)

  const plan = useWeeklyPlan(weekOffset)
  const { days, weekStart, weekEnd, totalHours, totalLoad, totalCalories, sessionCount } = plan

  // Flattened week sessions, so the conflict detail sheet can resolve the two
  // sessions each conflict involves.
  const weekSessions = useMemo(() => days.flatMap((d) => d.sessions), [days])

  const scrollRef = useRef<ScrollView>(null)
  const dayOffsets = useRef<Record<string, number>>({})
  const scrolledToToday = useRef(false)

  const translateX = useSharedValue(0)
  const opacity = useSharedValue(1)

  /**
   * Move to `next` week, sliding the day list out in the direction of travel and
   * back in from the opposite edge. The offset state flips at the midpoint so
   * the new week is what slides in.
   */
  const goToWeek = useCallback(
    (next: number) => {
      if (next === weekOffset) return
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const forward = next > weekOffset
      const exitTo = forward ? -SLIDE_DISTANCE : SLIDE_DISTANCE

      opacity.value = withTiming(0, { duration: 110 })
      translateX.value = withTiming(exitTo, { duration: 110 }, (finished) => {
        if (!finished) return
        runOnJS(setWeekOffset)(next)
        translateX.value = -exitTo
        translateX.value = withTiming(0, { duration: 200 })
        opacity.value = withTiming(1, { duration: 200 })
      })
    },
    [weekOffset, opacity, translateX],
  )

  // Week swipe. Constrained to clearly-horizontal drags so the vertical
  // ScrollView keeps its own gestures; a chip's own (lower-threshold) pan
  // activates first and cancels this one, so swipe-to-delete still wins.
  const weekSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-25, 25])
        .failOffsetY([-16, 16])
        .onEnd((e) => {
          if (e.translationX <= -SWIPE_THRESHOLD) runOnJS(goToWeek)(weekOffset + 1)
          else if (e.translationX >= SWIPE_THRESHOLD) runOnJS(goToWeek)(weekOffset - 1)
        }),
    [goToWeek, weekOffset],
  )

  const listStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }))

  const handleRefresh = async () => {
    setRefreshing(true)
    await plan.refresh()
    setRefreshing(false)
  }

  const handleDelete = useCallback(
    async (session: Session) => {
      if (!uid) return
      await deleteSession(uid, session.id)
    },
    [uid],
  )

  const openLogFor = useCallback(
    (isoDate: string) => {
      navigation.navigate('Log', { date: isoDate })
    },
    [navigation],
  )

  const handleAddSession = useCallback(
    (day: PlannerDay) => openLogFor(day.isoDate),
    [openLogFor],
  )

  /**
   * Put today's card in view. Skipped on an empty week — there's nothing to
   * scroll past, and scrolling would only clip the empty-state card.
   */
  const scrollToToday = useCallback(
    (animated: boolean) => {
      const y = dayOffsets.current[localISODate(new Date())]
      if (y == null || sessionCount === 0) return false
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated })
      return true
    },
    [sessionCount],
  )

  // Bring today into view the first time the current week finishes laying out,
  // so a mid-week user isn't looking at Monday.
  const handleDayLayout = (isoDate: string, y: number) => {
    dayOffsets.current[isoDate] = y
    if (scrolledToToday.current || weekOffset !== 0) return
    if (isoDate !== localISODate(new Date())) return
    requestAnimationFrame(() => {
      if (scrollToToday(true)) scrolledToToday.current = true
    })
  }

  // Every week change starts at the top — carrying the previous week's scroll
  // offset over drops the user into the middle of a week they haven't seen.
  // Coming back to the current week re-centres on today instead.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    scrolledToToday.current = false
    scrollRef.current?.scrollTo({ y: 0, animated: false })
    if (weekOffset === 0 && scrollToToday(false)) scrolledToToday.current = true
    // scrollToToday is intentionally excluded: it changes with sessionCount,
    // and a snapshot landing mid-week shouldn't yank the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  const ratio = budgetHours > 0 ? totalHours / budgetHours : 0
  const barColor = budgetColor(ratio)
  const isCurrentWeek = weekOffset === 0
  const isPastWeek = weekOffset < 0
  const weekIsEmpty = !plan.loading && sessionCount === 0

  // A week that empties out (last session deleted) would otherwise leave the
  // list scrolled past the empty-state card it just revealed.
  useEffect(() => {
    if (weekIsEmpty) scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [weekIsEmpty])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.fieldBg }} edges={['top']}>
      <StatusBar style="dark" />

      <GestureDetector gesture={weekSwipe}>
        <View style={{ flex: 1 }}>
          {/* --- Sticky week header ------------------------------------- */}
          <View
            style={{
              backgroundColor: COLORS.white,
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
            }}
          >
            <Animated.Text
              key={weekOffset}
              entering={FadeIn.duration(220)}
              style={{ fontSize: 24, fontWeight: '800', color: COLORS.ink }}
            >
              {formatRange(weekStart, weekEnd)}
            </Animated.Text>

            {/* Nav row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <ArrowButton label="‹" onPress={() => goToWeek(weekOffset - 1)} />
              <Pressable
                onPress={() => {
                  if (isCurrentWeek) return
                  goToWeek(0)
                }}
                style={{
                  marginHorizontal: 10,
                  paddingHorizontal: 18,
                  height: 34,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isCurrentWeek ? COLORS.teal : COLORS.white,
                  borderWidth: 1.5,
                  borderColor: isCurrentWeek ? COLORS.teal : COLORS.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: isCurrentWeek ? COLORS.white : COLORS.muted,
                  }}
                >
                  Today
                </Text>
              </Pressable>
              <ArrowButton label="›" onPress={() => goToWeek(weekOffset + 1)} />

              <View style={{ flex: 1 }} />

              <Text style={{ fontSize: 12, color: COLORS.subtle }}>
                {sessionCount} session{sessionCount === 1 ? '' : 's'}
              </Text>
            </View>

            {/* Budget bar */}
            <View style={{ marginTop: 14 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.body }}>
                  {totalHours.toFixed(1)} / {budgetHours}h budget
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.muted }}>
                  {totalLoad} AU · {totalCalories} kcal
                </Text>
              </View>
              <View
                style={{
                  marginTop: 6,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: COLORS.border,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.min(100, Math.round(ratio * 100))}%`,
                    height: '100%',
                    borderRadius: 999,
                    backgroundColor: barColor,
                  }}
                />
              </View>
            </View>
          </View>

          {/* --- Day list ------------------------------------------------ */}
          <Animated.View style={[{ flex: 1 }, listStyle]}>
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={COLORS.teal}
                  colors={[COLORS.teal]}
                />
              }
            >
              {weekIsEmpty ? (
                <EmptyWeek
                  isPastWeek={isPastWeek}
                  onPlan={() => openLogFor(localISODate(new Date()))}
                />
              ) : null}

              {days.map((day, i) => (
                <Animated.View
                  key={day.isoDate}
                  entering={FadeInDown.delay(i * 50).duration(280)}
                  onLayout={(e) => handleDayLayout(day.isoDate, e.nativeEvent.layout.y)}
                >
                  <DayCard
                    day={day}
                    onSessionPress={setSelected}
                    onSessionDelete={handleDelete}
                    onAddSession={handleAddSession}
                    onConflictPress={setConflictSheet}
                  />
                </Animated.View>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Floating "log something right now" button — always today's date, in
          contrast to a day card's date-specific "+ Add Session". */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          openLogFor(localISODate(new Date()))
        }}
        accessibilityLabel="Log a session today"
        style={{
          position: 'absolute',
          right: 20,
          bottom: 24,
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: COLORS.teal,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          elevation: 8,
        }}
      >
        <Text style={{ fontSize: 30, fontWeight: '300', color: COLORS.white, marginTop: -3 }}>
          +
        </Text>
      </Pressable>

      <SessionDetailModal
        visible={selected != null}
        session={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => setSelected(null)}
      />

      <ConflictDetailSheet
        conflicts={conflictSheet}
        sessions={weekSessions}
        onClose={() => setConflictSheet(null)}
        onDismiss={(id) => {
          if (uid) void resolveConflict(uid, id)
          setConflictSheet(null)
        }}
      />
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Week navigation arrow                                               */
/* ------------------------------------------------------------------ */
function ArrowButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label === '‹' ? 'Previous week' : 'Next week'}
      style={{
        width: 36,
        height: 34,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.white,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: '700', color: COLORS.body, marginTop: -3 }}>
        {label}
      </Text>
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Empty week                                                          */
/* ------------------------------------------------------------------ */
function EmptyWeek({ isPastWeek, onPlan }: { isPastWeek: boolean; onPlan: () => void }) {
  // A past week with nothing in it is just history — state it quietly. An
  // upcoming or current one is an invitation.
  if (isPastWeek) {
    return (
      <View
        style={{
          alignItems: 'center',
          paddingVertical: 18,
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 14, color: COLORS.subtle }}>
          Rest week — no sessions logged
        </Text>
      </View>
    )
  }

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      style={{
        backgroundColor: COLORS.white,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingVertical: 26,
        paddingHorizontal: 20,
        alignItems: 'center',
        marginBottom: 14,
      }}
    >
      <Text style={{ fontSize: 34 }}>🗓️</Text>
      <Text style={{ marginTop: 10, fontSize: 19, fontWeight: '800', color: COLORS.ink }}>
        Your week is wide open
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 14,
          color: COLORS.muted,
          textAlign: 'center',
        }}
      >
        Tap any day to plan your first session
      </Text>
      <Pressable
        onPress={onPlan}
        style={{
          marginTop: 18,
          height: 48,
          paddingHorizontal: 28,
          borderRadius: 12,
          backgroundColor: COLORS.teal,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.white }}>
          Plan a Session
        </Text>
      </Pressable>
    </Animated.View>
  )
}

