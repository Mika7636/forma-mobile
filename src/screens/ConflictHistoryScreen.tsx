// Full history of every training conflict FORMA has flagged — active and
// dismissed — reachable from Settings. Filterable, tap a card for the full
// explanation and the sessions involved, dismiss the ones still active.
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeInDown } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import { COLORS } from '../constants/theme'
import { severityStyle } from '../constants/conflictColors'
import { useConflictHistory } from '../hooks/useConflictHistory'
import { useSessionHistory } from '../hooks/useSessionHistory'
import { conflictSportsLabel, detectedAtDate } from '../utils/conflictInfo'
import type { Conflict } from '../types/conflict'
import type { ConflictHistoryScreenProps } from '../navigation/types'

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
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.fieldBg }} edges={['top']}>
      <StatusBar style="dark" />

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
          <Text style={{ fontSize: 24, color: COLORS.ink }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.ink, marginLeft: 4 }}>
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
                Haptics.selectionAsync()
                setFilter(f.value)
              }}
              style={{
                flex: 1,
                borderRadius: 999,
                paddingVertical: 9,
                alignItems: 'center',
                backgroundColor: active ? COLORS.teal : COLORS.white,
                borderWidth: 1,
                borderColor: active ? COLORS.teal : COLORS.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: active ? COLORS.white : COLORS.body,
                }}
              >
                {f.label} {counts[f.value] > 0 ? `(${counts[f.value]})` : ''}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.teal} />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {visible.map((conflict, i) => (
            <Animated.View key={conflict.conflictId} entering={FadeInDown.delay(i * 40).duration(280)}>
              <HistoryCard
                conflict={conflict}
                onPress={() => setDetail(conflict)}
                onDismiss={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  void dismiss(conflict.conflictId)
                }}
              />
            </Animated.View>
          ))}
        </ScrollView>
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
  const style = severityStyle(conflict.severity)
  const active = !conflict.resolved

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: COLORS.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
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

        <Text style={{ fontSize: 13.5, color: COLORS.body, lineHeight: 19 }} numberOfLines={3}>
          {conflict.message}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text style={{ fontSize: 11.5, color: COLORS.subtle }}>
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
            <Text style={{ fontSize: 12.5, fontWeight: '800', color: style.deep }}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: active ? COLORS.tealSoft : COLORS.fieldBg,
      }}
    >
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: '800',
          letterSpacing: 0.4,
          color: active ? COLORS.tealDark : COLORS.subtle,
        }}
      >
        {active ? 'ACTIVE' : 'DISMISSED'}
      </Text>
    </View>
  )
}

function EmptyState({ filter }: { filter: Filter }) {
  const copy =
    filter === 'active'
      ? { emoji: '✅', text: 'No active conflicts. Nice balance right now.' }
      : filter === 'dismissed'
        ? { emoji: '🗂️', text: "Nothing dismissed yet." }
        : { emoji: '💪', text: 'No conflicts yet — your training balance looks good!' }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 44 }}>{copy.emoji}</Text>
      <Text
        style={{
          marginTop: 12,
          fontSize: 15,
          fontWeight: '600',
          color: COLORS.muted,
          textAlign: 'center',
          lineHeight: 21,
        }}
      >
        {copy.text}
      </Text>
    </View>
  )
}
