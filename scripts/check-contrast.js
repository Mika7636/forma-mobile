/**
 * WCAG contrast audit of FORMA's palettes.
 *
 *   node scripts/check-contrast.js            # failures only
 *   VERBOSE=1 node scripts/check-contrast.js  # every pair
 *
 * Exits non-zero if any pair falls below its floor, so it works as a CI gate.
 *
 * ## Why this exists
 *
 * Every move between themes silently inverts the safety of every colour pair in
 * the app. White type on the brand fill was 3.4:1 on the old teal and became
 * 2.3:1 on the dark accent green — still "white on a colour", still looking
 * deliberate in a screenshot, and completely unreadable on the cheap 720p panel
 * this app is used on outdoors. That class of bug does not announce itself; it
 * has to be measured.
 *
 * Now that there are *two* palettes the risk is worse, not better: a value that
 * is safe on near-black is routinely 2:1 on white, and the light theme is the
 * one nobody looks at while developing. So both are audited, against the same
 * floors, with the palette's name printed on every failure.
 *
 * Values are parsed straight out of `src/theme/tokens.ts` rather than restated
 * here, because a hand-copied palette in a checker is a checker that passes
 * while the app fails.
 */
const fs = require('fs')
const path = require('path')

const TOKENS_PATH = path.join(__dirname, '..', 'src', 'theme', 'tokens.ts')
const source = fs.readFileSync(TOKENS_PATH, 'utf8')

/* ---- parsing ------------------------------------------------------- */

/** Body of the balanced `{ … }` starting at or after `from`, in `text`. */
function braced(text, from) {
  const open = text.indexOf('{', from)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(open, i + 1)
    }
  }
  throw new Error('unterminated block')
}

/** One whole palette, e.g. `const dark: Palette = { … }`. */
function paletteSource(name) {
  const start = source.indexOf('\nconst ' + name + ': Palette = {')
  if (start === -1) throw new Error('tokens.ts has no "' + name + '" palette')
  return braced(source, start)
}

/** A named sub-block inside a palette, e.g. `tint: { … }`. */
function block(text, name) {
  const start = text.indexOf('\n  ' + name + ': {')
  if (start === -1) throw new Error('palette has no "' + name + '" block')
  return braced(text, start)
}

/** `{ key: '#RRGGBB', … }` → object. */
function flatHexes(text) {
  const out = {}
  const re = /(\w+)\s*:\s*'(#[0-9a-fA-F]{6})'/g
  let m
  while ((m = re.exec(text))) out[m[1]] = m[2]
  return out
}

/** `{ name: { … }, … }` → object of objects, one level deep. */
function nestedHexes(text) {
  const out = {}
  const re = /(\w+)\s*:\s*\{([^{}]*)\}/g
  let m
  while ((m = re.exec(text))) out[m[1]] = flatHexes(m[2])
  return out
}

/**
 * One term of a builder: a quoted colour literal (`'#RRGGBB'` or an `rgba(…)`)
 * or a bare identifier referring to one of the builder's parameters. A single
 * capture group either way, so the two cases can be told apart by the quote.
 */
const TERM = String.raw`('(?:#[0-9a-fA-F]{6}|rgba?\([^)]*\))'|\w+)`

/** A quoted term is a literal colour; a bare one is a parameter reference. */
function term(raw) {
  const t = raw.trim()
  return t.startsWith("'") ? { lit: t.slice(1, -1) } : { param: t }
}

/**
 * One of the `hero` builder functions, as a template.
 *
 * The palettes build their six hero fills by calling `darkHero(…)` /
 * `lightHero(…)` rather than spelling each one out, so the checker has to
 * understand the builder to see the values. It reads the parameter list and the
 * returned object, recording each field as either a literal or a reference to a
 * parameter — {@link applyBuilder} then substitutes a call site's arguments.
 *
 * The alternative was to restate the builders' constants here, which is exactly
 * the hand-copied-palette failure this file's header warns about.
 */
function readBuilder(name) {
  const start = source.indexOf('function ' + name + '(')
  if (start === -1) throw new Error('tokens.ts has no "' + name + '" builder')

  const params = source
    .slice(source.indexOf('(', start) + 1, source.indexOf(')', start))
    .split(',')
    .map((p) => p.split(':')[0].trim())
    .filter(Boolean)

  // Comments first. A prose line ending in a comma reads to the field regex
  // below as an ES6 shorthand property, and the last word of the sentence
  // becomes a token name that resolves to nothing.
  const body = braced(source, source.indexOf('return {', start))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  const fields = {}

  const grad = body.match(
    new RegExp(String.raw`gradient:\s*\[\s*` + TERM + String.raw`\s*,\s*` + TERM + String.raw`\s*\]`),
  )
  if (!grad) throw new Error(name + ': no gradient')
  fields.gradient = [term(grad[1]), term(grad[2])]

  // `key: <value>`, plus the ES6 shorthand `key,` — which darkHero uses for
  // `ink` and `border`. Miss the shorthand and those fields silently vanish.
  const re = new RegExp(String.raw`(\w+)\s*(?::\s*` + TERM + String.raw`\s*)?,`, 'g')
  let m
  while ((m = re.exec(body))) {
    if (m[1] === 'gradient') continue
    fields[m[1]] = term(m[2] === undefined ? m[1] : m[2])
  }
  return { params, fields }
}

/** A module-level `const NAME = '<colour>'`, or null if there is no such const. */
function moduleConst(name) {
  const m = source.match(
    new RegExp(String.raw`(^|\s)const ` + name + String.raw`\s*=\s*'(#[0-9a-fA-F]{6}|rgba?\([^)]*\))'`, 'm'),
  )
  return m ? m[2] : null
}

/** Resolve a builder template against one call site's arguments. */
function applyBuilder(tpl, args) {
  const bind = (t) => {
    if (t.lit !== undefined) return t.lit
    const i = tpl.params.indexOf(t.param)
    if (i !== -1) return args[i]
    // Not a parameter — the light builder shares one scrim across every tone
    // via a module const rather than repeating the rgba six times.
    const c = moduleConst(t.param)
    if (c === null) throw new Error('unresolved builder term: ' + t.param)
    return c
  }
  const out = {}
  for (const [k, v] of Object.entries(tpl.fields)) {
    out[k] = Array.isArray(v) ? v.map(bind) : bind(v)
  }
  return out
}

/** `{ red: lightHero('#a', '#b'), … }` → the six resolved hero fills. */
function heroes(text) {
  const out = {}
  const re = /(\w+)\s*:\s*(\w+)\(([^)]*)\)/g
  let m
  while ((m = re.exec(text))) {
    const args = m[3].split(',').map((a) => a.trim().replace(/^'|'$/g, ''))
    out[m[1]] = applyBuilder(readBuilder(m[2]), args)
  }
  return out
}

/**
 * `key: '<literal>'`, for keys whose value may be an rgba rather than a hex.
 *
 * A value may also be a bare identifier — the light hero panel and its chip
 * share one scrim through a module const rather than repeating the rgba — so an
 * unquoted word is looked up as a module-level colour const before being
 * skipped. Skipping it silently is how a whole section of the audit disappears.
 */
function literalsOf(text) {
  const out = {}
  const re = /(\w+)\s*:\s*(?:'(#[0-9a-fA-F]{6}|rgba?\([^)]*\))'|([A-Za-z_]\w*))/g
  let m
  while ((m = re.exec(text))) {
    const v = m[2] !== undefined ? m[2] : moduleConst(m[3])
    if (v !== null && v !== undefined) out[m[1]] = v
  }
  return out
}

/**
 * The palette's own top-level keys only.
 *
 * `flatHexes` over the whole palette would also pick up `bg`, `border` and
 * `text` from inside every `tint` entry and quietly overwrite the real ones —
 * so every nested block is cut out first.
 */
function topLevel(text) {
  let flat = text
  for (const name of ['tint', 'palette', 'sport', 'hero', 'heroStat', 'heroStatChrome', 'heroPanel', 'shadowCard', 'shadowFloating']) {
    flat = flat.replace(block(text, name), '')
  }
  // `literalsOf`, not `flatHexes`: `heroLabel` and `heroBody` are rgba on the
  // light palette, and a hex-only parser drops them without saying so.
  return literalsOf(flat)
}

/**
 * `{ name: { … }, … }` → object of objects, keeping rgba values.
 *
 * An entry may also be a bare identifier — the light palette shares one
 * `HERO_SCRIM` across its panel, chips and plates, and has previously shared a
 * single tile const across both stat readouts — so a name is looked up as a
 * module-level const before being given up on. Returning `{}` for those would
 * have made the checks silently vanish rather than fail, which is the worst
 * thing a gate can do.
 */
function nestedLiterals(text) {
  const out = {}
  const re = /(\w+)\s*:\s*(\{[^{}]*\}|\w+)\s*,/g
  let m
  while ((m = re.exec(text))) {
    let body = m[2]
    if (!body.startsWith('{')) {
      const at = source.indexOf('const ' + body)
      if (at === -1) throw new Error('cannot resolve ' + body)
      body = braced(source, at)
    }
    out[m[1]] = literalsOf(body)
  }
  return out
}

/* ---- contrast ------------------------------------------------------ */

function lin(c) {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Flatten a colour onto a backdrop.
 *
 * The hero's interior is largely translucent white, and translucent white is
 * not a colour until you know what is behind it: rgba white at 15% over a deep
 * green is a mid green, and the white text on top of *that* has far less
 * contrast than it had against the green. Every check involving the hero
 * therefore composites the whole stack, innermost first, before measuring.
 */
function flatten(value, backdrop) {
  if (value.startsWith('#')) return value
  const m = value.match(/rgba?\(([^)]*)\)/)
  if (!m) throw new Error('cannot parse colour: ' + value)
  const parts = m[1].split(',').map((n) => parseFloat(n.trim()))
  const alpha = parts.length > 3 ? parts[3] : 1
  const b = backdrop.slice(1)
  const bg = [0, 2, 4].map((i) => parseInt(b.slice(i, i + 2), 16))
  return (
    '#' +
    [0, 1, 2]
      .map((i) => Math.round(alpha * parts[i] + (1 - alpha) * bg[i]))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

function luminance(hex) {
  const h = hex.slice(1)
  return (
    0.2126 * lin(parseInt(h.slice(0, 2), 16)) +
    0.7152 * lin(parseInt(h.slice(2, 4), 16)) +
    0.0722 * lin(parseInt(h.slice(4, 6), 16))
  )
}

function ratio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** WCAG AA for body text. Everything on this screen is body text or smaller. */
const AA = 4.5
/** A tinted panel only has to be *distinguishable* from the page behind it. */
const DISTINCT = 1.05

const verbose = Boolean(process.env.VERBOSE)
let checks = 0
let fails = 0
let scheme = ''

/**
 * `bg` may be a stack, outermost last: `[stop, tile]` means "a tile on the
 * gradient stop". `fg` is then flattened onto the resulting surface.
 */
function check(label, fg, bg, floor) {
  const layers = Array.isArray(bg) ? bg : [bg]
  const surface = layers.reduce((under, over) => flatten(over, under))
  const r = ratio(flatten(fg, surface), surface)
  checks++
  const ok = r >= floor
  if (!ok) fails++
  if (!ok || verbose) {
    const status = ok ? 'ok  ' : 'FAIL'
    console.log('  ' + status + ' ' + r.toFixed(2) + ':1  [' + scheme + '] ' + label + '  (floor ' + floor + ')')
  }
}

/* ---- the audit ----------------------------------------------------- */

function audit(name) {
  scheme = name
  const src = paletteSource(name)
  const color = topLevel(src)
  const palette = flatHexes(block(src, 'palette'))
  const sport = flatHexes(block(src, 'sport'))
  // `nestedLiterals`, not `nestedHexes`: the light tints are the vibrant hue at
  // 8-12% over the page, and a hex-only parser drops every one of them without
  // saying so — which would silently delete this whole section of the audit.
  const tint = nestedLiterals(block(src, 'tint'))
  const hero = heroes(block(src, 'hero'))

  // Every surface a piece of type can land on.
  const surfaces = {
    bg: color.bg,
    surface: color.surface,
    surfaceAlt: color.surfaceAlt,
    fieldBg: color.fieldBg,
  }

  // Everything used as type. `accent`, `warn`, `danger` and `info` are
  // deliberately NOT here: they are fills, icons and rails. Type in those hues
  // goes through the matching `*Text` key, which is what this checks.
  const type = {
    text: color.text,
    textBody: color.textBody,
    textMuted: color.textMuted,
    textSubtle: color.textSubtle,
    accentText: color.accentText,
    warnText: color.warnText,
    dangerText: color.dangerText,
    infoText: color.infoText,
  }

  // The two fills `onAccent` is actually printed on. Its documented contract is
  // "type on a saturated *accent* fill" and nothing else — every other fill in
  // the app (a sport hue, an RPE swatch, warn, danger) is inked by `onColor`,
  // which picks per fill by measurement. Asserting one token across all five
  // was only ever true while they were all dark, and it is the check that would
  // have forced the accent to stay olive.
  const accentFills = {
    accent: color.accent,
    accentPressed: color.accentPressed,
  }
  // Everything else: whatever `onColor` picks for it must clear the floor.
  const inkedFills = {
    warn: color.warn,
    danger: color.danger,
    info: color.info,
  }

  console.log('\n== [' + name + '] type on every surface ==')
  for (const [tn, tv] of Object.entries(type)) {
    for (const [sn, sv] of Object.entries(surfaces)) check(tn + ' on ' + sn, tv, sv, AA)
  }

  console.log('\n== [' + name + '] categorical hues on every surface ==')
  for (const [pn, pv] of Object.entries(palette)) {
    for (const [sn, sv] of Object.entries(surfaces)) check('palette.' + pn + ' on ' + sn, pv, sv, AA)
  }

  // Sport accents label chips and dots, so they are read like type.
  console.log('\n== [' + name + '] sport accents on every surface ==')
  for (const [pn, pv] of Object.entries(sport)) {
    for (const [sn, sv] of Object.entries(surfaces)) check('sport.' + pn + ' on ' + sn, pv, sv, AA)
  }

  console.log('\n== [' + name + '] each tint carries its own type ==')
  for (const [n, t] of Object.entries(tint)) {
    // A tint is a wash *over the page*, so anything measured against one is
    // handed the whole stack rather than the wash on its own — an rgba has no
    // luminance until you know what is behind it.
    const panel = [color.bg, t.bg]
    check('tint.' + n + '.text on tint.' + n + '.bg', t.text, panel, AA)
    check('tint.' + n + '.text on surface', t.text, color.surface, AA)
    check('tint.' + n + '.bg vs page', t.bg, color.bg, DISTINCT)
    // Body copy lands on a tinted panel wherever one carries an explanation
    // rather than just a label — the Progress verdict card, the conflict
    // banner. Those greys were picked against the page, not against a hue.
    check('textBody on tint.' + n, color.textBody, panel, AA)
    check('textMuted on tint.' + n, color.textMuted, panel, AA)
  }

  // The whole interior of the Form Score card, against both gradient stops.
  //
  // This is the section that would have caught the light hero shipping with a
  // white pill, a blue FITNESS number, a red FATIGUE number and navy body copy
  // all inside one green rectangle. Every one of these sits on the gradient
  // rather than on the page, and several sit on a translucent surface that is
  // itself on the gradient, so `check` is handed the whole stack.
  console.log('\n== [' + name + "] everything inside the hero, on both stops ==")
  const stat = nestedLiterals(block(src, 'heroStat'))
  const panel = literalsOf(block(src, 'heroPanel')).bg
  if (!panel) throw new Error(name + ': heroPanel has no bg')
  // The stat tiles carry their own label ink, because light's tiles are
  // translucent *white* over the fill and `heroLabel` — a muted grey picked for
  // the dark scrim the rest of the card uses — is unreadable on them. Checking
  // `heroLabel` here would audit a colour that is no longer rendered.
  const statLabel = literalsOf(block(src, 'heroStatChrome')).label
  if (!statLabel) throw new Error(name + ': heroStatChrome has no label')
  for (const [n, h] of Object.entries(hero)) {
    for (const [which, stop] of [['1st', h.gradient[0]], ['2nd', h.gradient[1]]]) {
      const on = ' on ' + n + ' ' + which + ' stop'
      // Everything in the card sits on the scrim panel, which on light is a
      // dark wash over a vibrant fill and on dark is fully transparent — so
      // this same stack measures both themes correctly, and measures what the
      // card actually renders rather than what it rendered two designs ago.
      const face = [stop, panel]
      check('hero.ink' + on, h.ink, face, AA)
      check('hero.chipInk' + on, h.chipInk, [stop, h.chipBg], AA)
      check('heroLabel' + on, color.heroLabel, face, AA)
      check('heroBody' + on, color.heroBody, face, AA)
      for (const [sn, sv] of Object.entries(stat)) {
        check('heroStat.' + sn + '.text' + on, sv.text, [stop, sv.bg], AA)
        check('heroStatChrome.label on heroStat.' + sn + on, statLabel, [stop, sv.bg], AA)
      }
    }
  }

  console.log('\n== [' + name + '] onAccent reads on the accent fills ==')
  for (const [n, v] of Object.entries(accentFills))
    check('onAccent on ' + n, color.onAccent, v, AA)

  console.log('\n== [' + name + '] onColor picks a legible ink for every other fill ==')
  const INK_DARK = '#0B1220'
  const INK_LIGHT = '#FFFFFF'
  for (const [n, v] of Object.entries(inkedFills)) {
    const ink = ratio(INK_DARK, v) >= ratio(INK_LIGHT, v) ? INK_DARK : INK_LIGHT
    check('onColor(' + n + ') on ' + n, ink, v, AA)
  }

  console.log('\n== [' + name + '] borders are visible against what they enclose ==')
  for (const [sn, sv] of Object.entries(surfaces)) check('border on ' + sn, color.border, sv, DISTINCT)
}

audit('light')
audit('dark')

console.log('\n' + checks + ' checks, ' + fails + ' below floor')

if (fails) {
  console.log('\nA failing pair means unreadable UI on a dim display in daylight.')
  console.log('Fix the token in src/theme/tokens.ts — do not lower the floor.')
}

process.exit(fails ? 1 : 0)
