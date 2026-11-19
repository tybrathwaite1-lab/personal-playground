/**
 * M1 closeout: deterministic test of the real editorial image pipeline
 * (scripts/images/process.ts, used by scripts/images/fetch.ts). CI's editorial images are
 * normally restored from cache, so this exercises the processing path itself on every run,
 * with synthetic in-memory images: no downloads, no cache, no fixtures from the web.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { VARIANTS, writeEditorialVariants } from '../scripts/images/process.ts';

const sharp = createRequire(import.meta.url)('sharp') as typeof import('sharp');

/** A synthetic JPEG with a gradient-free two-tone pattern and optional EXIF orientation. */
async function original(width: number, height: number, orientation?: number): Promise<Buffer> {
  const half = await sharp({ create: { width: Math.ceil(width / 2), height, channels: 3, background: { r: 32, g: 78, b: 63 } } }).png().toBuffer();
  let img = sharp({ create: { width, height, channels: 3, background: { r: 241, g: 227, b: 198 } } }).composite([{ input: half, left: 0, top: 0 }]).jpeg({ quality: 90 });
  if (orientation) img = img.withMetadata({ orientation });
  return img.toBuffer();
}

async function run(buf: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'editorial-'));
  try {
    const big = join(dir, 'x-1200.webp');
    const small = join(dir, 'x-600.webp');
    await writeEditorialVariants(buf, big, small);
    const out = { big: readFileSync(big), small: readFileSync(small) };
    return { ...out, bigMeta: await sharp(out.big).metadata(), smallMeta: await sharp(out.small).metadata() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('variants are 1200 px and 600 px wide WebP, aspect preserved, metadata stripped', async () => {
  assert.deepEqual(VARIANTS.map((v) => v.width), [1200, 600]);
  const r = await run(await original(2400, 1600));
  assert.equal(r.bigMeta.format, 'webp');
  assert.deepEqual([r.bigMeta.width, r.bigMeta.height], [1200, 800]);
  assert.deepEqual([r.smallMeta.width, r.smallMeta.height], [600, 400]);
  assert.equal(r.big.subarray(0, 4).toString(), 'RIFF');
  assert.equal(r.big.subarray(8, 12).toString(), 'WEBP');
  assert.equal(r.bigMeta.exif, undefined, 'no EXIF carried into published images');
  assert.ok(r.small.length < r.big.length);
});

test('EXIF orientation is applied before resizing', async () => {
  // Stored landscape, displayed portrait (orientation 6 = rotate 90° clockwise).
  const r = await run(await original(2400, 1600, 6));
  assert.deepEqual([r.bigMeta.width, r.bigMeta.height], [1200, 1800]);
  assert.deepEqual([r.smallMeta.width, r.smallMeta.height], [600, 900]);
  assert.ok(!r.bigMeta.orientation || r.bigMeta.orientation === 1);
});

test('small originals are never enlarged', async () => {
  const r = await run(await original(500, 300));
  assert.deepEqual([r.bigMeta.width, r.bigMeta.height], [500, 300]);
  assert.deepEqual([r.smallMeta.width, r.smallMeta.height], [500, 300]);
});

test('processing is deterministic: the same original gives byte-identical output', async () => {
  const buf = await original(1800, 1200);
  const a = await run(buf);
  const b = await run(buf);
  assert.ok(a.big.equals(b.big) && a.small.equals(b.small));
});

test('corrupt input is rejected, so fetch.ts records the image as missing', async () => {
  await assert.rejects(run(Buffer.from('<html>not an image</html>')), /unsupported image format|Input buffer/i);
});
