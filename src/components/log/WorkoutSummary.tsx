import { useMemo, useRef, useState } from 'react'
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import ThemedStatusBar from '../ui/ThemedStatusBar'
import ActionSheet, { type ActionSheetItem } from '../ui/ActionSheet'
import OverflowButton from '../ui/OverflowButton'
import Animated, { FadeInDown } from 'react-native-reanimated'
import CountUp from '../dashboard/CountUp'
import HeroRouteMap, { TITLE_OVERLAP } from '../session/HeroRouteMap'
import RpeScale from './RpeScale'
import { RADIUS, SPACING, rpeColor } from '../../theme/tokens'
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
import { SPORT_OPTIONS, type SportOption } from '../../constants/training'
import type { Conflict } from '../../types/conflict'
import type { RoutePoint, SportType } from '../../types/session'
import { useTheme } from '../../theme/ThemeProvider'

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
  /**
   * The sports this athlete trains, for the overflow menu's "Change sport".
   * A live workout can be started under the wrong one, and noticing that at the
   * summary is much more likely than noticing it at the start line.
   */
  sportOptions: SportOption[]
  onSportChange: (value: SportType) => void
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
  const { colors } = useTheme()

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
    sportOptions,
    onSportChange,
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [sportPickerOpen, setSportPickerOpen] = useState(false)
  // The overflow's "Edit title" and a tap on the title itself are the same
  // action, so both go through the input's own focus rather than a mode flag.
  const titleRef = useRef<TextInput>(null)
  const insets = useSafeAreaInsets()

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

  const menuItems: ActionSheetItem[] = [
    { label: 'Edit title', onPress: () => titleRef.current?.focus() },
    { label: 'Change sport', description: sportLabel, onPress: () => setSportPickerOpen(true) },
    { label: 'Discard session', destructive: true, onPress: handleDiscard },
  ]

  const sportItems: ActionSheetItem[] = sportOptions.map((option) => ({
    label: `${option.icon}  ${option.label}`,
    onPress: () => onSportChange(option.value),
  }))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ThemedStatusBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: SPACING.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1 · Hero, full-bleed and edge to edge. */}
          <HeroRouteMap coordinates={route} sportIcon={sportIcon} />

          {/* 2 · Title, pulled up over the gradient. */}
          <Animated.View
            entering={entrance(0)}
            style={{
              // Shared with the hero's scrim, which guarantees an opaque band at
              // least this tall. See TITLE_OVERLAP.
              marginTop: -TITLE_OVERLAP,
              paddingHorizontal: SPACING.lg,
            }}
          >
            <TitleField inputRef={titleRef} value={title} onChange={onTitleChange} />
            <Text style={{ marginTop: SPACING.xs, fontSize: 13, color: colors.textMuted }}>
              {sportLabel} · {formatStartedAt(startedAt)}
            </Text>
          </Animated.View>

          {/* 3 · The three numbers that matter. */}
          <Animated.View
            entering={entrance(1)}
            style={{
              flexDirection: 'row',
              paddingHorizontal: SPACING.lg,
              marginTop: SPACING.lg,
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
              paddingHorizontal: SPACING.lg,
              marginTop: SPACING.lg,
              gap: SPACING.md,
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
            <Animated.View entering={entrance(3)} style={{ marginTop: SPACING.lg }}>
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
          <Animated.View entering={entrance(5)} style={{ paddingHorizontal: SPACING.lg, marginTop: SPACING.lg }}>
            <SectionLabel>Notes</SectionLabel>
            <View
              style={{
                marginTop: SPACING.sm,
                backgroundColor: colors.surface,
                borderRadius: RADIUS.card,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: SPACING.base,
                paddingTop: SPACING.md,
                paddingBottom: SPACING.sm,
              }}
            >
              <TextInput
                value={notes}
                onChangeText={(v) => onNotesChange(v.slice(0, NOTES_MAX))}
                multiline
                maxLength={NOTES_MAX}
                placeholder="How did it go? Sleep, soreness, conditions..."
                placeholderTextColor={colors.textMuted}
                style={{
                  minHeight: 80,
                  maxHeight: 160,
                  fontSize: 15,
                  lineHeight: 21,
                  color: colors.text,
                  textAlignVertical: 'top',
                  padding: 0,
                }}
              />
              <Text
                style={{
                  marginTop: SPACING.sm,
                  alignSelf: 'flex-end',
                  fontSize: 11,
                  color: notes.length >= NOTES_MAX ? colors.warn : colors.textMuted,
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
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.md,
            paddingBottom: SPACING.md,
            backgroundColor: colors.bg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            onPress={handleDiscard}
            disabled={saving || saved}
            hitSlop={8}
            style={{ alignSelf: 'center', paddingVertical: SPACING.sm }}
          >
            <Text style={{ color: colors.dangerText, fontSize: 14, fontWeight: '700' }}>Discard</Text>
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
                marginTop: SPACING.sm,
                textAlign: 'center',
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              Select an effort rating to save
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {/* Overflow, pinned to the screen rather than scrolling with the hero.
          `edges` excludes 'top' here — the map is deliberately full-bleed — so
          the inset has to be applied by hand or this lands under the clock. */}
      <View style={{ position: 'absolute', top: insets.top + SPACING.xs, right: SPACING.md }}>
        <OverflowButton onImagery onPress={() => setMenuOpen(true)} />
      </View>

      <ActionSheet
        visible={menuOpen}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      <ActionSheet
        visible={sportPickerOpen}
        title="Change sport"
        items={sportItems}
        onClose={() => setSportPickerOpen(false)}
      />
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

/**
 * The workout's name.
 *
 * There used to be a ✏️ next to it. An emoji is the wrong thing to hang an
 * affordance on — it is a full-colour OS bitmap that cannot take the theme's
 * ink, is drawn differently by every Android version, and at 14pt next to a
 * 26pt heading it reads as a leftover rather than a control. The affordance is
 * now the underline: the field looks like a heading, and the hairline under it
 * says it is also a text box. The overflow menu's "Edit title" focuses this
 * same input, so there is one edit path rather than two.
 */
function TitleField({
  value,
  onChange,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  inputRef: React.RefObject<TextInput | null>
}) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)

  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder="Name this workout"
      placeholderTextColor={colors.textMuted}
      maxLength={80}
      style={{
        fontSize: 26,
        fontWeight: '700',
        color: colors.text,
        paddingTop: 0,
        paddingHorizontal: 0,
        paddingBottom: SPACING.xs,
        // Subtle at rest, the accent while editing — the same grammar as every
        // other input in the app, just without a box around it.
        borderBottomWidth: 1.5,
        borderBottomColor: focused ? colors.accent : colors.border,
      }}
    />
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
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, alignItems: centred ? 'center' : 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text }}>{value}</Text>
        {unit ? (
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.textMuted,
              marginLeft: 3,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          marginTop: SPACING.xs,
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

function SecondaryStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        // Two per row, accounting for the 12pt gap between them.
        width: '47.5%',
        flexGrow: 1,
        backgroundColor: colors.surfaceAlt,
        borderRadius: RADIUS.card,
        paddingVertical: SPACING.base,
        paddingHorizontal: SPACING.base,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: SPACING.xs }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{value}</Text>
        {unit ? (
          <Text style={{ fontSize: 12, color: colors.textMuted, marginLeft: 3 }}>{unit}</Text>
        ) : null}
      </View>
    </View>
  )
}

function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme()

  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: colors.textMuted,
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
  const { colors } = useTheme()

  // Bars are scaled against the SLOWEST split, so the fastest is the longest bar
  // and the eye reads "longer = better" consistently down the column. Scaling by
  // pace directly would invert that and make the best kilometre the stub.
  const slowest = Math.max(...splits.map((s) => s.paceSecPerKm))
  const fastest = Math.min(...splits.map((s) => s.paceSecPerKm))

  return (
    <View style={{ paddingHorizontal: SPACING.lg }}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <SectionLabel>Splits</SectionLabel>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
          {open ? 'Hide ▲' : `${splits.length} km ▼`}
        </Text>
      </Pressable>

      {open ? (
        <View style={{ marginTop: SPACING.md, gap: SPACING.sm }}>
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
                    color: colors.textMuted,
                  }}
                >
                  {split.km}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: 6,
                    backgroundColor: colors.surfaceAlt,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${ratio * 100}%`,
                      height: '100%',
                      borderRadius: 6,
                      backgroundColor: isFastest ? colors.accent : colors.border,
                    }}
                  />
                </View>
                <Text
                  style={{
                    width: 64,
                    textAlign: 'right',
                    fontSize: 13,
                    fontWeight: '700',
                    color: isFastest ? colors.accent : colors.text,
                  }}
                >
                  {formatSplitPace(split.paceSecPerKm)}
                </Text>
              </View>
            )
          })}
          {splits.some((s) => s.partial) ? (
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: SPACING.xs }}>
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
  const { colors } = useTheme()

  const formAfter = Math.round(currentForm + load * FORM_DELTA_PER_LOAD)
  const formNow = Math.round(currentForm)
  const worst = conflicts.find((c) => c.severity === 'danger') ?? conflicts[0]

  return (
    <View
      style={{
        marginTop: SPACING.lg,
        marginHorizontal: SPACING.lg,
        backgroundColor: colors.surface,
        borderRadius: RADIUS.card,
        // The accent rail is what marks this out as FORMA's block rather than
        // another stat card — it is the one thing on this screen no other
        // tracking app asks for.
        borderLeftWidth: 3,
        borderLeftColor: colors.accent,
        padding: SPACING.base,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>
        How hard was that session?
      </Text>
      <Text
        style={{
          marginTop: SPACING.xs,
          fontSize: 13,
          color: colors.textMuted,
          lineHeight: 19,
        }}
      >
        Rate your effort 1–10. Best measured about 30 minutes after finishing, once
        the session has settled.
      </Text>

      <View style={{ marginTop: SPACING.base }}>
        <RpeScale value={rpe} onChange={onRpeChange} />
      </View>

      {/* Live consequences of the rating. Shown only once there is a rating —
          a load of 0 AU and a flat forecast would be noise, and worse, would
          imply the numbers had already been computed. */}
      {rpe != null ? (
        <View
          style={{
            marginTop: SPACING.base,
            paddingTop: SPACING.base,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: SPACING.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Training load</Text>
            <CountUp
              value={load}
              duration={420}
              format={(v) => `${Math.round(v)}`}
              style={{
                fontSize: 22,
                fontWeight: '800',
                color: rpeColor(rpe, colors),
                marginLeft: SPACING.sm,
              }}
            />
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, marginLeft: 4 }}>
              AU
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: SPACING.sm }}>
              {durationMinutes} min × {rpe}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Form after saving</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginLeft: SPACING.sm }}>
              {formNow > 0 ? `+${formNow}` : formNow}
            </Text>
            <Text
              style={{
                marginHorizontal: 6,
                fontSize: 14,
                fontWeight: '800',
                color: formAfter < formNow ? colors.warn : colors.accent,
              }}
            >
              {formAfter < formNow ? '↘' : '↗'}
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: formAfter < formNow ? colors.warn : colors.accent,
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
            marginTop: SPACING.base,
            flexDirection: 'row',
            backgroundColor: colors.tint.amber.bg,
            borderWidth: 1,
            borderColor: colors.tint.amber.border,
            borderRadius: RADIUS.md,
            padding: SPACING.md,
          }}
        >
          <Text style={{ fontSize: 15, marginRight: SPACING.sm }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.warnText, letterSpacing: 0.4 }}>
              {worst.severity === 'danger' ? 'HIGH INJURY RISK' : 'TRAINING CONFLICT'}
            </Text>
            <Text style={{ marginTop: 3, fontSize: 13, color: colors.text, lineHeight: 18 }}>
              {worst.message}
            </Text>
            {conflicts.length > 1 ? (
              <Text style={{ marginTop: 4, fontSize: 11, color: colors.textMuted }}>
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
  const { colors } = useTheme()

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
        borderRadius: RADIUS.xl,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        // Muted rather than hidden while unrated: the athlete can see what they
        // are working towards, and the helper text below says what is missing.
        backgroundColor: active ? colors.accent : colors.surfaceAlt,
        opacity: pressed && enabled ? 0.85 : 1,
      }}
    >
      {saving ? <ActivityIndicator color={colors.bg} style={{ marginRight: SPACING.sm }} /> : null}
      <Text
        style={{
          fontSize: 17,
          fontWeight: '700',
          color: active ? colors.bg : colors.textMuted,
        }}
      >
        {saved ? '✓  Saved' : saving ? 'Saving…' : 'Save Session'}
      </Text>
    </Pressable>
  )
}
