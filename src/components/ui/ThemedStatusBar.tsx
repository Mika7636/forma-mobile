import { StatusBar } from 'expo-status-bar'
import { useTheme } from '../../theme/ThemeProvider'

/**
 * The status bar, in the theme the user chose.
 *
 * ## Why not `<StatusBar style="auto" />`
 *
 * `auto` sounds like exactly this, but it resolves against React Native's
 * `useColorScheme()` — the *OS* setting. FORMA's theme is only the OS setting
 * when the mode is `auto`; a user who has forced Light while their phone is in
 * dark mode would get white icons on FORMA's white header, which is the one
 * case a status bar has to get right. So it is resolved from our own scheme.
 *
 * Dark scheme → light icons, and vice versa: the bar's content has to contrast
 * with the page it sits on, so it is the inverse of the scheme name.
 *
 * Screens that fill the status-bar area with a saturated colour of their own —
 * `OfflineBanner` — state their requirement directly instead of using this.
 */
export default function ThemedStatusBar() {
  const { scheme } = useTheme()
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
}
