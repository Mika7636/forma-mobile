import { useEffect } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { COLORS } from '../../constants/theme'
import type { Conflict } from '../../types/conflict'

const WARNING = '#f59e0b'
const DANGER = '#ef4444'

interface ConflictModalProps {
  visible: boolean
  conflicts: Conflict[]
  /** True while the "Undo session" delete is in flight. */
  undoing?: boolean
  /** Keep the session; just dismiss. */
  onKeep: () => void
  /** Delete the session + its conflicts, then dismiss. */
  onUndo: () => void
}

/**
 * Native modal surfaced after a session is saved *and* the conflict engine
 * flags it. Shows every detected conflict with a severity-coloured left border
 * and lets the athlete either keep the session or undo it (deleting the session
 * and its conflicts from Firestore).
 */
export default function ConflictModal({
  visible,
  conflicts,
  undoing = false,
  onKeep,
  onUndo,
}: ConflictModalProps) {
  // Any "danger" conflict escalates the header to the injury-risk framing.
  const hasDanger = conflicts.some((c) => c.severity === 'danger')

  // Warn the athlete physically the moment the modal appears.
  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <Animated.View
        entering={FadeIn.duration(150)}
        style={{
          flex: 1,
          backgroundColor: 'rgba(17, 24, 39, 0.55)',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          entering={FadeInDown.duration(220)}
          style={{
            backgroundColor: COLORS.white,
            borderRadius: 20,
            paddingTop: 24,
            paddingBottom: 20,
            paddingHorizontal: 20,
            maxHeight: '80%',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '800',
              color: hasDanger ? DANGER : WARNING,
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            {hasDanger ? '🚨 High Injury Risk' : '⚠️ Training Conflict Detected'}
          </Text>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {conflicts.map((conflict, index) => {
              const isDanger = conflict.severity === 'danger'
              const accent = isDanger ? DANGER : WARNING
              return (
                <View
                  key={conflict.conflictId || index}
                  style={{
                    flexDirection: 'row',
                    backgroundColor: isDanger ? '#FEF2F2' : '#FFFBEB',
                    borderLeftWidth: 4,
                    borderLeftColor: accent,
                    borderRadius: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 10 }}>
                    {isDanger ? '🚨' : '⚠️'}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      lineHeight: 20,
                      color: COLORS.body,
                    }}
                  >
                    {conflict.message}
                  </Text>
                </View>
              )
            })}
          </ScrollView>

          <View style={{ marginTop: 8 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                onKeep()
              }}
              disabled={undoing}
              style={({ pressed }) => ({
                height: 52,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.teal,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>
                Got it, keep session
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                onUndo()
              }}
              disabled={undoing}
              style={({ pressed }) => ({
                height: 52,
                borderRadius: 12,
                marginTop: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: DANGER,
                backgroundColor: COLORS.white,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {undoing ? (
                <ActivityIndicator color={DANGER} />
              ) : (
                <Text style={{ color: DANGER, fontSize: 16, fontWeight: '700' }}>
                  Undo session
                </Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}
