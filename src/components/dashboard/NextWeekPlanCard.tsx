// The recommendation engine's week, on the Dashboard.

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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface NextWeekPlanCardProps {
  plan: WeeklyPlan
  recovery: RecoveryStatus[]
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

function stanceLabel(stance: LoadBudget['stance']): string | null {
  if (stance === 'fatigued') return 'Easing off'
  if (stance === 'detraining') return 'Building back'
  return null
}

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
    if (pending) return
    setPending(true)
    const ok = await onPlanIt(suggestion)
    if (!ok) setPending(false)
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingTop: first ? 0 : SPACING.md,
        marginTop: first ? 0 : SPACING.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
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

function RecoverySection({ recovery }: { recovery: RecoveryStatus[] }) {
  const { colors } = useTheme()

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
