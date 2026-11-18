/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Field Guide palette (CSS variables in src/styles/tokens.css). Prefer the semantic
        // surface tokens below for new work.
        ink: 'rgb(var(--pp-ink) / <alpha-value>)',
        ink2: 'rgb(var(--pp-ink-2) / <alpha-value>)',
        paper: 'rgb(var(--pp-paper) / <alpha-value>)',
        muted: 'rgb(var(--pp-muted) / <alpha-value>)',
        hunter: 'rgb(var(--pp-hunter) / <alpha-value>)',
        rust: {
          DEFAULT: 'rgb(var(--pp-rust) / <alpha-value>)',
          hover: 'rgb(var(--pp-rust-hover) / <alpha-value>)',
        },
        line: 'rgb(var(--pp-line) / <alpha-value>)',
        // Semantic tokens: resolve against the nearest `.surface-*` (tested pairs).
        surface: 'rgb(var(--surface) / <alpha-value>)',
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
        },
        accent: 'rgb(var(--accent) / <alpha-value>)',
        focus: 'rgb(var(--focus) / <alpha-value>)',
        rule: 'rgb(var(--rule) / <alpha-value>)',
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
      // Type scale (Sprint 02, PR 1). Body copy is ≥ 16px with line-height ≥ 1.5. Fluid sizes
      // always include a rem term, so they scale with browser zoom and text size (WCAG 1.4.4).
      fontSize: {
        label: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.18em' }],
        small: ['0.875rem', { lineHeight: '1.5' }],
        body: ['1rem', { lineHeight: '1.6' }],
        lede: ['clamp(1.125rem, 1.05rem + 0.35vw, 1.3125rem)', { lineHeight: '1.5' }],
        title: ['clamp(1.75rem, 1.4rem + 1.5vw, 2.5rem)', { lineHeight: '1' }],
        'display-s': ['clamp(2.25rem, 1.8rem + 2vw, 3.25rem)', { lineHeight: '0.95' }],
        'display-m': ['clamp(3rem, 2.2rem + 3.5vw, 5rem)', { lineHeight: '0.9' }],
        'display-l': ['clamp(3.75rem, 2.5rem + 6vw, 7.5rem)', { lineHeight: '0.88' }],
        'display-xl': ['clamp(4.5rem, 2.5rem + 9vw, 10rem)', { lineHeight: '0.85' }],
      },
      maxWidth: {
        measure: '65ch',
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
