/**
 * Local Pulse ingest — runs in GitHub Actions before each build (daily schedule +
 * every deploy). Reads public calendar feeds, normalizes, tags, de-duplicates,
 * drops expired listings and writes public/data/pulse.json.
 *
 * Failure handling: if a source fails today, its still-valid events are carried
 * over from the currently deployed pulse.json and marked stale. If everything
 * fails, the app falls back to permanent places and communities.
 *
 * Usage: npx tsx scripts/pulse/ingest.ts [--out public/data/pulse.json] [--previous <url-or-path>]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { PULSE_SOURCES } from '../../src/data/pulseSources.ts';
import type { PulseEvent, PulseFile, PulseSource } from '../../src/types/pulse.ts';
import { parseIcs } from '../../src/utils/ics.ts';
import { dedupe, isExpired, normalizeIcs, priceEvidence } from '../../src/utils/pulse.ts';
import { stripHtml } from '../../src/utils/ics.ts';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = arg('--out', 'public/data/pulse.json');
const PREVIOUS = arg('--previous', process.env.PULSE_PREVIOUS ?? '');
const UA = 'PersonalPlaygroundBot/1.0 (+https://github.com/tybrathwaite1-lab/personal-playground; personal, non-commercial; 1 request/source/day)';
const HORIZON_DAYS = 120;
const REPORT = args.includes('--report');
const evidence = new Map<string, string[]>();

async function loadPrevious(): Promise<PulseFile | null> {
  if (!PREVIOUS) return null;
  try {
    if (/^https?:/.test(PREVIOUS)) {
      const r = await fetch(PREVIOUS, { headers: { 'User-Agent': UA } });
      return r.ok ? ((await r.json()) as PulseFile) : null;
    }
    return existsSync(PREVIOUS) ? (JSON.parse(readFileSync(PREVIOUS, 'utf8')) as PulseFile) : null;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/calendar, */*' }, signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();
  const horizon = now.getTime() + HORIZON_DAYS * 86_400_000;
  const previous = await loadPrevious();
  const sources: PulseSource[] = [];
  let events: PulseEvent[] = [];

  for (const def of PULSE_SOURCES) {
    const prevSource = previous?.sources.find((s) => s.id === def.id);
    try {
      const raw = parseIcs(await fetchText(def.feed));
      if (REPORT)
        for (const r of raw) {
          const n = normalizeIcs(r, def.id, nowIso);
          if (n) evidence.set(n.id, priceEvidence(`${r.summary}.\n${r.description ? stripHtml(r.description) : ''}`));
        }
      const items = raw
        .map((e) => normalizeIcs(e, def.id, nowIso))
        .filter((e): e is PulseEvent => Boolean(e))
        .filter((e) => !isExpired(e, now.getTime()) && Date.parse(e.start) < horizon);
      events.push(...items);
      sources.push({ id: def.id, name: def.name, homepage: def.homepage, feed: def.feed, ok: true, lastSuccess: nowIso, count: items.length });
      console.log(`✓ ${def.id.padEnd(14)} ${String(raw.length).padStart(3)} in feed → ${items.length} kept`);
    } catch (err) {
      const carried = (previous?.events ?? []).filter((e) => e.sourceIds.includes(def.id) && !isExpired(e, now.getTime()));
      events.push(...carried);
      sources.push({
        id: def.id,
        name: def.name,
        homepage: def.homepage,
        feed: def.feed,
        ok: false,
        lastSuccess: prevSource?.lastSuccess ?? null,
        count: carried.length,
        error: (err as Error).message,
        stale: carried.length > 0,
      });
      console.log(`✗ ${def.id.padEnd(14)} ${(err as Error).message}${carried.length ? ` — carried over ${carried.length}` : ''}`);
    }
  }

  events = dedupe(events).sort((a, b) => a.start.localeCompare(b.start));
  const file: PulseFile = { generatedAt: nowIso, timezone: 'America/New_York', sources, events };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));
  const ok = sources.filter((s) => s.ok).length;
  console.log(`\nLocal Pulse: ${events.length} events from ${ok}/${sources.length} sources → ${OUT}`);
  if (REPORT) {
    // Reviewer aid (branch checks): how each listing's admission price was read.
    const kinds = { free: 0, paid: 0, mixed: 0, partial: 0, unknown: 0 };
    for (const e of events) {
      const k = e.free ? 'free' : e.priceMin !== undefined ? 'paid' : /Free and paid/.test(e.priceNote ?? '') ? 'mixed' : e.priceNote ? 'partial' : 'unknown';
      kinds[k]++;
      console.log(`price  ${(e.priceNote ?? 'unknown').padEnd(36)} | ${e.sourceIds.join('+').padEnd(14)} | ${e.title.slice(0, 60)}`);
      for (const line of (evidence.get(e.id) ?? []).slice(0, 4)) console.log(`         ↳ ${line.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
    console.log('Price summary:', Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · '));
  }
  const byCat = new Map<string, number>();
  events.forEach((e) => e.categories.forEach((c) => byCat.set(c, (byCat.get(c) ?? 0) + 1)));
  console.log('By category:', [...byCat].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · '));
  console.log('Sample:', events.slice(0, 5).map((e) => `${e.start.slice(0, 16)} ${e.title} @ ${e.city ?? '?'}`).join(' | '));
}

main().catch((e) => {
  // Never fail the build because of the Pulse — the app works without it.
  console.error('Pulse ingest crashed:', e);
  process.exitCode = 0;
});
