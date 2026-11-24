/**
 * Creative Slice 03, Phase 3.1: the default-appearance comparison
 * (scripts/visual/compare-published.ts) tells identical, known noise and real change apart.
 * Synthetic images only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { NOISE_MAX_MEAN, NOISE_MAX_RATIO, PHONE_VIEWPORT_HEIGHT, TAB_BAR_BAND, TAB_BAR_HEIGHT, compareRaw, decode, excludedRows, imagesFor, type Raw } from '../scripts/visual/compare-published.ts';
import { readFileSync } from 'node:fs';
import { STANDARD_ROUTES } from '../scripts/visual/publish/policy.mjs';

/** A w×h RGB image filled with one colour, optionally with a band of rows painted another. */
function image(w: number, h: number, rgb: [number, number, number], band?: { from: number; to: number; rgb: [number, number, number] }): Raw {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = band && y >= band.from && y <= band.to ? band.rgb : rgb;
      data.set(c, (y * w + x) * 3);
    }
  return { width: w, height: h, channels: 3, data };
}

test('identical pixels are identical', () => {
  const d = compareRaw(image(40, 400, [20, 22, 20]), image(40, 400, [20, 22, 20]));
  assert.equal(d.verdict, 'identical');
  assert.equal(d.changedPixels, 0);
});

test('a thin band (the fixed phone tab bar landing a few pixels off) is known noise', () => {
  const base = image(390, 2000, [20, 22, 20]);
  const head = image(390, 2000, [20, 22, 20], { from: 800, to: 802, rgb: [255, 244, 219] });
  const d = compareRaw(base, head);
  assert.equal(d.verdict, 'noise');
  assert.deepEqual(d.rows, [800, 802]);
  assert.ok(d.changedRatio <= NOISE_MAX_RATIO && d.meanDiff <= NOISE_MAX_MEAN);
});

test('a real change is "changed": a recoloured area, a faint shift everywhere, or a different size', () => {
  // A heading recoloured across 3 % of the page.
  assert.equal(compareRaw(image(100, 1000, [20, 22, 20]), image(100, 1000, [20, 22, 20], { from: 100, to: 129, rgb: [212, 126, 71] })).verdict, 'changed');
  // A faint background shift on every pixel (under the per-pixel threshold, over the mean limit).
  const faint = compareRaw(image(100, 100, [20, 22, 20]), image(100, 100, [21, 23, 21]));
  assert.equal(faint.verdict, 'changed');
  assert.equal(faint.rows, null);
  // A page that got taller or shorter.
  const size = compareRaw(image(390, 1724, [0, 0, 0]), image(390, 1721, [0, 0, 0]));
  assert.equal(size.verdict, 'changed');
  assert.match(size.detail, /size 390×1724 → 390×1721/);
});

test('images with different channel layouts are refused, not compared', () => {
  assert.throws(() => compareRaw(image(2, 2, [0, 0, 0]), { width: 2, height: 2, channels: 4, data: new Uint8Array(16) }), /channel mismatch/);
});

test('decoding a JPEG round-trips through the same comparison', async () => {
  const src = image(64, 64, [244, 198, 50]);
  const jpg = await sharp(Buffer.from(src.data), { raw: { width: 64, height: 64, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  const a = await decode(jpg);
  const b = await decode(jpg);
  assert.equal(compareRaw(a, b).verdict, 'identical', 'the same bytes decode to the same pixels');
  assert.equal(a.channels, 3);
});

test('the comparison covers every standard route, full page and first screen, plus the menu on phones', () => {
  assert.equal(imagesFor(1280).length, STANDARD_ROUTES.length * 2);
  assert.equal(imagesFor(390).length, STANDARD_ROUTES.length * 2 + 1);
  assert.ok(imagesFor(390).includes('390/home.jpg') && imagesFor(390).includes('390/home-fold.jpg') && imagesFor(390).includes('states/menu-390.jpg'));
});

// ─── Phase 3.3: the phone tab bar in full-page captures ─────────────────
const bar = (from = 792, to = 831) => ({ from, to, rgb: [233, 223, 201] as [number, number, number] });

test('the Phase 3.2 false positive: the tab bar half-drawn in a short full page is no longer "changed"', () => {
  // A short page (as 390/plan.jpg) where the bar was drawn in one run only: over the noise limit…
  const base = image(390, 1200, [20, 22, 20]);
  const head = image(390, 1200, [20, 22, 20], bar());
  assert.equal(compareRaw(base, head).verdict, 'changed', 'without the band rule');
  // …and identical outside the band, with what differed inside it reported.
  const d = compareRaw(base, head, excludedRows('390/plan.jpg'));
  assert.equal(d.verdict, 'identical');
  assert.deepEqual(d.excluded, { rows: TAB_BAR_BAND, changedPixels: 390 * 40 });
  assert.match(d.detail, /rows 779–843 \(tab-bar band\) not compared, 15600 px differed there/);
});

test('the band is narrow: changes outside it, even right next to it, still count', () => {
  const base = image(390, 1200, [20, 22, 20]);
  for (const [from, to] of [[740, 778], [844, 900], [770, 790], [830, 860], [100, 140]]) {
    const d = compareRaw(base, image(390, 1200, [20, 22, 20], bar(from, to)), excludedRows('390/plan.jpg'));
    assert.equal(d.verdict, 'changed', `rows ${from}–${to}`);
    assert.ok(d.rows![0] < TAB_BAR_BAND[0] || d.rows![1] > TAB_BAR_BAND[1], `rows ${from}–${to} reported outside the band`);
  }
  // A page that changed size is still "changed", band or not.
  assert.equal(compareRaw(image(390, 1200, [0, 0, 0]), image(390, 1210, [0, 0, 0]), TAB_BAR_BAND).verdict, 'changed');
});

test('the tab bar itself is still compared: first screens, the menu and other widths are never banded', () => {
  for (const f of ['390/plan-fold.jpg', '390/home-fold.jpg', 'states/menu-390.jpg', '1280/plan.jpg', '1280/plan-fold.jpg']) assert.equal(excludedRows(f), null, f);
  for (const f of ['390/plan.jpg', '390/home.jpg', '390/collection.jpg']) assert.deepEqual(excludedRows(f), TAB_BAR_BAND, f);
  // Every 390 px first screen and the menu are compared whole, so a navigation regression there
  // (here: the bar recoloured in the first screen) is "changed".
  const fold = (rgb: [number, number, number]) => image(390, PHONE_VIEWPORT_HEIGHT, [20, 22, 20], { from: TAB_BAR_BAND[0], to: TAB_BAR_BAND[1], rgb });
  assert.equal(compareRaw(fold([20, 22, 20]), fold([212, 126, 71]), excludedRows('390/plan-fold.jpg')).verdict, 'changed');
  const banded = imagesFor(390).filter((f) => excludedRows(f));
  assert.equal(banded.length, STANDARD_ROUTES.length, 'only the full pages');
});

test('the band is derived from the harness viewport and the tab bar\'s height', () => {
  // scripts/visual/run.ts (a protected harness file, read only here) captures phones at 390 × 844.
  assert.match(readFileSync(new URL('../scripts/visual/run.ts', import.meta.url), 'utf8'), /HEIGHTS[^=]*= \{[^}]*\b390: 844\b/);
  // The bar: 64 px tall (h-16) with a 1 px top border, fixed to the bottom.
  const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
  const tabbar = /<nav aria-label="Primary"[^>]*className="([^"]*)"/.exec(layout)![1];
  for (const c of ['fixed', 'bottom-0', 'border-t']) assert.ok(tabbar.split(' ').includes(c), c);
  assert.match(layout, /tab-link relative flex h-16/);
  assert.equal(TAB_BAR_HEIGHT, 64 + 1);
  assert.deepEqual(TAB_BAR_BAND, [PHONE_VIEWPORT_HEIGHT - TAB_BAR_HEIGHT, PHONE_VIEWPORT_HEIGHT - 1]);
});
