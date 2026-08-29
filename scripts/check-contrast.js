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

/** `{ name: { gradient: ['#a', '#b'], ink: '#c', … }, … }` */
function heroes(text) {
  const out = {}
  const re =
    /(\w+)\s*:\s*\{\s*gradient:\s*\['(#[0-9a-fA-F]{6})',\s*'(#[0-9a-fA-F]{6})'\][^}]*?ink:\s*'(#[0-9a-fA-F]{6})'/g
  let m
  while ((m = re.exec(text))) out[m[1]] = { from: m[2], to: m[3], ink: m[4] }
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
  for (const name of ['tint', 'palette', 'sport', 'hero', 'shadowCard', 'shadowFloating']) {
    flat = flat.replace(block(text, name), '')
  }
  return flatHexes(flat)
}

/* ---- contrast ------------------------------------------------------ */

function lin(c) {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
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

function check(label, fg, bg, floor) {
  const r = ratio(fg, bg)
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
  const tint = nestedHexes(block(src, 'tint'))
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

  // Fills that have to carry `onAccent` as their ink.
  const fills = {
    accent: color.accent,
    accentPressed: color.accentPressed,
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
    check('tint.' + n + '.text on tint.' + n + '.bg', t.text, t.bg, AA)
    check('tint.' + n + '.text on surface', t.text, color.surface, AA)
    check('tint.' + n + '.bg vs page', t.bg, color.bg, DISTINCT)
  }

  // The hero's numerals are the largest type in the app and the most important,
  // and they sit on a gradient — so they are checked against *both* stops, not
  // just the one that happens to be behind their centre.
  console.log('\n== [' + name + "] the hero's ink reads on both gradient stops ==")
  for (const [n, h] of Object.entries(hero)) {
    check('hero.' + n + '.ink on its first stop', h.ink, h.from, AA)
    check('hero.' + n + '.ink on its second stop', h.ink, h.to, AA)
  }

  console.log('\n== [' + name + '] onAccent reads on the saturated fills ==')
  for (const [n, v] of Object.entries(fills)) check('onAccent on ' + n, color.onAccent, v, AA)

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
