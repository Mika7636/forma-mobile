// Full history of every training conflict FORMA has flagged — active and
// dismissed — reachable from Settings. Filterable, tap a card for the full
// explanation and the sessions involved, dismiss the ones still active.
import { useMemo, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { haptics } from '../utils/haptics'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import EmptyState from '../components/ui/EmptyState'
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton'
import { severityStyle } from '../constants/conflictColors'
import { useConflictHistory } from '../hooks/useConflictHistory'
import { useSessionHistory } from '../hooks/useSessionHistory'
import { conflictSportsLabel, detectedAtDate } from '../utils/conflictInfo'
import type { Conflict } from '../types/conflict'
import type { ConflictHistoryScreenProps } from '../navigation/types'
import { RADIUS, SPACING, TYPE } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'

type Filter = 'all' | 'active' | 'dismissed'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'dismissed', label: 'Dismissed' },
]

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ConflictHistoryScreen({ navigation }: ConflictHistoryScreenProps) {
  const { colors } = useTheme()

  const { conflicts, loading, dismiss } = useConflictHistory()
  const { sessions } = useSessionHistory()
  const [filter, setFilter] = useState<Filter>('all')
  const [detail, setDetail] = useState<Conflict | null>(null)

  const counts = useMemo(
    () => ({
      all: conflicts.length,
      active: conflicts.filter((c) => !c.resolved).length,
      dismissed: conflicts.filter((c) => c.resolved).length,
    }),
    [conflicts],
  )

  const visible = useMemo(() => {
    if (filter === 'active') return conflicts.filter((c) => !c.resolved)
    if (filter === 'dismissed') return conflicts.filter((c) => c.resolved)
    return conflicts
  }, [conflicts, filter])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 24, color: colors.text }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginLeft: 4 }}>
          Conflict History
        </Text>
      </View>

      {/* Filter tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
        {FILTERS.map((f) => {
          const active = filter === f.value
          return (
            <Pressable
              key={f.value}
              onPress={() => {
                haptics.selection()
                setFilter(f.value)
              }}
              style={{
                flex: 1,
                borderRadius: 999,
                paddingVertical: 9,
                alignItems: 'center',
                backgroundColor: active ? colors.accent : colors.surfaceAlt,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: active ? colors.onAccent : colors.textBody,
                }}
              >
                {f.label} {counts[f.value] > 0 ? `(${counts[f.value]})` : ''}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {loading ? (
        <View style={{ padding: SPACING.base, paddingTop: SPACING.sm, gap: SPACING.md }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <Skeleton width={34} height={34} radius={RADIUS.pill} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="80%" height={10} />
                </View>
              </View>
              <View style={{ marginTop: SPACING.md }}>
                <Skeleton height={12} width="90%" />
              </View>
            </SkeletonCard>
          ))}
        </View>
      ) : visible.length === 0 ? (
        <HistoryEmptyState filter={filter} />
      ) : (
        // FlatList, not a ScrollView + map: this list is unbounded (the "All"
        // filter includes every conflict ever recorded), so mapping it would
        // mount every card at once and grow steadily heavier with account age.
        <FlatList
          data={visible}
          keyExtractor={(conflict) => conflict.conflictId}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40, gap: 12 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item, index }) => (
            <Animated.View
              // Cap the stagger: uncapped, the 40th card would wait 1.6s to
              // appear, and a card scrolled back into view would re-animate
              // after an ever-longer delay.
              entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(280)}
            >
              <HistoryCard
                conflict={item}
                onPress={() => setDetail(item)}
                onDismiss={() => {
                  haptics.light()
                  void dismiss(item.conflictId)
                }}
              />
            </Animated.View>
          )}
        />
      )}

      <ConflictDetailSheet
        conflicts={detail ? [detail] : null}
        sessions={sessions}
        onClose={() => setDetail(null)}
        onDismiss={(id) => {
          void dismiss(id)
          setDetail(null)
        }}
      />
    </SafeAreaView>
  )
}

function HistoryCard({
  conflict,
  onPress,
  onDismiss,
}: {
  conflict: Conflict
  onPress: () => void
  onDismiss: () => void
}) {
  const { colors } = useTheme()

  const style = severityStyle(conflict.severity, colors)
  const active = !conflict.resolved

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        opacity: active ? 1 : 0.82,
      }}
    >
      {/* Severity accent rail */}
      <View
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: style.solid }}
      />
      <View style={{ padding: 14, paddingLeft: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>{style.icon}</Text>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: style.deep }}>
            {style.title}
          </Text>
          <StatusBadge active={active} />
        </View>

        <Text style={{ fontSize: 14, color: colors.textBody, lineHeight: 19 }} numberOfLines={3}>
          {conflict.message}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text style={{ fontSize: 12, color: colors.textSubtle }}>
            {formatDate(detectedAtDate(conflict))} · {conflictSportsLabel(conflict)}
          </Text>
        </View>

        {active ? (
          <Pressable
            onPress={onDismiss}
            style={{
              marginTop: 12,
              alignSelf: 'flex-start',
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: style.solid,
              paddingHorizontal: 16,
              paddingVertical: 7,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '800', color: style.deep }}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: active ? colors.accentSoft : colors.fieldBg,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.4,
          color: active ? colors.accentPressed : colors.textSubtle,
        }}
      >
        {active ? 'ACTIVE' : 'DISMISSED'}
      </Text>
    </View>
  )
}

function HistoryEmptyState({ filter }: { filter: Filter }) {
  // No conflicts is the *good* outcome here, so all three read as reassurance
  // rather than as an error — and none of them offers a CTA, because there's
  // genuinely nothing the user should go and do about it.
  const copy =
    filter === 'active'
      ? {
          emoji: '✅',
          title: 'All clear',
          message: 'No active conflicts. Your balance looks good right now.',
        }
      : filter === 'dismissed'
        ? {
            emoji: '🗂️',
            title: 'Nothing dismissed',
            message: "Conflicts you dismiss will be kept here so you can look back at them.",
          }
        : {
            emoji: '💪',
            title: 'No conflicts yet',
            message: 'Your training balance looks good! FORMA will flag it here if that changes.',
          }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}>
      <EmptyState emoji={copy.emoji} title={copy.title} message={copy.message} />
    </View>
  )
}
