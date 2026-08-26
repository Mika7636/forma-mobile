/**
 * FORMA's design tokens. The whole app, one dark theme.
 *
 * ## History, because the shape of this file only makes sense with it
 *
 * This started as the palette for the live-tracking flow alone, sitting
 * alongside `constants/theme.ts`, which was FORMA's *light* system — dashboard,
 * planner, progress and settings on an off-white page with white cards. Two
 * palettes, and the seam between them ran right down the middle of the product:
 * the tab bar was dark and every screen above it was light.
 *
 * That is resolved. This file is now the only palette. `constants/theme.ts`
 * still exists and still exports `COLORS`, `SPACING`, `TYPE` and the rest —
 * 58 files call them and the names were never the problem — but every colour it
 * exports is a *semantic mapping onto these tokens*. There is nowhere else for a
 * colour to come from, and nothing in the app may use a raw hex.
 *
 * Two things live here rather than in `constants/theme.ts`: the raw values (this
 * is the definition, so hex literals are the point) and {@link tokens.palette},
 * the categorical hues, which are data colours rather than UI colours and are
 * explained below.
 */

export const tokens = {
  color: {
    /** Page ground. Everything sits on this. */
    bg: '#0B1220',
    /** Cards and panels one step up from the ground. */
    surface: '#141E2E',
    /** Nested cards — stat tiles inside a section. One step up again. */
    surfaceAlt: '#1B2739',
    /** Hairlines and dividers. */
    border: '#243247',

    /** Primary action, route line, "good" states. */
    accent: '#22C55E',
    /** Caution: conflicts, hard efforts, paused. */
    warn: '#F59E0B',
    /** Destructive and maximal effort. */
    danger: '#EF4444',

    /** Primary type. */
    text: '#F8FAFC',
    /** Labels, captions, secondary copy. */
    textMuted: '#94A3B8',

    /**
     * Drop shadows. Black, obviously — but a token so that "no raw hex" is a
     * rule with no exceptions, and so the one place that would need to change
     * if shadows ever became tinted is findable.
     */
    shadow: '#000000',

    /**
     * The dim behind a modal or bottom sheet.
     *
     * Near-black and heavy, because a scrim has to work *against the page*, and
     * the page is now nearly black itself. The old `rgba(17,24,39,0.55)` was a
     * dark grey at half strength — plenty over a white dashboard, and almost
     * invisible over `bg`, which would have left sheets floating with nothing
     * separating them from the screen behind.
     */
    scrim: 'rgba(0,0,0,0.66)',
  },

  /**
   * Categorical hues, for things that are *data* rather than UI: sports, heart
   * rate zones, chart series.
   *
   * Kept apart from `color` above on purpose. Those are semantic — `danger`
   * means danger, and a component asking for it is making a statement. These
   * carry no meaning beyond "different from the one next to it", and choosing
   * them by role would be a category error: football is not a warning.
   *
   * ## Every one of these is tuned for the dark ground
   *
   * The set they replace was picked for white cards — `#6b7280` for the gym,
   * `#b45309` for strength — and those are 2:1 and 2.9:1 against `bg`, i.e.
   * invisible on this theme and *especially* invisible on the dim, cheap LCD
   * this app has to work on outdoors. Every hue here clears 6.8:1 against `bg`,
   * comfortably past the 4.5:1 floor, while staying distinguishable from its
   * neighbours.
   */
  palette: {
    green: '#22C55E',
    sky: '#38BDF8',
    red: '#F87171',
    amber: '#FBBF24',
    violet: '#A78BFA',
    orange: '#FB923C',
    /** For the deliberately un-showy categories — the gym, "no interaction". */
    slate: '#94A3B8',
    /** Strength work. The old `#b45309` bronze, lifted until it reads. */
    bronze: '#D8A25E',
  },

  /**
   * Tinted surfaces: a dark panel that carries a hue, the hairline that goes
   * around it, and the type colour that stays legible on it.
   *
   * ## Why the app needs this as a system
   *
   * On the light theme, "this card means caution" was expressed by filling it
   * with saturated amber and printing white on top. That does not survive the
   * move to dark. A saturated fill is now the brightest thing on the screen —
   * the Form Score card was a bright green block that glared — and white on
   * amber is 2.1:1, which was already failing and merely became obvious.
   *
   * The dark idiom inverts it: the *surface* carries a deep, desaturated wash of
   * the hue, and the hue itself comes back as the type and the border. The panel
   * reads as tinted without competing with the content, and the numbers on it
   * are the brightest thing rather than the background.
   *
   * Each `text` clears 7:1 on its own `bg`.
   */
  tint: {
    green: { bg: '#10291F', border: '#1D5138', text: '#4ADE80' },
    amber: { bg: '#2A2010', border: '#5A431A', text: '#FCD34D' },
    red: { bg: '#2A1416', border: '#5B2326', text: '#FCA5A5' },
    sky: { bg: '#111E33', border: '#25406B', text: '#93C5FD' },
    orange: { bg: '#2A1A10', border: '#5A3A1A', text: '#FDBA74' },
    /** The "balanced" tone — distinct from `green`, which means *good*. */
    teal: { bg: '#0E2626', border: '#1C4A48', text: '#5EEAD4' },
    violet: { bg: '#1C1633', border: '#392C63', text: '#C4B5FD' },
  },

  /**
   * The consistency heatmap's four steps, empty to full.
   *
   * Monotonic in *lightness* as well as saturation (relative luminance runs
   * 0.020 / 0.043 / 0.146 / 0.420), which is what makes the grid readable as a
   * ramp rather than as four arbitrary greens — and what keeps it legible for
   * the red-green colour blind, who get the lightness even without the hue.
   * The old ramp started at near-white on a white card; inverted naively it
   * would have made an empty week the brightest cell on the grid.
   */
  heat: ['#1B2739', '#14432A', '#1E7A45', '#22C55E'],

  radius: {
    sm: 12,
    md: 16,
    lg: 24,
  },

  /** 4-point scale. Every gap in the summary comes from here. */
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 24,
    xl: 32,
  },
} as const

export const COLOR = tokens.color
export const RADIUS_T = tokens.radius
export const SPACE = tokens.spacing
/** Categorical data hues. See {@link tokens.palette}. */
export const PALETTE = tokens.palette
/** Tinted surfaces (bg + border + legible text). See {@link tokens.tint}. */
export const TINT = tokens.tint
/** The consistency heatmap ramp, empty to full. See {@link tokens.heat}. */
export const HEAT_RAMP = tokens.heat

/**
 * The RPE 1-10 ramp: green through amber to red.
 *
 * Generated rather than listed so the endpoints stay tied to
 * {@link tokens.color} — an effort scale that drifts away from the accent and
 * danger colours used everywhere else reads as a different app's widget.
 * Index 0 is RPE 1.
 */
export const RPE_RAMP: readonly string[] = [
  '#22C55E', // 1  accent
  '#3FCB56',
  '#6BD24A',
  '#9BD53E',
  '#CBD336',
  '#F0C42E', // 6
  '#F59E0B', // 7  warn
  '#F2792C',
  '#EF5B39',
  '#EF4444', // 10 danger
]

export function rpeColor(rpe: number): string {
  const i = Math.min(Math.max(Math.round(rpe), 1), 10) - 1
  return RPE_RAMP[i]
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

export function rpeLabel(rpe: number): string {
  const i = Math.min(Math.max(Math.round(rpe), 1), 10) - 1
  return RPE_LABEL[i]
}
