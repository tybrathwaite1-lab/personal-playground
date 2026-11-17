/**
 * Checks every source URL in the editions, thread nodes and Digital Playground.
 * Prints broken links; never fails the build (sites block bots, have outages…).
 * Usage: npx tsx scripts/drop/check-links.ts
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { SEED_WEBSITES } from '../../src/data/websites.ts';
import type { DropEdition, ThreadNode } from '../../src/types/drop.ts';

const urls = new Map<string, string>();
for (const f of readdirSync('content/drop/editions').filter((x) => x.endsWith('.json'))) {
  const ed = JSON.parse(readFileSync(`content/drop/editions/${f}`, 'utf8')) as DropEdition;
  for (const it of ed.items) for (const s of it.sources) urls.set(s.url, `${f} · ${it.id}`);
}
if (existsSync('content/drop/nodes.json'))
  for (const n of JSON.parse(readFileSync('content/drop/nodes.json', 'utf8')) as ThreadNode[]) if (n.url) urls.set(n.url, `node ${n.id}`);
for (const w of SEED_WEBSITES) urls.set(w.url, `website ${w.id}`);

const UA = 'Mozilla/5.0 (compatible; PersonalPlaygroundLinkCheck/1.0; +https://github.com/tybrathwaite1-lab/personal-playground)';
async function check(url: string): Promise<number | string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (r.status === 405 || r.status === 403 || r.status === 404) r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
    return r.status;
  } catch (e) {
    return (e as Error).name;
  } finally {
    clearTimeout(t);
  }
}
const entries = [...urls];
let bad = 0;
for (let i = 0; i < entries.length; i += 8) {
  const batch = entries.slice(i, i + 8);
  const res = await Promise.all(batch.map(([u]) => check(u)));
  batch.forEach(([u, where], j) => {
    const r = res[j];
    if (typeof r !== 'number' || r >= 400) {
      bad++;
      console.log(`✗ ${r}  ${u}  (${where})`);
    }
  });
}
console.log(`\nLink check: ${entries.length - bad}/${entries.length} OK${bad ? ` — ${bad} need a look (403s are often bot-blocking, not dead links)` : ''}`);
