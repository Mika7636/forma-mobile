/**
 * Dark-surface design tokens for the live-tracking flow.
 *
 * ## Why this sits alongside `constants/theme.ts` rather than replacing it
 *
 * `constants/theme.ts` is FORMA's *light* system — the dashboard, planner,
 * progress and settings screens all sit on `pageBg` with white cards, and its
 * teal is the brand colour. Live tracking is the one part of the app that is
 * dark by necessity: it is read at arm's length, outdoors, mid-effort, and now
 * on a lock screen. It had been getting there with hex literals scattered
 * through `LiveTracker` (`#1f2937`, `#374151`, `#22c55e`…), which is how the
 * summary screen ended up with three slightly different greys.
 *
 * So this is the palette for the dark flow, in one place, and nothing in the
 * redesigned summary may use a raw hex. It is deliberately *not* a fork of the
 * light theme: the two systems have different jobs and different contrast
 * requirements, and pretending one set of tokens serves both is what produced
 * the mismatch in the first place.
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
  },

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
