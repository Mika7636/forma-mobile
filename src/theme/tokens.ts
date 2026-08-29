/**
 * FORMA's design tokens: two complete palettes, plus everything that doesn't
 * depend on which one is active.
 *
 * ## The contract
 *
 * `palettes.light` and `palettes.dark` have **identical key sets**. That is the
 * whole design: a component reads `colors.surface` and never asks which theme it
 * is in, so there is exactly one styling path and no `scheme === 'dark' ? … : …`
 * ternaries scattered through the UI. Anything that genuinely differs between
 * modes — a map style, a shadow opacity, a tint ramp — differs *here*, as a
 * value, not out there as a branch.
 *
 * Adding a key means adding it to both. TypeScript enforces that: both are typed
 * as {@link Palette}.
 *
 * ## Why `accent` is not the same colour in both
 *
 * The dark palette's greens are bright because they sit on near-black. Printed
 * on white they collapse: `#22C55E` on `#FFFFFF` is 2.1:1, unreadable. The light
 * palette therefore runs darker accents, and the two are genuinely different
 * colour systems that happen to share a vocabulary — not one palette with an
 * inverted lightness channel.
 *
 * ## Fills vs. type
 *
 * `accent` / `warn` / `danger` are **fills, icons, rails and chart series**.
 * They are frequently *not* legible as body type against the page — dark
 * `#EF4444` on `surface` is 4.45:1 — so each has a matching `*Text` key that is
 * safe as type, and type must use that. See {@link onColor} for the other
 * direction: what to print *on top of* a fill.
 *
 * The two can coincide. On the light palette `accent` and `accentText` are both
 * `#15803D`, because a fill that has to carry a white label ends up as dark as
 * type in the same hue. That is an outcome, not a licence to collapse them.
 *
 * Verified by `node scripts/check-contrast.js`, which reads this file directly
 * and audits **both** palettes. Run it after touching any value here.
 */
import { Platform } from 'react-native'
import { DARK_MAP_STYLE } from './mapStyle'

export type ThemeScheme = 'light' | 'dark'
/** What the user picked. `auto` resolves to a scheme via the OS setting. */
export type ThemeMode = ThemeScheme | 'auto'

/** A tinted panel: a hued surface, its hairline, and type that reads on it. */
export interface Tint {
  bg: string
  border: string
  text: string
}

/**
 * The six form states, worst → best, as `getFormStatus` names them.
 *
 * Declared here rather than in `algorithms/formScore` so the algorithm cannot
 * return a state the palette has no fill for — the union is the contract
 * between the two, and TypeScript checks it at both ends.
 */
export type FormTone = 'red' | 'orange' | 'yellow' | 'lightgreen' | 'green' | 'brightgreen'

/** How the dashboard hero is painted for one form state. */
export interface HeroFill {
  /** Two stops, top-left → bottom-right. */
  gradient: readonly [string, string]
  /** The score itself — the one figure the whole card exists to carry. */
  ink: string
  /** Hairline around the card. */
  border: string
  /** The status pill ("Peaked", "Building"…). */
  chipBg: string
  chipBorder: string
  chipInk: string
}

interface Elevation {
  shadowColor: string
  shadowOpacity: number
  shadowRadius: number
  shadowOffset: { width: number; height: number }
  elevation: number
}

export interface Palette {
  /* ---- core surfaces & type ------------------------------------- */
  /** Page ground. Every screen sits on this. */
  bg: string
  /** Cards and panels, one step off the ground. */
  surface: string
  /** Nested surfaces — a stat tile inside a card, an input well. */
  surfaceAlt: string
  /** Hairlines and dividers. */
  border: string
  /** A border that has to be seen: focused inputs, table rules. */
  borderStrong: string
  /** Primary type. */
  text: string
  /** Body copy — a step down from `text` so a paragraph doesn't shout. */
  textBody: string
  /** Labels, captions, axis ticks. */
  textMuted: string
  /** The dimmest type allowed. Still clears 4.5:1 on every surface. */
  textSubtle: string
  /** Input and well backgrounds. */
  fieldBg: string

  /* ---- accent / status ------------------------------------------ */
  /** The accent as a *fill, icon, rail or series*. Not guaranteed as type. */
  accent: string
  /** Pressed state for an accent fill. */
  accentPressed: string
  /** The accent as *type* on `bg` / `surface` / `surfaceAlt`. */
  accentText: string
  /** Accent-tinted surface. */
  accentSoft: string
  /** Hairline for an accent-tinted surface. */
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

  /**
   * Type printed on a saturated `accent` fill.
   *
   * Precomputed {@link onColor} of `accent`. For any *other* fill — a sport
   * colour, an RPE swatch — call `onColor` rather than reaching for this: those
   * hues vary too much in lightness for one answer to serve them all.
   */
  onAccent: string

  /* ---- effects --------------------------------------------------- */
  /**
   * The page ground at ~50% and ~92% alpha.
   *
   * For fading imagery — a route map — into the page underneath it. It has to
   * be the ground's own colour rather than a neutral black: a black ramp over a
   * white page reads as a bruise where it meets the ground.
   */
  bgFade: readonly [string, string]
  shadow: string
  /** The dim behind a modal or bottom sheet. */
  scrim: string
  skeleton: string
  skeletonHighlight: string
  /** Elevation for a resting card. */
  shadowCard: Elevation
  /** Elevation for something floating above cards: toasts, sheets, FABs. */
  shadowFloating: Elevation

  /* ---- the dashboard hero ---------------------------------------- */
  /**
   * The Form Score card's fill, per form state.
   *
   * The two themes want structurally different treatments here, and this is
   * where that difference lives — as values, not as a `scheme === 'light'`
   * branch inside the card:
   *
   *  - **Light**: a saturated fill with white numerals. This is how a hero
   *    stands out from a white page, and what the card was designed as.
   *  - **Dark**: a *deep wash* of the hue with the hue returning as the
   *    numerals. A saturated fill on a dark dashboard is the single brightest
   *    object on the screen, glaring out of the page, and its white-on-green
   *    numerals measured about 2.6:1.
   */
  hero: Record<FormTone, HeroFill>
  /** The band that sweeps across the hero in the Peaked state. */
  heroSheen: string
  /**
   * The hero's interior, which is the same for all six states.
   *
   * These exist because *nothing inside that card may use a page token*. On
   * dark the two happen to agree — the fill is a deep wash, so `textMuted` on
   * it looks right — and that coincidence is exactly what broke the light
   * theme: the card became a saturated green fill and its children were still
   * being coloured for a white page. The result was a white pill, a blue
   * FITNESS number, a red FATIGUE number and navy body copy at 2.2:1, all
   * inside one green rectangle.
   *
   * So the interior is specified per theme, next to the fill it has to sit on.
   */
  heroLabel: string
  heroBody: string
  /**
   * The FITNESS / FATIGUE tiles.
   *
   * Typed as a full {@link Tint} each, because on dark they carry their own
   * hues (sky and red, so the two readouts stay distinguishable against a wash)
   * while on light they are both plain translucent white — a saturated fill has
   * no room for a second and third hue inside it.
   */
  heroStat: { fitness: Tint; fatigue: Tint }

  /* ---- tinted surfaces ------------------------------------------- */
  tint: {
    green: Tint
    amber: Tint
    red: Tint
    sky: Tint
    orange: Tint
    /** "Balanced" — distinct from `green`, which means *good*. */
    teal: Tint
    violet: Tint
  }

  /* ---- categorical data ------------------------------------------ */
  /**
   * Hues for things that are *data*, not UI: sports, zones, chart series.
   *
   * Semantically neutral on purpose. `danger` means danger and a component
   * asking for it is making a statement; these mean only "different from the one
   * next to it", and picking them by role would make football a warning.
   */
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
  /** Per-sport accents. One assignment, shared by every screen. */
  sport: {
    running: string
    cycling: string
    swimming: string
    football: string
    combat: string
    gym: string
    strength: string
  }
  /** Heart-rate zones 1-5, in order. */
  zone: readonly string[]
  /** Consistency heatmap, empty → full. Monotonic in lightness. */
  heat: readonly string[]
  /** RPE 1-10, easy → maximal. */
  rpe: readonly string[]

  /* ---- maps -------------------------------------------------------- */
  /**
   * Google Maps style array for this theme.
   *
   * Empty in light mode, which is Google's default styling and already correct
   * on a white page. Android only — iOS uses Apple Maps, which ignores
   * `customMapStyle` and follows the MapView's `userInterfaceStyle` instead.
   */
  mapStyle: readonly unknown[]
}

/* ------------------------------------------------------------------ */
/* Hero builders                                                       */
/* ------------------------------------------------------------------ */

/**
 * A dark-theme hero fill: a deep wash of `bg`, fading into the card surface,
 * with the hue returning as the numerals.
 */
function darkHero(bg: string, ink: string, border: string): HeroFill {
  return {
    gradient: [bg, '#141E2E'],
    ink,
    border,
    // A raised surface rather than a translucent one: over a wash this dark,
    // white-at-low-opacity is an indistinct grey smear rather than a pill.
    chipBg: '#1B2739',
    chipBorder: border,
    chipInk: ink,
  }
}

/** Translucent white, shared by both light-theme stat tiles. */
const HERO_STAT_TILE: Tint = {
  bg: 'rgba(255,255,255,0.15)',
  border: 'rgba(255,255,255,0.28)',
  text: '#FFFFFF',
}

/**
 * A light-theme hero fill: a saturated block of colour with a white interior.
 *
 * ## Why the stops are so deep
 *
 * Everything inside this card is white or translucent white, and translucent
 * white is not free: a 15% white tile over `#15803D` composites to `#38935A`,
 * and solid white on *that* is 3.83:1. Laying translucent white on a fill
 * raises the local background, so every surface added inside the card spends
 * contrast the text still needs. Stacking two of them — a label at 80% on a
 * tile at 15% — spends it twice.
 *
 * The stops are therefore at the 900 end of each ramp rather than the 700s.
 * That buys back the headroom: the same tile over `#14532D` is `#376D4D`, white
 * on it is 6.07:1, and a label at 80% on it is 4.57:1. The worst pair anywhere
 * inside the card is then 4.57:1, against a 4.5 floor.
 *
 * `from` is the darker stop; `to` is the lighter one and therefore the case
 * every contrast check has to be run against.
 */
function lightHero(from: string, to: string): HeroFill {
  return {
    gradient: [from, to],
    ink: '#FFFFFF',
    border: from,
    chipBg: 'rgba(255,255,255,0.18)',
    chipBorder: 'rgba(255,255,255,0.45)',
    chipInk: '#FFFFFF',
  }
}

/* ------------------------------------------------------------------ */
/* Dark                                                                */
/* ------------------------------------------------------------------ */

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
  // A drop shadow has very little to fall on here — separation comes from the
  // surface being lighter than the page, and from the hairline. These are kept
  // mostly so Android's `elevation` still orders overlapping views.
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

  // Each state washes its tint's `bg` into the card surface, so the gradient
  // ends where the rest of the dashboard begins. The pill is a raised surface
  // with the hue as its label — the wash is too dark to print a pill *on*.
  hero: {
    red: darkHero('#2A1416', '#FCA5A5', '#5B2326'),
    orange: darkHero('#2A1A10', '#FDBA74', '#5A3A1A'),
    yellow: darkHero('#2A2010', '#FCD34D', '#5A431A'),
    lightgreen: darkHero('#0E2626', '#5EEAD4', '#1C4A48'),
    green: darkHero('#10291F', '#4ADE80', '#1D5138'),
    brightgreen: darkHero('#10291F', '#4ADE80', '#1D5138'),
  },
  heroSheen: 'rgba(74,222,128,0.10)',
  heroLabel: '#94A3B8',
  heroBody: '#CBD5E1',
  // Two hues, so the reader can tell the two readouts apart at a glance. This
  // works here and only here: they sit on a dark wash, not on a saturated fill.
  heroStat: {
    fitness: { bg: '#111E33', border: '#25406B', text: '#93C5FD' },
    fatigue: { bg: '#2A1416', border: '#5B2326', text: '#FCA5A5' },
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

/* ------------------------------------------------------------------ */
/* Light                                                               */
/* ------------------------------------------------------------------ */

const light: Palette = {
  bg: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textBody: '#334155',
  // Specified as #64748B, darkened one step. That value is 4.76:1 on `bg` but
  // only 4.34:1 on `surfaceAlt`, and muted type lands on stat tiles and input
  // wells constantly. This clears 4.5:1 on all three surfaces.
  textMuted: '#5B6B80',
  // Specified as #64748B, darkened for the same reason as `textMuted` above:
  // 4.76:1 on `bg` but 4.34:1 on `surfaceAlt` and `fieldBg`, and the dimmest
  // type in the app lands on stat tiles and input wells constantly. Still a
  // step lighter than `textMuted`, so the hierarchy survives.
  textSubtle: '#5F6E7E',
  fieldBg: '#F1F5F9',

  // The spec's #16A34A, darkened one step.
  //
  // `accent` is the primary button, and `onAccent` is white — and white on
  // #16A34A is 3.3:1, which is a CTA label nobody can read outdoors. The two
  // honest options were a near-black label on the spec green (what `onColor`
  // would pick, 5.68:1) or a darker green under a white one. This is the
  // second: a white label on a deep green is what a light theme's primary
  // button looks like, and a dark label on a mid-green is not.
  //
  // It leaves `accent` and `accentText` at the same value here. That is a
  // coincidence of this palette, not a rule — on dark they are still different
  // colours, and the distinction between "a fill" and "type in the accent hue"
  // is what the two keys mean.
  accent: '#15803D',
  accentPressed: '#166534',
  accentText: '#15803D',
  accentSoft: '#ECFDF5',
  accentBorder: '#A7F3D0',

  // Darkened from the spec's #D97706 for the same reason: 3.19:1 under white
  // type. It also does real work for the conflict rails and severity dots,
  // which are amber-on-white and were far too pale at the lighter value.
  warn: '#B45309',
  warnText: '#B45309',
  // Nudged off #FFFBEB, which was 1.04:1 against the white page — a tinted
  // panel that was, to the eye, simply not there.
  warnSoft: '#FEF7E0',
  warnBorder: '#FDE68A',

  danger: '#DC2626',
  dangerText: '#B91C1C',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',

  info: '#2563EB',
  infoText: '#1D4ED8',
  infoSoft: '#EFF6FF',
  infoBorder: '#BFDBFE',

  onAccent: '#FFFFFF',

  bgFade: ['rgba(255,255,255,0.50)', 'rgba(255,255,255,0.92)'],
  shadow: '#000000',
  scrim: 'rgba(15,23,42,0.45)',
  skeleton: '#E9ECEF',
  skeletonHighlight: '#F4F6F8',
  // Shadows do real work on a light theme, where a card is lighter than what
  // surrounds it; they carry the elevation that the hairline carries on dark.
  // Hence far lower opacities than the dark palette above.
  shadowCard: {
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  shadowFloating: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  // A saturated fill with an all-white interior — no second hue anywhere inside
  // it. See {@link lightHero} for why these stops are as deep as they are.
  hero: {
    red: lightHero('#6B1717', '#7F1D1D'),
    orange: lightHero('#6B270F', '#7C2D12'),
    yellow: lightHero('#682D0C', '#78350F'),
    lightgreen: lightHero('#0F423F', '#134E4A'),
    green: lightHero('#0F4C25', '#14532D'),
    brightgreen: lightHero('#0F4C25', '#14532D'),
  },
  heroSheen: 'rgba(255,255,255,0.22)',
  // 0.80, not the 0.70 that reads as "a muted label" on a page. Translucent
  // white *lightens the fill underneath it*, so it eats the contrast from both
  // ends at once: at 0.70 a label on a stat tile is 3.90:1. See lightHero.
  heroLabel: 'rgba(255,255,255,0.80)',
  heroBody: 'rgba(255,255,255,0.92)',
  // Both tiles identical, and deliberately so: on a saturated fill a blue tile
  // and a red tile are two more colours competing inside a card that already
  // has one. They are told apart by their labels, which is enough.
  heroStat: {
    fitness: HERO_STAT_TILE,
    fatigue: HERO_STAT_TILE,
  },

  tint: {
    green: { bg: '#ECFDF5', border: '#A7F3D0', text: '#15803D' },
    amber: { bg: '#FEF7E0', border: '#FDE68A', text: '#B45309' },
    red: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
    sky: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    orange: { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
    teal: { bg: '#E6FBF6', border: '#99F6E4', text: '#0F766E' },
    violet: { bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' },
  },

  palette: {
    green: '#15803D',
    sky: '#0369A1',
    red: '#B91C1C',
    amber: '#B45309',
    violet: '#6D28D9',
    orange: '#C2410C',
    slate: '#475569',
    bronze: '#92400E',
  },
  sport: {
    running: '#C2410C',
    cycling: '#6D28D9',
    swimming: '#0369A1',
    football: '#15803D',
    combat: '#B91C1C',
    gym: '#475569',
    strength: '#92400E',
  },
  zone: ['#475569', '#0369A1', '#15803D', '#B45309', '#B91C1C'],
  // Empty → full, so the ramp runs light → dark here and dark → light above.
  heat: ['#F1F5F9', '#BBF7D0', '#4ADE80', '#15803D'],
  rpe: [
    '#15803D',
    '#3D8A2E',
    '#5E9222',
    '#7F9417',
    '#9A8B12',
    '#AC780E',
    '#B45309',
    '#B4400F',
    '#B72F16',
    '#B91C1C',
  ],

  mapStyle: [],
}

export const palettes: Record<ThemeScheme, Palette> = { light, dark }

/* ------------------------------------------------------------------ */
/* Mode-independent tokens                                             */
/*                                                                     */
/* Spacing, type and motion do not change with the theme, so they are  */
/* plain exports rather than palette keys — a component can import     */
/* them without the hook.                                              */
/* ------------------------------------------------------------------ */

/** 4pt grid. Prefer these over ad-hoc numbers. */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

/** Corner radii. `card` is the one every card/panel uses. */
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
 * Type scale. Whole numbers on purpose — half-point sizes read as "someone
 * nudged this one screen" rather than as a system.
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

/** Native-feeling motion, so nothing feels faster or slower than the rest. */
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

/**
 * The tab bar's height, above the safe-area inset.
 *
 * Lives here rather than in `MainTabs` because it is not only the navigator's
 * business: the bar is drawn *over* the bottom of every tab screen, so each of
 * those screens has to reserve room for it at the end of its scroll content or
 * its last row is cut in half. See `useTabContentPadding`.
 */
export const TAB_BAR_HEIGHT = 58

/** Android's ripple/elevation model differs enough to be worth branching on. */
export const IS_ANDROID = Platform.OS === 'android'

/**
 * Chrome drawn on top of map imagery.
 *
 * Fixed rather than themed, for the same reason as {@link NOTIFICATION_ACCENT}:
 * what is behind it is a satellite or street tile, whose brightness has nothing
 * to do with which theme the user picked. A themed ink would be a dark glyph on
 * a dark city block half the time.
 *
 * 0.62 is the shallowest disc that still puts white at 5.3:1 over the *worst*
 * case, which is a blank white map tile — well clear of the 3:1 that WCAG asks
 * of a graphical object, and enough for the 4.5 this project holds itself to.
 */
export const IMAGERY_SCRIM = 'rgba(11,18,32,0.62)'
export const IMAGERY_INK = '#FFFFFF'

/**
 * The Android notification accent.
 *
 * Fixed rather than themed: notifications are drawn by the system shade, which
 * has its own light/dark state that has nothing to do with the one inside
 * FORMA, and the channel colour is read outside React where no palette is in
 * scope. The bright accent is the right pick because the shade is dark far more
 * often than not.
 */
export const NOTIFICATION_ACCENT = dark.accent

/** The paused-state counterpart of {@link NOTIFICATION_ACCENT}. Same reasoning. */
export const NOTIFICATION_WARN = dark.warn

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function channel(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  return (
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16))
  )
}

/** WCAG contrast ratio between two `#RRGGBB` colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The two inks anything printed on a saturated fill can use. */
const INK_DARK = '#0B1220'
const INK_LIGHT = '#FFFFFF'

/**
 * Legible type to print **on top of** an arbitrary fill.
 *
 * Computed rather than tokenised because the fills this has to serve are not a
 * fixed set: seven sport accents, ten RPE swatches and five heart-rate zones all
 * get text or glyphs on them, and they span most of the lightness range. A
 * single `onAccent` token cannot be right for all of them — white on the amber
 * zone is 2.1:1 while white on the combat red is 6.5:1 — so the choice is made
 * per fill, by measurement.
 */
export function onColor(fill: string): string {
  return contrast(INK_DARK, fill) >= contrast(INK_LIGHT, fill) ? INK_DARK : INK_LIGHT
}

/** The standard card: same radius, padding, border and elevation everywhere. */
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

/**
 * Borg-derived effort descriptors. The wording matters more than it looks: sRPE
 * is only as good as the athlete's calibration, and a bare number invites
 * everything to be rated a 7.
 */
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

/** The RPE swatch for this effort, in the active theme. */
export function rpeColor(rpe: number, colors: Palette): string {
  return colors.rpe[clampIndex(rpe)]
}
