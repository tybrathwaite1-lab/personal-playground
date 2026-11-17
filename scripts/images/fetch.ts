/**
 * Downloads every image in src/data/images.ts and writes optimized WebP copies to
 * public/images/editorial/<id>-{600,1200}.webp. Existing files are skipped (cached
 * between CI runs). Failures are logged; the app falls back to a placeholder.
 */
import { existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { IMAGES } from '../../src/data/images.ts';

const OUT = 'public/images/editorial';
mkdirSync(OUT, { recursive: true });
const UA = 'PersonalPlaygroundBot/1.0 (+https://github.com/tybrathwaite1-lab/personal-playground)';
let ok = 0;
for (const img of IMAGES) {
  const big = `${OUT}/${img.id}-1200.webp`;
  const small = `${OUT}/${img.id}-600.webp`;
  if (existsSync(big) && existsSync(small)) {
    ok++;
    continue;
  }
  try {
    const r = await fetch(img.download, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 72 }).toFile(big);
    await sharp(buf).rotate().resize({ width: 600, withoutEnlargement: true }).webp({ quality: 70 }).toFile(small);
    ok++;
    console.log(`✓ ${img.id}`);
  } catch (e) {
    console.log(`✗ ${img.id}: ${(e as Error).message}`);
  }
}
console.log(`Images: ${ok}/${IMAGES.length} ready in ${OUT}`);
