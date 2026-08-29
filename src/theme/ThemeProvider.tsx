import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { palettes, type Palette, type ThemeMode, type ThemeScheme } from './tokens'

/** Where the chosen mode is persisted. */
const STORAGE_KEY = 'forma.themeMode'

const DEFAULT_MODE: ThemeMode = 'auto'

export interface ThemeValue {
  /** What the user picked: what the Settings control shows as selected. */
  mode: ThemeMode
  /** The resolved scheme. `auto` becomes whichever the OS is currently in. */
  scheme: ThemeScheme
  /** The active palette. Every colour in the app comes from here. */
  colors: Palette
  /** Change the mode. Applies immediately and persists in the background. */
  setMode: (mode: ThemeMode) => void
}

/**
 * Undefined until a provider is mounted, so {@link useTheme} can tell "no
 * provider" from "provider with default values" and throw a useful error rather
 * than silently rendering an unstyled screen.
 */
const ThemeContext = createContext<ThemeValue | undefined>(undefined)

function isMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto'
}

/**
 * Reads the persisted theme mode once, before anything renders.
 *
 * ## Why this blocks
 *
 * AsyncStorage is asynchronous, so the honest options are to render with a guess
 * and correct it a frame later, or to render nothing until the answer arrives.
 * The first is what produces the white flash this provider exists to prevent:
 * for a user who has chosen dark, the app would paint the light theme, then
 * repaint. On the A7 that is a visible flash of a completely different-coloured
 * screen on every cold start.
 *
 * So the tree below is not mounted until the read resolves. The wait is a single
 * AsyncStorage round-trip — the same one Firebase Auth is already making — and
 * it is covered by the native splash, which `RootNavigator` does not dismiss
 * until it has laid out a frame. `null` is returned rather than a spinner
 * precisely so nothing paints before the palette is known.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE)
  const [hydrated, setHydrated] = useState(false)

  // `useColorScheme` re-renders on its own when the OS setting changes, which is
  // what makes 'auto' track Android's Display > Dark theme toggle live rather
  // than only at launch.
  const systemScheme = useColorScheme()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY)
        if (!cancelled && isMode(stored)) setModeState(stored)
      } catch {
        // Unreadable storage is a first launch as far as this is concerned:
        // fall through to the default rather than blocking the app on it.
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    // State first, storage second. The repaint is the thing the user is waiting
    // for; persisting it is bookkeeping and must not be in the way of it.
    setModeState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  }, [])

  const value = useMemo<ThemeValue>(() => {
    // `useColorScheme` can report `null` or `'unspecified'` — while the OS value
    // is still unknown, and permanently on Android builds where the app has no
    // configured appearance. Neither is a scheme, so both fall back. Dark is the
    // better guess for FORMA: it is what the app shipped as and what the
    // live-tracking screens are designed around.
    const resolved: ThemeScheme | null =
      systemScheme === 'light' || systemScheme === 'dark' ? systemScheme : null
    const scheme: ThemeScheme = mode === 'auto' ? (resolved ?? 'dark') : mode
    return { mode, scheme, colors: palettes[scheme], setMode }
  }, [mode, systemScheme, setMode])

  if (!hydrated) return null

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/**
 * The active theme.
 *
 * `const { colors } = useTheme()` is the only way a component should learn a
 * colour. Styles that depend on one must be built inside the component from
 * `colors` — a module-level style constant captures whichever palette happened
 * to be active when the module was first evaluated and then never updates,
 * which is exactly the "one screen kept its old colour" bug this system is
 * meant to make impossible.
 */
export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
