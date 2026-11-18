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
        control: 'rgb(var(--control) / <alpha-value>)',
        rule: 'rgb(var(--rule) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Anton', '"Avenir Next Condensed"', '"Arial Narrow"', 'Impact', '"Roboto Condensed"', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        jp: ['"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"', '"Yu Gothic"', 'sans-serif'],
        // Decorative handwritten accent only (Caveat Bold, loaded with <Annotation>); never for
        // essential labels, controls or body copy.
        hand: ['Caveat', '"Bradley Hand"', '"Segoe Print"', 'cursive'],
      },
      letterSpacing: {
        label: '0.18em',
      },
      // Type hierarchy (Sprint 02, agreed 2026-11-18): ordinary body 16px; editorial body
      // 17–18px; labels 12–13px; display ≈ 40–56px on mobile and 72–112px on desktop. Oversized,
      // unusually tight type is reserved for deliberate cover treatments (`text-cover`), never
      // ordinary headings. Fluid sizes include a rem term so they follow browser text size and
      // zoom; that is a design safeguard, not proof of 200% reflow (verified manually).
      fontSize: {
        label: ['clamp(0.75rem, 0.72rem + 0.1vw, 0.8125rem)', { lineHeight: '1.4', letterSpacing: '0.16em' }],
        small: ['0.875rem', { lineHeight: '1.5' }],
        body: ['1rem', { lineHeight: '1.6' }],
        'body-editorial': ['clamp(1.0625rem, 1rem + 0.2vw, 1.125rem)', { lineHeight: '1.65' }],
        heading: ['clamp(1.5rem, 1.3rem + 0.9vw, 2.25rem)', { lineHeight: '1.1' }],
        display: ['clamp(2.5rem, 1.67rem + 3.54vw, 4.5rem)', { lineHeight: '0.95' }],
        'display-lg': ['clamp(3rem, 1.72rem + 6.59vw, 7rem)', { lineHeight: '0.92' }],
        cover: ['clamp(4.5rem, 2.5rem + 9vw, 10rem)', { lineHeight: '0.85' }],
      },
      maxWidth: {
        measure: '65ch',
      },
      borderRadius: {
        DEFAULT: '2px',
      },
      keyframes: {
        // Graphic primitives: a stamp landing. Disabled by the global reduced-motion rule.
        'stamp-in': {
          '0%': { opacity: '0', transform: 'scale(1.35) rotate(var(--stamp-angle, 0deg))' },
          '70%': { opacity: '1', transform: 'scale(0.96) rotate(var(--stamp-angle, 0deg))' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(var(--stamp-angle, 0deg))' },
        },
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
        'stamp-in': 'stamp-in 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
        flicker: 'flicker 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
