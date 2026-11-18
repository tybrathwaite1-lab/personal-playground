/**
 * Sprint 02 PR 1: accessible design tokens and typography.
 * Computes WCAG 2.x contrast for every declared surface pair and for the legacy Field Guide
 * pairs that existing pages use, checks the type scale, and guards token discipline.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwind from '../tailwind.config.js';

type RGB = [number, number, number];
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const css = read('src/styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** Variables declared in a block: name → raw value. */
function vars(block: string) {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}
const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)![1];
const palette = vars(rootBlock);
function resolve(v: string, scope: Map<string, string>, depth = 0): RGB {
  assert.ok(depth < 5, `unresolvable ${v}`);
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  if (ref) {
    const next = scope.get(ref[1]) ?? palette.get(ref[1]);
    assert.ok(next, `undefined variable --${ref[1]}`);
    return resolve(next!, scope, depth + 1);
  }
  const m = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(v);
  assert.ok(m, `not an RGB triplet: ${v}`);
  const rgb = [Number(m![1]), Number(m![2]), Number(m![3])] as RGB;
  assert.ok(rgb.every((c) => c <= 255), `channel out of range: ${v}`);
  return rgb;
}
const lum = (c: RGB) => {
  const [r, g, b] = c.map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Color `fg` at opacity `a` composited over `bg`. */
const over = (fg: RGB, a: number, bg: RGB) => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;
const P = (name: string) => resolve(`var(--pp-${name})`, palette);

const surfaces = new Map<string, Map<string, string>>();
for (const m of css.matchAll(/\.surface-([\w-]+)\s*\{([^}]*)\}/g)) if (m[2].includes('--surface:')) surfaces.set(m[1], vars(m[2]));

test('every surface declares the full token set', () => {
  assert.deepEqual([...surfaces.keys()], ['ink', 'raised', 'hunter', 'cream', 'orange', 'cobalt', 'mustard', 'pink', 'olive', 'forest']);
  for (const [name, v] of surfaces) assert.deepEqual([...v.keys()].sort(), ['accent', 'fg', 'fg-muted', 'focus', 'rule', 'surface'], name);
  // Every surface class also paints its background and text.
  const painted = /((?:\.surface-[\w-]+,\s*)+\.surface-[\w-]+)\s*\{\s*background-color: rgb\(var\(--surface\)\);\s*color: rgb\(var\(--fg\)\);/.exec(css);
  assert.ok(painted);
  assert.deepEqual(painted![1].split(/,\s*/).map((s) => s.slice('.surface-'.length)).sort(), [...surfaces.keys()].sort());
});

test('every surface pair meets WCAG AA: text 4.5:1, focus indicator 3:1', () => {
  const rows: string[] = [];
  for (const [name, v] of surfaces) {
    const bg = resolve(v.get('surface')!, v);
    const r = (k: string) => contrast(resolve(v.get(k)!, v), bg);
    for (const k of ['fg', 'fg-muted', 'accent']) assert.ok(r(k) >= 4.5, `${name}: --${k} is ${r(k).toFixed(2)}:1`);
    assert.ok(r('focus') >= 3, `${name}: --focus is ${r('focus').toFixed(2)}:1`);
    rows.push(`${name}: fg ${r('fg').toFixed(2)} · muted ${r('fg-muted').toFixed(2)} · accent ${r('accent').toFixed(2)} · focus ${r('focus').toFixed(2)}`);
  }
  assert.equal(rows.length, 10);
});

test(':root defaults are the ink surface (existing pages unchanged)', () => {
  const ink = surfaces.get('ink')!;
  for (const k of ['surface', 'fg', 'fg-muted', 'accent', 'focus', 'rule']) assert.equal(palette.get(k), ink.get(k), `--${k}`);
});

test('legacy Field Guide pairs used by existing pages meet WCAG AA', () => {
  const ink = P('ink');
  const ink2 = P('ink-2');
  const paper = P('paper');
  const muted = P('muted');
  const hunter = P('hunter');
  const rust = P('rust');
  const hunterHeader = over(hunter, 0.4, ink2); // bg-hunter/40 headers inside cards
  const hunterPanel = over(hunter, 0.3, ink); // bg-hunter/30 panels on the page
  const text: [string, RGB, RGB][] = [
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
    ['ink on rust hover', ink, P('rust-hover')],
    ['ink on paper (pressed chips)', ink, paper],
    ['paper/60 on ink', over(paper, 0.6, ink), ink],
    ['paper/60 on hunter/40 headers', over(paper, 0.6, hunterHeader), hunterHeader],
    ['paper/60 on hunter/30 panels', over(paper, 0.6, hunterPanel), hunterPanel],
    ['paper/85 on ink2', over(paper, 0.85, ink2), ink2],
    ['muted/80 placeholders on ink', over(muted, 0.8, ink), ink],
    ['popup links (rust) on ink2', rust, ink2],
  ];
  for (const [label, fg, bg] of text) assert.ok(contrast(fg, bg) >= 4.5, `${label}: ${contrast(fg, bg).toFixed(2)}:1`);
  // Non-text: the focus ring on the page and on cards (WCAG 1.4.11).
  assert.ok(contrast(rust, ink) >= 3 && contrast(rust, ink2) >= 3);
  // The rust fix: the old value failed body-text contrast on ink and on cards.
  assert.ok(contrast([0xb7, 0x69, 0x40], ink) < 4.5 && contrast([0xb7, 0x69, 0x40], ink2) < 4.5, 'regression reference');
});

test('theme color and manifest match the ink token', () => {
  const hex = `#${P('ink').map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  assert.match(read('index.html'), new RegExp(`name="theme-color" content="${hex}"`, 'i'));
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.theme_color.toUpperCase(), hex);
  assert.equal(manifest.background_color.toUpperCase(), hex);
});

// ─── Typography ─────────────────────────────────────────────────────────
const sizes = (tailwind as { theme: { extend: { fontSize: Record<string, [string, { lineHeight: string }]> } } }).theme.extend.fontSize;
const rem = (v: string) => {
  const m = /^([\d.]+)rem$/.exec(v);
  return m ? Number(m[1]) * 16 : NaN;
};

test('type scale: readable body copy, zoom-safe fluid sizes, tight-but-safe display leading', () => {
  assert.deepEqual(Object.keys(sizes), ['label', 'small', 'body', 'lede', 'title', 'display-s', 'display-m', 'display-l', 'display-xl']);
  assert.ok(rem(sizes.body[0]) >= 16, 'body ≥ 16px');
  for (const k of ['small', 'body', 'lede']) assert.ok(Number(sizes[k][1].lineHeight) >= 1.5, `${k} line-height ≥ 1.5`);
  assert.ok(rem(sizes.label[0]) >= 11, 'labels ≥ 11px');
  for (const [k, [size, { lineHeight }]] of Object.entries(sizes)) {
    const clamp = /^clamp\(([\d.]+)rem, ([\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)$/.exec(size);
    if (size.startsWith('clamp')) {
      assert.ok(clamp, `${k}: clamp(min rem, rem + vw, max rem)`);
      const [, min, base, , max] = clamp!.map(Number);
      assert.ok(min < max && base > 0, `${k}: min < max and a rem term so zoom scales it`);
    } else assert.ok(!Number.isNaN(rem(size)), `${k}: rem units`);
    assert.ok(Number(lineHeight) >= 0.85, `${k}: line-height ≥ 0.85`);
  }
  // Display sizes increase step by step.
  const mins = ['display-s', 'display-m', 'display-l', 'display-xl'].map((k) => Number(/clamp\(([\d.]+)rem/.exec(sizes[k][0])![1]));
  assert.deepEqual([...mins].sort((a, b) => a - b), mins);
});

// ─── Token discipline ───────────────────────────────────────────────────
function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? files(p) : [p];
  });
}

test('colors come from tokens: no hard-coded colors in components or the stylesheet', () => {
  const src = files('src').filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith('tokens.css'));
  for (const f of src) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/(?:bg|text|border|fill|stroke|ring|outline|decoration|from|to|via)-\[#/.test(s), false, `${f}: arbitrary color utility`);
    if (f.endsWith('.css')) {
      const hex = s.replace(/url\("data:[^"]*"\)/g, '').match(/#[0-9a-fA-F]{3,8}\b/g);
      assert.equal(hex, null, `${f}: hard-coded hex ${hex}`);
      assert.equal(/rgba?\(\s*\d/.test(s), false, `${f}: hard-coded rgb()`);
    } else {
      assert.equal(/['"`]#[0-9a-fA-F]{6}['"`]/.test(s), false, `${f}: hard-coded hex color`);
    }
  }
  // The old rust value is gone everywhere.
  for (const f of [...src, 'tailwind.config.js']) assert.equal(/b76940|c97a50/i.test(read(f)), false, f);
});
