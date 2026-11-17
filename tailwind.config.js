/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#141614',
        ink2: '#212520',
        paper: '#E9DFC9',
        muted: '#A8AA99',
        hunter: '#283B31',
        rust: '#B76940',
        line: '#3D453B',
      },
      fontFamily: {
        display: ['Anton', '"Avenir Next Condensed"', '"Arial Narrow"', 'Impact', '"Roboto Condensed"', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        jp: ['"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"', '"Yu Gothic"', 'sans-serif'],
      },
      letterSpacing: {
        label: '0.18em',
      },
      borderRadius: {
        DEFAULT: '2px',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        rise: 'rise 320ms ease-out both',
        flicker: 'flicker 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
