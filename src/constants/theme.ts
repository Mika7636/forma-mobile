// FORMA's design system: colour, type, spacing, radius and elevation.
//
// ## This file no longer owns a palette
//
// It used to define FORMA's *light* system — a teal brand colour, white cards on
// an off-white page — while `src/theme/tokens.ts` defined a separate dark one for
// live tracking and the workout summary. Two palettes, two sets of contrast
// assumptions, and a seam running straight down the middle of the app: the tab
// bar was dark, and every screen above it was light. It read as two products
// stitched together.
//
// So there is one palette now, and it lives in `src/theme/tokens.ts`. Everything
// below is a *semantic mapping onto those tokens* — `COLORS.pageBg` is
// `tokens.color.bg`, `COLORS.ink` is `tokens.color.text`, and so on. The names
// survive because 58 files call them and the names were never the problem; the
// values are the dark system, and there is nowhere else for a colour to come
// from.
//
// Rule of thumb when adding UI: if you're about to type a raw hex, a font size
// that isn't in TYPE, or a padding that isn't a multiple of 4, reach for a token
// here instead. Conflict amber/red live in constants/conflictColors.ts — that
// file is the source of truth for severity, and derives its colours from here.
import { Platform } from 'react-native'
import { tokens } from '../theme/tokens'

/**
 * The app's colours, mapped onto {@link tokens}.
 *
 * Grouped by *role*, not by hue. The old names are kept where they still make
 * sense as roles (`ink` is still the strongest type colour) and where they were
 * only ever hue names they now point at the dark equivalent — `teal` is the
 * accent, whatever the accent happens to be.
 *
 * ## The two that changed meaning, and why
 *
 * `white` is gone. It meant two incompatible things — the background of a card,
 * and the colour of text printed on a saturated fill — and on a dark theme those
 * diverge completely: cards become {@link COLORS.surface}, and text on a fill
 * has to go *darker*, not lighter. Splitting them is what stops a green button
 * shipping with 2.2:1 white text on it.
 *
 * `pageBg` is now the darkest colour rather than the lightest. Cards sit *above*
 * the page on dark, not on top of a tint.
 */
export const COLORS = {
  /**
   * The accent: primary actions, links, chart series, "good" states.
   *
   * Named `teal` for continuity with the 69 call sites that already say it, but
   * it is `tokens.color.accent` — the same green the tab bar, the live tracker
   * and the route polyline have always used. FORMA had two brand colours for as
   * long as it had two palettes; this is the surviving one.
   */
  teal: tokens.color.accent,
  /** Pressed/hover state for an accent fill. */
  tealDark: '#16A34A',
  /** Brighter accent for numerals and small type that must pop off a tint. */
  tealDeep: tokens.tint.green.text,
  /** Deep accent-tinted surface: selected chips, the Form Score card. */
  tealSoft: tokens.tint.green.bg,
  /** Hairline for an accent-tinted surface. */
  tealBorder: tokens.tint.green.border,

  danger: tokens.color.danger,
  /** Danger-tinted surface. */
  dangerSoft: tokens.tint.red.bg,
  dangerBorder: tokens.tint.red.border,
  /** Danger as *type* on a dark ground — light, not deep. The name is legacy. */
  dangerDeep: tokens.tint.red.text,
  /**
   * Destructive *type*: "Delete", validation errors under an input.
   *
   * Not {@link COLORS.danger}. That red is correct as a fill, an icon or a
   * 4pt rail, but as text it measures 4.45:1 on `surface` and 4.00:1 on
   * `surfaceAlt` — under the 4.5:1 floor, and this app has to be readable on a
   * dim A7 panel in daylight. The same hue lifted for type clears 9:1 on both.
   *
   * An alias of `dangerDeep` rather than a new colour: same value, a name that
   * says what it is for at the call site.
   */
  dangerText: tokens.tint.red.text,

  warning: tokens.color.warn,
  warningSoft: tokens.tint.amber.bg,
  warningBorder: tokens.tint.amber.border,
  /** Warning as type on a dark ground. */
  warningDeep: tokens.tint.amber.text,

  info: '#60A5FA',
  infoSoft: tokens.tint.sky.bg,
  infoBorder: tokens.tint.sky.border,
  infoDeep: tokens.tint.sky.text,

  success: tokens.color.accent,

  /** Strongest type. Headings, numbers, anything that must be read first. */
  ink: tokens.color.text,
  /** Body copy. A step down from ink so a paragraph doesn't shout. */
  body: '#CBD5E1',
  /** Labels and secondary copy. 7.3:1 on the page ground. */
  muted: tokens.color.textMuted,
  /** The dimmest type we allow. 6.4:1 on bg, 5.2:1 on the lightest surface. */
  subtle: '#8A99AE',

  border: tokens.color.border,
  /** A border that needs to be seen — focused inputs, table rules. */
  borderStrong: '#31425C',

  /** Input and well backgrounds. Recessed relative to a card. */
  fieldBg: tokens.color.surfaceAlt,
  /** The page ground. Every screen sits on this. */
  pageBg: tokens.color.bg,
  /** Cards and panels, one step up from the ground. */
  surface: tokens.color.surface,
  /** Nested cards — a stat tile inside a section. One step up again. */
  surfaceAlt: tokens.color.surfaceAlt,

  /**
   * Type and icons printed on a saturated accent/warn/danger fill.
   *
   * Dark, deliberately. White on the accent green is 2.2:1 and on the warning
   * amber 2.1:1 — both unreadable, and both were shipping. The page ground
   * against those same fills is 8.4:1 and 8.7:1.
   */
  onAccent: tokens.color.bg,

  skeleton: '#1B2739',
  skeletonHighlight: '#243247',

  /** Drop-shadow colour. A token so "no raw hex" has no exceptions. */
  shadow: tokens.color.shadow,
  /** The dim behind a modal or bottom sheet. See {@link tokens.color.scrim}. */
  scrim: tokens.color.scrim,
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
 * On a dark theme a drop shadow does much less work than it does on white: there
 * is little contrast between a shadow and the ground it falls on. Separation
 * comes primarily from the surface being *lighter* than the page and from the
 * hairline border. The shadows are kept — and darkened, since they now have to
 * read against a dark ground rather than a light one — mainly so Android's
 * `elevation` still orders overlapping views correctly.
 */
export const SHADOW = {
  card: {
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  floating: {
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const

/** The standard card: same radius, padding, border and shadow everywhere. */
export const CARD = {
  backgroundColor: COLORS.surface,
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
