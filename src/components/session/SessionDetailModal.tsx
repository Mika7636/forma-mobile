import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import Slider from '@react-native-community/slider'
import Reanimated, { FadeIn } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import RouteMap from './RouteMap'
import PrimaryButton from '../ui/PrimaryButton'
import { COLORS } from '../../constants/theme'
import { SPORT_OPTIONS } from '../../constants/training'
import { hrZoneColor } from '../../algorithms/heartRate'
import {
  computeEstimates,
  deleteSession,
  isDistanceSport,
  updateSession,
} from '../../services/sessionService'
import { useAuthStore } from '../../store/authStore'
import { useSessionHistory } from '../../hooks/useSessionHistory'
import { CALIBRATION_SESSION_TARGET } from '../../utils/calibration'
import { SPORT_META } from '../../utils/sportMeta'
import type { Session, SportType } from '../../types/session'

const SHEET_HEIGHT = Math.round(Dimensions.get('window').height * 0.9)
const DISMISS_THRESHOLD = 120

interface SessionDetailModalProps {
  visible: boolean
  session: Session | null
  onClose: () => void
  /** Called after a successful delete so the host can toast + refresh. */
  onDeleted?: () => void
  /** Called after a successful edit save (host may toast). */
  onUpdated?: (session: Session) => void
}

function rpeColor(rpe: number): string {
  if (rpe <= 3) return '#22c55e'
  if (rpe <= 7) return '#f59e0b'
  return '#ef4444'
}

/**
 * Full-screen, swipe-to-dismiss detail sheet for a single session. Opens from
 * anywhere a session is tapped (dashboard recent activity today, planner chips
 * later). View mode shows every derived stat + the route; Edit mode turns the
 * inputs editable and recomputes load/calories/zone/pace live before saving.
 */
export default function SessionDetailModal({
  visible,
  session,
  onClose,
  onDeleted,
  onUpdated,
}: SessionDetailModalProps) {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const { sessions } = useSessionHistory()

  const [current, setCurrent] = useState<Session | null>(session)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Edit-form state.
  const [sport, setSport] = useState<SportType>('running')
  const [date, setDate] = useState<Date>(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [duration, setDuration] = useState('')
  const [rpe, setRpe] = useState(5)
  const [distance, setDistance] = useState('')
  const [notes, setNotes] = useState('')
  const [avgBpm, setAvgBpm] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const translateY = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed everything from the tapped session whenever it (re)opens.
  useEffect(() => {
    if (!visible || !session) return
    setCurrent(session)
    setMode('view')
    seedForm(session)
    translateY.setValue(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, session?.id])

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  function seedForm(s: Session) {
    setSport(s.sport)
    setDate(new Date(s.date))
    setDuration(String(s.durationMinutes))
    setRpe(s.rpe)
    setDistance(s.distanceKm != null ? String(s.distanceKm) : '')
    setNotes(s.notes ?? '')
    setAvgBpm(s.avgBpm != null ? String(s.avgBpm) : '')
    setAdvancedOpen(s.avgBpm != null)
  }

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  // Drag-to-dismiss, wired only to the grab handle so the ScrollView keeps its
  // own vertical gestures.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) translateY.setValue(g.dy)
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > DISMISS_THRESHOLD) {
            Animated.timing(translateY, {
              toValue: SHEET_HEIGHT,
              duration: 180,
              useNativeDriver: true,
            }).start(onClose)
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 4,
            }).start()
          }
        },
      }),
    [translateY, onClose],
  )

  const durationNum = parseInt(duration, 10) || 0
  const distanceNum = distance ? parseFloat(distance) : undefined
  const avgBpmNum = avgBpm ? parseInt(avgBpm, 10) : undefined
  const editShowsDistance = isDistanceSport(sport)
  const canSave = durationNum >= 1 && durationNum <= 300

  // Live recompute in edit mode — mirrors the Log screen preview.
  const liveEstimates = useMemo(() => {
    if (mode !== 'edit') return null
    return computeEstimates(
      { sport, durationMinutes: durationNum, rpe, distanceKm: distanceNum },
      profile,
    )
  }, [mode, sport, durationNum, rpe, distanceNum, profile])

  const profileSports = useMemo<SportType[]>(() => {
    const list = profile?.sports ?? []
    // Always include the session's own sport even if it's since been removed
    // from the profile, so editing never silently drops it.
    return list.includes(sport) ? list : [sport, ...list]
  }, [profile?.sports, sport])

  const handleEdit = () => {
    if (!current) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    seedForm(current)
    setMode('edit')
  }

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setMode('view')
  }

  const handleSave = async () => {
    if (!user || !profile || !current || !canSave || saving) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSaving(true)
    try {
      const { session: updated } = await updateSession(
        user.uid,
        current,
        {
          sport,
          date,
          durationMinutes: durationNum,
          rpe,
          distanceKm: editShowsDistance ? distanceNum : undefined,
          notes: notes.trim() || undefined,
          avgBpm: avgBpmNum,
        },
        profile,
        { calibrating: sessions.length < CALIBRATION_SESSION_TARGET },
      )
      setCurrent(updated)
      setMode('view')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      showToast('Session updated')
      onUpdated?.(updated)
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showToast('Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!user || !current) return
    const meta = SPORT_META[current.sport]
    const dateLabel = new Date(current.date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    Alert.alert(
      'Delete Session?',
      `This will permanently remove this ${meta?.label ?? current.sport} session from ${dateLabel}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await deleteSession(user.uid, current.id)
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
              onDeleted?.()
              onClose()
            } catch {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
              showToast('Could not delete session')
            } finally {
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  const data = current
  if (!data) {
    // Nothing to show yet; keep the Modal mounted so open/close still animates.
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} />
  }

  const meta = SPORT_META[data.sport] ?? { label: data.sport, icon: '🏅', color: COLORS.muted }
  const d = new Date(data.date)
  const dateLine = `${d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  const hasRoute = Array.isArray(data.routeCoordinates) && data.routeCoordinates.length > 1
  const isDistance = isDistanceSport(data.sport)
  const paceValue =
    data.averageSpeed != null
      ? `${data.averageSpeed.toFixed(1)} km/h`
      : data.averagePace ?? data.pace ?? null

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Dim backdrop — tap to dismiss. */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.55)' }}
      />

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: SHEET_HEIGHT,
          backgroundColor: COLORS.white,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          transform: [{ translateY }],
          overflow: 'hidden',
        }}
      >
        {/* Grab handle + close (the drag zone). */}
        <View {...panResponder.panHandlers} style={{ paddingTop: 10 }}>
          <View
            style={{
              alignSelf: 'center',
              width: 44,
              height: 5,
              borderRadius: 999,
              backgroundColor: COLORS.border,
            }}
          />
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={{ position: 'absolute', top: 10, right: 16, padding: 4 }}
          >
            <Text style={{ fontSize: 22, color: COLORS.subtle, fontWeight: '600' }}>✕</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: `${meta.color}1A`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                }}
              >
                <Text style={{ fontSize: 30 }}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.ink }}>
                  {meta.label}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <Text style={{ fontSize: 13.5, color: COLORS.muted }}>{dateLine}</Text>
                  {data.trackingMode === 'live' ? (
                    <Text style={{ fontSize: 12, marginLeft: 6 }} accessibilityLabel="GPS tracked">
                      📍
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            {mode === 'view' ? (
              <ViewMode
                session={data}
                meta={meta}
                isDistance={isDistance}
                paceValue={paceValue}
                hasRoute={hasRoute}
                onEdit={handleEdit}
                onDelete={handleDelete}
                deleting={deleting}
              />
            ) : (
              <EditMode
                sport={sport}
                setSport={setSport}
                profileSports={profileSports}
                date={date}
                onOpenDatePicker={() => setShowDatePicker(true)}
                duration={duration}
                setDuration={setDuration}
                rpe={rpe}
                setRpe={setRpe}
                distance={distance}
                setDistance={setDistance}
                showDistance={editShowsDistance}
                notes={notes}
                setNotes={setNotes}
                avgBpm={avgBpm}
                setAvgBpm={setAvgBpm}
                advancedOpen={advancedOpen}
                setAdvancedOpen={setAdvancedOpen}
                estimates={liveEstimates}
                canSave={canSave}
                saving={saving}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {showDatePicker ? (
          <DateTimePicker
            value={date}
            mode="date"
            maximumDate={new Date()}
            onChange={(_e, picked) => {
              setShowDatePicker(false)
              if (picked) {
                // Preserve the original time-of-day; only the calendar day moves.
                const next = new Date(picked)
                next.setHours(date.getHours(), date.getMinutes(), 0, 0)
                setDate(next)
              }
            }}
          />
        ) : null}

        {toast ? (
          <Reanimated.View
            entering={FadeIn.duration(180)}
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 24,
              backgroundColor: COLORS.ink,
              borderRadius: 14,
              paddingVertical: 13,
              paddingHorizontal: 18,
            }}
          >
            <Text
              style={{ color: COLORS.white, fontSize: 14, fontWeight: '700', textAlign: 'center' }}
            >
              {toast}
            </Text>
          </Reanimated.View>
        ) : null}
      </Animated.View>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* View mode                                                           */
/* ------------------------------------------------------------------ */
function ViewMode({
  session,
  isDistance,
  paceValue,
  hasRoute,
  onEdit,
  onDelete,
  deleting,
}: {
  session: Session
  meta: { label: string; icon: string; color: string }
  isDistance: boolean
  paceValue: string | null
  hasRoute: boolean
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const zone = session.estimatedHRZone
  return (
    <View>
      {/* Route map */}
      {hasRoute ? (
        <View style={{ marginTop: 18 }}>
          <RouteMap coordinates={session.routeCoordinates!} height={200} showMarkers />
        </View>
      ) : null}

      {/* Stat grid */}
      <View
        style={{
          marginTop: 18,
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <StatTile icon="⏱️" label="Duration" value={`${session.durationMinutes} min`} />
        <StatTile
          icon="💪"
          label="RPE"
          value={`${session.rpe} / 10`}
          badge={{ text: `Z${zone?.zone ?? '—'}`, color: rpeColor(session.rpe) }}
        />
        <StatTile icon="⚡" label="Training Load" value={`${session.loadScore} AU`} />
        {session.estimatedCalories != null ? (
          <StatTile icon="🔥" label="Calories" value={`${session.estimatedCalories} kcal`} />
        ) : null}
        {zone ? (
          <StatTile
            icon="❤️"
            label="HR Zone"
            value={`Zone ${zone.zone} — ${zone.name}`}
            sub={zone.hrRange}
            badgeBar={hrZoneColor(zone.zone)}
          />
        ) : null}
        {isDistance && paceValue ? (
          <StatTile icon="⏱️" label="Pace" value={paceValue} />
        ) : null}
        {isDistance && session.distanceKm != null ? (
          <StatTile icon="📏" label="Distance" value={`${session.distanceKm} km`} />
        ) : null}
        {session.avgBpm != null ? (
          <StatTile icon="💓" label="Avg BPM" value={`${session.avgBpm} bpm`} />
        ) : null}
      </View>

      {/* Notes */}
      {session.notes ? (
        <View
          style={{
            marginTop: 16,
            backgroundColor: COLORS.fieldBg,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 14,
          }}
        >
          <Text
            style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: COLORS.muted }}
          >
            NOTES
          </Text>
          <Text style={{ marginTop: 6, fontSize: 15, color: COLORS.body, lineHeight: 21 }}>
            {session.notes}
          </Text>
        </View>
      ) : null}

      {/* Actions */}
      <View style={{ marginTop: 24 }}>
        <PrimaryButton label="Edit" onPress={onEdit} />
        <Pressable
          onPress={onDelete}
          disabled={deleting}
          style={{
            height: 52,
            borderRadius: 12,
            marginTop: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: COLORS.danger,
            backgroundColor: COLORS.white,
          }}
        >
          {deleting ? (
            <ActivityIndicator color={COLORS.danger} />
          ) : (
            <Text style={{ color: COLORS.danger, fontSize: 16, fontWeight: '700' }}>Delete</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

function StatTile({
  icon,
  label,
  value,
  sub,
  badge,
  badgeBar,
}: {
  icon: string
  label: string
  value: string
  sub?: string
  badge?: { text: string; color: string }
  badgeBar?: string
}) {
  return (
    <View
      style={{
        width: '48%',
        backgroundColor: COLORS.white,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderLeftWidth: badgeBar ? 4 : 1,
        borderLeftColor: badgeBar ?? COLORS.border,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, marginRight: 6 }}>{icon}</Text>
        <Text
          style={{ fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.3 }}
        >
          {label.toUpperCase()}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.ink }} numberOfLines={1}>
          {value}
        </Text>
        {badge ? (
          <View
            style={{
              marginLeft: 8,
              backgroundColor: badge.color,
              borderRadius: 999,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.white }}>
              {badge.text}
            </Text>
          </View>
        ) : null}
      </View>
      {sub ? (
        <Text style={{ marginTop: 2, fontSize: 11.5, color: COLORS.subtle }}>{sub}</Text>
      ) : null}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Edit mode                                                           */
/* ------------------------------------------------------------------ */
function EditMode({
  sport,
  setSport,
  profileSports,
  date,
  onOpenDatePicker,
  duration,
  setDuration,
  rpe,
  setRpe,
  distance,
  setDistance,
  showDistance,
  notes,
  setNotes,
  avgBpm,
  setAvgBpm,
  advancedOpen,
  setAdvancedOpen,
  estimates,
  canSave,
  saving,
  onSave,
  onCancel,
}: {
  sport: SportType
  setSport: (s: SportType) => void
  profileSports: SportType[]
  date: Date
  onOpenDatePicker: () => void
  duration: string
  setDuration: (v: string) => void
  rpe: number
  setRpe: (v: number) => void
  distance: string
  setDistance: (v: string) => void
  showDistance: boolean
  notes: string
  setNotes: (v: string) => void
  avgBpm: string
  setAvgBpm: (v: string) => void
  advancedOpen: boolean
  setAdvancedOpen: (v: boolean) => void
  estimates: ReturnType<typeof computeEstimates> | null
  canSave: boolean
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const zoneCol = rpeColor(rpe)
  return (
    <Reanimated.View entering={FadeIn.duration(200)} style={{ marginTop: 18 }}>
      {/* Sport selector */}
      <FieldLabel>Sport</FieldLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 2 }}
      >
        {profileSports.map((value) => {
          const opt = SPORT_OPTIONS.find((o) => o.value === value)
          const selected = sport === value
          return (
            <Pressable
              key={value}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setSport(value)
              }}
              style={{
                width: 82,
                height: 84,
                borderRadius: 14,
                borderWidth: 2,
                borderColor: selected ? opt?.accent ?? COLORS.teal : COLORS.border,
                backgroundColor: selected ? opt?.accent ?? COLORS.teal : COLORS.white,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Text style={{ fontSize: 26 }}>{opt?.icon ?? '🏅'}</Text>
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  fontWeight: '700',
                  textAlign: 'center',
                  color: selected ? COLORS.white : COLORS.ink,
                }}
                numberOfLines={1}
              >
                {opt?.label ?? value}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Date */}
      <FieldLabel style={{ marginTop: 18 }}>Date</FieldLabel>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onOpenDatePicker()
        }}
        style={{
          backgroundColor: COLORS.fieldBg,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: COLORS.border,
          paddingHorizontal: 14,
          height: 52,
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16, color: COLORS.ink }}>
          {date.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
      </Pressable>

      {/* Duration */}
      <FieldLabel style={{ marginTop: 18 }}>Duration (minutes)</FieldLabel>
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
          value={duration}
          onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, '').slice(0, 3))}
          keyboardType="number-pad"
          placeholder="e.g. 45"
          placeholderTextColor={COLORS.subtle}
          style={{ height: 52, fontSize: 18, color: COLORS.ink }}
        />
      </View>

      {/* Distance (conditional) */}
      {showDistance ? (
        <Reanimated.View entering={FadeIn.duration(160)}>
          <FieldLabel style={{ marginTop: 18 }}>Distance (km)</FieldLabel>
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
                const parts = cleaned.split('.')
                setDistance(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned)
              }}
              keyboardType="decimal-pad"
              placeholder="e.g. 5.0"
              placeholderTextColor={COLORS.subtle}
              style={{ height: 52, fontSize: 18, color: COLORS.ink }}
            />
          </View>
        </Reanimated.View>
      ) : null}

      {/* RPE */}
      <View
        style={{
          marginTop: 18,
          borderRadius: 16,
          backgroundColor: `${zoneCol}1A`,
          padding: 16,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <FieldLabel style={{ marginBottom: 0 }}>RPE</FieldLabel>
          <Text style={{ fontSize: 32, fontWeight: '800', color: zoneCol }}>{rpe}</Text>
        </View>
        <Slider
          style={{ width: '100%', height: 40, marginTop: 4 }}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={rpe}
          onValueChange={(v) => {
            const next = Math.round(v)
            if (next !== rpe) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setRpe(next)
            }
          }}
          minimumTrackTintColor={zoneCol}
          maximumTrackTintColor={COLORS.border}
          thumbTintColor={zoneCol}
        />
      </View>

      {/* Live recompute preview */}
      {estimates && (parseInt(duration, 10) || 0) > 0 ? (
        <View
          style={{
            marginTop: 14,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            backgroundColor: COLORS.fieldBg,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 12,
          }}
        >
          <LivePill label="Load" value={`${estimates.loadScore} AU`} />
          <LivePill label="Calories" value={`${estimates.estimatedCalories} kcal`} />
          <LivePill label="Zone" value={`Z${estimates.estimatedHRZone.zone}`} />
          {showDistance && estimates.pace ? (
            <LivePill label="Pace" value={estimates.pace} />
          ) : null}
        </View>
      ) : null}

      {/* Notes */}
      <FieldLabel style={{ marginTop: 18 }}>Notes</FieldLabel>
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
          placeholder="How did it feel?"
          placeholderTextColor={COLORS.subtle}
          style={{
            minHeight: 60,
            maxHeight: 110,
            fontSize: 16,
            color: COLORS.ink,
            paddingTop: 10,
            textAlignVertical: 'top',
          }}
        />
      </View>

      {/* Advanced (avg BPM) */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          setAdvancedOpen(!advancedOpen)
        }}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 10,
          marginTop: 8,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.muted }}>Advanced</Text>
        <Text style={{ fontSize: 14, color: COLORS.subtle }}>{advancedOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {advancedOpen ? (
        <View>
          <FieldLabel>Average Heart Rate (BPM)</FieldLabel>
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
              style={{ height: 50, fontSize: 16, color: COLORS.ink }}
            />
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View style={{ marginTop: 22 }}>
        <PrimaryButton label="Save Changes" onPress={onSave} loading={saving} disabled={!canSave} />
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={{
            height: 52,
            borderRadius: 12,
            marginTop: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: COLORS.border,
            backgroundColor: COLORS.white,
          }}
        >
          <Text style={{ color: COLORS.muted, fontSize: 16, fontWeight: '700' }}>Cancel</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  )
}

function LivePill({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: COLORS.subtle }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 15, fontWeight: '800', color: COLORS.teal }}>
        {value}
      </Text>
    </View>
  )
}

function FieldLabel({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text
      style={[
        { fontSize: 13, fontWeight: '700', color: COLORS.body, marginBottom: 8 },
        style,
      ]}
    >
      {children}
    </Text>
  )
}
