/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // FORMA brand teal — use via className="bg-forma" / "text-forma".
        forma: {
          DEFAULT: '#1D9E75',
          500: '#1D9E75',
        },
      },
    },
  },
  plugins: [],
}
