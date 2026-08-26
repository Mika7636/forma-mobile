/**
 * WCAG contrast audit of FORMA's palette.
 *
 *   node scripts/check-contrast.js          # failures only
 *   VERBOSE=1 node scripts/check-contrast.js  # every pair
 *
 * Exits non-zero if any pair falls below its floor, so it works as a CI gate.
 *
 * ## Why this exists
 *
 * FORMA moved from a light theme to a single dark one, and that move silently
 * inverts the safety of every colour pair in the app. White type on the brand
 * fill was 3.4:1 on the old teal and became 2.3:1 on the accent green — still
 * "white on a colour", still looking deliberate in a screenshot, and completely
 * unreadable on the cheap 720p panel this app is used on outdoors. That class of
 * bug does not announce itself; it has to be measured.
 *
 * So the palette is checked rather than eyeballed. Values are parsed straight
 * out of `src/theme/tokens.ts` instead of being restated here, because a
 * hand-copied palette in a checker is a checker that passes while the app fails.
 */
const fs = require('fs')
const path = require('path')

const TOKENS_PATH = path.join(__dirname, '..', 'src', 'theme', 'tokens.ts')

/* ---- parsing ------------------------------------------------------- */

const source = fs.readFileSync(TOKENS_PATH, 'utf8')

/** The body of a named block in the tokens object, e.g. `color: { … }`. */
function block(name) {
  const start = source.indexOf(`\n  ${name}: {`)
  if (start === -1) throw new Error(`tokens.ts has no "${name}" block`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  throw new Error(`unterminated "${name}" block`)
}

/** `{ key: '#RRGGBB', … }` → object, ignoring comments and nested blocks. */
function flatHexes(text) {
  const out = {}
  const re = /(\w+)\s*:\s*'(#[0-9a-fA-F]{6})'/g
  let m
  while ((m = re.exec(text))) out[m[1]] = m[2]
  return out
}

/** `{ name: { bg: '#…', border: '#…', text: '#…' }, … }` */
function nestedHexes(text) {
  const out = {}
  const re = /(\w+)\s*:\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(text))) out[m[1]] = flatHexes(m[2])
  return out
}

const color = flatHexes(block('color'))
const palette = flatHexes(block('palette'))
const tint = nestedHexes(block('tint'))

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
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG AA for body text. Everything on this screen is body text or smaller. */
const AA = 4.5
/** A tinted panel only has to be *distinguishable* from the page behind it. */
const DISTINCT = 1.05

const verbose = Boolean(process.env.VERBOSE)
let checks = 0
let fails = 0

function check(label, fg, bg, floor) {
  const r = ratio(fg, bg)
  checks++
  const ok = r >= floor
  if (!ok) fails++
  if (!ok || verbose) {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2)}:1  ${label}  (floor ${floor})`)
  }
}

/* ---- the audit ----------------------------------------------------- */

// Every surface a piece of type can land on.
const surfaces = {
  bg: color.bg,
  surface: color.surface,
  surfaceAlt: color.surfaceAlt,
}

// Everything used as type. `danger`, `warn` and `accent` are deliberately NOT
// here: they are fills, icons and rails. The app uses the tint `text` values for
// type in those hues — see COLORS.dangerText in constants/theme.ts.
const type = { text: color.text, textMuted: color.textMuted }

// Fills that carry dark type.
const fills = { accent: color.accent, warn: color.warn, danger: color.danger }

console.log('\n== type on every surface ==')
for (const [tn, tv] of Object.entries(type)) {
  for (const [sn, sv] of Object.entries(surfaces)) check(`${tn} on ${sn}`, tv, sv, AA)
}

console.log('\n== categorical hues on every surface ==')
for (const [pn, pv] of Object.entries(palette)) {
  for (const [sn, sv] of Object.entries(surfaces)) check(`palette.${pn} on ${sn}`, pv, sv, AA)
}

console.log('\n== each tint carries its own type ==')
for (const [n, t] of Object.entries(tint)) {
  check(`tint.${n}.text on tint.${n}.bg`, t.text, t.bg, AA)
  check(`tint.${n}.text on surface`, t.text, color.surface, AA)
  check(`tint.${n}.bg vs page`, t.bg, color.bg, DISTINCT)
}

console.log('\n== dark type on saturated fills (COLORS.onAccent) ==')
for (const [n, v] of Object.entries(fills)) check(`onAccent on ${n}`, color.bg, v, AA)

console.log('\n== borders are visible against what they enclose ==')
for (const [sn, sv] of Object.entries(surfaces)) check(`border on ${sn}`, color.border, sv, DISTINCT)

console.log(`\n${checks} checks, ${fails} below floor`)

if (fails) {
  console.log('\nA failing pair means unreadable UI on a dim display in daylight.')
  console.log('Fix the token in src/theme/tokens.ts — do not lower the floor.')
}

process.exit(fails ? 1 : 0)
