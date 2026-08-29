// Mounted at the app root, above the navigator — which is what makes
// `toast.success(...)` work from any screen or service without each of them
// wiring up its own overlay.
//
// The one exception is React Native's `<Modal>`: it renders into a *separate
// native window*, so anything outside it — including the root container — is
// drawn underneath and stays invisible while the modal is up. Screens with a
// long-lived Modal that keeps showing toasts (the session editor) therefore
// render a second `<ToastContainer insideModal />` within it. Both read the same
// store, and only one is ever on screen at a time, so they can't double up.
import { useCallback } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { SPACING } from '../../theme/tokens'
import { useToastStore } from '../../store/toastStore'
import Toast from './Toast'

interface ToastContainerProps {
  /**
   * Set on the copy rendered inside a `<Modal>`. A full-screen modal covers the
   * tab bar, so the tab-bar offset must not be applied — the toast would float
   * an inexplicable 58px above the bottom edge.
   */
  insideModal?: boolean
}

export default function ToastContainer({ insideModal = false }: ToastContainerProps) {
  const toasts = useToastStore((s) => s.toasts)
  const storedOffset = useToastStore((s) => s.bottomOffset)
  const dismiss = useToastStore((s) => s.dismiss)
  const insets = useSafeAreaInsets()
  const bottomOffset = insideModal ? 0 : storedOffset

  const handleDismiss = useCallback((id: string) => dismiss(id), [dismiss])

  // Nothing to show → render nothing at all, so there's no invisible view
  // sitting over the tab bar swallowing touches.
  if (toasts.length === 0) return null

  return (
    <View
      // `box-none` is the important bit: the container itself must never catch
      // a touch, or it would block the tab bar underneath it. Only the toast
      // cards inside are interactive.
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        // Clear the home indicator/gesture bar, then the tab bar on top of that.
        paddingBottom: insets.bottom + bottomOffset + SPACING.md,
        paddingHorizontal: SPACING.base,
        gap: SPACING.sm,
      }}
    >
      {toasts.map((item) => (
        // `layout` is what makes the survivors slide down smoothly when a toast
        // above them is dismissed, instead of snapping into the gap.
        <Animated.View key={item.id} layout={LinearTransition.springify().damping(18)}>
          <Toast item={item} onDismiss={handleDismiss} />
        </Animated.View>
      ))}
    </View>
  )
}
