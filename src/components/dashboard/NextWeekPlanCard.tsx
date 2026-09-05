// The recommendation engine's week, on the dashboard.
//
// Two sections in one card, because they answer halves of the same question.
// The suggestions say what to do; the recovery countdown underneath says what
// not to do yet, and an athlete who reads "Combat on Thursday" wants the reason
// combat is not on Tuesday within the same glance. Splitting them into two cards
// would put a gap between an instruction and its constraint.
//
// ## Nothing here decides anything
//
// Every figure, every date and every sentence comes from
// `algorithms/recommender` exactly as computed. This file chooses ordering,
// spacing and hue and nothing else — it does not round a load, pick a day, or
// compose a reason. That division is the point of an explainable system: if a
// suggestion is wrong, it is wrong in one testable pure module rather than
// somewhere in a render tree.
//
// The one thing it deliberately does *not* render is the engine's sport emoji.
// `sportVisual` carries one and this screen has sworn off them: an OS-supplied
// bitmap ignores the theme and sits in a themed card as a full-colour sticker.
// The sport's own accent, as a disc, says the same thing in the palette's voice
// — and colour standing for a sport is the one place on this card where colour
// is data rather than decoration.
import { useState } from 'react'
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import PressableScale from '../ui/PressableScale'
import PrimaryButton from '../ui/PrimaryButton'
import TabIcon from '../ui/TabIcon'
import { formatThousands } from '../../utils/formatting'
import { weekdayLabel } from '../../utils/dates'
import { sportVisual } from '../../utils/sportMeta'
import type {
  LoadBudget,
  RecoveryStatus,
  SuggestedSession,
  WeeklyPlan,
} from '../../algorithms/recommender'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

// LayoutAnimation is opt-in on old-architecture Android and a no-op without
// this. Idempotent, and harmless everywhere it is already on.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface NextWeekPlanCardProps {
  plan: WeeklyPlan
  recovery: RecoveryStatus[]
  /**
   * Persist one suggestion as a planned session. Resolves true on success.
   *
   * The write lives on the screen rather than in here: it owns the uid, the
   * toast and the navigator, and a card that reached for Firestore would be a
   * card that could not be rendered in isolation.
   */
  onPlanIt: (suggestion: SuggestedSession) => Promise<boolean>
  onRefresh: () => void
  onLogSession: () => void
}

export default function NextWeekPlanCard({
  plan,
  recovery,
  onPlanIt,
  onRefresh,
  onLogSession,
}: NextWeekPlanCardProps) {
  const { colors } = useTheme()
  const [infoOpen, setInfoOpen] = useState(false)

  const toggleInfo = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setInfoOpen((v) => !v)
  }

  return (
    <Animated.View entering={FadeInDown.delay(120).duration(360)} style={cardStyle(colors)}>
      <Header infoOpen={infoOpen} onToggleInfo={toggleInfo} />

      {plan.status === 'insufficient_data' ? (
        <InsufficientState plan={plan} infoOpen={infoOpen} onLogSession={onLogSession} />
      ) : (
        <ReadyState
          plan={plan}
          recovery={recovery}
          infoOpen={infoOpen}
          onPlanIt={onPlanIt}
          onRefresh={onRefresh}
        />
      )}
    </Animated.View>
  )
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({ infoOpen, onToggleInfo }: { infoOpen: boolean; onToggleInfo: () => void }) {
  const { colors } = useTheme()

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Text
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: TYPE.subtitle,
          fontWeight: WEIGHT.heavy,
          color: colors.text,
        }}
      >
        Suggested next week
      </Text>
      <Pressable
        onPress={onToggleInfo}
        // A generous hit slop rather than a padded 44pt box, which would push
        // the title off its own baseline.
        hitSlop={12}
        accessibilityRole="button"
        accessibilityState={{ expanded: infoOpen }}
        accessibilityLabel="How these suggestions are worked out"
        style={{ marginLeft: SPACING.sm, paddingTop: 1 }}
      >
        <TabIcon
          name="info"
          size={18}
          color={infoOpen ? colors.accentText : colors.textMuted}
          focused={infoOpen}
        />
      </Pressable>
    </View>
  )
}

/**
 * The explanation, behind the icon.
 *
 * `budget.reason` is a full sentence the engine wrote from the figures that
 * chose the target — the form value, the floor, the two weeks it compared. It is
 * printed verbatim rather than paraphrased, because a paraphrase is a second
 * claim that can drift from the first.
 */
function InfoPanel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        marginTop: SPACING.md,
        padding: SPACING.md,
        borderRadius: RADIUS.md,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {children}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Insufficient data                                                   */
/* ------------------------------------------------------------------ */

/**
 * What the card shows before FORMA knows the athlete well enough.
 *
 * A teaching state, not an empty one, and specifically not a zeroed one. The
 * alternative — the same layout with 0 AU and no rows — reads as a feature that
 * is broken rather than one that is waiting, and it invites the reader to
 * believe a target of zero.
 */
function InsufficientState({
  plan,
  infoOpen,
  onLogSession,
}: {
  plan: Extract<WeeklyPlan, { status: 'insufficient_data' }>
  infoOpen: boolean
  onLogSession: () => void
}) {
  const { colors } = useTheme()

  return (
    <View>
      <Text
        style={{
          marginTop: SPACING.sm,
          fontSize: TYPE.small,
          lineHeight: 19,
          color: colors.textMuted,
        }}
      >
        Suggestions need about two weeks of training days behind them. FORMA has{' '}
        <Text style={{ fontWeight: WEIGHT.heavy, color: colors.textBody }}>
          {plan.trainingDays} of {plan.required}
        </Text>
        , so it isn&apos;t guessing a week for you yet.
      </Text>

      {infoOpen ? (
        <InfoPanel>
          <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
            A week&apos;s plan is built from how much you can absorb, which sports you have
            trained recently, and how they interact. All three need a fortnight of real
            training days to mean anything — so rather than average almost nothing, FORMA
            waits.
          </Text>
        </InfoPanel>
      ) : null}

      {/* The meter, so "not yet" comes with a distance rather than a refusal. */}
      <View
        style={{
          height: 6,
          marginTop: SPACING.base,
          borderRadius: RADIUS.pill,
          backgroundColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.max(0, Math.min(plan.trainingDays / plan.required, 1)) * 100}%`,
            height: '100%',
            borderRadius: RADIUS.pill,
            backgroundColor: colors.accent,
          }}
        />
      </View>

      <View style={{ marginTop: SPACING.base }}>
        <PrimaryButton label="Log a session" onPress={onLogSession} />
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

function ReadyState({
  plan,
  recovery,
  infoOpen,
  onPlanIt,
  onRefresh,
}: {
  plan: Extract<WeeklyPlan, { status: 'ok' }>
  recovery: RecoveryStatus[]
  infoOpen: boolean
  onPlanIt: (suggestion: SuggestedSession) => Promise<boolean>
  onRefresh: () => void
}) {
  const { colors } = useTheme()

  return (
    <View>
      {/* The target and the range it sits in. The range matters as much as the
          number: a single figure reads as a quota to hit exactly, and the whole
          point of the band is that anywhere inside it is fine. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm }}>
        <Text
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: TYPE.bodyLg,
            fontWeight: WEIGHT.bold,
            color: colors.text,
          }}
        >
          Aim for ~{formatThousands(plan.budget.target)} AU{' '}
          <Text
            style={{ fontSize: TYPE.small, fontWeight: WEIGHT.medium, color: colors.textMuted }}
          >
            ({formatThousands(plan.budget.floor)}–{formatThousands(plan.budget.ceiling)})
          </Text>
        </Text>

        {/* Why the target sits where it does in that range. Without this, a
            fatigued week reads "Aim for ~224 AU (224–364)" and the number looks
            arbitrary rather than deliberately at the bottom. `maintain` is the
            default and says nothing, because a chip on every ordinary week is a
            chip nobody reads. */}
        {stanceLabel(plan.budget.stance) ? (
          <View
            style={{
              marginLeft: SPACING.sm,
              paddingHorizontal: SPACING.sm + 2,
              paddingVertical: 3,
              borderRadius: RADIUS.pill,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{ fontSize: TYPE.caption, fontWeight: WEIGHT.heavy, color: colors.textMuted }}
            >
              {stanceLabel(plan.budget.stance)}
            </Text>
          </View>
        ) : null}
      </View>

      {infoOpen ? (
        <InfoPanel>
          <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
            {plan.budget.reason}
          </Text>
          <Text
            style={{
              marginTop: SPACING.sm,
              fontSize: TYPE.small,
              lineHeight: 19,
              color: colors.textBody,
            }}
          >
            Sports are ranked on three things: how much overlapping fatigue is still
            outstanding, how far under an even share of your load each one is, and how long
            since you last trained it. Days are then spaced so two sports that clash never
            land together.
          </Text>
        </InfoPanel>
      ) : null}

      {plan.sessions.length === 0 ? (
        <Text
          style={{
            marginTop: SPACING.base,
            fontSize: TYPE.small,
            lineHeight: 19,
            color: colors.textMuted,
          }}
        >
          Everything you train is still recovering from the last few days, so there is no
          session FORMA can place this week without stacking fatigue.
        </Text>
      ) : (
        <View style={{ marginTop: SPACING.base }}>
          {plan.sessions.map((suggestion, i) => (
            <SuggestionRow
              key={`${suggestion.sport}-${suggestion.date}`}
              suggestion={suggestion}
              first={i === 0}
              onPlanIt={onPlanIt}
            />
          ))}
        </View>
      )}

      {/* Said only when it is true *and* there is something for it to describe.
          A plan with no placeable session reports `below_minimum` too, and the
          caveat would then announce that the suggestions above come to 0 AU
          when there are no suggestions above. A permanent caveat is also one
          readers learn to skip, which is the wrong reflex to train. */}
      {plan.budgetFit !== 'on_target' && plan.sessions.length > 0 ? (
        <Text
          style={{
            marginTop: SPACING.md,
            fontSize: TYPE.caption,
            lineHeight: 16,
            color: colors.textSubtle,
          }}
        >
          {plan.budgetFit === 'below_minimum'
            ? `One realistic session of your sports already comes to more than this week's target, so the suggestion above lands at ${formatThousands(plan.allocatedLoad)} AU.`
            : `These sessions come to ${formatThousands(plan.allocatedLoad)} AU — the recovery gaps between your sports leave room for fewer than this week's target needs.`}
        </Text>
      ) : null}

      <Pressable
        onPress={onRefresh}
        accessibilityRole="button"
        accessibilityLabel="Refresh suggestions"
        hitSlop={8}
        style={{ alignSelf: 'flex-start', marginTop: SPACING.md, paddingVertical: 4 }}
      >
        <Text style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, color: colors.accentText }}>
          Refresh suggestions
        </Text>
      </Pressable>

      <RecoverySection recovery={recovery} />
    </View>
  )
}

/** How a non-default budget stance is named. `maintain` is left unlabelled. */
function stanceLabel(stance: LoadBudget['stance']): string | null {
  if (stance === 'fatigued') return 'Easing off'
  if (stance === 'detraining') return 'Building back'
  return null
}

/**
 * One suggestion: what, when, how much, and why.
 *
 * The reason sits under the row in muted type rather than beside it. It is a
 * full sentence and it is the part a reader consults *after* deciding the row
 * looks plausible — putting it in the scan line would make four rows into four
 * paragraphs.
 */
function SuggestionRow({
  suggestion,
  first,
  onPlanIt,
}: {
  suggestion: SuggestedSession
  first: boolean
  onPlanIt: (suggestion: SuggestedSession) => Promise<boolean>
}) {
  const { colors } = useTheme()
  const [pending, setPending] = useState(false)

  const visual = sportVisual(suggestion.sport, colors)

  const handlePlan = async () => {
    // Guarded rather than debounced: the handler navigates away on success, and
    // a second tap during the write would add the same plan twice.
    if (pending) return
    setPending(true)
    const ok = await onPlanIt(suggestion)
    // Only released on failure. On success this row is leaving the screen, and
    // re-enabling the button underneath the transition invites a double add.
    if (!ok) setPending(false)
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingTop: first ? 0 : SPACING.md,
        marginTop: first ? 0 : SPACING.md,
        // A hairline between rows rather than a box around each: this is a list
        // of four comparable things, not four separate objects.
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      {/* The sport's own accent, as a disc. Colour is the identifier here. */}
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: RADIUS.pill,
          backgroundColor: visual.color,
          marginTop: 5,
          marginRight: SPACING.sm + 2,
        }}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: TYPE.bodyLg,
              fontWeight: WEIGHT.bold,
              color: colors.text,
            }}
          >
            {visual.label}
          </Text>
          <PressableScale
            onPress={handlePlan}
            haptic="medium"
            disabled={pending}
            accessibilityRole="button"
            accessibilityLabel={`Plan ${visual.label} for ${weekdayLabel(suggestion.date)}`}
            accessibilityState={{ disabled: pending }}
            style={{
              marginLeft: SPACING.sm,
              paddingHorizontal: SPACING.md,
              paddingVertical: 6,
              borderRadius: RADIUS.pill,
              backgroundColor: colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.accentBorder,
              opacity: pending ? 0.6 : 1,
            }}
          >
            <Text
              style={{ fontSize: TYPE.caption, fontWeight: WEIGHT.heavy, color: colors.accentText }}
            >
              {pending ? 'Planning…' : 'Plan it'}
            </Text>
          </PressableScale>
        </View>

        <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textBody }}>
          {weekdayLabel(suggestion.date)} · {suggestion.durationMinutes} min at RPE{' '}
          {suggestion.rpe}
        </Text>

        <Text
          style={{ marginTop: 4, fontSize: TYPE.caption, lineHeight: 16, color: colors.textMuted }}
        >
          {suggestion.reason}
        </Text>
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Recovery countdown                                                  */
/* ------------------------------------------------------------------ */

/**
 * Which sports are clear to train, and when the rest come back.
 *
 * Compact by design — one row per sport, a pill each, and the explanation only
 * for the row you tap. The list is read as a scan ("what can I do today?") and a
 * permanent sentence under every not-ready sport would turn a four-line answer
 * into half a screen.
 */
function RecoverySection({ recovery }: { recovery: RecoveryStatus[] }) {
  const { colors } = useTheme()

  // The engine returns an entry per sport even when it cannot answer; the card
  // above already explains that case, so it is not repeated here.
  const rows = recovery.filter((r) => r.status !== 'insufficient_data')
  if (rows.length === 0) return null

  return (
    <View style={{ marginTop: SPACING.base }}>
      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: SPACING.md }} />

      <Text
        style={{
          fontSize: TYPE.caption,
          fontWeight: WEIGHT.heavy,
          letterSpacing: 0.6,
          color: colors.textMuted,
          marginBottom: SPACING.sm,
        }}
      >
        RECOVERY
      </Text>

      {rows.map((row) => (
        <RecoveryRow key={row.sport} row={row} />
      ))}
    </View>
  )
}

function RecoveryRow({ row }: { row: Exclude<RecoveryStatus, { status: 'insufficient_data' }> }) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)

  const visual = sportVisual(row.sport, colors)
  const ready = row.status === 'ready'

  const toggle = () => {
    if (ready) return
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((v) => !v)
  }

  const pillLabel = ready ? 'Ready' : `Wait until ${weekdayLabel(row.readyOn)}`

  return (
    <Pressable
      onPress={toggle}
      // A ready row has nothing to expand, so it is not a button at all rather
      // than a button that does nothing when pressed.
      accessibilityRole={ready ? 'text' : 'button'}
      accessibilityState={ready ? undefined : { expanded: open }}
      accessibilityLabel={
        ready
          ? `${visual.label}: ready to train`
          : `${visual.label}: ${pillLabel}. ${open ? row.reason : 'Tap for what is holding it back.'}`
      }
      style={{ paddingVertical: 5 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontSize: TYPE.small, color: colors.textBody }}
        >
          {visual.label}
        </Text>

        <View
          style={{
            paddingHorizontal: SPACING.sm + 2,
            paddingVertical: 3,
            borderRadius: RADIUS.pill,
            backgroundColor: ready ? colors.accentSoft : colors.warnSoft,
            borderWidth: 1,
            borderColor: ready ? colors.accentBorder : colors.warnBorder,
          }}
        >
          <Text
            style={{
              fontSize: TYPE.caption,
              fontWeight: WEIGHT.heavy,
              color: ready ? colors.accentText : colors.warnText,
            }}
          >
            {pillLabel}
          </Text>
        </View>
      </View>

      {/* The blocking session, named. Built from the engine's own blocker rather
          than from its prose, so the line stays one short clause at this size. */}
      {!ready && open ? (
        <Animated.Text
          entering={FadeIn.duration(160)}
          style={{
            marginTop: 4,
            marginRight: 70,
            fontSize: TYPE.caption,
            lineHeight: 16,
            color: colors.textMuted,
          }}
        >
          {weekdayLabel(row.blockedBy.date)}&apos;s {sportVisual(row.blockedBy.sport, colors).label}{' '}
          session, RPE {row.blockedBy.rpe}.
        </Animated.Text>
      ) : null}
    </Pressable>
  )
}
