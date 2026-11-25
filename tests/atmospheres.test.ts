/**
 * Creative Slice 03, Phase 3.3: shell atmospheres.
 *
 *  - Every colour set in the registry has exactly one complete block of tokens, and every pair
 *    the existing pages and the surface-aware controls draw with passes WCAG AA in each set
 *    (the same list as the default palette: tests/helpers/contrast.ts).
 *  - Nothing applies without an atmosphere: every rule is scoped to html[data-look…].
 *  - The shell is styled through shared variables and data-shell hooks only.
 *  - The pre-paint script in index.html agrees with resolve(parseAppearance(…)) for every input
 *    and gives the browser the page colour of the set it applies.
 *  - Newsreader is named only by The Quiet Room, the prototype and the discovery preview.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { LOOKS } from '../src/appearance/looks.ts';
import { APPEARANCE_KEY, parseAppearance, resolve } from '../src/appearance/appearance.ts';
import { contrast, controlStates, legacyPairs, luminance, type RGB } from './helpers/contrast.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const tokensCss = strip(read('src/styles/atmospheres/tokens.css'));
const shellCss = strip(read('src/styles/atmospheres/shell.css'));

const ROLES = ['ink', 'ink-2', 'paper', 'muted', 'hunter', 'line', 'control', 'rust', 'rust-hover'];
const triplet = (v: string | undefined, what: string): RGB => {
  const m = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(v ?? '');
  assert.ok(m, `${what}: not an RGB triplet (${v})`);
  const rgb = m!.slice(1).map(Number) as RGB;
  assert.ok(rgb.every((c) => c <= 255), `${what}: channel out of range`);
  return rgb;
};
const hex = (c: RGB) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Colour-set blocks: "look/palette" → declarations. */
const sets = new Map<string, Map<string, string>>();
for (const m of tokensCss.matchAll(/html\[data-look='([\w-]+)'\]\[data-look-palette='([\w-]+)'\]\s*\{([^}]*)\}/g)) {
  const key = `${m[1]}/${m[2]}`;
  assert.ok(!sets.has(key), `${key} declared twice`);
  const decl = new Map<string, string>();
  for (const d of m[3].matchAll(/([\w-]+):\s*([^;]+);/g)) decl.set(d[1], d[2].trim());
  sets.set(key, decl);
}
const role = (key: string, r: string) => triplet(sets.get(key)!.get(`--pp-${r}`), `${key} --pp-${r}`);

test('every colour set in the registry has exactly one complete block, and nothing else does', () => {
  const expected = LOOKS.flatMap((l) => l.palettes.map((p) => `${l.id}/${p.id}`));
  assert.deepEqual([...sets.keys()].sort(), expected.sort());
  for (const [key, decl] of sets) {
    const studio = key.startsWith('studio/');
    const want = ['color-scheme', ...ROLES.map((r) => `--pp-${r}`), '--look-duo', ...(studio ? ['--look-a', '--look-b', '--look-c', '--look-d'] : [])];
    assert.deepEqual([...decl.keys()].sort(), want.sort(), key);
    // Light pages: light browser chrome and multiplied artwork; dark pages: the reverse.
    const light = luminance(role(key, 'ink')) >= 0.18;
    assert.equal(decl.get('color-scheme'), light ? 'light' : 'dark', `${key} color-scheme`);
    assert.equal(decl.get('--look-duo'), light ? 'multiply' : 'screen', `${key} duotone blend`);
    if (studio) for (const k of ['a', 'b', 'c', 'd']) triplet(decl.get(`--look-${k}`), `${key} --look-${k}`);
  }
});

test('in every colour set, each pair the existing pages draw with meets WCAG AA', () => {
  for (const key of sets.keys()) {
    const p = { ink: role(key, 'ink'), ink2: role(key, 'ink-2'), paper: role(key, 'paper'), muted: role(key, 'muted'), hunter: role(key, 'hunter'), rust: role(key, 'rust'), rustHover: role(key, 'rust-hover'), control: role(key, 'control') };
    const { text, nonText } = legacyPairs(p);
    assert.equal(text.length + nonText.length, 29);
    for (const [label, fg, bg] of text) assert.ok(contrast(fg, bg) >= 4.5, `${key}: ${label} ${contrast(fg, bg).toFixed(2)}:1`);
    for (const [label, fg, bg] of nonText) assert.ok(contrast(fg, bg) >= 3, `${key}: ${label} ${contrast(fg, bg).toFixed(2)}:1`);
  }
});

test('in every colour set, the surface-aware controls keep every state accessible on ink, raised and hunter', () => {
  // The Field Guide surfaces follow the set; on hunter the focus ring is the text colour.
  const hunter = /html\[data-look\] \.surface-hunter \{([^}]*)\}/.exec(tokensCss);
  assert.ok(hunter, 'the hunter surface follows the set');
  for (const [k, v] of [['fg-muted', 'muted'], ['accent', 'rust'], ['focus', 'paper'], ['control', 'control'], ['rule', 'line']]) {
    assert.match(hunter![1], new RegExp(`--${k}: var\\(--pp-${v}\\);`), `hunter --${k}`);
  }
  for (const key of sets.keys()) {
    const [paper, muted, rust, control] = ['paper', 'muted', 'rust', 'control'].map((r) => role(key, r));
    for (const [surface, bg, focus] of [['ink', role(key, 'ink'), rust], ['raised', role(key, 'ink-2'), rust], ['hunter', role(key, 'hunter'), paper]] as const) {
      for (const [label, ratio, min] of controlStates({ bg, fg: paper, muted, accent: rust, focus, control })) {
        assert.ok(ratio >= min, `${key} on ${surface}: ${label} ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('the default is untouched: every atmosphere rule needs data-look on <html>', () => {
  for (const [file, css] of [['atmospheres/tokens.css', tokensCss], ['atmospheres/shell.css', shellCss]] as const) {
    const flat = css.replace(/@media[^{]*\{/g, ''); // a media query's own closing brace then just separates rules
    const selectors = [...flat.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim())).filter(Boolean);
    assert.ok(selectors.length > 10, file);
    for (const s of selectors) assert.match(s, /^html\[data-look[\]=]/, `${file}: "${s}" would apply without an atmosphere`);
  }
  // The default palette itself is unchanged (tests/design-tokens.test.ts pins every value).
  assert.match(read('src/styles/tokens.css'), /--pp-ink: 20 22 20;/);
});

test('the shell is styled through shared type variables and data-shell hooks only', () => {
  // Each type pairing sets the same variables.
  const VARS = ['--shell-display', '--shell-display-weight', '--shell-display-case', '--shell-display-tracking', '--shell-nav', '--shell-nav-weight', '--shell-nav-case', '--shell-nav-tracking', '--shell-nav-size'];
  for (const l of LOOKS) {
    for (const t of l.types) {
      const block = new RegExp(`html\\[data-look='${l.id}'\\]\\[data-look-type='${t.id}'\\] \\{([^}]*)\\}`).exec(shellCss);
      assert.ok(block, `${l.id}/${t.id} type pairing`);
      assert.deepEqual([...block![1].matchAll(/(--[\w-]+):/g)].map((m) => m[1]), VARS, `${l.id}/${t.id}`);
    }
  }
  // Every hook the styles use is in Layout.tsx, and Layout only gained hooks (no new classes).
  const layout = read('src/components/Layout.tsx');
  const hooks = new Set([...layout.matchAll(/data-shell="([\w-]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...hooks].sort(), ['footer', 'header', 'issue', 'main', 'menu', 'menu-label', 'menu-num', 'menu-title', 'nav', 'settings', 'tabbar', 'wordmark']);
  for (const m of shellCss.matchAll(/\[data-shell='([\w-]+)'\]/g)) assert.ok(hooks.has(m[1]), `unknown hook ${m[1]}`);
  // Studio's four decorative colours are for stripes and dots only, never text or borders.
  const declarations = [...shellCss.matchAll(/\{([^{}]*)\}/g)].flatMap((b) => b[1].split(';'));
  const decorative = declarations.filter((d) => /var\(--look-[a-d]\)/.test(d));
  assert.ok(decorative.length >= 4);
  for (const d of decorative) assert.match(d.trim(), /^background(-image)?:/, `--look-* used for ${d.trim()}`);
  // Nothing in the shell atmospheres moves (reduced motion is unaffected).
  assert.doesNotMatch(shellCss, /transition|animation|@keyframes/);
  // No colour outside the tokens.
  assert.doesNotMatch(shellCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/);
});

test('Newsreader is named only by The Quiet Room, its declaration, the prototype and the discovery preview', () => {
  const files = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((f) => {
      const p = join(dir, f);
      return statSync(join(root, p)).isDirectory() ? files(p) : [p];
    });
  const users = files('src').filter((f) => /\.(tsx?|css)$/.test(f) && /Newsreader/.test(strip(read(f))));
  // PR 3: the discovery preview (#/preview/living, a lazy chunk) sets its editorial text in it.
  assert.deepEqual(users.filter((f) => !f.startsWith('src/prototype/')).sort(), ['src/preview/living/living.css', 'src/styles/atmospheres/shell.css', 'src/styles/newsreader.css']);
  // In the shell styles, only Quiet Room rules name it.
  for (const m of shellCss.matchAll(/([^{}]+)\{([^{}]*Newsreader[^{}]*)\}/g)) {
    for (const s of m[1].split(',')) assert.match(s.trim(), /^html\[data-look='quiet-room'\]/, s.trim());
  }
  // Every declared face swaps in (text is never invisible while it loads).
  const faces = [...read('src/styles/newsreader.css').matchAll(/@font-face\s*\{([^}]*)\}/g)];
  assert.equal(faces.length, 3);
  for (const f of faces) assert.match(f[1], /font-display: swap;/);
});

// ─── Before first paint ──────────────────────────────────────────────────
const html = read('index.html');
const inline = /<script>([\s\S]*?)<\/script>/.exec(html);

/** Runs the inline script against a stored value; returns what it set. */
function prePaint(stored: string | null | Error) {
  const attrs: Record<string, string> = {};
  const metas: Record<string, string> = { 'theme-color': '#141614', 'color-scheme': 'dark' };
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = String(v)) },
    querySelector: (sel: string) => {
      const name = /meta\[name="([\w-]+)"\]/.exec(sel)![1];
      return { setAttribute: (k: string, v: string) => (assert.equal(k, 'content'), (metas[name] = String(v))) };
    },
  };
  const localStorage = {
    getItem: (k: string) => {
      assert.equal(k, APPEARANCE_KEY);
      if (stored instanceof Error) throw stored;
      return stored;
    },
  };
  runInNewContext(inline![1], { document, localStorage, JSON, Object, Array });
  return { attrs, metas };
}

/** What the app resolves for the same stored value (as loadAppearance reads it). */
function app(stored: string | null | Error) {
  if (stored === null || stored instanceof Error) return null;
  try {
    return resolve(parseAppearance(JSON.parse(stored)));
  } catch {
    return null;
  }
}

test('index.html applies a saved atmosphere before the app runs, exactly as the app resolves it', () => {
  assert.ok(inline, 'an inline script in <head>');
  assert.ok(html.indexOf(inline![0]) < html.indexOf('</head>'), 'it runs in <head>, before the body paints');
  // The static defaults stay: no atmosphere means today's Playground (design-tokens pins them).
  assert.match(html, /name="theme-color" content="#141614"/);
  assert.match(html, /name="color-scheme" content="dark"/);

  const v = (x: unknown) => JSON.stringify(x);
  const corpus: (string | null | Error)[] = [
    null,
    new Error('SecurityError: storage blocked'),
    '',
    'not json',
    '{',
    'null',
    '42',
    '"studio"',
    '[]',
    v({}),
    v({ look: 'studio' }),
    v({ v: 2, look: 'studio', custom: {} }),
    v({ v: '1', look: 'studio', custom: {} }),
    v({ v: 1, look: null, custom: {} }),
    v({ v: 1, look: 'gallery', custom: {} }),
    v({ v: 1, look: ['studio'], custom: {} }),
    v({ v: 1, look: 'constructor', custom: {} }),
    v({ v: 1, look: '__proto__', custom: {} }),
    v({ v: 1, look: 'toString', custom: {} }),
    v({ v: 1, look: 'Studio', custom: {} }),
    v({ v: 1, look: 'studio' }),
    v({ v: 1, look: 'studio', custom: null }),
    v({ v: 1, look: 'studio', custom: [] }),
    v({ v: 1, look: 'studio', custom: { studio: [] } }),
    v({ v: 1, look: 'studio', custom: { studio: 'night' } }),
    v({ v: 1, look: 'studio', custom: { studio: { palette: 'night' } } }),
    v({ v: 1, look: 'studio', custom: { studio: { type: 'mono' } } }),
    v({ v: 1, look: 'studio', custom: { studio: { palette: 'forest', type: 'mono' } } }),
    v({ v: 1, look: 'studio', custom: { studio: { palette: ['night'], type: 'zine' } } }),
    v({ v: 1, look: 'studio', custom: { underground: { palette: 'forest', type: 'zine' } } }),
    v({ v: 1, look: 'underground', custom: { studio: { palette: 'night', type: 'mono' }, underground: { palette: 'daylight', type: 'zine' } } }),
    v({ v: 1, look: 'quiet-room', custom: { 'quiet-room': { palette: 'lamplight', type: 'serif-sans' }, extra: 1 }, other: true }),
    '{"v":1,"look":"studio","custom":{"__proto__":{"palette":"night"}}}',
    '{"v":1,"look":"studio","custom":{"studio":{"palette":"night","__proto__":{"type":"mono"}}}}',
  ];
  // Every valid combination too.
  for (const l of LOOKS) for (const p of l.palettes) for (const t of l.types) corpus.push(v({ v: 1, look: l.id, custom: { [l.id]: { palette: p.id, type: t.id } } }));

  for (const stored of corpus) {
    const label = stored instanceof Error ? 'throwing storage' : String(stored);
    const want = app(stored);
    const got = prePaint(stored);
    if (!want) {
      assert.deepEqual(got.attrs, {}, `${label}: nothing applied`);
      assert.deepEqual(got.metas, { 'theme-color': '#141614', 'color-scheme': 'dark' }, `${label}: browser colours untouched`);
      continue;
    }
    assert.deepEqual(got.attrs, { 'data-look': want.look, 'data-look-palette': want.palette, 'data-look-type': want.type }, label);
    const key = `${want.look}/${want.palette}`;
    assert.equal(got.metas['theme-color'], hex(role(key, 'ink')), `${label}: theme-color is the set's page colour`);
    assert.equal(got.metas['color-scheme'], sets.get(key)!.get('color-scheme'), `${label}: color-scheme`);
  }
});

test('the pre-paint script mirrors the registry exactly', () => {
  // Every set it knows has a page colour that matches the tokens, and no other set is known.
  const page = [...inline![1].matchAll(/([\w-]+): \['(#[0-9A-F]{6})', '(light|dark)'\]/g)];
  const byPalette = new Map(LOOKS.flatMap((l) => l.palettes.map((p) => [p.id, `${l.id}/${p.id}`] as const)));
  assert.equal(page.length, byPalette.size);
  for (const [, palette, colour, scheme] of page) {
    const key = byPalette.get(palette);
    assert.ok(key, palette);
    assert.equal(colour, hex(role(key!, 'ink')), palette);
    assert.equal(scheme, sets.get(key!)!.get('color-scheme'), palette);
  }
});
