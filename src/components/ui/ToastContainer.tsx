// The toast list, mounted at the app root above the navigator.

import { useCallback } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { SPACING } from '../../theme/tokens'
import { useToastStore } from '../../store/toastStore'
import Toast from './Toast'

interface ToastContainerProps {
  insideModal?: boolean
}

export default function ToastContainer({ insideModal = false }: ToastContainerProps) {
  const toasts = useToastStore((s) => s.toasts)
  const storedOffset = useToastStore((s) => s.bottomOffset)
  const dismiss = useToastStore((s) => s.dismiss)
  const insets = useSafeAreaInsets()
  const bottomOffset = insideModal ? 0 : storedOffset

  const handleDismiss = useCallback((id: string) => dismiss(id), [dismiss])

  if (toasts.length === 0) return null

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: insets.bottom + bottomOffset + SPACING.md,
        paddingHorizontal: SPACING.base,
        gap: SPACING.sm,
      }}
    >
      {toasts.map((item) => (
        <Animated.View key={item.id} layout={LinearTransition.springify().damping(18)}>
          <Toast item={item} onDismiss={handleDismiss} />
        </Animated.View>
      ))}
    </View>
  )
}
