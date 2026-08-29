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
import { haptics } from '../../utils/haptics'
import RouteMap from './RouteMap'
import PrimaryButton from '../ui/PrimaryButton'
import ToastContainer from '../ui/ToastContainer'
import ActionSheet, { type ActionSheetItem } from '../ui/ActionSheet'
import OverflowButton from '../ui/OverflowButton'
import { toast } from '../../store/toastStore'
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
import { sportVisual } from '../../utils/sportMeta'
import { formatDistanceKm } from '../../utils/formatting'
import type { Session, SportType } from '../../types/session'
import { useTheme } from '../../theme/ThemeProvider'
import { onColor, type Palette } from '../../theme/tokens'
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

function rpeColor(rpe: number, colors: Palette): string {
  if (rpe <= 3) return colors.accent
  if (rpe <= 7) return colors.warn
  return colors.danger
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
  const { colors } = useTheme()

  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const { sessions } = useSessionHistory()

  const [current, setCurrent] = useState<Session | null>(session)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Edit-form state.
  const [sport, setSport] = useState<SportType>('running')
  const [date, setDate] = useState<Date>(new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [duration, setDuration] = useState('')
  const [rpe, setRpe] = useState(5)
  const [distance, setDistance] = useState('')
  const [notes, setNotes] = useState('')
  const [avgBpm, setAvgBpm] = useState('')
  const [title, setTitle] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Focused when the overflow's "Edit title" is chosen, so that item lands the
  // user on the field rather than merely somewhere on the edit form.
  const titleRef = useRef<TextInput>(null)

  const translateY = useRef(new Animated.Value(0)).current

  // Seed everything from the tapped session whenever it (re)opens.
  useEffect(() => {
    if (!visible || !session) return
    setCurrent(session)
    setMode('view')
    seedForm(session)
    translateY.setValue(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, session?.id])

  function seedForm(s: Session) {
    setSport(s.sport)
    setDate(new Date(s.date))
    setDuration(String(s.durationMinutes))
    setRpe(s.rpe)
    setDistance(s.distanceKm != null ? String(s.distanceKm) : '')
    setNotes(s.notes ?? '')
    setAvgBpm(s.avgBpm != null ? String(s.avgBpm) : '')
    setTitle(s.title ?? '')
    setAdvancedOpen(s.avgBpm != null)
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
    haptics.light()
    seedForm(current)
    setMode('edit')
  }

  const handleCancel = () => {
    haptics.light()
    setMode('view')
  }

  const handleSave = async () => {
    if (!user || !profile || !current || !canSave || saving) return
    haptics.medium()
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
          title: title.trim() || undefined,
        },
        profile,
        { calibrating: sessions.length < CALIBRATION_SESSION_TARGET },
      )
      setCurrent(updated)
      setMode('view')
      // Toasts fire their own haptic — see toastStore.
      toast.success('Session updated')
      onUpdated?.(updated)
    } catch {
      toast.error('Could not save changes', {
        description: 'Your edits are still here. Check your connection.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (!user || !current) return
    const meta = sportVisual(current.sport, colors)
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
              haptics.warning()
              onDeleted?.()
              onClose()
            } catch {
              toast.error('Could not delete session')
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

  const meta = sportVisual(data.sport, colors)
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

  /**
   * The same three actions the workout summary offers, so editing a session
   * feels like one thing whether it is done straight after the workout or a
   * week later. Both of the first two drop into the edit form — which is where
   * a saved session's fields live — and "Edit title" additionally puts the
   * cursor in the title box.
   */
  const menuItems: ActionSheetItem[] = [
    {
      label: 'Edit title',
      onPress: () => {
        handleEdit()
        // After the form has mounted; focusing a field that is not on screen yet
        // is a no-op that looks like the menu item doing nothing.
        requestAnimationFrame(() => titleRef.current?.focus())
      },
    },
    { label: 'Change sport', description: meta?.label, onPress: handleEdit },
    { label: 'Delete session', destructive: true, onPress: handleDelete },
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Dim backdrop — tap to dismiss. */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.scrim }}
      />

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: SHEET_HEIGHT,
          backgroundColor: colors.surface,
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
              backgroundColor: colors.border,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 2,
              right: 8,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <OverflowButton onPress={() => setMenuOpen(true)} />
            <Pressable onPress={onClose} hitSlop={12} style={{ padding: 4, marginLeft: 2 }}>
              <Text style={{ fontSize: 22, color: colors.textSubtle, fontWeight: '600' }}>✕</Text>
            </Pressable>
          </View>
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
                {/* The workout's own name when it has one — live sessions are
                    saved with one — falling back to the sport. A title set on
                    the summary screen was previously written and then never
                    shown again anywhere in the app. */}
                <Text
                  style={{ fontSize: 24, fontWeight: '800', color: colors.text }}
                  numberOfLines={2}
                >
                  {data.title?.trim() || meta.label}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <Text style={{ fontSize: 14, color: colors.textMuted }}>{dateLine}</Text>
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
                title={title}
                setTitle={setTitle}
                titleRef={titleRef}
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

        {/* RN's <Modal> is its own native window, so the app-root container is
            drawn *behind* this and would be invisible. Same store, so nothing
            is duplicated — only one of the two is ever on screen. */}
        <ToastContainer insideModal />
      </Animated.View>

      {/* A sibling of the sheet rather than a child of it, so its scrim covers
          the whole modal window instead of stopping at the sheet's top edge —
          and inside this <Modal> rather than at the app root, because RN's
          <Modal> is its own native window and anything outside it is drawn
          behind. */}
      <ActionSheet visible={menuOpen} items={menuItems} onClose={() => setMenuOpen(false)} />
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
  const { colors } = useTheme()

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
          badge={{ text: `Z${zone?.zone ?? '—'}`, color: rpeColor(session.rpe, colors) }}
        />
        <StatTile icon="⚡" label="Training Load" value={`${session.loadScore} AU`} />
        {session.estimatedCalories != null ? (
          <StatTile icon="🔥" label="Est. Calories" value={`${session.estimatedCalories} kcal`} />
        ) : null}
        {zone ? (
          <StatTile
            icon="❤️"
            label="HR Zone"
            value={`Zone ${zone.zone} — ${zone.name}`}
            sub={zone.hrRange}
            badgeBar={hrZoneColor(zone.zone, colors)}
          />
        ) : null}
        {isDistance && paceValue ? (
          <StatTile icon="⏱️" label="Pace" value={paceValue} />
        ) : null}
        {isDistance && session.distanceKm != null ? (
          <StatTile icon="📏" label="Distance" value={formatDistanceKm(session.distanceKm)} />
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
            backgroundColor: colors.fieldBg,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 14,
          }}
        >
          <Text
            style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.textMuted }}
          >
            NOTES
          </Text>
          <Text style={{ marginTop: 6, fontSize: 15, color: colors.textBody, lineHeight: 21 }}>
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
            borderColor: colors.danger,
            backgroundColor: colors.surface,
          }}
        >
          {deleting ? (
            <ActivityIndicator color={colors.dangerText} />
          ) : (
            <Text style={{ color: colors.dangerText, fontSize: 16, fontWeight: '700' }}>Delete</Text>
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
  const { colors } = useTheme()

  return (
    <View
      style={{
        width: '48%',
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: badgeBar ? 4 : 1,
        borderLeftColor: badgeBar ?? colors.border,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, marginRight: 6 }}>{icon}</Text>
        <Text
          style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 }}
        >
          {label.toUpperCase()}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }} numberOfLines={1}>
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
            <Text style={{ fontSize: 10, fontWeight: '800', color: onColor(badge.color) }}>
              {badge.text}
            </Text>
          </View>
        ) : null}
      </View>
      {sub ? (
        <Text style={{ marginTop: 2, fontSize: 12, color: colors.textSubtle }}>{sub}</Text>
      ) : null}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Edit mode                                                           */
/* ------------------------------------------------------------------ */
function EditMode({
  title,
  setTitle,
  titleRef,
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
  title: string
  setTitle: (v: string) => void
  titleRef: React.RefObject<TextInput | null>
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
  const { colors } = useTheme()

  const zoneCol = rpeColor(rpe, colors)
  return (
    <Reanimated.View entering={FadeIn.duration(200)} style={{ marginTop: 18 }}>
      {/* Title. First field on the form because it is the one the header shows,
          and the one the overflow menu's "Edit title" jumps to. */}
      <FieldLabel>Title</FieldLabel>
      <TextInput
        ref={titleRef}
        value={title}
        onChangeText={setTitle}
        placeholder={sportVisual(sport, colors).label}
        placeholderTextColor={colors.textMuted}
        maxLength={80}
        style={{
          backgroundColor: colors.fieldBg,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 14,
          height: 48,
          fontSize: 16,
          color: colors.text,
          marginBottom: 16,
        }}
      />

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
          const accent = sportVisual(value, colors).color
          return (
            <Pressable
              key={value}
              onPress={() => {
                haptics.light()
                setSport(value)
              }}
              style={{
                width: 82,
                height: 84,
                borderRadius: 14,
                borderWidth: 2,
                borderColor: selected ? accent : colors.border,
                backgroundColor: selected ? accent : colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Text style={{ fontSize: 26 }}>{opt?.icon ?? '🏅'}</Text>
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  fontWeight: '700',
                  textAlign: 'center',
                  color: selected ? onColor(accent) : colors.text,
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
          haptics.light()
          onOpenDatePicker()
        }}
        style={{
          backgroundColor: colors.fieldBg,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: colors.border,
          paddingHorizontal: 14,
          height: 52,
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16, color: colors.text }}>
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
          backgroundColor: colors.fieldBg,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: colors.border,
          paddingHorizontal: 14,
        }}
      >
        <TextInput
          value={duration}
          onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, '').slice(0, 3))}
          keyboardType="number-pad"
          placeholder="e.g. 45"
          placeholderTextColor={colors.textSubtle}
          style={{ height: 52, fontSize: 18, color: colors.text }}
        />
      </View>

      {/* Distance (conditional) */}
      {showDistance ? (
        <Reanimated.View entering={FadeIn.duration(160)}>
          <FieldLabel style={{ marginTop: 18 }}>Distance (km)</FieldLabel>
          <View
            style={{
              backgroundColor: colors.fieldBg,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: colors.border,
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
              placeholderTextColor={colors.textSubtle}
              style={{ height: 52, fontSize: 18, color: colors.text }}
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
              haptics.light()
              setRpe(next)
            }
          }}
          minimumTrackTintColor={zoneCol}
          maximumTrackTintColor={colors.border}
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
            backgroundColor: colors.fieldBg,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
          }}
        >
          <LivePill label="Load" value={`${estimates.loadScore} AU`} />
          <LivePill label="Est. Calories" value={`${estimates.estimatedCalories} kcal`} />
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
          backgroundColor: colors.fieldBg,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 4,
        }}
      >
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="How did it feel?"
          placeholderTextColor={colors.textSubtle}
          style={{
            minHeight: 60,
            maxHeight: 110,
            fontSize: 16,
            color: colors.text,
            paddingTop: 10,
            textAlignVertical: 'top',
          }}
        />
      </View>

      {/* Advanced (avg BPM) */}
      <Pressable
        onPress={() => {
          haptics.light()
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
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textMuted }}>Advanced</Text>
        <Text style={{ fontSize: 14, color: colors.textSubtle }}>{advancedOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {advancedOpen ? (
        <View>
          <FieldLabel>Average Heart Rate (BPM)</FieldLabel>
          <View
            style={{
              backgroundColor: colors.fieldBg,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: colors.border,
              paddingHorizontal: 14,
            }}
          >
            <TextInput
              value={avgBpm}
              onChangeText={(t) => setAvgBpm(t.replace(/[^0-9]/g, '').slice(0, 3))}
              keyboardType="number-pad"
              placeholder="e.g. 152"
              placeholderTextColor={colors.textSubtle}
              style={{ height: 50, fontSize: 16, color: colors.text }}
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
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: '700' }}>Cancel</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  )
}

function LivePill({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme()

  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: colors.textSubtle }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 15, fontWeight: '800', color: colors.accent }}>
        {value}
      </Text>
    </View>
  )
}

function FieldLabel({ children, style }: { children: React.ReactNode; style?: object }) {
  const { colors } = useTheme()

  return (
    <Text
      style={[
        { fontSize: 13, fontWeight: '700', color: colors.textBody, marginBottom: 8 },
        style,
      ]}
    >
      {children}
    </Text>
  )
}
