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
import type { PulseFile } from '../../src/types/pulse.ts';
import type { IcsEvent } from '../../src/utils/ics.ts';
import { normalizeIcs, priceEvidence } from '../../src/utils/pulse.ts';
import { stripHtml } from '../../src/utils/ics.ts';
import { assemblePulse, sourceResult, usablePrevious, type FetchOutcome, type SourceResult } from './assemble.ts';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = arg('--out', 'public/data/pulse.json');
const PREVIOUS = arg('--previous', process.env.PULSE_PREVIOUS ?? '');
const UA = 'PersonalPlaygroundBot/1.0 (+https://github.com/tybrathwaite1-lab/personal-playground; personal, non-commercial; 1 request/source/day)';
const REPORT = args.includes('--report');
const evidence = new Map<string, string[]>();

/** The previously deployed pulse.json, validated (usablePrevious); null when missing or unreadable. */
async function loadPrevious(): Promise<PulseFile | null> {
  if (!PREVIOUS) return null;
  let raw: unknown = null;
  try {
    if (/^https?:/.test(PREVIOUS)) {
      const r = await fetch(PREVIOUS, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
      raw = r.ok ? await r.json() : null;
    } else raw = existsSync(PREVIOUS) ? JSON.parse(readFileSync(PREVIOUS, 'utf8')) : null;
  } catch (e) {
    console.log(`Previous snapshot unavailable (${(e as Error).message}); nothing to carry over.`);
    return null;
  }
  const { file, dropped } = usablePrevious(raw);
  if (dropped.length) console.log(`Previous snapshot: left out ${dropped.join(', ')}`);
  return file;
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
  const previous = await loadPrevious();
  const results: SourceResult[] = [];

  for (const def of PULSE_SOURCES) {
    let outcome: FetchOutcome;
    try {
      outcome = { ok: true, text: await fetchText(def.feed) };
    } catch (err) {
      outcome = { ok: false, error: (err as Error).message };
    }
    const report = (raw: IcsEvent[]) => {
      for (const r of raw) {
        const n = normalizeIcs(r, def.id, nowIso);
        if (n) evidence.set(n.id, priceEvidence(`${r.summary}.\n${r.description ? stripHtml(r.description) : ''}`));
      }
    };
    const r = sourceResult(def, outcome, previous, now, REPORT ? report : undefined);
    results.push(r);
    if (r.source.ok) console.log(`✓ ${def.id.padEnd(14)} ${String(r.inFeed).padStart(3)} in feed → ${r.events.length} kept`);
    else console.log(`✗ ${def.id.padEnd(14)} ${r.source.error}${r.events.length ? ` — carried over ${r.events.length}` : ''}`);
  }

  const { file, listings: before } = assemblePulse(results, now);
  const { sources, events } = file;
  const merged = events.filter((e) => e.sourceIds.length > 1).length;
  console.log(`Dedupe: ${before} listings → ${events.length} events (${before - events.length} duplicates merged; ${merged} confirmed by 2+ sources)`);
  console.log(`Venue coordinates (ICS GEO, validated): ${events.filter((e) => e.geo).length} of ${events.length} events`);
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
