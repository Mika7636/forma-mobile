import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import { COLORS } from '../../constants/theme'
import { INTERACTION_LEVELS } from '../../constants/conflictColors'
import { SPORT_META } from '../../utils/sportMeta'
import type { SportType } from '../../types/session'

interface SportInteractionMatrixProps {
  /** The user's active sports; only pairs among these are shown. */
  sports: SportType[]
  /** Current matrix, keyed by alphabetical "a_b" pair. */
  interactions: Record<string, number>
  onChange: (a: SportType, b: SportType, level: number) => void
}

/** Canonical alphabetical pair key — matches conflictDetector's pairKey(). */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('_')
}

/**
 * Visual editor for how strongly each pair of the user's sports competes for
 * recovery. Each pair gets a None/Low/Medium/High segmented control, colour-coded
 * to line up with the conflict severities (Medium = warning amber, High = danger
 * red). Only pairs among the user's selected sports are shown. Changes are pushed
 * up immediately (the parent saves to Firestore).
 */
export default function SportInteractionMatrix({
  sports,
  interactions,
  onChange,
}: SportInteractionMatrixProps) {
  const pairs = useMemo(() => {
    const out: [SportType, SportType][] = []
    for (let i = 0; i < sports.length; i++) {
      for (let j = i + 1; j < sports.length; j++) out.push([sports[i], sports[j]])
    }
    return out
  }, [sports])

  return (
    <View>
      <Text style={{ fontSize: 13, color: COLORS.muted, marginBottom: 14, lineHeight: 18 }}>
        Tell FORMA which of your sports stress the same muscles or nervous system. Higher settings
        mean more warnings.
      </Text>

      {pairs.length === 0 ? (
        <Text style={{ fontSize: 13, color: COLORS.subtle }}>
          Add at least two active sports to customise interactions.
        </Text>
      ) : (
        pairs.map(([a, b]) => {
          const level = interactions[pairKey(a, b)] ?? 0
          const metaA = SPORT_META[a]
          const metaB = SPORT_META[b]
          const activeLevel = INTERACTION_LEVELS.find((l) => l.value === level)
          return (
            <View key={pairKey(a, b)} style={{ marginBottom: 16 }}>
              <Text
                style={{ fontSize: 14, fontWeight: '700', color: COLORS.body, marginBottom: 7 }}
              >
                {metaA?.icon} {metaA?.label ?? a}{'  ↔  '}{metaB?.icon} {metaB?.label ?? b}
              </Text>

              <View style={{ flexDirection: 'row' }}>
                {INTERACTION_LEVELS.map((lvl) => {
                  const on = level === lvl.value
                  return (
                    <Pressable
                      key={lvl.value}
                      onPress={() => {
                        if (on) return
                        haptics.light()
                        onChange(a, b, lvl.value)
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${metaA?.label ?? a} and ${metaB?.label ?? b} interaction: ${lvl.label}`}
                      style={{
                        flex: 1,
                        marginRight: lvl.value < 3 ? 6 : 0,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: on ? lvl.color : COLORS.border,
                        backgroundColor: on ? lvl.color : COLORS.surfaceAlt,
                        paddingVertical: 9,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: on ? COLORS.onAccent : COLORS.muted,
                        }}
                      >
                        {lvl.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {activeLevel ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.subtle }}>
                  {activeLevel.hint}
                </Text>
              ) : null}
            </View>
          )
        })
      )}
    </View>
  )
}
