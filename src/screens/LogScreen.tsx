import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Slider from '@react-native-community/slider'
import * as Haptics from 'expo-haptics'
import ConflictModal from '../components/log/ConflictModal'
import PrimaryButton from '../components/ui/PrimaryButton'
import { COLORS } from '../constants/theme'
import { SPORT_OPTIONS, type SportOption } from '../constants/training'
import {
  computeEstimates,
  deleteSession,
  isDistanceSport,
  logSession,
} from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import type { Conflict } from '../types/conflict'
import type { SportType } from '../types/session'
import type { LogScreenProps } from '../navigation/types'

/* --- RPE zones -------------------------------------------------------- */
const ZONE_GREEN = '#22c55e'
const ZONE_AMBER = '#f59e0b'
const ZONE_RED = '#ef4444'
const ZONE_ORANGE = '#f97316'

interface RpeZone {
  label: string
  color: string
}

function rpeZone(rpe: number): RpeZone {
  if (rpe <= 3) return { label: 'EASY ZONE', color: ZONE_GREEN }
  if (rpe <= 7) return { label: 'MODERATE ZONE', color: ZONE_AMBER }
  return { label: 'MAX EFFORT', color: ZONE_RED }
}

const RPE_DESCRIPTIONS: Record<number, string> = {
  1: 'Very easy — barely any effort',
  2: 'Very easy — barely any effort',
  3: 'Easy — comfortable conversation',
  4: 'Easy — comfortable conversation',
  5: 'Moderate — noticeable but manageable',
  6: 'Moderate — noticeable but manageable',
  7: 'Hard — pushing your pace',
  8: "Very hard — can't hold a conversation",
  9: 'Extremely hard — near maximum',
  10: 'Maximum — all-out effort',
}

/* --- Training-load severity ------------------------------------------- */
function loadSeverity(load: number): { color: string; label: string } {
  if (load > 600) return { color: ZONE_RED, label: 'Very hard session' }
  if (load >= 400) return { color: ZONE_ORANGE, label: 'Hard session' }
  if (load >= 200) return { color: ZONE_AMBER, label: 'Moderate session' }
  return { color: ZONE_GREEN, label: 'Light session' }
}

const DURATION_MAX = 300

/** Hex colour + "10% opacity" alpha suffix for soft zone tints. */
function tint(hex: string): string {
  return `${hex}1A`
}

export default function LogScreen({ route, navigation }: LogScreenProps) {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)

  // A date handed over from the Planner: pre-fill it and send the user back
  // there after saving. Parse at local noon so the calendar day never slips.
  const paramDate = route.params?.date
  const logDate = useMemo(
    () => (paramDate ? new Date(`${paramDate}T12:00:00`) : null),
    [paramDate],
  )
  const fromPlanner = logDate != null
  const bannerLabel = logDate
    ? logDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : null

  const sports = useMemo<SportOption[]>(
    () => SPORT_OPTIONS.filter((o) => profile?.sports?.includes(o.value)),
    [profile?.sports],
  )

  const [sport, setSport] = useState<SportType | null>(null)
  const [duration, setDuration] = useState('')
  const [distance, setDistance] = useState('')
  const [rpe, setRpe] = useState(5)
  const [notes, setNotes] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [avgBpm, setAvgBpm] = useState('')

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRpe = useRef(rpe)

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const durationNum = parseInt(duration, 10) || 0
  const distanceNum = distance ? parseFloat(distance) : undefined
  const avgBpmNum = avgBpm ? parseInt(avgBpm, 10) : undefined
  const showDistance = isDistanceSport(sport)
  const canSave = sport != null && durationNum >= 1 && durationNum <= DURATION_MAX

  const zone = rpeZone(rpe)

  const estimates = useMemo(() => {
    if (!sport) return null
    return computeEstimates(
      { sport, durationMinutes: durationNum, rpe, distanceKm: distanceNum },
      profile,
    )
  }, [sport, durationNum, rpe, distanceNum, profile])

  const load = estimates?.loadScore ?? 0
  const severity = loadSeverity(load)

  // Pulse the load number whenever it changes.
  const loadScale = useSharedValue(1)
  useEffect(() => {
    loadScale.value = withSequence(
      withTiming(1.08, { duration: 90 }),
      withTiming(1, { duration: 140 }),
    )
  }, [load, loadScale])
  const loadAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: loadScale.value }],
  }))

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  const resetForm = () => {
    setSport(null)
    setDuration('')
    setDistance('')
    setRpe(5)
    setNotes('')
    setAvgBpm('')
    setAdvancedOpen(false)
  }

  const handleSelectSport = (value: SportType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSport(value)
    if (!isDistanceSport(value)) setDistance('')
  }

  const handleRpeChange = (raw: number) => {
    const next = Math.round(raw)
    if (next !== lastRpe.current) {
      lastRpe.current = next
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setRpe(next)
    }
  }

  const goBackToPlannerOrReset = () => {
    if (fromPlanner) navigation.navigate('Planner')
    else resetForm()
  }

  const handleSave = async () => {
    if (!canSave || !sport || !user || !profile || saving) return
    Keyboard.dismiss()
    setSaving(true)
    try {
      const { session, conflicts: detected } = await logSession(
        user.uid,
        {
          sport,
          date: logDate ?? new Date(),
          durationMinutes: durationNum,
          rpe,
          distanceKm: showDistance ? distanceNum : undefined,
          notes: notes.trim() || undefined,
          avgBpm: avgBpmNum,
        },
        profile,
      )
      setSaving(false)

      if (detected.length > 0) {
        setSavedSessionId(session.id)
        setConflicts(detected)
        return
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      showToast(
        `Session saved! ${session.loadScore} AU · ${session.estimatedCalories} kcal`,
      )
      setTimeout(goBackToPlannerOrReset, 1000)
    } catch {
      setSaving(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showToast('Could not save session. Please try again.')
    }
  }

  const handleKeepSession = () => {
    setConflicts(null)
    setSavedSessionId(null)
    showToast('Session saved.')
    setTimeout(goBackToPlannerOrReset, 700)
  }

  const handleUndoSession = async () => {
    if (!user || !savedSessionId) return
    setUndoing(true)
    try {
      await deleteSession(user.uid, savedSessionId)
    } catch {
      // Best-effort: still close the modal so the user isn't stuck.
    } finally {
      setUndoing(false)
      setConflicts(null)
      setSavedSessionId(null)
      showToast('Session undone.')
      setTimeout(goBackToPlannerOrReset, 700)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }} edges={['top']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: COLORS.ink }}>
                Log Session
              </Text>
              <Text style={{ marginTop: 4, fontSize: 15, color: COLORS.muted }}>
                Record a workout to track your training load
              </Text>

              {bannerLabel ? (
                <View
                  style={{
                    marginTop: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: COLORS.tealSoft,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={{ fontSize: 16, marginRight: 8 }}>🗓️</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.tealDark }}>
                    Logging for {bannerLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Sport selector */}
            <SectionLabel style={{ marginTop: 24, paddingHorizontal: 20 }}>
              Sport
            </SectionLabel>
            {sports.length === 0 ? (
              <Text
                style={{
                  paddingHorizontal: 20,
                  fontSize: 14,
                  color: COLORS.muted,
                }}
              >
                No sports yet — add some in your profile to start logging.
              </Text>
            ) : (
              <FlatList
                data={sports}
                keyExtractor={(item) => item.value}
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={112}
                snapToAlignment="start"
                contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 4 }}
                renderItem={({ item }) => (
                  <SportCard
                    option={item}
                    selected={sport === item.value}
                    onPress={() => handleSelectSport(item.value)}
                  />
                )}
              />
            )}

            {/* Duration */}
            <View style={{ paddingHorizontal: 20 }}>
              <SectionLabel style={{ marginTop: 24 }}>Duration (minutes)</SectionLabel>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 96,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <Text style={{ fontSize: 44, fontWeight: '800', color: COLORS.ink }}>
                    {durationNum || 0}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.subtle, marginTop: -4 }}>
                    min
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: COLORS.border,
                    paddingHorizontal: 14,
                  }}
                >
                  <TextInput
                    value={duration}
                    onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder="e.g. 45"
                    placeholderTextColor={COLORS.subtle}
                    style={{ height: 56, fontSize: 20, color: COLORS.ink }}
                  />
                </View>
              </View>
              {durationNum > DURATION_MAX ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.danger }}>
                  Keep it under {DURATION_MAX} minutes.
                </Text>
              ) : null}
            </View>

            {/* Distance (conditional, animated) */}
            {showDistance ? (
              <Animated.View
                entering={FadeInDown.duration(200)}
                exiting={FadeOutUp.duration(160)}
                style={{ paddingHorizontal: 20 }}
              >
                <SectionLabel style={{ marginTop: 20 }}>Distance (km)</SectionLabel>
                <View
                  style={{
                    backgroundColor: COLORS.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: COLORS.border,
                    paddingHorizontal: 14,
                  }}
                >
                  <TextInput
                    value={distance}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9.]/g, '')
                      // allow only one decimal point
                      const parts = cleaned.split('.')
                      setDistance(
                        parts.length > 2
                          ? `${parts[0]}.${parts.slice(1).join('')}`
                          : cleaned,
                      )
                    }}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 5.0"
                    placeholderTextColor={COLORS.subtle}
                    style={{ height: 56, fontSize: 20, color: COLORS.ink }}
                  />
                </View>
              </Animated.View>
            ) : null}

            {/* RPE */}
            <View
              style={{
                marginTop: 24,
                marginHorizontal: 16,
                borderRadius: 16,
                backgroundColor: tint(zone.color),
                padding: 16,
              }}
            >
              <SectionLabel style={{ marginTop: 0 }}>
                Rate of Perceived Exertion (RPE)
              </SectionLabel>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    backgroundColor: zone.color,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 12,
                      fontWeight: '800',
                      letterSpacing: 0.5,
                    }}
                  >
                    {zone.label}
                  </Text>
                </View>
                <Text style={{ fontSize: 40, fontWeight: '800', color: zone.color }}>
                  {rpe}
                </Text>
              </View>

              <Slider
                style={{ width: '100%', height: 44, marginTop: 6 }}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={rpe}
                onValueChange={handleRpeChange}
                minimumTrackTintColor={zone.color}
                maximumTrackTintColor={COLORS.border}
                thumbTintColor={zone.color}
              />

              <Text style={{ fontSize: 14, color: COLORS.body, marginTop: 2 }}>
                {RPE_DESCRIPTIONS[rpe]}
              </Text>
            </View>

            {/* Training load */}
            <View
              style={{
                marginTop: 20,
                marginHorizontal: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.fieldBg,
                padding: 18,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 1,
                  color: COLORS.muted,
                }}
              >
                TRAINING LOAD
              </Text>
              <Animated.View
                style={[
                  { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
                  loadAnimStyle,
                ]}
              >
                <Text style={{ fontSize: 52, fontWeight: '800', color: COLORS.teal }}>
                  {load}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: COLORS.teal,
                    marginBottom: 9,
                    marginLeft: 6,
                  }}
                >
                  AU
                </Text>
              </Animated.View>

              <Text style={{ fontSize: 13, color: COLORS.muted }}>
                {durationNum || 0} min × RPE {rpe} = {load} AU
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: severity.color,
                    marginRight: 8,
                  }}
                />
                <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.body }}>
                  {severity.label}
                </Text>
              </View>
            </View>

            {/* Estimated stats */}
            {estimates && durationNum > 0 ? (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  flexDirection: 'row',
                  paddingHorizontal: 16,
                  marginTop: 14,
                }}
              >
                <StatCard
                  icon="🔥"
                  label="Est. Calories"
                  value={`${estimates.estimatedCalories} kcal`}
                />
                <StatCard
                  icon="❤️"
                  label="HR Zone"
                  value={`Zone ${estimates.estimatedHRZone.zone} — ${estimates.estimatedHRZone.name}`}
                />
                {showDistance && estimates.pace ? (
                  <StatCard icon="⏱️" label="Pace" value={estimates.pace} />
                ) : null}
              </Animated.View>
            ) : null}

            {/* Notes */}
            <View style={{ paddingHorizontal: 20 }}>
              <SectionLabel style={{ marginTop: 24 }}>Notes (optional)</SectionLabel>
              <View
                style={{
                  backgroundColor: COLORS.fieldBg,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: COLORS.border,
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                }}
              >
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholder="How did it feel? Any observations..."
                  placeholderTextColor={COLORS.subtle}
                  style={{
                    minHeight: 60,
                    maxHeight: 100,
                    fontSize: 16,
                    color: COLORS.ink,
                    paddingTop: 10,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            </View>

            {/* Advanced (collapsible) */}
            <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  setAdvancedOpen((v) => !v)
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.muted }}>
                  Advanced
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.subtle }}>
                  {advancedOpen ? '▲' : '▼'}
                </Text>
              </Pressable>

              {advancedOpen ? (
                <Animated.View
                  entering={FadeInDown.duration(180)}
                  exiting={FadeOutUp.duration(140)}
                >
                  <SectionLabel style={{ marginTop: 8 }}>
                    Average Heart Rate (BPM)
                  </SectionLabel>
                  <View
                    style={{
                      backgroundColor: COLORS.fieldBg,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: COLORS.border,
                      paddingHorizontal: 14,
                    }}
                  >
                    <TextInput
                      value={avgBpm}
                      onChangeText={(t) => setAvgBpm(t.replace(/[^0-9]/g, '').slice(0, 3))}
                      keyboardType="number-pad"
                      placeholder="e.g. 152"
                      placeholderTextColor={COLORS.subtle}
                      style={{ height: 52, fontSize: 16, color: COLORS.ink }}
                    />
                  </View>
                  <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.subtle }}>
                    Optional — for users with a wearable.
                  </Text>
                </Animated.View>
              ) : null}
            </View>

            {/* Save */}
            <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
              <PrimaryButton
                label="Save Session"
                onPress={handleSave}
                loading={saving}
                disabled={!canSave}
              />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Success / error toast */}
      {toast ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOut.duration(200)}
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 24,
            backgroundColor: COLORS.ink,
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 18,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          <Text
            style={{
              color: COLORS.white,
              fontSize: 14,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {toast}
          </Text>
        </Animated.View>
      ) : null}

      <ConflictModal
        visible={conflicts != null}
        conflicts={conflicts ?? []}
        undoing={undoing}
        onKeep={handleKeepSession}
        onUndo={handleUndoSession}
      />
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Sport card — horizontal selector with a scale animation on select   */
/* ------------------------------------------------------------------ */
function SportCard({
  option,
  selected,
  onPress,
}: {
  option: SportOption
  selected: boolean
  onPress: () => void
}) {
  const scale = useSharedValue(1)
  useEffect(() => {
    scale.value = withTiming(selected ? 1.05 : 1, { duration: 100 })
  }, [selected, scale])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View style={[{ marginRight: 12 }, animStyle]}>
      <Pressable
        onPress={onPress}
        style={{
          width: 100,
          height: 104,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: selected ? option.accent : COLORS.border,
          backgroundColor: selected ? option.accent : COLORS.white,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 8,
        }}
      >
        <Text style={{ fontSize: 34 }}>{option.icon}</Text>
        <Text
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: '700',
            textAlign: 'center',
            color: selected ? COLORS.white : COLORS.ink,
          }}
          numberOfLines={2}
        >
          {option.label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

/* ------------------------------------------------------------------ */
/* Estimated-stat mini card                                            */
/* ------------------------------------------------------------------ */
function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 4,
        backgroundColor: COLORS.white,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingVertical: 12,
        paddingHorizontal: 10,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 11,
          color: COLORS.subtle,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          marginTop: 2,
          fontSize: 13,
          fontWeight: '700',
          color: COLORS.ink,
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Section label                                                       */
/* ------------------------------------------------------------------ */
function SectionLabel({
  children,
  style,
}: {
  children: ReactNode
  style?: object
}) {
  return (
    <Text
      style={[
        {
          fontSize: 13,
          fontWeight: '700',
          color: COLORS.body,
          marginBottom: 10,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}
