/**
 * Creative Slice 02 (Make It Yours) prototype, B1: the journey model, honest interest feedback,
 * URL handling, the Studio's colour sets, and isolation from personal data. Browser behaviour
 * is in browser-tests/make-it-yours.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_EXPERIENCES } from '../src/data/experiences.ts';
import { INTERESTS, SAMPLE, SAMPLE_IDS, arrange, feedback, sampleCount } from '../src/prototype/make-it-yours/sample.ts';
import { INITIAL, LOOKS, customOf, parsePlace, placeHref, reduce, type Choices } from '../src/prototype/make-it-yours/journey.ts';
import { UNDERGROUND_TONES } from '../src/prototype/make-it-yours/looks/Underground.tsx';
import { SURFACES } from '../src/components/graphic/Surface.tsx';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const q = (s: string) => new URLSearchParams(s);

test('the sample is ten real catalogue ideas, and every interest maps to tags the catalogue uses', () => {
  assert.equal(SAMPLE.length, 10);
  assert.equal(new Set(SAMPLE_IDS).size, 10);
  const tags = new Set(SEED_EXPERIENCES.flatMap((e) => e.interests));
  for (const i of INTERESTS) for (const t of i.tags) assert.ok(tags.has(t), `${i.label}: "${t}" is not a catalogue tag`);
  // Some interests match nothing in the sample: the zero-match path is real, not hypothetical.
  assert.deepEqual(
    INTERESTS.filter((i) => sampleCount(i.id) === 0).map((i) => i.id),
    ['making', 'film', 'sport'],
  );
});

test('interests reorder the fixed sample; they never add, drop or invent ideas', () => {
  const none = arrange([]);
  assert.deepEqual(
    none.ideas.map((x) => x.exp.id),
    [...SAMPLE_IDS],
    'no picks: the sample in its own order',
  );
  assert.equal(none.matched, 0);

  const walks = arrange(['walks']);
  assert.equal(walks.featured.exp.id, 'exp-local-history', 'the first walk leads the cover');
  assert.deepEqual(
    walks.ideas.slice(0, 3).map((x) => x.exp.id),
    ['exp-local-history', 'exp-street-photo', 'exp-waterfront-sunset'],
  );
  assert.equal(walks.matched, 3);
  assert.deepEqual(new Set(walks.ideas.map((x) => x.exp.id)), new Set(SAMPLE_IDS), 'same ten ideas');
  for (const x of walks.ideas) assert.equal(x.matches.length > 0, ['exp-local-history', 'exp-street-photo', 'exp-waterfront-sunset'].includes(x.exp.id));

  // More matches first.
  const two = arrange(['walks', 'photography']);
  assert.deepEqual(
    two.ideas.slice(0, 2).map((x) => x.exp.id),
    ['exp-street-photo', 'exp-waterfront-sunset'],
  );
});

test('feedback is honest: counts from the sample, zero matches said plainly, no recommendation language', () => {
  assert.equal(feedback(arrange([])), 'No interests picked. The cover shows a mix from the 10 sample ideas.');
  assert.equal(feedback(arrange(['walks'])), '3 of 10 sample ideas match. Local History Adventure now leads the cover.');
  assert.equal(feedback(arrange(['film'])), 'Nothing in this sample matches Film yet. The cover keeps a mix instead.');
  assert.equal(feedback(arrange(['film', 'sport'])), 'Nothing in this sample matches Film and Sport yet. The cover keeps a mix instead.');
  assert.equal(
    feedback(arrange(['music', 'film'])),
    '2 of 10 sample ideas match. Music Rabbit Hole now leads the cover. Nothing in this sample matches Film yet.',
  );
  // Zero matches leave the order exactly as it was.
  assert.deepEqual(
    arrange(['film']).ideas.map((x) => x.exp.id),
    [...SAMPLE_IDS],
  );
  const all = [[], ['walks'], ['film'], ['music', 'film'], INTERESTS.map((i) => i.id)].map((p) => feedback(arrange(p))).join(' ');
  assert.doesNotMatch(all, /for you|recommend|personalised|perfect|you'll love/i);
  // The prototype's copy keeps to the same rule.
  const copy = ['Arrival.tsx', 'InterestsStep.tsx', 'LookStep.tsx', 'SampleDiscovery.tsx', 'looks/Studio.tsx', 'looks/Fallback.tsx', 'looks/QuietRoom.tsx', 'looks/Underground.tsx'].map((f) => read(`src/prototype/make-it-yours/${f}`)).join('\n');
  assert.doesNotMatch(copy, /picked for you|recommended for you|just for you|we think you/i);
});

test('the URL holds where you are, never what you chose', () => {
  assert.deepEqual(parsePlace(q('')), { step: 'look', view: 'studio', sample: null });
  assert.deepEqual(parsePlace(q('step=look&look=quiet-room')), { step: 'look', view: 'quiet-room', sample: null });
  assert.deepEqual(parsePlace(q('step=arrival&sample=exp-home-cafe')), { step: 'arrival', view: 'studio', sample: 'exp-home-cafe' });
  // Anything unrecognised falls back to the start; a sample only opens where one can be shown.
  assert.deepEqual(parsePlace(q('step=nope&look=nope')), { step: 'look', view: 'studio', sample: null });
  assert.equal(parsePlace(q('step=look&look=studio&sample=exp-not-in-sample')).sample, null);
  assert.equal(parsePlace(q('step=look&look=underground&sample=exp-home-cafe')).sample, 'exp-home-cafe', 'every look can open one');
  assert.equal(parsePlace(q('step=interests&sample=exp-home-cafe')).sample, null);
  // Round trip.
  for (const p of [
    { step: 'look', view: 'quiet-room', sample: null },
    { step: 'look', view: 'studio', sample: 'exp-new-game' },
    { step: 'interests', view: 'studio', sample: null },
    { step: 'arrival', view: 'studio', sample: 'exp-art-afternoon' },
  ] as const) {
    const h = placeHref(p);
    assert.match(h, /^#\/preview\/make-it-yours\?/);
    assert.deepEqual(parsePlace(q(h.split('?')[1])), p);
    // Only position keys: no interests, palette, type, saves or chosen look.
    for (const k of new URLSearchParams(h.split('?')[1]).keys()) assert.ok(['step', 'look', 'sample'].includes(k), k);
  }
  assert.equal(placeHref({ step: 'arrival' }), '#/preview/make-it-yours?step=arrival', 'the arrival link carries no look');
});

test('choices: Skip is an explicit "no aesthetic preference", distinct from any look', () => {
  assert.equal(INITIAL.look, null);
  let s: Choices = reduce(INITIAL, { type: 'choose-look', look: 'studio' });
  assert.equal(s.look, 'studio');
  s = reduce(s, { type: 'no-preference' });
  assert.equal(s.look, null, 'skipping clears the look, it does not infer one');
  assert.equal(s.touched, true);
  s = reduce(s, { type: 'toggle-interest', id: 'music' });
  s = reduce(s, { type: 'toggle-interest', id: 'walks' });
  s = reduce(s, { type: 'toggle-interest', id: 'music' });
  assert.deepEqual(s.interests, ['walks']);
  assert.deepEqual(reduce(s, { type: 'clear-interests' }).interests, []);
  // Colour and type: the curated first set until changed, per look.
  assert.deepEqual(customOf(s, 'studio'), { palette: 'poster', type: 'sans' });
  s = reduce(s, { type: 'customise', look: 'studio', palette: 'night' });
  assert.deepEqual(customOf(s, 'studio'), { palette: 'night', type: 'sans' });
  s = reduce(s, { type: 'customise', look: 'studio', typeface: 'mono' });
  assert.deepEqual(customOf(s, 'studio'), { palette: 'night', type: 'mono' });
  s = reduce(s, { type: 'toggle-save', id: 'exp-home-cafe' });
  assert.deepEqual(s.saved, ['exp-home-cafe']);
  assert.deepEqual(reduce(s, { type: 'toggle-save', id: 'exp-home-cafe' }).saved, []);
  // Every look offers the same kind of optional customisation: three colour sets, two type pairings.
  assert.deepEqual(
    LOOKS.map((l) => [l.id, l.palettes.length, l.types.length]),
    [
      ['studio', 3, 2],
      ['quiet-room', 3, 2],
      ['underground', 3, 2],
    ],
  );
  for (const l of LOOKS) assert.deepEqual(customOf(INITIAL, l.id), { palette: l.palettes[0].id, type: l.types[0].id });
});

// ─── Colour sets ─────────────────────────────────────────────────────────
type RGB = [number, number, number];
const lum = (c: RGB) => {
  const [r, g, b] = c.map((x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q2) => q2 - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (fg: RGB, a: number, bg: RGB) => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;

test('every Studio and Quiet Room colour set meets WCAG AA for every pair the prototype uses', () => {
  const css = read('src/prototype/make-it-yours/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const look of ['studio', 'quiet-room'] as const) {
    const sets = new Map<string, Map<string, string>>();
    for (const m of css.matchAll(/\[data-miy-look='([\w-]+)'\]\[data-miy-palette='([\w-]+)'\]\s*\{([^}]*)\}/g)) {
      if (m[1] === look) sets.set(m[2], new Map([...m[3].matchAll(/--miy-([\w-]+):\s*([^;]+);/g)].map((v) => [v[1], v[2].trim()])));
    }
    const def = LOOKS.find((l) => l.id === look)!;
    assert.deepEqual([...sets.keys()], def.palettes.map((p) => p.id), `${look}: one colour set per palette on offer`);
    for (const [name, v] of sets) {
      const get = (k: string, depth = 0): RGB => {
        const raw = v.get(k);
        assert.ok(raw && depth < 4, `${name}: --miy-${k} missing`);
        const ref = /^var\(--miy-([\w-]+)\)$/.exec(raw!);
        if (ref) return get(ref[1], depth + 1);
        const m = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(raw!);
        assert.ok(m, `${name}: --miy-${k} is not an RGB triplet`);
        return [Number(m![1]), Number(m![2]), Number(m![3])];
      };
      const paper = get('paper');
      const ink = get('ink');
      const text: [string, RGB, RGB][] = [
        ['ink on paper', ink, paper],
        ['muted on paper', get('muted'), paper],
        ['accent (a) on paper: notes, matches', get('a'), paper],
        ['primary button text (paper on ink)', paper, ink],
        ['primary button hover (paper on ink/88)', paper, over(ink, 0.88, paper)],
        ['hover text (ink on ink/10)', ink, over(ink, 0.1, paper)],
        ['picked chip (paper on ink)', paper, ink],
        ...(['a', 'b', 'c', 'd'] as const).map((x) => [`on-${x} on ${x}`, get(`on-${x}`), get(x)] as [string, RGB, RGB]),
      ];
      // The Studio sets text on its four shape colours; its accent (a) is a shape, never text on paper.
      for (const [label, fg, bg] of text) {
        if (look === 'studio' && label.startsWith('accent')) continue;
        assert.ok(contrast(fg, bg) >= 4.5, `${look}/${name}: ${label} ${contrast(fg, bg).toFixed(2)}:1`);
      }
      const nonText: [string, number][] = [
        ['focus ring on paper', contrast(get('focus'), paper)],
        ['control boundary (ink) on paper', contrast(ink, paper)],
        // The pressed save keeps its ink border, so its boundary is ink on paper either way.
        ['pressed save (d) against paper', Math.max(contrast(get('d'), paper), contrast(ink, paper))],
      ];
      for (const [label, ratio] of nonText) assert.ok(ratio >= 3, `${look}/${name}: ${label} ${ratio.toFixed(2)}:1`);
    }
  }
});

test('the Underground colour sets are made only of tested surfaces', () => {
  const def = LOOKS.find((l) => l.id === 'underground')!;
  assert.deepEqual(Object.keys(UNDERGROUND_TONES), def.palettes.map((p) => p.id));
  for (const [name, t] of Object.entries(UNDERGROUND_TONES)) {
    for (const tone of [t.page, t.cover, t.star, ...t.cards]) assert.ok((SURFACES as readonly string[]).includes(tone), `${name}: ${tone}`);
    assert.notEqual(t.cover, t.page, `${name}: the cover stands off the page`);
    assert.ok(t.cards.length >= 4 && new Set(t.cards).size === t.cards.length, `${name}: varied card stock`);
  }
  // Its controls and text follow the surface they sit on, like the app's own .ui-* controls.
  const css = read('src/prototype/make-it-yours/prototype.css');
  assert.match(css, /\.miy-root\[data-miy-look='underground'\] \{\s*--miy-paper: var\(--surface\);\s*--miy-ink: var\(--fg\);\s*--miy-muted: var\(--fg-muted\);\s*--miy-focus: var\(--focus\);/);
});

test('the one serif is self-hosted, licensed and unmodified, and the prototype uses the shared declaration', () => {
  // Since Creative Slice 03 Phase 3.3 the shell's Quiet Room setting uses it too, so it is
  // declared once with the app's styles (tests/atmospheres.test.ts checks who may name it).
  const dir = 'src/styles/fonts/newsreader';
  const readme = read(`${dir}/README.md`);
  const woff = readdirSync(join(root, dir)).filter((f) => f.endsWith('.woff2')).sort();
  assert.deepEqual(woff, ['newsreader-latin-400-italic.woff2', 'newsreader-latin-400-normal.woff2', 'newsreader-latin-500-normal.woff2']);
  for (const f of woff) {
    const bytes = readFileSync(join(root, dir, f));
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.match(readme, new RegExp(`\\| ${f.replace(/\./g, '\\.')} \\| ${bytes.length} \\| ${sha} \\|`), `${f}: size and hash as recorded`);
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${f}: a WOFF2 file`);
  }
  assert.match(read(`${dir}/OFL.txt`), /SIL Open Font License, Version 1\.1/);
  const declared = [...read('src/styles/newsreader.css').matchAll(/url\('\.\/fonts\/newsreader\/([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(declared, woff);
  assert.match(read('src/styles/index.css'), /@import '\.\/newsreader\.css';/);
  // The prototype no longer declares its own copy.
  assert.ok(!files('src/prototype').some((f) => f.endsWith('.woff2') || /@font-face/.test(f.endsWith('.css') ? read(f) : '')));
  assert.doesNotMatch(read('package.json'), /newsreader/i, 'no package dependency');
});

// ─── Isolation ───────────────────────────────────────────────────────────
function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? files(p) : [p];
  });
}

test('the prototype cannot touch personal data, sync or the network', () => {
  const src = files('src/prototype').filter((f) => /\.tsx?$/.test(f));
  assert.ok(src.length >= 8);
  for (const f of src) {
    const s = read(f);
    assert.doesNotMatch(s, /localStorage|sessionStorage|indexedDB|document\.cookie/, `${f}: storage`);
    assert.doesNotMatch(s, /useStore|useSync|useDrop|usePulse|useWeather|utils\/storage|utils\/sync|github/i, `${f}: app data or sync`);
    assert.doesNotMatch(s, /fetch\(|XMLHttpRequest|navigator\.sendBeacon|https?:\/\//, `${f}: network`);
    assert.doesNotMatch(s, /from '(?:\.\.\/)+components\/graphic'/, `${f}: imports the graphic index (Caveat)`);
  }
  // Only the app shell reaches the prototype, lazily; nothing links to it.
  const users = files('src')
    .filter((f) => /\.(tsx?|css)$/.test(f) && !f.startsWith('src/prototype/'))
    .filter((f) => /make-it-yours/.test(read(f)));
  assert.deepEqual(users.sort(), ['src/App.tsx', 'src/hooks/useRoute.ts']);
  assert.match(read('src/App.tsx'), /lazy\(\(\) => import\('\.\/prototype\/make-it-yours\/MakeItYours'\)\)/);
});
