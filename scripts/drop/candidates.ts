/**
 * Stage B — automated candidate discovery. Reads permitted RSS/Atom feeds, normalizes,
 * de-duplicates (including against published items), validates links, and writes
 * public/data/candidates.json for the Editorial desk. Never publishes anything.
 * Failures are logged and skipped; the build always continues.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CANDIDATE_FEEDS } from '../../src/data/candidateFeeds.ts';
import type { DropEdition } from '../../src/types/drop.ts';
import { stripHtml } from '../../src/utils/ics.ts';

interface Candidate {
  id: string;
  feed: string;
  feedName: string;
  column: string;
  title: string;
  url: string;
  published?: string;
  summary?: string;
  linkOk: boolean;
}

const UA = 'PersonalPlaygroundBot/1.0 (+https://github.com/tybrathwaite1-lab/personal-playground; personal, non-commercial)';
const pick = (block: string, tag: string) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : undefined;
};

function parseFeed(xml: string): { title: string; url: string; published?: string; summary?: string }[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks
    .map((b) => {
      const atomLink = b.match(/<link[^>]*href="([^"]+)"/i)?.[1];
      const url = (pick(b, 'link') || atomLink || '').trim();
      const date = pick(b, 'pubDate') ?? pick(b, 'published') ?? pick(b, 'updated');
      const summary = pick(b, 'description') ?? pick(b, 'summary');
      return {
        title: stripHtml(pick(b, 'title') ?? ''),
        url,
        published: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : undefined,
        summary: summary ? stripHtml(summary).slice(0, 280) : undefined,
      };
    })
    .filter((x) => x.title && /^https:\/\//.test(x.url));
}

async function get(url: string, method = 'GET'): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(url, { method, headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const published = new Set<string>();
for (const f of readdirSync('content/drop/editions').filter((x) => x.endsWith('.json'))) {
  const ed = JSON.parse(readFileSync(`content/drop/editions/${f}`, 'utf8')) as DropEdition;
  ed.items.forEach((i) => i.sources.forEach((s) => published.add(s.url.replace(/\/$/, ''))));
}

const out: Candidate[] = [];
const seen = new Set<string>();
for (const feed of CANDIDATE_FEEDS) {
  try {
    const r = await get(feed.url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const items = parseFeed(await r.text()).slice(0, 8);
    let kept = 0;
    for (const it of items) {
      const key = it.url.replace(/[?#].*$/, '').replace(/\/$/, '');
      if (seen.has(key) || published.has(key)) continue;
      seen.add(key);
      let linkOk = false;
      try {
        linkOk = (await get(it.url, 'HEAD')).status < 400;
      } catch {
        linkOk = false;
      }
      out.push({ id: `${feed.id}:${key.split('/').filter(Boolean).pop()}`, feed: feed.id, feedName: feed.name, column: feed.column, ...it, linkOk });
      kept++;
    }
    console.log(`✓ ${feed.id.padEnd(22)} ${kept} candidates`);
  } catch (e) {
    console.log(`✗ ${feed.id.padEnd(22)} ${(e as Error).message}`);
  }
}
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/candidates.json', JSON.stringify({ generatedAt: new Date().toISOString(), candidates: out }));
console.log(`Candidates: ${out.length} unreviewed leads → public/data/candidates.json`);
