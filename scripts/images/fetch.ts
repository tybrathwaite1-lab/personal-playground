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
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url: string, ua = UA) {
  const r = await fetch(url, { headers: { 'User-Agent': ua }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url).hostname}`);
  return r;
}

/**
 * Try the direct download URL first. Unsplash's /download endpoint can require an API key,
 * so fall back to the photo page's og:image (an images.unsplash.com CDN URL) at full width.
 */
async function download(url: string, page?: string): Promise<Buffer> {
  try {
    return Buffer.from(await (await get(url)).arrayBuffer());
  } catch (first) {
    if (!page || !/unsplash\.com\/photos\//.test(page)) throw first;
    const html = await (await get(page, BROWSER_UA)).text();
    const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) ?? html.match(/content="([^"]+)"[^>]+property="og:image"/);
    if (!m) throw new Error(`${(first as Error).message}; no og:image on photo page`);
    const cdn = new URL(m[1].replace(/&amp;/g, '&'));
    if (cdn.hostname !== 'images.unsplash.com') throw new Error(`unexpected image host ${cdn.hostname}`);
    for (const k of ['w', 'h', 'fit', 'crop', 'ixid', 'ixlib', 'q', 'fm', 'auto']) cdn.searchParams.delete(k);
    cdn.searchParams.set('w', '1600');
    cdn.searchParams.set('q', '80');
    cdn.searchParams.set('fm', 'jpg');
    return Buffer.from(await (await get(cdn.toString(), BROWSER_UA)).arrayBuffer());
  }
}

let ok = 0;
for (const img of IMAGES) {
  const big = `${OUT}/${img.id}-1200.webp`;
  const small = `${OUT}/${img.id}-600.webp`;
  if (existsSync(big) && existsSync(small)) {
    ok++;
    continue;
  }
  try {
    const buf = await download(img.download, img.sourceUrl);
    await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 72 }).toFile(big);
    await sharp(buf).rotate().resize({ width: 600, withoutEnlargement: true }).webp({ quality: 70 }).toFile(small);
    ok++;
    console.log(`✓ ${img.id}`);
  } catch (e) {
    console.log(`✗ ${img.id}: ${(e as Error).message}`);
  }
}
console.log(`Images: ${ok}/${IMAGES.length} ready in ${OUT}`);
