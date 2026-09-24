// Theme provider and useTheme(): mode, scheme and palette.

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

const STORAGE_KEY = 'forma.themeMode'

const DEFAULT_MODE: ThemeMode = 'auto'

export interface ThemeValue {
  mode: ThemeMode
  scheme: ThemeScheme
  colors: Palette
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined)

function isMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE)
  const [hydrated, setHydrated] = useState(false)

  const systemScheme = useColorScheme()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY)
        if (!cancelled && isMode(stored)) setModeState(stored)
      } catch {
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  }, [])

  const value = useMemo<ThemeValue>(() => {
    const resolved: ThemeScheme | null =
      systemScheme === 'light' || systemScheme === 'dark' ? systemScheme : null
    const scheme: ThemeScheme = mode === 'auto' ? (resolved ?? 'dark') : mode
    return { mode, scheme, colors: palettes[scheme], setMode }
  }, [mode, systemScheme, setMode])

  if (!hydrated) return null

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
