/**
 * Image scouting (maintainer tool, not part of the build).
 *
 * Searches Wikimedia Commons for free-licensed photos for each brief below, keeps
 * only CC0 / public domain / CC BY / CC BY-SA files that are large enough, and writes:
 *   scout/<slug>.jpg   a numbered contact sheet to look at
 *   scout/results.json title, license, author, size, description and file URL for every candidate
 * A human (or Claude) then picks images by number and adds them to src/data/images.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const UA = 'PersonalPlaygroundBot/1.0 (https://github.com/tybrathwaite1-lab/personal-playground; image scouting)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OUT = 'scout';
mkdirSync(OUT, { recursive: true });

const BRIEFS: { slug: string; q: string }[] = [
  { slug: 'record-store', q: 'record store vinyl crates interior' },
  { slug: 'turntable', q: 'turntable vinyl record playing' },
  { slug: 'tokyo-night', q: 'Shinjuku alley night neon' },
  { slug: 'game-center', q: 'Japanese game center arcade cabinets' },
  { slug: 'arcade-us', q: 'retro arcade cabinets row' },
  { slug: 'electronics-bench', q: 'soldering electronics workbench' },
  { slug: 'raspberry-pi', q: 'Raspberry Pi board' },
  { slug: 'graffiti', q: 'graffiti wall lettering' },
  { slug: 'manga-shop', q: 'manga bookstore shelves' },
  { slug: 'comic-shop', q: 'comic book store interior' },
  { slug: 'board-games', q: 'people playing board game table' },
  { slug: 'skatepark', q: 'skateboarder skatepark bowl' },
  { slug: 'tea', q: 'Japanese tea ceremony matcha bowl' },
  { slug: 'tatami', q: 'Japanese room tatami shoji interior' },
  { slug: 'film-camera', q: '35mm film camera' },
  { slug: 'dreamcast', q: 'Sega Dreamcast console' },
  { slug: 'basketball-court', q: 'outdoor basketball court street' },
  { slug: 'archery', q: 'archery target arrows range' },
  { slug: 'glassblowing', q: 'glassblowing glass blower furnace' },
  { slug: 'pottery', q: 'pottery wheel throwing clay hands' },
  { slug: 'live-music', q: 'small club concert band stage' },
  { slug: 'used-books', q: 'used bookstore shelves interior' },
  { slug: 'houseplants', q: 'houseplants pots windowsill' },
  { slug: 'sauna', q: 'sauna interior wooden' },
  { slug: 'night-drive', q: 'city night lights car street long exposure' },
  { slug: 'cassette', q: 'cassette tapes walkman' },
  { slug: 'stpete-pier', q: 'St. Pete Pier St. Petersburg Florida' },
  { slug: 'dali-museum', q: 'Salvador Dali Museum St. Petersburg Florida building' },
  { slug: 'sunken-gardens', q: 'Sunken Gardens St. Petersburg Florida' },
  { slug: 'fort-desoto', q: 'Fort De Soto Park Florida' },
  { slug: 'weedon', q: 'Weedon Island Preserve' },
  { slug: 'tampa-riverwalk', q: 'Tampa Riverwalk' },
  { slug: 'plant-hall', q: 'Plant Hall University of Tampa minarets' },
  { slug: 'stpete-waterfront', q: 'St. Petersburg Florida waterfront downtown' },
  { slug: 'stpete-murals', q: 'St. Petersburg Florida mural' },
  { slug: 'chihuly', q: 'Chihuly Collection St. Petersburg' },
];

const OK_LICENSE = /^(cc0|public domain|pd|cc by(-sa)? [1-4]\.0|cc by(-sa)? 2\.5|cc-by(-sa)?-[1-4]\.0)/i;
const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

interface Hit {
  n: number;
  title: string;
  license: string;
  author: string;
  width: number;
  height: number;
  description: string;
  page: string;
  url: string;
  thumb: string;
}

async function search(q: string): Promise<Hit[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata|mime',
    iiurlwidth: '360',
    origin: '*',
  });
  const r = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as { query?: { pages?: Record<string, { title: string; index: number; imageinfo?: { url: string; thumburl: string; width: number; height: number; mime: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } };
  const pages = Object.values(j.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  const hits: Hit[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || ii.mime !== 'image/jpeg' || ii.width < 1400) continue;
    const m = ii.extmetadata ?? {};
    const license = strip(m.LicenseShortName?.value);
    if (!OK_LICENSE.test(license)) continue;
    if (/nonderivative|non-commercial|\bnd\b|\bnc\b/i.test(license)) continue;
    hits.push({
      n: hits.length + 1,
      title: p.title,
      license,
      author: strip(m.Artist?.value).slice(0, 120),
      width: ii.width,
      height: ii.height,
      description: strip(m.ImageDescription?.value).slice(0, 300),
      page: ii.descriptionurl,
      url: ii.url,
      thumb: ii.thumburl,
    });
    if (hits.length >= 12) break;
  }
  return hits;
}

async function sheet(slug: string, hits: Hit[]) {
  const W = 360, H = 240, cols = 4;
  const rows = Math.ceil(hits.length / cols) || 1;
  const tiles: sharp.OverlayOptions[] = [];
  for (const h of hits) {
    try {
      const r = await fetch(h.thumb, { headers: { 'User-Agent': UA } });
      const buf = Buffer.from(await r.arrayBuffer());
      const img = await sharp(buf).resize(W, H, { fit: 'cover' }).jpeg().toBuffer();
      const x = ((h.n - 1) % cols) * W, y = Math.floor((h.n - 1) / cols) * H;
      tiles.push({ input: img, left: x, top: y });
      const label = Buffer.from(`<svg width="44" height="34"><rect width="44" height="34" fill="#B76940"/><text x="22" y="25" font-size="22" font-family="sans-serif" font-weight="bold" fill="#141614" text-anchor="middle">${h.n}</text></svg>`);
      tiles.push({ input: label, left: x, top: y });
    } catch {
      /* skip tile */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#141614' } })
    .composite(tiles)
    .jpeg({ quality: 70 })
    .toFile(`${OUT}/${slug}.jpg`);
}

const results: Record<string, Hit[]> = {};
for (const b of BRIEFS) {
  try {
    const hits = await search(b.q);
    results[b.slug] = hits;
    if (hits.length) await sheet(b.slug, hits);
    console.log(`${hits.length ? '✓' : '·'} ${b.slug.padEnd(18)} ${hits.length} candidates`);
  } catch (e) {
    console.log(`✗ ${b.slug}: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
