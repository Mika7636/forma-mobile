// FORMA's design tokens: both palettes, and the shared scales.

import { Platform } from 'react-native'
import { DARK_MAP_STYLE } from './mapStyle'

export type ThemeScheme = 'light' | 'dark'
export type ThemeMode = ThemeScheme | 'auto'

export interface Tint {
  bg: string
  border: string
  text: string
}

export type FormTone = 'red' | 'orange' | 'yellow' | 'lightgreen' | 'green' | 'brightgreen'

export interface HeroFill {
  gradient: readonly [string, string]
  ink: string
  border: string
  chipBg: string
  chipBorder: string
  chipInk: string
}

export interface HeroPanel {
  bg: string
  border: string
  borderWidth: number
  pad: number
  radius: number
}

interface Elevation {
  shadowColor: string
  shadowOpacity: number
  shadowRadius: number
  shadowOffset: { width: number; height: number }
  elevation: number
}

export interface Palette {
  bg: string
  surface: string
  surfaceAlt: string
  border: string
  borderStrong: string
  text: string
  textBody: string
  textMuted: string
  textSubtle: string
  fieldBg: string

  accent: string
  accentPressed: string
  accentText: string
  accentSoft: string
  accentBorder: string

  warn: string
  warnText: string
  warnSoft: string
  warnBorder: string

  danger: string
  dangerText: string
  dangerSoft: string
  dangerBorder: string

  info: string
  infoText: string
  infoSoft: string
  infoBorder: string

  onAccent: string

  bgFade: readonly [string, string]
  shadow: string
  scrim: string
  skeleton: string
  skeletonHighlight: string
  shadowCard: Elevation
  shadowFloating: Elevation

  hero: Record<FormTone, HeroFill>
  heroGradient: { start: { x: number; y: number }; end: { x: number; y: number } }
  heroSheen: string
  heroGloss: readonly [string, string]
  heroLabel: string
  heroBody: string
  heroPanel: HeroPanel
  heroStat: { fitness: Tint; fatigue: Tint }
  heroStatChrome: { label: string; highlight: string }

  tint: {
    green: Tint
    amber: Tint
    red: Tint
    sky: Tint
    orange: Tint
    teal: Tint
    violet: Tint
  }

  palette: {
    green: string
    sky: string
    red: string
    amber: string
    violet: string
    orange: string
    slate: string
    bronze: string
  }
  sport: {
    running: string
    cycling: string
    swimming: string
    football: string
    combat: string
    gym: string
    strength: string
  }
  zone: readonly string[]
  heat: readonly string[]
  rpe: readonly string[]

  mapStyle: readonly unknown[]
}

function darkHero(bg: string, ink: string, border: string): HeroFill {
  return {
    gradient: [bg, '#141E2E'],
    ink,
    border,
    chipBg: '#1B2739',
    chipBorder: border,
    chipInk: ink,
  }
}

const HERO_SCRIM = 'rgba(11,18,32,0.52)'
const HERO_SCRIM_EDGE = 'rgba(255,255,255,0.22)'

function lightHero(from: string, to: string): HeroFill {
  return {
    gradient: [from, to],
    ink: '#FFFFFF',
    border: from,
    chipBg: HERO_SCRIM,
    chipBorder: HERO_SCRIM_EDGE,
    chipInk: '#FFFFFF',
  }
}

const dark: Palette = {
  bg: '#0B1220',
  surface: '#141E2E',
  surfaceAlt: '#1B2739',
  border: '#243247',
  borderStrong: '#31425C',
  text: '#F8FAFC',
  textBody: '#CBD5E1',
  textMuted: '#94A3B8',
  textSubtle: '#8A99AE',
  fieldBg: '#1B2739',

  accent: '#22C55E',
  accentPressed: '#16A34A',
  accentText: '#4ADE80',
  accentSoft: '#10291F',
  accentBorder: '#1D5138',

  warn: '#F59E0B',
  warnText: '#FCD34D',
  warnSoft: '#2A2010',
  warnBorder: '#5A431A',

  danger: '#EF4444',
  dangerText: '#FCA5A5',
  dangerSoft: '#2A1416',
  dangerBorder: '#5B2326',

  info: '#60A5FA',
  infoText: '#93C5FD',
  infoSoft: '#111E33',
  infoBorder: '#25406B',

  onAccent: '#0B1220',

  bgFade: ['rgba(11,18,32,0.50)', 'rgba(11,18,32,0.92)'],
  shadow: '#000000',
  scrim: 'rgba(0,0,0,0.66)',
  skeleton: '#1B2739',
  skeletonHighlight: '#243247',
  shadowCard: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  shadowFloating: {
    shadowColor: '#000000',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  hero: {
    red: darkHero('#2A1416', '#FCA5A5', '#5B2326'),
    orange: darkHero('#2A1A10', '#FDBA74', '#5A3A1A'),
    yellow: darkHero('#2A2010', '#FCD34D', '#5A431A'),
    lightgreen: darkHero('#0E2626', '#5EEAD4', '#1C4A48'),
    green: darkHero('#10291F', '#4ADE80', '#1D5138'),
    brightgreen: darkHero('#10291F', '#4ADE80', '#1D5138'),
  },
  heroGradient: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  heroSheen: 'rgba(74,222,128,0.10)',
  heroGloss: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)'],
  heroLabel: '#94A3B8',
  heroBody: '#CBD5E1',
  heroStat: {
    fitness: { bg: '#111E33', border: '#25406B', text: '#93C5FD' },
    fatigue: { bg: '#2A1416', border: '#5B2326', text: '#FCA5A5' },
  },
  heroStatChrome: { label: '#94A3B8', highlight: 'rgba(0,0,0,0)' },
  heroPanel: {
    bg: 'rgba(0,0,0,0)',
    border: 'rgba(0,0,0,0)',
    borderWidth: 0,
    pad: 0,
    radius: 0,
  },

  tint: {
    green: { bg: '#10291F', border: '#1D5138', text: '#4ADE80' },
    amber: { bg: '#2A2010', border: '#5A431A', text: '#FCD34D' },
    red: { bg: '#2A1416', border: '#5B2326', text: '#FCA5A5' },
    sky: { bg: '#111E33', border: '#25406B', text: '#93C5FD' },
    orange: { bg: '#2A1A10', border: '#5A3A1A', text: '#FDBA74' },
    teal: { bg: '#0E2626', border: '#1C4A48', text: '#5EEAD4' },
    violet: { bg: '#1C1633', border: '#392C63', text: '#C4B5FD' },
  },

  palette: {
    green: '#22C55E',
    sky: '#38BDF8',
    red: '#F87171',
    amber: '#FBBF24',
    violet: '#A78BFA',
    orange: '#FB923C',
    slate: '#94A3B8',
    bronze: '#D8A25E',
  },
  sport: {
    running: '#FB923C',
    cycling: '#A78BFA',
    swimming: '#38BDF8',
    football: '#22C55E',
    combat: '#F87171',
    gym: '#94A3B8',
    strength: '#D8A25E',
  },
  zone: ['#94A3B8', '#38BDF8', '#22C55E', '#FBBF24', '#F87171'],
  heat: ['#1B2739', '#14432A', '#1E7A45', '#22C55E'],
  rpe: [
    '#22C55E',
    '#3FCB56',
    '#6BD24A',
    '#9BD53E',
    '#CBD336',
    '#F0C42E',
    '#F59E0B',
    '#F2792C',
    '#EF5B39',
    '#EF4444',
  ],

  mapStyle: DARK_MAP_STYLE,
}

const light: Palette = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF1F6',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textBody: '#334155',
  textMuted: '#5B6675',
  textSubtle: '#5F6A78',
  fieldBg: '#EDF1F6',

  accent: '#22C55E',
  accentPressed: '#16A34A',
  accentText: '#157A3A',
  accentSoft: 'rgba(34,197,94,0.10)',
  accentBorder: 'rgba(34,197,94,0.32)',

  warn: '#F59E0B',
  warnText: '#AB4E08',
  warnSoft: 'rgba(245,158,11,0.12)',
  warnBorder: 'rgba(245,158,11,0.38)',

  danger: '#EF4444',
  dangerText: '#B91C1C',
  dangerSoft: 'rgba(239,68,68,0.10)',
  dangerBorder: 'rgba(239,68,68,0.32)',

  info: '#3B82F6',
  infoText: '#1D4ED8',
  infoSoft: 'rgba(59,130,246,0.10)',
  infoBorder: 'rgba(59,130,246,0.32)',

  onAccent: '#0B1220',

  bgFade: ['rgba(245,247,250,0.50)', 'rgba(245,247,250,0.92)'],
  shadow: '#000000',
  scrim: 'rgba(15,23,42,0.45)',
  skeleton: '#E9ECEF',
  skeletonHighlight: '#F4F6F8',
  shadowCard: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  shadowFloating: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  hero: {
    red: lightHero('#EF4444', '#DC2626'),
    orange: lightHero('#F97316', '#EA580C'),
    yellow: lightHero('#F59E0B', '#D97706'),
    lightgreen: lightHero('#14B8A6', '#0D9488'),
    green: lightHero('#22C55E', '#16A34A'),
    brightgreen: lightHero('#22C55E', '#16A34A'),
  },
  heroGradient: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  heroSheen: 'rgba(255,255,255,0.28)',
  heroGloss: ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)'],
  heroLabel: 'rgba(255,255,255,0.80)',
  heroBody: 'rgba(255,255,255,0.90)',
  heroStat: {
    fitness: { bg: '#FFFFFF', border: '#FFFFFF', text: '#1D4ED8' },
    fatigue: { bg: '#FFFFFF', border: '#FFFFFF', text: '#B91C1C' },
  },
  heroStatChrome: { label: '#5B6675', highlight: 'rgba(0,0,0,0)' },
  heroPanel: {
    bg: HERO_SCRIM,
    border: HERO_SCRIM_EDGE,
    borderWidth: 1,
    pad: 12,
    radius: 16,
  },

  tint: {
    green: { bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.32)', text: '#157A3A' },
    amber: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.38)', text: '#AB4E08' },
    red: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.32)', text: '#B91C1C' },
    sky: { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.32)', text: '#1D4ED8' },
    orange: { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.32)', text: '#B93C0B' },
    teal: { bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.36)', text: '#0F766E' },
    violet: { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.32)', text: '#6D28D9' },
  },

  palette: {
    green: '#157A3A',
    sky: '#0369A1',
    red: '#B91C1C',
    amber: '#AB4E08',
    violet: '#6D28D9',
    orange: '#B93C0B',
    slate: '#475569',
    bronze: '#92400E',
  },
  sport: {
    running: '#B93C0B',
    cycling: '#6D28D9',
    swimming: '#0369A1',
    football: '#157A3A',
    combat: '#B91C1C',
    gym: '#475569',
    strength: '#92400E',
  },
  zone: ['#475569', '#0369A1', '#157A3A', '#AB4E08', '#B91C1C'],
  heat: ['#F1F5F9', '#BBF7D0', '#4ADE80', '#157A3A'],
  rpe: [
    '#157A3A',
    '#3D8A2E',
    '#5E9222',
    '#7F9417',
    '#9A8B12',
    '#AC780E',
    '#AB4E08',
    '#B4400F',
    '#B72F16',
    '#B91C1C',
  ],

  mapStyle: [],
}

export const palettes: Record<ThemeScheme, Palette> = { light, dark }

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  card: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const

export const TYPE = {
  caption: 11,
  micro: 12,
  small: 13,
  body: 14,
  bodyLg: 15,
  subtitle: 16,
  title: 18,
  heading: 22,
  display: 28,
  hero: 44,
} as const

export const WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const

export const MOTION = {
  fast: 150,
  base: 260,
  slow: 380,
  pressScale: 0.97,
  cardPressScale: 0.985,
  spring: { damping: 18, stiffness: 260, mass: 0.5 },
} as const

export const MIN_TOUCH = 44

export const TAB_BAR_HEIGHT = 58

export const IS_ANDROID = Platform.OS === 'android'

export const IMAGERY_SCRIM = 'rgba(11,18,32,0.62)'
export const IMAGERY_INK = '#FFFFFF'

export const NOTIFICATION_ACCENT = dark.accent

export const NOTIFICATION_WARN = dark.warn

function channel(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  return (
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16))
  )
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function mix(src: string, dst: string, t: number): string {
  const parse = (hex: string): [number, number, number] | null => {
    const h = hex.replace('#', '')
    if (h.length !== 6) return null
    const n = parseInt(h, 16)
    return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const a = parse(src)
  const b = parse(dst)
  if (!a || !b) return dst

  const k = Math.max(0, Math.min(1, t))
  const out = a.map((c, i) => Math.round(c * k + b[i] * (1 - k)))
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

const INK_DARK = '#0B1220'
const INK_LIGHT = '#FFFFFF'

/** Ink that reads on an arbitrary fill: whichever of the two inks contrasts more. */
export function onColor(fill: string): string {
  return contrast(INK_DARK, fill) >= contrast(INK_LIGHT, fill) ? INK_DARK : INK_LIGHT
}

export function cardStyle(colors: Palette) {
  return {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.card,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...colors.shadowCard,
  } as const
}

export const RPE_LABEL: readonly string[] = [
  'Very light',
  'Light',
  'Moderate',
  'Somewhat hard',
  'Hard',
  'Harder',
  'Very hard',
  'Very hard +',
  'Near maximal',
  'Maximal',
]

function clampIndex(rpe: number): number {
  return Math.min(Math.max(Math.round(rpe), 1), 10) - 1
}

export function rpeLabel(rpe: number): string {
  return RPE_LABEL[clampIndex(rpe)]
}

export function rpeColor(rpe: number, colors: Palette): string {
  return colors.rpe[clampIndex(rpe)]
}
