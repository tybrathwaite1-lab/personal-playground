/**
 * Sprint 02 PR 2: graphic primitives and the hidden #/styleguide route.
 * Renders components to static markup (no browser) and checks the rules that keep decoration
 * separate from content, the route hidden and code-split, and new components on semantic tokens.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Node can't import stylesheets (e.g. the Caveat @font-face CSS); stub them for these tests.
register(
  'data:text/javascript,' +
    encodeURIComponent('export async function resolve(s, c, next) { return s.endsWith(".css") ? { url: "data:text/javascript,export default {}", format: "module", shortCircuit: true } : next(s, c); }'),
  import.meta.url,
);

const g = await import('../src/components/graphic/index.ts');
const { parseHash, isRouteHash, ROUTES, PREVIEWS } = await import('../src/hooks/useRoute.ts');
const { InPageLink } = await import('../src/components/InPageLink.tsx');
const { default: StyleGuide } = await import('../src/styleguide/StyleGuide.tsx');
const { AtmosphereProvider } = await import('../src/hooks/useAtmosphere.tsx');
/** The style guide renders inside the app's providers; its atmosphere section needs this one. */
const guide = () => h(AtmosphereProvider, null, h(StyleGuide));

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const html = (el: ReactElement) => renderToStaticMarkup(el);
function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? files(p) : [p];
  });
}

test('#/styleguide is a hidden preview: not a route, not in navigation, everything else unchanged', () => {
  const sg = parseHash('#/styleguide');
  assert.equal(sg.preview, 'styleguide');
  assert.equal(sg.name, 'home');
  assert.equal(parseHash('#/styleguide?x=1').preview, 'styleguide');
  for (const r of ROUTES) assert.equal(parseHash(`#/${r}`).preview, null, r);
  assert.equal(parseHash('#/nope').name, 'home');
  assert.equal(parseHash('#/nope').preview, null);
  assert.deepEqual(PREVIEWS, ['styleguide', 'preview/make-it-yours']);
  // The Slice 02 prototype is a second hidden preview; its query is its own step state.
  const miy = parseHash('#/preview/make-it-yours?step=interests');
  assert.equal(miy.preview, 'preview/make-it-yours');
  assert.equal(miy.name, 'home');
  assert.equal(miy.params.get('step'), 'interests');
  assert.equal(parseHash('#/preview').preview, null);
  assert.equal(parseHash('#/preview/other').preview, null);
  assert.equal(ROUTES.length, 12);
  assert.equal((ROUTES as string[]).includes('styleguide'), false, 'not part of the standard route set');
  assert.equal(/styleguide/i.test(read('src/components/Layout.tsx')), false, 'never linked from navigation');
});

test('in-page anchors never replace the route', () => {
  for (const hsh of ['', '#', '#/', '#/discover', '#/styleguide', '#/styleguide?x=1']) assert.equal(isRouteHash(hsh), true, hsh);
  for (const hsh of ['#main', '#sg-main', '#sg-feature-title']) assert.equal(isRouteHash(hsh), false, hsh);
  assert.match(read('src/hooks/useRoute.ts'), /if \(!isRouteHash\(window\.location\.hash\)\) return;/);
  const link = html(h(InPageLink, { to: 'sg-main', className: 'x' }, 'Skip'));
  assert.match(link, /^<a href="#sg-main" data-in-page-link="sg-main" class="x">Skip<\/a>$/);
  // No plain in-page anchors anywhere in the app (they would replace the route in the URL).
  for (const f of files('src').filter((x) => x.endsWith('.tsx') && !x.endsWith('InPageLink.tsx'))) assert.equal(/href=["'`{]+#(?!\/)/.test(read(f)), false, `${f} has a bare in-page anchor`);
  const layout = read('src/components/Layout.tsx');
  assert.match(layout, /<InPageLink to="main"/, 'app skip link uses InPageLink');
  assert.match(layout, /<main id="main" tabIndex=\{-1\}/, 'skip target is programmatically focusable');
  assert.match(read('src/pages/Pulse.tsx'), /<InPageLink to="pulse-sources"/);
  // The style guide uses no plain in-page anchors (they would replace the route).
  const sg = read('src/styleguide/StyleGuide.tsx');
  assert.equal(/<a href="#(?!\/)/.test(sg), false);
  assert.ok((sg.match(/<InPageLink to="/g) ?? []).length >= 4);
});

test('the style guide and the handwritten face are code-split away from the app shell', () => {
  const app = read('src/App.tsx');
  assert.match(app, /lazy\(\(\) => import\('\.\/styleguide\/StyleGuide'\)\)/);
  assert.equal(/^import [^;]*from '\.\/styleguide/m.test(app), false, 'no static import');
  assert.equal(/caveat/i.test(read('src/main.tsx')), false, 'Caveat not loaded with the app shell');
  const importers = files('src').filter((f) => /\.(tsx?|css)$/.test(f) && /@fontsource\/caveat/.test(read(f)));
  assert.deepEqual(importers, ['src/components/graphic/Annotation.tsx']);
  assert.match(read('src/components/graphic/Annotation.tsx'), /import '@fontsource\/caveat\/latin-700\.css';/, 'Latin, bold only');
  // The graphic index re-exports Annotation (and so the font): app code imports the primitives
  // it needs directly, and only the style guide and the graphic module itself use the index.
  const indexImporters = files('src').filter((f) => /\.tsx?$/.test(f) && /from '[./]*\/?(?:components\/)?graphic'/.test(read(f)));
  assert.deepEqual(indexImporters, ['src/styleguide/StyleGuide.tsx'], 'only the style guide imports the graphic index');
});

test('the handwritten face is decorative only', () => {
  const users = files('src').filter((f) => /\.tsx?$/.test(f) && /\bfont-hand\b/.test(read(f)));
  assert.deepEqual(users, ['src/components/graphic/Annotation.tsx']);
  const markup = html(h(g.Annotation, { arrow: 'right' }, 'look here'));
  assert.match(markup, /^<span aria-hidden="true" data-decor=""/);
});

test('every decorative primitive renders hidden from assistive tech and never interactive', () => {
  const decorative: [string, ReactElement][] = [
    ['PaperEdge', h(g.PaperEdge, { side: 'bottom', seed: 3 })],
    ['Tape', h(g.Tape, { tone: 'pink' })],
    ['Grain', h(g.Grain)],
    ['Stamp (decorative)', h(g.Stamp, { decorative: true }, 'Free')],
    ['Annotation', h(g.Annotation, null, 'note')],
  ];
  for (const [name, el] of decorative) {
    const m = html(el);
    assert.match(m, /^<span aria-hidden="true" data-decor="" class="pointer-events-none select-none/, name);
  }
  // A non-decorative stamp is real, readable text.
  const stamp = html(h(g.Stamp, null, 'Tonight'));
  assert.equal(stamp.includes('aria-hidden'), false);
  assert.match(stamp, />Tonight</);
  // Rotations are clamped so compositions stay legible.
  assert.match(html(h(g.Tape, { angle: 40 })), /rotate\(8deg\)/);
  assert.match(html(h(g.Stamp, { angle: -40 }, 'x')), /rotate\(-12deg\)/);
  // Paper edges are deterministic (stable screenshots) and stay inside their box.
  assert.equal(g.edgePath(7), g.edgePath(7));
  assert.notEqual(g.edgePath(7), g.edgePath(8));
  for (const n of g.edgePath(5, 14).match(/[\d.]+,[\d.]+/g)!) {
    const [x, y] = n.split(',').map(Number);
    assert.ok(x >= 0 && x <= 1200 && y >= 0 && y <= 14, n);
  }
});

test('surfaces: one per token surface, nestable, painting their own tokens', () => {
  const css = read('src/styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const declared = [...css.matchAll(/\.surface-([\w-]+)\s*\{[^}]*--surface:/g)].map((m) => m[1]);
  assert.deepEqual([...g.SURFACES], declared);
  assert.deepEqual([...g.FIELD_GUIDE, ...g.NEWSSTAND], declared);
  for (const t of g.SURFACES) assert.match(html(h(g.Surface, { tone: t }, 'x')), new RegExp(`^<div data-surface="${t}" class="surface-${t} relative isolate`));
  assert.match(html(h(g.Surface, { tone: 'cream', as: 'section', 'aria-label': 'x' })), /^<section data-surface="cream"[^>]*aria-label="x"/);
});

test('artwork: explicit provenance, never a photo by default, and a stable fallback when missing', () => {
  const art = h('svg', { viewBox: '0 0 1 1' });
  const ai = html(h(g.Artwork, { art, alt: 'A harbor', credit: { kind: 'ai-assisted', by: 'Studio X' } }));
  assert.match(ai, /role="img" aria-label="A harbor"/);
  assert.match(ai, />AI-assisted illustration · Studio X</);
  assert.match(html(h(g.Artwork, { art, alt: 'x', credit: { kind: 'illustration', by: 'Y' } })), />Illustration · Y</);
  const missing = html(h(g.Artwork, { alt: 'Night market', title: 'Coming soon', credit: { kind: 'photo', by: 'Z' } }));
  assert.match(missing, /role="img" aria-label="Night market \(artwork not available\)"/);
  assert.match(missing, /Artwork to come/);
  assert.match(missing, /aspect-ratio:4 \/ 3/, 'fixed size: no layout shift');
  assert.equal(missing.includes('Photo ·'), false, 'no credit for artwork that is not there');
  for (const t of ['duotone', 'halftone'] as const) assert.match(html(h(g.Artwork, { art, alt: 'x', treatment: t, credit: { kind: 'illustration', by: 'Y' } })), new RegExp(`art-${t}`));
  // Displayed artwork must be credited: uncredited or blank-credited artwork is not shown.
  for (const credit of [undefined, { kind: 'illustration', by: '  ' }, { kind: 'stock', by: 'Z' }]) {
    for (const media of [{ art }, { src: 'a.jpg' }]) {
      const m = html(h(g.Artwork, { ...media, alt: 'Uncredited', credit } as never));
      assert.match(m, /data-artwork="missing"/, JSON.stringify({ credit, media: Object.keys(media) }));
      assert.equal(/<img|role="img" aria-label="Uncredited"/.test(m), false);
    }
  }
  assert.equal(g.canDisplay({ art, credit: { kind: 'photo', by: 'P' } }), true);
  assert.equal(g.canDisplay({ src: 'a.jpg' }), false);
  // Images get a fresh element per src, so a replacement after a failure is loaded anew.
  assert.match(read('src/components/graphic/Artwork.tsx'), /<img key=\{src\}/);
  assert.match(read('src/components/graphic/Artwork.tsx'), /const failed = Boolean\(src\) && failedSrc === src;/);
  // The compile-time check exists (tsc fails if credit ever becomes optional).
  assert.match(read('src/components/graphic/Artwork.typecheck.ts'), /@ts-expect-error displayed inline artwork must be credited/);
  assert.match(html(h(g.Artwork, { art, alt: 'x', treatment: 'cutout', credit: { kind: 'illustration', by: 'Y' } })), /^<figure class="surface-cream art-cutout/);
});

test('the style guide renders every demonstration with sound structure', () => {
  const m = html(guide());
  for (const id of ['sg-compositions', 'sg-surfaces', 'sg-atmosphere', 'sg-type', 'sg-primitives', 'sg-controls', 'sg-nesting', 'sg-resilience', 'sg-motion'])
    assert.match(m, new RegExp(`<section aria-labelledby="${id}"`), id);
  for (const id of ['sg-cover-title', 'sg-feature-title', 'sg-listings-title', 'sg-elsewhere-title']) assert.match(m, new RegExp(`id="${id}"`), id);
  assert.match(m, /href="#sg-main"[^>]*>Skip to style guide</);
  // One h1, and heading levels never skip.
  const levels = [...m.matchAll(/<h([1-6])\b/g)].map((x) => Number(x[1]));
  assert.equal(levels.filter((l) => l === 1).length, 1);
  levels.reduce((prev, l) => {
    assert.ok(l <= prev + 1, `heading jumps from h${prev} to h${l}`);
    return l;
  }, 1);
  // Every decorative layer is hidden; every surface in the tokens is shown.
  assert.equal((m.match(/data-decor=""/g) ?? []).length, (m.match(/aria-hidden="true" data-decor=""/g) ?? []).length);
  assert.ok((m.match(/data-decor=""/g) ?? []).length >= 15);
  for (const t of g.SURFACES) assert.match(m, new RegExp(`data-surface="${t}"`), t);
  // Missing-artwork, long-headline, nesting, focus and reduced-motion demonstrations exist.
  assert.match(m, /artwork not available/);
  assert.match(m, /Pneumonoultramicroscopicsilicovolcanoconiosis/);
  assert.match(m, /focus-preview/);
  assert.match(m, /Reduced motion is/);
  // Sample copy only: no edition content is published here.
  assert.equal(/issue\s*0?9/i.test(m), false);
});

test('annotations never carry unique essential information', () => {
  const m = html(guide());
  // font-hand only appears inside <Annotation>, which is always decorative (tested above).
  const notes = [...m.matchAll(/<span class="font-hand[^"]*">([^<]+)<\/span>/g)].map((x) => x[1]);
  assert.ok(notes.length >= 5, notes.join(', '));
  // Purely expressive notes may stand alone; anything practical must also be in the real text.
  const EXPRESSIVE = new Set(['start here', 'look here', 'not essential', 'worth the detour']);
  const visibleText = m.replace(/<span class="font-hand[^"]*">[^<]+<\/span>/g, '').replace(/<[^>]+>/g, ' ');
  for (const n of notes) if (!EXPRESSIVE.has(n)) assert.ok(visibleText.toLowerCase().includes(n.toLowerCase()), `annotation "${n}" must repeat information found in the text`);
  assert.ok(notes.includes('bring cash'));
});

test('new components use semantic, surface-aware tokens (no fixed Field Guide color utilities)', () => {
  const legacy = /(?:^|[\s"'`])(?:hover:|focus:|placeholder:|group-hover:)?(?:text|bg|border|divide|ring|outline|decoration|placeholder|fill|stroke)-(?:ink2?|paper|muted|rust|hunter|line)(?:\/\d+)?(?=[\s"'`]|$)/m;
  for (const f of [...files('src/components/graphic'), ...files('src/styleguide')]) assert.equal(legacy.test(read(f)), false, `${f} uses a fixed legacy color utility`);
  const css = read('src/styles/index.css');
  const ui = css.slice(css.indexOf('.ui-button {'), css.indexOf('.scrollbar-none {'));
  assert.ok(ui.length > 200);
  assert.equal(legacy.test(ui), false, 'surface-aware controls use semantic tokens only');
  for (const cls of ['.ui-button', '.ui-button-primary', '.ui-chip', '.ui-input']) assert.match(ui, new RegExp(`\\${cls} \\{[^}]*border-(control|fg)`), `${cls} has a control boundary`);
});
