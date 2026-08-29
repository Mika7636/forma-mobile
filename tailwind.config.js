/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Deliberately no `colors` here. FORMA has two palettes that swap at runtime,
  // which a Tailwind class name cannot express, so every colour in the app comes
  // from `useTheme()` and `src/theme/tokens.ts` is the only palette. A brand
  // colour restated here would be a second source of truth that no longer
  // matches either theme — the old `forma` teal already didn't.
  theme: { extend: {} },
  plugins: [],
}
