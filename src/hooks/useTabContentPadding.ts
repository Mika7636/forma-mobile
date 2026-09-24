// Bottom padding that clears the tab bar and gesture bar.

import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SPACING, TAB_BAR_HEIGHT } from '../theme/tokens'

export function useTabContentPadding(extra: number = SPACING.xl): number {
  const insets = useSafeAreaInsets()
  return TAB_BAR_HEIGHT + insets.bottom + extra
}
