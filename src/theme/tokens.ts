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

/**
 * The dark scrim a piece of hero content sits on.
 *
 * Exists because the light hero is a *vibrant* fill, and white type cannot sit
 * directly on one: white on `#22C55E` is 2.28:1. Every readout inside the card
 * therefore gets a darkened panel under it, which buys the contrast back
 * (white on the scrim over that same green is 6.81:1) without giving up the
 * saturation the card exists for.
 *
 * The dark theme needs none of this — its hero is already a deep wash — so
 * there the panel is fully transparent with zero width and zero padding, and
 * renders as nothing at all. That is why the geometry lives here as values
 * rather than as a `scheme === 'light'` branch inside the card: with a
 * zero-inset transparent panel the dark hero is pixel-identical to what it was
 * before the panel existed.
 */
export interface HeroPanel {
  bg: string
  border: string
  borderWidth: number
  /** Inset around the content. 0 on dark, so the layout is untouched there. */
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
  /**
   * Which way the hero's fill runs.
   *
   * A value rather than a constant in the card, because the two themes want
   * different axes for the same reason they want different fills. Dark's hero
   * washes a hue *into the card surface*, and a diagonal is what makes that
   * read as a wash rather than as a two-tone block. Light's is a single hue
   * shading into a darker version of itself, which is a lighting model — and
   * light comes from above, so it runs vertically.
   */
  heroGradient: { start: { x: number; y: number }; end: { x: number; y: number } }
  /** The band that sweeps across the hero in the Peaked state. */
  heroSheen: string
  /**
   * The static diagonal gloss laid over the hero, under its content.
   *
   * Separate from {@link heroSheen}, which is the *animated* band the Peaked
   * state sweeps. This one never moves and is on every state: it is what stops
   * a two-stop fill reading as a flat rectangle, and it is most of why the dark
   * hero looks lit and the light one used to look printed.
   */
  heroGloss: readonly [string, string]
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
  /** The scrim every hero readout sits on. See {@link HeroPanel}. */
  heroPanel: HeroPanel
  /**
   * The FITNESS / FATIGUE tiles.
   *
   * Typed as a full {@link Tint} each because each carries its own hue: sky for
   * fitness, red for fatigue, in both themes. Two quantities that are read
   * against each other should not look alike, and this is the one place inside
   * the hero where a second and third hue is affordable — the tiles are opaque,
   * so their numerals sit on the tile rather than on the fill and the fill's
   * saturation costs them nothing.
   *
   * Dark's tiles are darker hued panels on a dark wash; light's are white paper
   * on a vibrant one. Same arrangement, opposite direction, one code path.
   */
  heroStat: { fitness: Tint; fatigue: Tint }
  /**
   * The label ink and top highlight for those tiles.
   *
   * The labels are muted grey in both themes, because in both the tile is an
   * opaque surface and the page's own muted grey is what a label on a surface
   * is. This used to differ: light's tiles were translucent white, a tile
   * *lighter* than the fill, and muted grey on one of those is unreadable — a
   * 45% white tile over `#DC2626` leaves `#334155` at 3.2:1 — so light ran a
   * near-black label instead. Making the tiles opaque removed the constraint
   * rather than working around it.
   *
   * `highlight` is the one-pixel top edge that makes a *translucent* tile read
   * as glass rather than as a hole. Both themes are opaque now, so it is fully
   * transparent in both and renders as nothing — kept as a value rather than
   * deleted because it is the difference between the two treatments, and the
   * frosted one is a plausible thing to want back.
   */
  heroStatChrome: { label: string; highlight: string }

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

/** The dark scrim used for every panel, chip and tile inside the light hero. */
const HERO_SCRIM = 'rgba(11,18,32,0.52)'
const HERO_SCRIM_EDGE = 'rgba(255,255,255,0.22)'

/**
 * A light-theme hero fill: a *vibrant* block of colour, with every readout on a
 * dark scrim.
 *
 * ## Why the interior is scrimmed rather than translucent white
 *
 * The card used to be a deep, near-olive green with plain white contents. That
 * is the only other arrangement that works, and it works because the fill is
 * dark: white on `#14532D` is 4.57:1, and one step brighter — `#166534` —
 * drops the worst interior pair to 3.86:1. The deep fill was therefore sitting
 * exactly on the contrast floor, and the price was a hero that read as olive
 * rather than as the brand's green.
 *
 * Translucent white made it worse, not better: a 15% white tile over the fill
 * *raises* the local background, so an 80% white label on that tile spends the
 * contrast twice. That pair is what pinned the old stops in place.
 *
 * Inverting the scrim removes the ceiling entirely. The fill is now the actual
 * accent (`#22C55E`), and each readout sits on `rgba(11,18,32,0.52)`, which
 * composites to `#16683E` over that green — white on it is 6.81:1 and the 80%
 * label is 5.01:1, both comfortably clear. The worst case across all six tones
 * is the yellow state at 4.94:1.
 *
 * `from` is the brighter stop and the one every check has to be run against,
 * since a dark scrim has least to work with over the lightest fill.
 */
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
  // Diagonal: the dark hero washes a hue *into* the card surface, and an
  // off-axis run is what makes that read as a wash rather than as two bands.
  heroGradient: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  heroSheen: 'rgba(74,222,128,0.10)',
  // None. The dark hero is already a lit object — the wash itself is the
  // lighting — and a white gloss over a near-black card is a grey smear. Fully
  // transparent, so the card renders exactly as it did before the gloss
  // existed, the same trick `heroPanel` plays below.
  heroGloss: ['rgba(255,255,255,0)', 'rgba(255,255,255,0)'],
  heroLabel: '#94A3B8',
  heroBody: '#CBD5E1',
  // Two hues, so the reader can tell the two readouts apart at a glance. This
  // works here and only here: they sit on a dark wash, not on a saturated fill.
  heroStat: {
    fitness: { bg: '#111E33', border: '#25406B', text: '#93C5FD' },
    fatigue: { bg: '#2A1416', border: '#5B2326', text: '#FCA5A5' },
  },
  // The tiles are opaque panels on a dark wash, so the page's muted grey is
  // the right label and there is no glass edge to catch the light.
  heroStatChrome: { label: '#94A3B8', highlight: 'rgba(0,0,0,0)' },
  // Nothing at all. The dark hero is a deep wash, so its readouts already have
  // all the contrast they need and need no scrim under them — and a fully
  // transparent panel at zero width and zero padding leaves the card
  // pixel-identical to what it was before the panel existed. `rgba(…,0)`
  // rather than the `transparent` keyword so the contrast checker can
  // composite it like any other layer.
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

/* ------------------------------------------------------------------ */
/* Light                                                               */
/* ------------------------------------------------------------------ */

const light: Palette = {
  // ## The three-step ladder, and why the page is no longer white
  //
  // `bg` and `surface` were both `#FFFFFF`. That is the root of the "light mode
  // looks flat" problem and no amount of shadow fixes it: a white card on a
  // white page has nothing to be elevated *above*, so the only thing marking
  // its edge is a hairline, and a screen of hairline-bounded white rectangles
  // reads as a form rather than as a set of objects. The dark theme never had
  // this problem because its page (`#0B1220`) is genuinely darker than its
  // cards (`#141E2E`) — the separation is in the values, not in the effects.
  //
  // So light now runs the same ladder, in the same direction: a tinted page,
  // white cards lifted off it, and a wells step *below* the page for anything
  // nested inside a card. Each rung is small (about 3% lightness) — enough to
  // separate, not enough to read as grey.
  bg: '#F5F7FA',
  // Cards stay pure white. This is the one surface that should look like paper.
  surface: '#FFFFFF',
  // A step *below* the page, not equal to it. When `surfaceAlt` was `#F5F7FA`
  // and the page went there too, every input well and nested tile in the app
  // would have dissolved into the page behind it.
  surfaceAlt: '#EDF1F6',
  // Lightened a touch alongside the page: `#E5E9EF` against the old white page
  // and against the new `#F5F7FA` are different jobs, and the hairline now has
  // less work to do because the shadow carries the separation.
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textBody: '#334155',
  // Warmer than the slate `#64748B` this was specified as, and than the
  // `#5B6B80` it was corrected to — both of which pulled the whole page blue.
  // 5.83:1 on white, 5.43:1 on `surfaceAlt`.
  textMuted: '#5B6675',
  // A step lighter than `textMuted` so the hierarchy survives, and warm for the
  // same reason. Still clears 4.5:1 on every surface (5.12:1 on `surfaceAlt`).
  textSubtle: '#5F6A78',
  fieldBg: '#EDF1F6',

  // The brand green at full strength. `accent` was previously darkened all the
  // way to `#157A3A` so that a *white* button label would clear 4.5:1 — which
  // worked, and cost the app its colour: every fill, bar, chip and rail on the
  // light theme went olive.
  //
  // The label is what gives, not the hue. `onAccent` is near-black here, which
  // is what `onColor('#22C55E')` picks anyway (8.22:1, against 2.28:1 for
  // white). A bright fill with a dark label is what a modern light theme's
  // primary button looks like; a dark fill with a white one is what a dark
  // theme's does.
  accent: '#22C55E',
  accentPressed: '#16A34A',
  // The same hue as *type*. `accent` itself is 1.85:1 on white — fine for a
  // 200px bar, illegible as a 13pt caption — so anything under ~18px in the
  // brand green uses this instead. See the `accent` vs `accentText` note on
  // the Palette interface.
  // Nudged down from `#15803D` when the page gained its tint. That value cleared
  // 4.5:1 on a white page by a whisker and on the old `#F5F7FA` wells by less
  // than that; stepping the wells to `#EDF1F6` took it to 4.42:1. The hue is
  // unchanged — this is two percent of lightness, not a different green — and
  // the same nudge was applied to every token that shares it (`palette.green`,
  // `sport.football`, `tint.green.text`, the RPE and zone ramps) so the app
  // still speaks one green. `scripts/check-contrast.js` is what caught it.
  accentText: '#157A3A',
  // The vibrant hue at low alpha over the page, rather than a pre-mixed pastel.
  // `#ECFDF5` is a mint that has lost its relationship to the green it is
  // supposed to be a wash of; this is literally that green, at 10%.
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

  // Near-black, not white. See the `accent` note above: this is
  // `onColor(accent)`, and on a vibrant fill that answer is dark.
  onAccent: '#0B1220',

  // The ground's own colour, which is no longer white — a ramp that ends at
  // `#FFFFFF` over a `#F5F7FA` page leaves a pale seam exactly where the image
  // is supposed to have disappeared into it.
  bgFade: ['rgba(245,247,250,0.50)', 'rgba(245,247,250,0.92)'],
  shadow: '#000000',
  scrim: 'rgba(15,23,42,0.45)',
  skeleton: '#E9ECEF',
  skeletonHighlight: '#F4F6F8',
  // Shadows do real work on a light theme, where a card is lighter than what
  // surrounds it; they carry the elevation that the hairline carries on dark.
  // Hence far lower opacities than the dark palette above.
  shadowCard: {
    // Slate rather than pure black. A neutral-black shadow over a faintly cool
    // page goes muddy at the edges; tinting it toward the page's own hue keeps
    // the falloff clean.
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

  // The actual state hues, at full strength — this card is the largest block of
  // colour in the app and it was reading as olive. The white interior each one
  // carries is what makes the brightness affordable: every readout sits on a
  // dark scrim rather than straight on the fill. See {@link lightHero}.
  hero: {
    red: lightHero('#EF4444', '#DC2626'),
    orange: lightHero('#F97316', '#EA580C'),
    yellow: lightHero('#F59E0B', '#D97706'),
    lightgreen: lightHero('#14B8A6', '#0D9488'),
    green: lightHero('#22C55E', '#16A34A'),
    brightgreen: lightHero('#22C55E', '#16A34A'),
  },
  // Vertical. Light's hero is one hue shading into a darker version of itself,
  // which is a lighting model rather than a wash — and light falls from above.
  heroGradient: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  heroSheen: 'rgba(255,255,255,0.28)',
  // A soft diagonal gloss across the whole card, on every state. This is the
  // piece that was missing: two stops eight percent apart in lightness make a
  // rectangle, not an object, and no border or shadow applied to the *outside*
  // of the card fixes how flat the inside looks.
  heroGloss: ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)'],
  // 0.80, not the 0.70 that reads as "a muted label": this is printed on the
  // scrim, and the scrim is only as dark as it needs to be.
  heroLabel: 'rgba(255,255,255,0.80)',
  heroBody: 'rgba(255,255,255,0.90)',
  // Opaque white tiles carrying a blue and a red numeral, which is the same
  // arrangement the dark theme uses and for the same reason: FITNESS and
  // FATIGUE are two different quantities, and a reader glancing at the card
  // should be able to tell which is which before reading either label.
  //
  // They were both frosted white — translucent, identical, near-black ink —
  // because a saturated fill has no room for a second and third hue *on* it.
  // That is still true, and it is why these are opaque: the numerals are not on
  // the green at all. `#1D4ED8` and `#B91C1C` are `infoText` and `dangerText`,
  // the palette's own type-safe blue and red, and on a white tile they measure
  // 8.6:1 and 7.0:1 — nowhere near the 3.2:1 a hue on a frosted tile was pinned
  // to. The border is the tile's own white, so the edge is the tile.
  heroStat: {
    fitness: { bg: '#FFFFFF', border: '#FFFFFF', text: '#1D4ED8' },
    fatigue: { bg: '#FFFFFF', border: '#FFFFFF', text: '#B91C1C' },
  },
  // `textMuted`, now that the tile is white: these labels are on paper, not on
  // the fill, so the page's own muted grey is exactly right and the near-black
  // that a frosted tile forced is no longer needed. No highlight either — a
  // glass edge is what makes a *translucent* tile read as raised, and an opaque
  // white one on green needs no help.
  heroStatChrome: { label: '#5B6675', highlight: 'rgba(0,0,0,0)' },
  heroPanel: {
    bg: HERO_SCRIM,
    border: HERO_SCRIM_EDGE,
    borderWidth: 1,
    pad: 12,
    radius: 16,
  },

  // Each tint is its own vibrant hue at 8–12% over the page, not a pre-mixed
  // pastel. The difference is visible: `#ECFDF5` is a mint with no remaining
  // relationship to the green it washes, while `rgba(34,197,94,0.10)` is
  // unmistakably *that* green, quietly. The type on each stays the darker
  // `*Text` value, because a caption on a 10% wash is still a caption on
  // near-white.
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
  // Empty → full, so the ramp runs light → dark here and dark → light above.
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
