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
  assert.deepEqual([...surfaces.keys()], ['ink', 'raised', 'hunter', 'editorial', 'cream', 'orange', 'mustard', 'pink', 'cobalt', 'olive', 'forest']);
  for (const [name, v] of surfaces) assert.deepEqual([...v.keys()].sort(), ['accent', 'control', 'fg', 'fg-muted', 'focus', 'rule', 'surface'], name);
  // Every surface class also paints its background and text.
  const painted = /((?:\.surface-[\w-]+,\s*)+\.surface-[\w-]+)\s*\{\s*background-color: rgb\(var\(--surface\)\);\s*color: rgb\(var\(--fg\)\);/.exec(css);
  assert.ok(painted);
  assert.deepEqual(painted![1].split(/,\s*/).map((s) => s.slice('.surface-'.length)).sort(), [...surfaces.keys()].sort());
});

test('every surface pair meets WCAG AA: text 4.5:1, focus indicator and control boundary 3:1', () => {
  const rows: string[] = [];
  for (const [name, v] of surfaces) {
    const bg = resolve(v.get('surface')!, v);
    const r = (k: string) => contrast(resolve(v.get(k)!, v), bg);
    for (const k of ['fg', 'fg-muted', 'accent']) assert.ok(r(k) >= 4.5, `${name}: --${k} is ${r(k).toFixed(2)}:1`);
    assert.ok(r('focus') >= 3, `${name}: --focus is ${r('focus').toFixed(2)}:1`);
    assert.ok(r('control') >= 3, `${name}: --control is ${r('control').toFixed(2)}:1`);
    rows.push(`${name}: fg ${r('fg').toFixed(2)} · muted ${r('fg-muted').toFixed(2)} · accent ${r('accent').toFixed(2)} · focus ${r('focus').toFixed(2)} · control ${r('control').toFixed(2)}`);
  }
  assert.equal(rows.length, 11);
});

test('surface-aware controls (.ui-*) keep every state accessible on every surface', () => {
  for (const [name, v] of surfaces) {
    const bg = resolve(v.get('surface')!, v);
    const fg = resolve(v.get('fg')!, v);
    const states: [string, number, number][] = [
      // Primary button: surface-colored text on an fg fill, at rest and on hover (fg at 90%).
      ['primary text', contrast(bg, fg), 4.5],
      ['primary hover text', contrast(bg, over(fg, 0.9, bg)), 4.5],
      ['primary fill vs surface', contrast(fg, bg), 3],
      // Secondary buttons and chips on hover: fg text on a 10% fg wash.
      ['hover text', contrast(fg, over(fg, 0.1, bg)), 4.5],
      // Hover strengthens the boundary to fg (the control token alone can dip below 3:1 on the wash).
      ['hover boundary', contrast(fg, over(fg, 0.1, bg)), 3],
      // Pressed chip: surface text on fg.
      ['pressed chip text', contrast(bg, fg), 4.5],
      // Placeholder text uses fg-muted on the surface.
      ['placeholder', contrast(resolve(v.get('fg-muted')!, v), bg), 4.5],
    ];
    for (const [label, ratio, min] of states) assert.ok(ratio >= min, `${name}: ${label} ${ratio.toFixed(2)}:1`);
  }
});

test(':root defaults are the Field Guide ink surface (application background unchanged)', () => {
  const ink = surfaces.get('ink')!;
  for (const k of ['surface', 'fg', 'fg-muted', 'accent', 'focus', 'control', 'rule']) assert.equal(palette.get(k), ink.get(k), `--${k}`);
  assert.deepEqual(P('ink'), [0x14, 0x16, 0x14], 'app background stays #141614');
  assert.deepEqual(P('ink-2'), [0x21, 0x25, 0x20]);
  assert.deepEqual(P('hunter'), [0x28, 0x3b, 0x31]);
});

/** The approved Newsstand pairs (ChatGPT, 2026-11-18): background / foreground / muted / accent / focus. */
const APPROVED: Record<string, string> = {
  cream: '#F1E3C6 #20251F #53594C #923219 #164AB7',
  editorial: '#20251F #FFF4DB #C4C8B7 #F4C632 #F4C632',
  orange: '#F47738 #161A16 #35231B #44200D #20251F',
  mustard: '#F4C632 #20251F #51502B #70310F #164AB7',
  pink: '#E99FB2 #20251F #51404A #762345 #164AB7',
  cobalt: '#164AB7 #FFF4DB #DCE6FF #F4C632 #F4C632',
  olive: '#A8B56B #20251F #394126 #343D19 #20251F',
  forest: '#204E3F #FFF4DB #C5D8C7 #F4C632 #F4C632',
};
const hex = (c: RGB) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

test('Newsstand surfaces use exactly the approved palette pairs', () => {
  for (const [name, pairs] of Object.entries(APPROVED)) {
    const v = surfaces.get(name)!;
    assert.ok(v, name);
    const got = ['surface', 'fg', 'fg-muted', 'accent', 'focus'].map((k) => hex(resolve(v.get(k)!, v))).join(' ');
    assert.equal(got, pairs, name);
  }
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
  // Non-text (WCAG 1.4.11): control boundaries, focus indicators and control states against
  // every background they sit on.
  const control = P('control');
  const nonText: [string, RGB, RGB][] = [
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
  ];
  for (const [label, fg, bg] of nonText) assert.ok(contrast(fg, bg) >= 3, `${label}: ${contrast(fg, bg).toFixed(2)}:1`);
  // Decorative rules are not control boundaries (the reason --control exists).
  assert.ok(contrast(P('line'), ink) < 3);
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
/** Rendered px of a size token at a viewport width (16px root; zoom is checked manually). */
function px(size: string, vw: number) {
  const fixed = /^([\d.]+)rem$/.exec(size);
  if (fixed) return Number(fixed[1]) * 16;
  const m = /^clamp\(([\d.]+)rem, ([\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)$/.exec(size);
  assert.ok(m, `unsupported size ${size}`);
  const [min, base, slope, max] = m!.slice(1).map(Number);
  return Math.min(max * 16, Math.max(min * 16, base * 16 + (slope * vw) / 100));
}
const range = (k: string, from: number, to: number) => {
  const v: number[] = [];
  for (let w = from; w <= to; w += 5) v.push(px(sizes[k][0], w));
  return [Math.min(...v), Math.max(...v)];
};

test('type hierarchy matches the agreed sizes', () => {
  assert.deepEqual(Object.keys(sizes), ['label', 'small', 'body', 'body-editorial', 'heading', 'display', 'display-lg', 'cover']);
  assert.deepEqual(range('body', 320, 1440), [16, 16], 'ordinary body 16px');
  const [eMin, eMax] = range('body-editorial', 320, 1440);
  assert.ok(eMin >= 17 && eMax <= 18, `editorial body 17–18px (${eMin}–${eMax})`);
  const [lMin, lMax] = range('label', 320, 1440);
  assert.ok(lMin >= 12 && lMax <= 13, `labels 12–13px (${lMin}–${lMax})`);
  for (const k of ['display', 'display-lg']) {
    const [mMin, mMax] = range(k, 320, 430);
    const [dMin, dMax] = range(k, 1280, 1440);
    assert.ok(mMin >= 40 && mMax <= 56, `${k} mobile ≈ 40–56px (${mMin.toFixed(1)}–${mMax.toFixed(1)})`);
    assert.ok(dMin >= 72 && dMax <= 112, `${k} desktop ≈ 72–112px (${dMin.toFixed(1)}–${dMax.toFixed(1)})`);
  }
  for (const k of ['small', 'body', 'body-editorial']) assert.ok(Number(sizes[k][1].lineHeight) >= 1.5, `${k} line-height ≥ 1.5`);
});

test('oversized and unusually tight type is reserved for cover treatments', () => {
  for (const [k, [size, { lineHeight }]] of Object.entries(sizes)) {
    if (k === 'cover') continue;
    assert.ok(range(k, 320, 1440)[1] <= 112, `${k} stays within ordinary sizes`);
    assert.ok(Number(lineHeight) >= 0.9, `${k}: line-height ${lineHeight} is cover-tight`);
    if (size.startsWith('clamp')) assert.match(size, /rem \+/, `${k}: fluid sizes keep a rem term (zoom safeguard)`);
  }
  assert.ok(range('cover', 1280, 1440)[1] > 112 && Number(sizes.cover[1].lineHeight) < 0.9, 'cover is the deliberate exception');
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
