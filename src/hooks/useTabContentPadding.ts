import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SPACING, TAB_BAR_HEIGHT } from '../theme/tokens'

/**
 * Bottom padding for the scroll content of a screen inside the tab navigator.
 *
 * The tab bar sits above the screen rather than beside it, and on Android 15's
 * edge-to-edge layout it also extends under the gesture bar. A screen that ends
 * its content with a plain `paddingBottom: 32` therefore loses its last row
 * behind the bar — which is what clipped the Dashboard's stat cards through the
 * middle of their labels.
 *
 * `extra` is the breathing room the screen wants *in addition* to clearing the
 * bar, so callers keep whatever end-of-page spacing they already had.
 */
export function useTabContentPadding(extra: number = SPACING.xl): number {
  const insets = useSafeAreaInsets()
  return TAB_BAR_HEIGHT + insets.bottom + extra
}
