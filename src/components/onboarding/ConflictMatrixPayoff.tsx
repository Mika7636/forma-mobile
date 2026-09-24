// Onboarding's last step: what FORMA already knows about you.

import { ScrollView, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import PrimaryButton from '../ui/PrimaryButton'
import { interactionLevels } from '../../constants/conflictColors'
import { sportPairInsights, type SportPairInsight } from '../../utils/sportPairs'
import { sportVisual } from '../../utils/sportMeta'
import type { SportType } from '../../types/session'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface ConflictMatrixPayoffProps {
  sports: SportType[]
  interactions: Record<string, number>
  ctaLabel: string
  onContinue: () => void
  saving: boolean
  error: string | null
}

export default function ConflictMatrixPayoff({
  sports,
  interactions,
  ctaLabel,
  onContinue,
  saving,
  error,
}: ConflictMatrixPayoffProps) {
  const { colors } = useTheme()

  const insights = sportPairInsights(sports, interactions)
  const clashes = insights.filter((p) => p.clashes)
  const compatible = insights.filter((p) => !p.clashes)

  return (
    <View style={{ flex: 1 }}>
      <View style={{ marginTop: 12 }}>
        <Text
          style={{ fontSize: 24, fontWeight: WEIGHT.heavy, color: colors.text, lineHeight: 30 }}
        >
          Your training conflicts
        </Text>
        <Text style={{ marginTop: 8, fontSize: TYPE.bodyLg, color: colors.textMuted, lineHeight: 21 }}>
          {headline(sports.length, clashes.length)}
        </Text>
      </View>

      <ScrollView
        style={{ marginTop: SPACING.lg }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING.sm }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.lg }}>
          {sports.map((sport) => {
            const { color, icon, label } = sportVisual(sport, colors)
            return (
              <View
                key={sport}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  marginRight: SPACING.sm,
                  marginBottom: SPACING.sm,
                  borderRadius: RADIUS.pill,
                  borderWidth: 1.5,
                  borderColor: color,
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Text style={{ fontSize: 13 }}>{icon}</Text>
                <Text
                  style={{
                    marginLeft: 6,
                    fontSize: TYPE.micro,
                    fontWeight: WEIGHT.bold,
                    color: colors.textBody,
                  }}
                >
                  {label}
                </Text>
              </View>
            )
          })}
        </View>

        {insights.length === 0 ? (
          <SingleSportNote />
        ) : (
          <>
            {clashes.length > 0 ? (
              <Section title="Watch these combinations">
                {clashes.map((pair, i) => (
                  <PairRow key={pair.key} pair={pair} index={i} />
                ))}
              </Section>
            ) : null}

            {compatible.length > 0 ? (
              <Section title="These combine well" spaced={clashes.length > 0}>
                {compatible.map((pair, i) => (
                  <PairRow key={pair.key} pair={pair} index={clashes.length + i} />
                ))}
              </Section>
            ) : null}
          </>
        )}

        <Text
          style={{
            marginTop: SPACING.base,
            fontSize: TYPE.micro,
            lineHeight: 18,
            color: colors.textSubtle,
          }}
        >
          FORMA checks this every time you plan or log a session — from today, not after
          weeks of data. You can retune any pair in Settings.
        </Text>
      </ScrollView>

      {error ? (
        <Text
          style={{
            color: colors.dangerText,
            fontSize: TYPE.body,
            fontWeight: WEIGHT.semibold,
            textAlign: 'center',
            marginBottom: SPACING.md,
          }}
        >
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label={ctaLabel}
        onPress={onContinue}
        loading={saving}
        style={{ marginTop: SPACING.md }}
      />
    </View>
  )
}

function headline(sportCount: number, clashCount: number): string {
  if (sportCount < 2) {
    return "Here's how FORMA will watch your training — no logging needed."
  }
  if (clashCount === 0) {
    return "Your sports sit well together. Here's what FORMA will still be watching."
  }
  return `Based on the ${sportCount} sports you picked, here's where your recovery will compete.`
}

function Section({
  title,
  spaced = false,
  children,
}: {
  title: string
  spaced?: boolean
  children: React.ReactNode
}) {
  const { colors } = useTheme()
  return (
    <View style={{ marginTop: spaced ? SPACING.lg : 0 }}>
      <Text
        style={{
          fontSize: TYPE.caption,
          fontWeight: WEIGHT.heavy,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: colors.textSubtle,
          marginBottom: SPACING.md - 2,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

function PairRow({ pair, index }: { pair: SportPairInsight; index: number }) {
  const { colors } = useTheme()

  const level = interactionLevels(colors).find((l) => l.value === pair.level)
  const rail = level?.color ?? colors.palette.slate

  return (
    <Animated.View
      entering={FadeInDown.delay(60 * index).duration(280)}
      style={{
        flexDirection: 'row',
        marginBottom: SPACING.md - 2,
        paddingVertical: SPACING.md - 2,
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.md,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: rail,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.text }}>
          {pair.title}
        </Text>
        <Text
          style={{
            marginTop: 3,
            fontSize: TYPE.small,
            lineHeight: 18,
            color: colors.textMuted,
          }}
        >
          {pair.detail}
        </Text>
      </View>
    </Animated.View>
  )
}

function SingleSportNote() {
  const { colors } = useTheme()
  return (
    <View
      style={{
        padding: SPACING.base,
        borderRadius: RADIUS.md,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: colors.accent,
      }}
    >
      <Text style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.text }}>
        One sport, one rule
      </Text>
      <Text
        style={{ marginTop: 4, fontSize: TYPE.small, lineHeight: 19, color: colors.textMuted }}
      >
        FORMA will flag two near-maximal sessions inside 48 hours — the clash that doesn&apos;t
        need two sports to happen. Add a second sport in Settings and you&apos;ll get the full
        interaction map.
      </Text>
    </View>
  )
}
