/**
 * Creative Slice 03, Phase 3.1: the default-appearance comparison
 * (scripts/visual/compare-published.ts) tells identical, known noise and real change apart.
 * Synthetic images only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { NOISE_MAX_MEAN, NOISE_MAX_RATIO, compareRaw, decode, imagesFor, type Raw } from '../scripts/visual/compare-published.ts';
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
