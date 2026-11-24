/**
 * WCAG 2.x contrast and the colour pairs the existing pages and controls rely on. Shared by
 * tests/design-tokens.test.ts (the default Field Guide palette) and tests/atmospheres.test.ts
 * (every atmosphere colour set), so both are held to exactly the same list.
 */
export type RGB = [number, number, number];

const lum = (c: RGB) => {
  const [r, g, b] = c.map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const luminance = lum;
export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Colour `fg` at opacity `a` composited over `bg`. */
export const over = (fg: RGB, a: number, bg: RGB) => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;

/** The Field Guide palette roles that existing pages use through fixed utilities. */
export interface LegacyPalette {
  ink: RGB;
  ink2: RGB;
  paper: RGB;
  muted: RGB;
  hunter: RGB;
  rust: RGB;
  rustHover: RGB;
  control: RGB;
}

/** Every text pair (≥ 4.5:1) and non-text pair (≥ 3:1) the existing pages draw with that palette. */
export function legacyPairs(p: LegacyPalette): { text: [string, RGB, RGB][]; nonText: [string, RGB, RGB][] } {
  const { ink, ink2, paper, muted, hunter, rust, control } = p;
  const hunterHeader = over(hunter, 0.4, ink2); // bg-hunter/40 headers inside cards
  const hunterPanel = over(hunter, 0.3, ink); // bg-hunter/30 panels on the page
  return {
    text: [
      ['paper on ink', paper, ink],
      ['paper on ink2 (cards)', paper, ink2],
      ['paper on hunter', paper, hunter],
      ['muted on ink', muted, ink],
      ['muted on ink2', muted, ink2],
      ['muted on hunter', muted, hunter],
      ['rust on ink (labels, numerals)', rust, ink],
      ['rust on ink2 (card dates, prices)', rust, ink2],
      ['rust on hunter/40 card headers', rust, hunterHeader],
      ['ink on rust (primary buttons, rust editions)', ink, rust],
      ['ink on rust hover', ink, p.rustHover],
      ['ink on paper (pressed chips)', ink, paper],
      ['paper/60 on ink', over(paper, 0.6, ink), ink],
      ['paper/60 on hunter/40 headers', over(paper, 0.6, hunterHeader), hunterHeader],
      ['paper/60 on hunter/30 panels', over(paper, 0.6, hunterPanel), hunterPanel],
      ['paper/85 on ink2', over(paper, 0.85, ink2), ink2],
      ['muted/80 placeholders on ink', over(muted, 0.8, ink), ink],
      ['popup links (rust) on ink2', rust, ink2],
    ],
    nonText: [
      ['control border on ink', control, ink],
      ['control border on cards', control, ink2],
      ['control border on hunter/40 headers', control, hunterHeader],
      ['control border on hunter/30 panels', control, hunterPanel],
      ['focus ring on ink', rust, ink],
      ['focus ring on cards', rust, ink2],
      ['focused input border (paper) on ink', paper, ink],
      ['pressed chip fill (paper) on ink', paper, ink],
      ['pressed chip fill (paper) on cards', paper, ink2],
      ['primary button fill (rust) on ink', rust, ink],
      ['primary button fill (rust) on cards', rust, ink2],
    ],
  };
}

/** States of the surface-aware `.ui-*` controls on one surface: [label, ratio, minimum]. */
export function controlStates(s: { bg: RGB; fg: RGB; muted: RGB; accent: RGB; focus: RGB; control: RGB }): [string, number, number][] {
  const { bg, fg } = s;
  return [
    ['fg', contrast(fg, bg), 4.5],
    ['fg-muted', contrast(s.muted, bg), 4.5],
    ['accent', contrast(s.accent, bg), 4.5],
    ['focus', contrast(s.focus, bg), 3],
    ['control', contrast(s.control, bg), 3],
    ['primary text', contrast(bg, fg), 4.5],
    ['primary hover text', contrast(bg, over(fg, 0.9, bg)), 4.5],
    ['primary fill vs surface', contrast(fg, bg), 3],
    ['hover text', contrast(fg, over(fg, 0.1, bg)), 4.5],
    ['hover boundary', contrast(fg, over(fg, 0.1, bg)), 3],
    ['pressed chip text', contrast(bg, fg), 4.5],
    ['pressed chip hover text', contrast(bg, over(fg, 0.9, bg)), 4.5],
    ['pressed chip fill vs surface', contrast(fg, bg), 3],
    ['pressed chip hover fill vs surface', contrast(over(fg, 0.9, bg), bg), 3],
    ['focus ring vs surface', contrast(s.focus, bg), 3],
    ['placeholder', contrast(s.muted, bg), 4.5],
  ];
}
