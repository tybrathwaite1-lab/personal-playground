/**
 * Downloads every image in src/data/images.ts (Wikimedia Commons originals) and writes
 * optimized WebP copies to public/images/editorial/<id>-{600,1200}.webp. Existing files
 * are skipped, so CI only downloads new images (the folder is cached between runs).
 * Failures are logged; the app shows a typographic placeholder for missing images.
 *
 * Wikimedia asks for a descriptive User-Agent and gentle request rates:
 * https://meta.wikimedia.org/wiki/User-Agent_policy
 */
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { IMAGES } from '../../src/data/images.ts';

const OUT = 'public/images/editorial';
mkdirSync(OUT, { recursive: true });
const UA = 'PersonalPlaygroundBot/1.1 (https://github.com/tybrathwaite1-lab/personal-playground; build-time image cache)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status} for ${new URL(url).hostname}`);
    await sleep(2000 * attempt);
  }
  throw new Error(`gave up after retries: ${url}`);
}

let ok = 0;
const missing: string[] = [];
for (const img of IMAGES) {
  const big = `${OUT}/${img.id}-1200.webp`;
  const small = `${OUT}/${img.id}-600.webp`;
  if (existsSync(big) && existsSync(small)) {
    ok++;
    continue;
  }
  try {
    const buf = await download(img.download);
    const base = sharp(buf, { limitInputPixels: 300_000_000 }).rotate();
    await base.clone().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 72 }).toFile(big);
    await base.clone().resize({ width: 600, withoutEnlargement: true }).webp({ quality: 70 }).toFile(small);
    ok++;
    console.log(`✓ ${img.id}`);
  } catch (e) {
    missing.push(img.id);
    console.log(`✗ ${img.id}: ${(e as Error).message}`);
  }
  await sleep(600);
}
console.log(`Images: ${ok}/${IMAGES.length} ready in ${OUT}${missing.length ? ` — missing: ${missing.join(', ')}` : ''}`);
