import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeInDown } from 'react-native-reanimated'
import CountUp from '../dashboard/CountUp'
import HeroRouteMap from '../session/HeroRouteMap'
import RpeScale from './RpeScale'
import { COLOR, RADIUS_T, SPACE, rpeColor } from '../../theme/tokens'
import { haptics } from '../../utils/haptics'
import { calculateSpeed, formatPaceValue } from '../../utils/geo'
import {
  computeElevationGain,
  computeSplits,
  formatDuration,
  formatSplitPace,
  type Split,
} from '../../algorithms/movingTime'
import { estimateCalories } from '../../algorithms/calories'
import { calculateLoadScore } from '../../algorithms/sRPE'
import { SPORT_OPTIONS } from '../../constants/training'
import type { Conflict } from '../../types/conflict'
import type { RoutePoint, SportType } from '../../types/session'

/* ------------------------------------------------------------------ */
/* Default title                                                       */
/* ------------------------------------------------------------------ */

/**
 * The noun each sport takes in a workout title. Strava's convention, and it
 * reads far better than the sport's settings-screen label: "Morning Ride", not
 * "Morning Cycling".
 */
const SPORT_NOUN: Record<SportType, string> = {
  running: 'Run',
  cycling: 'Ride',
  swimming: 'Swim',
  football: 'Football',
  combat: 'Session',
  gym: 'Workout',
  strength: 'Workout',
}

function timeOfDay(at: Date): string {
  const h = at.getHours()
  if (h < 5) return 'Night'
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  if (h < 21) return 'Evening'
  return 'Night'
}

/**
 * "Night Run", "Morning Ride". Derived from when the session *started*, not from
 * now — a run that finishes at 12:04 was a morning run, and the athlete sitting
 * on this screen for ten minutes must not watch its name change.
 */
export function defaultWorkoutTitle(sport: SportType, startedAt: number): string {
  const at = startedAt > 0 ? new Date(startedAt) : new Date()
  return `${timeOfDay(at)} ${SPORT_NOUN[sport] ?? 'Workout'}`
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

export interface WorkoutSummaryProps {
  sport: SportType
  sportLabel: string
  /** Wall clock. Drives training load; never the pace denominator. */
  elapsedMs: number
  /** Elapsed minus established stops. The pace denominator. */
  movingTimeMs: number
  distanceKm: number
  route: RoutePoint[]
  startedAt: number
  weightKg?: number

  /** Current Form score, for the post-save forecast. */
  currentForm: number
  /**
   * Conflicts this session would raise, recomputed as the RPE changes. Empty
   * until an effort has been chosen — a conflict is a function of load, and
   * there is no load without an RPE.
   */
  conflicts: Conflict[]

  title: string
  onTitleChange: (value: string) => void
  /** Null until the athlete picks one. Save stays disabled while it is. */
  rpe: number | null
  onRpeChange: (value: number) => void
  notes: string
  onNotesChange: (value: string) => void

  saving: boolean
  /** True once the write has landed, for the button's checkmark beat. */
  saved: boolean
  onSave: () => void
  onDiscard: () => void
}

const NOTES_MAX = 500

/** Entrance stagger. 60ms is enough to read as sequence, not as lag. */
const STEP_MS = 60
const entrance = (index: number) => FadeInDown.delay(index * STEP_MS).duration(320).springify().damping(18)

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

/**
 * The finished-workout screen.
 *
 * Structured to answer, in order: *what did I just do* (hero, title, the three
 * numbers that matter), *how did it break down* (secondary stats, splits), and
 * then the one thing only FORMA asks — *how hard was it* — which is the block
 * everything downstream depends on and is therefore given the most visual weight
 * on the page.
 */
export default function WorkoutSummary(props: WorkoutSummaryProps) {
  const {
    sport,
    sportLabel,
    elapsedMs,
    movingTimeMs,
    distanceKm,
    route,
    startedAt,
    weightKg,
    currentForm,
    conflicts,
    title,
    onTitleChange,
    rpe,
    onRpeChange,
    notes,
    onNotesChange,
    saving,
    saved,
    onSave,
    onDiscard,
  } = props

  const [splitsOpen, setSplitsOpen] = useState(false)

  const isCycling = sport === 'cycling'
  const hasGps = route.length >= 2 && distanceKm > 0
  const sportIcon = SPORT_OPTIONS.find((o) => o.value === sport)?.icon ?? '🏃'

  const splits = useMemo(() => computeSplits(route), [route])
  const elevationGain = useMemo(() => computeElevationGain(route), [route])

  const durationMinutes = Math.max(1, Math.round(elapsedMs / 60000))
  const calories = estimateCalories(sport, elapsedMs / 60000, rpe ?? 5, weightKg)
  const load = rpe != null ? calculateLoadScore(durationMinutes, rpe) : 0

  // Average pace over MOVING time, which is the whole point of Bug 1: elapsed
  // charges every red light to the athlete's pace.
  const avgPaceSecPerKm = hasGps && movingTimeMs > 0 ? movingTimeMs / 1000 / distanceKm : null
  const avgSpeedKmh = hasGps ? calculateSpeed(movingTimeMs / 1000, distanceKm) : 0
  const bestSplit = useMemo(
    () =>
      splits.reduce<Split | null>(
        (best, s) => (best == null || s.paceSecPerKm < best.paceSecPerKm ? s : best),
        null,
      ),
    [splits],
  )

  const canSave = rpe != null && !saving && !saved

  const handleDiscard = () => {
    haptics.warning()
    Alert.alert(
      'Discard this workout?',
      'The time, distance and route you just recorded will be deleted. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onDiscard },
      ],
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLOR.bg }} edges={['bottom']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: SPACE.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1 · Hero, full-bleed and edge to edge. */}
          <HeroRouteMap coordinates={route} sportIcon={sportIcon} />

          {/* 2 · Title, pulled up over the gradient. */}
          <Animated.View
            entering={entrance(0)}
            style={{
              marginTop: -SPACE.lg,
              paddingHorizontal: SPACE.lg,
            }}
          >
            <TitleField value={title} onChange={onTitleChange} />
            <Text style={{ marginTop: SPACE.xs, fontSize: 13, color: COLOR.textMuted }}>
              {sportLabel} · {formatStartedAt(startedAt)}
            </Text>
          </Animated.View>

          {/* 3 · The three numbers that matter. */}
          <Animated.View
            entering={entrance(1)}
            style={{
              flexDirection: 'row',
              paddingHorizontal: SPACE.lg,
              marginTop: SPACE.lg,
            }}
          >
            {hasGps ? (
              <>
                <PrimaryStat label="Distance" value={distanceKm.toFixed(2)} unit="km" />
                <PrimaryStat label="Moving Time" value={formatDuration(movingTimeMs)} />
                <PrimaryStat
                  label={isCycling ? 'Avg Speed' : 'Avg Pace'}
                  value={
                    isCycling
                      ? avgSpeedKmh > 0
                        ? avgSpeedKmh.toFixed(1)
                        : '--.-'
                      : formatPaceValue(avgPaceSecPerKm).replace(' /km', '')
                  }
                  unit={isCycling ? 'km/h' : '/km'}
                />
              </>
            ) : (
              // No GPS: distance and pace would be blanks pretending to be data.
              // One centred number is the honest layout.
              <PrimaryStat label="Moving Time" value={formatDuration(movingTimeMs)} centred />
            )}
          </Animated.View>

          {/* 4 · Secondary stats. */}
          <Animated.View
            entering={entrance(2)}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingHorizontal: SPACE.lg,
              marginTop: SPACE.lg,
              gap: SPACE.md,
            }}
          >
            <SecondaryStat label="Elapsed Time" value={formatDuration(elapsedMs)} />
            <SecondaryStat label="Calories" value={`${calories}`} unit="kcal" />
            <SecondaryStat
              label="Best Pace"
              value={bestSplit ? formatSplitPace(bestSplit.paceSecPerKm) : '--:--'}
              unit={bestSplit ? '/km' : undefined}
            />
            <SecondaryStat
              label="Elevation Gain"
              value={hasGps ? `${elevationGain}` : '--'}
              unit={hasGps ? 'm' : undefined}
            />
          </Animated.View>

          {/* 5 · Splits. */}
          {splits.length > 0 && distanceKm >= 1 ? (
            <Animated.View entering={entrance(3)} style={{ marginTop: SPACE.lg }}>
              <Splits
                splits={splits}
                open={splitsOpen}
                onToggle={() => {
                  haptics.light()
                  setSplitsOpen((v) => !v)
                }}
              />
            </Animated.View>
          ) : null}

          {/* 6 · The block this whole app is built on. */}
          <Animated.View entering={entrance(4)}>
            <TrainingLoadBlock
              rpe={rpe}
              onRpeChange={onRpeChange}
              load={load}
              durationMinutes={durationMinutes}
              currentForm={currentForm}
              conflicts={conflicts}
            />
          </Animated.View>

          {/* 7 · Notes. */}
          <Animated.View entering={entrance(5)} style={{ paddingHorizontal: SPACE.lg, marginTop: SPACE.lg }}>
            <SectionLabel>Notes</SectionLabel>
            <View
              style={{
                marginTop: SPACE.sm,
                backgroundColor: COLOR.surface,
                borderRadius: RADIUS_T.md,
                borderWidth: 1,
                borderColor: COLOR.border,
                paddingHorizontal: SPACE.base,
                paddingTop: SPACE.md,
                paddingBottom: SPACE.sm,
              }}
            >
              <TextInput
                value={notes}
                onChangeText={(v) => onNotesChange(v.slice(0, NOTES_MAX))}
                multiline
                maxLength={NOTES_MAX}
                placeholder="How did it go? Sleep, soreness, conditions..."
                placeholderTextColor={COLOR.textMuted}
                style={{
                  minHeight: 80,
                  maxHeight: 160,
                  fontSize: 15,
                  lineHeight: 21,
                  color: COLOR.text,
                  textAlignVertical: 'top',
                  padding: 0,
                }}
              />
              <Text
                style={{
                  marginTop: SPACE.sm,
                  alignSelf: 'flex-end',
                  fontSize: 11,
                  color: notes.length >= NOTES_MAX ? COLOR.warn : COLOR.textMuted,
                }}
              >
                {notes.length}/{NOTES_MAX}
              </Text>
            </View>
          </Animated.View>
        </ScrollView>

        {/* 8 · Sticky CTA. Outside the ScrollView so it never scrolls away — the
            athlete must be able to save from anywhere on the page. */}
        <View
          style={{
            paddingHorizontal: SPACE.lg,
            paddingTop: SPACE.md,
            paddingBottom: SPACE.md,
            backgroundColor: COLOR.bg,
            borderTopWidth: 1,
            borderTopColor: COLOR.border,
          }}
        >
          <Pressable
            onPress={handleDiscard}
            disabled={saving || saved}
            hitSlop={8}
            style={{ alignSelf: 'center', paddingVertical: SPACE.sm }}
          >
            <Text style={{ color: COLOR.danger, fontSize: 14, fontWeight: '700' }}>Discard</Text>
          </Pressable>

          <SaveButton
            enabled={canSave}
            saving={saving}
            saved={saved}
            onPress={() => {
              haptics.success()
              onSave()
            }}
          />

          {rpe == null ? (
            <Text
              style={{
                marginTop: SPACE.sm,
                textAlign: 'center',
                fontSize: 12,
                color: COLOR.textMuted,
              }}
            >
              Select an effort rating to save
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function formatStartedAt(startedAt: number): string {
  const at = startedAt > 0 ? new Date(startedAt) : new Date()
  return at.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Name this workout"
        placeholderTextColor={COLOR.textMuted}
        maxLength={80}
        // Borderless on purpose: this reads as a heading you happen to be able to
        // edit, not as a form field. The pencil is the only affordance it needs.
        style={{
          flex: 1,
          fontSize: 26,
          fontWeight: '700',
          color: COLOR.text,
          padding: 0,
        }}
      />
      <Text style={{ fontSize: 14, color: COLOR.textMuted, marginLeft: SPACE.sm }}>✏️</Text>
    </View>
  )
}

function PrimaryStat({
  label,
  value,
  unit,
  centred,
}: {
  label: string
  value: string
  unit?: string
  centred?: boolean
}) {
  return (
    <View style={{ flex: 1, alignItems: centred ? 'center' : 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 30, fontWeight: '700', color: COLOR.text }}>{value}</Text>
        {unit ? (
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: COLOR.textMuted,
              marginLeft: 3,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          marginTop: SPACE.xs,
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: COLOR.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

function SecondaryStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View
      style={{
        // Two per row, accounting for the 12pt gap between them.
        width: '47.5%',
        flexGrow: 1,
        backgroundColor: COLOR.surfaceAlt,
        borderRadius: RADIUS_T.md,
        paddingVertical: SPACE.base,
        paddingHorizontal: SPACE.base,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: COLOR.textMuted,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: SPACE.xs }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: COLOR.text }}>{value}</Text>
        {unit ? (
          <Text style={{ fontSize: 12, color: COLOR.textMuted, marginLeft: 3 }}>{unit}</Text>
        ) : null}
      </View>
    </View>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: COLOR.textMuted,
      }}
    >
      {children}
    </Text>
  )
}

/* ---- Splits -------------------------------------------------------- */

function Splits({
  splits,
  open,
  onToggle,
}: {
  splits: Split[]
  open: boolean
  onToggle: () => void
}) {
  // Bars are scaled against the SLOWEST split, so the fastest is the longest bar
  // and the eye reads "longer = better" consistently down the column. Scaling by
  // pace directly would invert that and make the best kilometre the stub.
  const slowest = Math.max(...splits.map((s) => s.paceSecPerKm))
  const fastest = Math.min(...splits.map((s) => s.paceSecPerKm))

  return (
    <View style={{ paddingHorizontal: SPACE.lg }}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <SectionLabel>Splits</SectionLabel>
        <Text style={{ fontSize: 12, fontWeight: '700', color: COLOR.textMuted }}>
          {open ? 'Hide ▲' : `${splits.length} km ▼`}
        </Text>
      </Pressable>

      {open ? (
        <View style={{ marginTop: SPACE.md, gap: SPACE.sm }}>
          {splits.map((split) => {
            const isFastest = split.paceSecPerKm === fastest
            // Floor at 12% so the slowest kilometre is still a bar, not a sliver.
            const ratio = slowest > 0 ? Math.max(0.12, fastest / split.paceSecPerKm) : 1
            return (
              <View key={split.km} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{
                    width: 28,
                    fontSize: 13,
                    fontWeight: '700',
                    color: COLOR.textMuted,
                  }}
                >
                  {split.km}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: 6,
                    backgroundColor: COLOR.surfaceAlt,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${ratio * 100}%`,
                      height: '100%',
                      borderRadius: 6,
                      backgroundColor: isFastest ? COLOR.accent : COLOR.border,
                    }}
                  />
                </View>
                <Text
                  style={{
                    width: 64,
                    textAlign: 'right',
                    fontSize: 13,
                    fontWeight: '700',
                    color: isFastest ? COLOR.accent : COLOR.text,
                  }}
                >
                  {formatSplitPace(split.paceSecPerKm)}
                </Text>
              </View>
            )
          })}
          {splits.some((s) => s.partial) ? (
            <Text style={{ fontSize: 11, color: COLOR.textMuted, marginTop: SPACE.xs }}>
              Final split is a partial kilometre, extrapolated to a full-km pace.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/* ---- Training load ------------------------------------------------- */

/**
 * How much a single session's load moves Form.
 *
 * Form is `CTL − ATL`, CTL is a 42-day mean of daily load and ATL a 7-day mean
 * (see `store/metricsStore` and `algorithms/ctlAtl`). Adding `load` to today
 * therefore lifts CTL by `load/42` and ATL by `load/7`, so Form moves by
 * `load/42 − load/7`, i.e. down by `load × 5/42`. Training makes you tired
 * before it makes you fit; that ratio is the whole shape of the model.
 */
const FORM_DELTA_PER_LOAD = 1 / 42 - 1 / 7

function TrainingLoadBlock({
  rpe,
  onRpeChange,
  load,
  durationMinutes,
  currentForm,
  conflicts,
}: {
  rpe: number | null
  onRpeChange: (v: number) => void
  load: number
  durationMinutes: number
  currentForm: number
  conflicts: Conflict[]
}) {
  const formAfter = Math.round(currentForm + load * FORM_DELTA_PER_LOAD)
  const formNow = Math.round(currentForm)
  const worst = conflicts.find((c) => c.severity === 'danger') ?? conflicts[0]

  return (
    <View
      style={{
        marginTop: SPACE.lg,
        marginHorizontal: SPACE.lg,
        backgroundColor: COLOR.surface,
        borderRadius: RADIUS_T.md,
        // The accent rail is what marks this out as FORMA's block rather than
        // another stat card — it is the one thing on this screen no other
        // tracking app asks for.
        borderLeftWidth: 3,
        borderLeftColor: COLOR.accent,
        padding: SPACE.base,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: '800', color: COLOR.text }}>
        How hard was that session?
      </Text>
      <Text
        style={{
          marginTop: SPACE.xs,
          fontSize: 13,
          color: COLOR.textMuted,
          lineHeight: 19,
        }}
      >
        Rate your effort 1–10. Best measured about 30 minutes after finishing, once
        the session has settled.
      </Text>

      <View style={{ marginTop: SPACE.base }}>
        <RpeScale value={rpe} onChange={onRpeChange} />
      </View>

      {/* Live consequences of the rating. Shown only once there is a rating —
          a load of 0 AU and a flat forecast would be noise, and worse, would
          imply the numbers had already been computed. */}
      {rpe != null ? (
        <View
          style={{
            marginTop: SPACE.base,
            paddingTop: SPACE.base,
            borderTopWidth: 1,
            borderTopColor: COLOR.border,
            gap: SPACE.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 13, color: COLOR.textMuted }}>Training load</Text>
            <CountUp
              value={load}
              duration={420}
              format={(v) => `${Math.round(v)}`}
              style={{
                fontSize: 22,
                fontWeight: '800',
                color: rpeColor(rpe),
                marginLeft: SPACE.sm,
              }}
            />
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLOR.textMuted, marginLeft: 4 }}>
              AU
            </Text>
            <Text style={{ fontSize: 11, color: COLOR.textMuted, marginLeft: SPACE.sm }}>
              {durationMinutes} min × {rpe}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: COLOR.textMuted }}>Form after saving</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLOR.text, marginLeft: SPACE.sm }}>
              {formNow > 0 ? `+${formNow}` : formNow}
            </Text>
            <Text
              style={{
                marginHorizontal: 6,
                fontSize: 14,
                fontWeight: '800',
                color: formAfter < formNow ? COLOR.warn : COLOR.accent,
              }}
            >
              {formAfter < formNow ? '↘' : '↗'}
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: formAfter < formNow ? COLOR.warn : COLOR.accent,
              }}
            >
              {formAfter > 0 ? `+${formAfter}` : formAfter}
            </Text>
          </View>
        </View>
      ) : null}

      {/* The signature feature. Deliberately styled as part of this card rather
          than as a floating alert: it is an expected, informative outcome of the
          training model, not an error the athlete has to dismiss. */}
      {worst ? (
        <View
          style={{
            marginTop: SPACE.base,
            flexDirection: 'row',
            backgroundColor: 'rgba(245,158,11,0.10)',
            borderWidth: 1,
            borderColor: 'rgba(245,158,11,0.35)',
            borderRadius: RADIUS_T.sm,
            padding: SPACE.md,
          }}
        >
          <Text style={{ fontSize: 15, marginRight: SPACE.sm }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: COLOR.warn, letterSpacing: 0.4 }}>
              {worst.severity === 'danger' ? 'HIGH INJURY RISK' : 'TRAINING CONFLICT'}
            </Text>
            <Text style={{ marginTop: 3, fontSize: 13, color: COLOR.text, lineHeight: 18 }}>
              {worst.message}
            </Text>
            {conflicts.length > 1 ? (
              <Text style={{ marginTop: 4, fontSize: 11, color: COLOR.textMuted }}>
                +{conflicts.length - 1} more flagged after saving
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

/* ---- Save button --------------------------------------------------- */

function SaveButton({
  enabled,
  saving,
  saved,
  onPress,
}: {
  enabled: boolean
  saving: boolean
  saved: boolean
  onPress: () => void
}) {
  const [pressed, setPressed] = useState(false)
  const active = enabled || saving || saved

  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        height: 56,
        borderRadius: RADIUS_T.lg,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        // Muted rather than hidden while unrated: the athlete can see what they
        // are working towards, and the helper text below says what is missing.
        backgroundColor: active ? COLOR.accent : COLOR.surfaceAlt,
        opacity: pressed && enabled ? 0.85 : 1,
      }}
    >
      {saving ? <ActivityIndicator color={COLOR.bg} style={{ marginRight: SPACE.sm }} /> : null}
      <Text
        style={{
          fontSize: 17,
          fontWeight: '700',
          color: active ? COLOR.bg : COLOR.textMuted,
        }}
      >
        {saved ? '✓  Saved' : saving ? 'Saving…' : 'Save Session'}
      </Text>
    </Pressable>
  )
}
