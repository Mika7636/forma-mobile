// FORMA's design system: the single source of truth for colour, type, spacing,
// radius and elevation. Keep in sync with the web app's Tailwind theme.
//
// Rule of thumb when adding UI: if you're about to type a raw hex, a font size
// that isn't in TYPE, or a padding that isn't a multiple of 4, reach for a token
// here instead. Conflict amber/red live in constants/conflictColors.ts — that
// file is the source of truth for severity, and imports its base reds from here.
import { Platform } from 'react-native'

/** The teal is FORMA's primary brand colour: buttons, links, accents, charts. */
export const COLORS = {
  teal: '#1D9E75',
  tealDark: '#178860',
  tealDeep: '#0F6B4C',
  tealSoft: '#E7F5EF',
  tealBorder: '#C7EBDD',

  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerDeep: '#B91C1C',

  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningDeep: '#B45309',

  info: '#2563EB',
  infoSoft: '#EFF6FF',
  infoBorder: '#BFDBFE',
  infoDeep: '#1D4ED8',

  success: '#16A34A',

  ink: '#111827',
  body: '#374151',
  muted: '#6B7280',
  subtle: '#9CA3AF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  fieldBg: '#F9FAFB',
  /** The app's page background — every screen sits on this, cards sit on white. */
  pageBg: '#FAFAF8',
  white: '#FFFFFF',
  skeleton: '#E9ECEF',
  skeletonHighlight: '#F4F6F8',
} as const

/**
 * Spacing scale (4pt grid). Prefer these over ad-hoc numbers so gaps between
 * sections stay the same on every screen.
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

/** Corner radii. `card` is the one every card/panel in the app uses. */
export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  card: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const

/**
 * Type scale. Sizes are whole numbers on purpose — half-point sizes read as
 * "someone nudged this one screen" rather than as a system.
 */
export const TYPE = {
  /** 11 — timestamps, axis labels, chip captions. */
  caption: 11,
  /** 12 — secondary metadata. */
  micro: 12,
  /** 13 — supporting copy under a title. */
  small: 13,
  /** 14 — default body text. */
  body: 14,
  /** 15 — emphasised body, list rows. */
  bodyLg: 15,
  /** 16 — section headings, input text. */
  subtitle: 16,
  /** 18 — card titles. */
  title: 18,
  /** 22 — screen titles. */
  heading: 22,
  /** 28 — hero numbers. */
  display: 28,
  /** 44 — the Form Score. */
  hero: 44,
} as const

export const WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const

/**
 * Elevation. One shadow for cards, one for things that float above them
 * (toasts, sheets, FABs) — anything else drifts.
 *
 * iOS reads shadow*, Android reads elevation; both are set so a card looks the
 * same on either platform.
 */
export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const

/** The standard white card: same radius, padding, border and shadow everywhere. */
export const CARD = {
  backgroundColor: COLORS.white,
  borderRadius: RADIUS.card,
  padding: SPACING.base,
  borderWidth: 1,
  borderColor: COLORS.border,
  ...SHADOW.card,
} as const

/**
 * Native-feeling motion. Screen transitions and micro-interactions all pull
 * their timing from here so nothing feels faster or slower than the rest.
 */
export const MOTION = {
  /** Micro-interactions: press states, value changes. */
  fast: 150,
  /** The default — matches the native stack push/pop feel. */
  base: 260,
  /** Entrances that should be noticed (toasts, sheets). */
  slow: 380,
  /** Scale a button drops to while held. */
  pressScale: 0.97,
  /** Cards lift rather than shrink. */
  cardPressScale: 0.985,
  /** Reanimated spring used for press feedback. */
  spring: { damping: 18, stiffness: 260, mass: 0.5 },
} as const

/** Touch targets below this fail accessibility guidance on both platforms. */
export const MIN_TOUCH = 44

/** Android's ripple/elevation model differs enough to be worth branching on. */
export const IS_ANDROID = Platform.OS === 'android'
