/**
 * The decision logic of the Local Pulse ingest, extracted unchanged from scripts/pulse/ingest.ts
 * (M2-5) so it can be tested without the network: given what each source returned, the
 * previous pulse.json and the current time, which events are kept, carried over or dropped,
 * and what each source's status says. ingest.ts does the fetching, logging and writing.
 */
import type { PulseSourceDef } from '../../src/data/pulseSources.ts';
import type { PulseEvent, PulseFile, PulseSource } from '../../src/types/pulse.ts';
import { parseIcs, type IcsEvent } from '../../src/utils/ics.ts';
import { dedupe, isExpired, normalizeIcs } from '../../src/utils/pulse.ts';

export const HORIZON_DAYS = 120;

/** What fetching one source produced: its body, or the error that stopped it (e.g. "HTTP 403"). */
export type FetchOutcome = { ok: true; text: string } | { ok: false; error: string };

export interface SourceResult {
  source: PulseSource;
  events: PulseEvent[];
  /** Feed items before filtering (only when the read succeeded). */
  inFeed?: number;
}

/**
 * One source's contribution. A successful read keeps its normalized, unexpired events that
 * start within the horizon. Any failure — fetching, parsing or normalizing — instead carries
 * over this source's unexpired events from `previous` and marks the source stale.
 * `onParsed` (ingest's --report price evidence) runs on the parsed feed inside the same error
 * handling, so an error there is also a source failure, as it always was.
 */
export function sourceResult(def: PulseSourceDef, outcome: FetchOutcome, previous: PulseFile | null, now: Date, onParsed?: (raw: IcsEvent[]) => void): SourceResult {
  const nowIso = now.toISOString();
  const horizon = now.getTime() + HORIZON_DAYS * 86_400_000;
  const prevSource = previous?.sources.find((s) => s.id === def.id);
  try {
    if (!outcome.ok) throw new Error(outcome.error);
    const raw = parseIcs(outcome.text);
    onParsed?.(raw);
    const items = raw
      .map((e) => normalizeIcs(e, def.id, nowIso))
      .filter((e): e is PulseEvent => Boolean(e))
      .filter((e) => !isExpired(e, now.getTime()) && Date.parse(e.start) < horizon);
    return { source: { id: def.id, name: def.name, homepage: def.homepage, feed: def.feed, ok: true, lastSuccess: nowIso, count: items.length }, events: items, inFeed: raw.length };
  } catch (err) {
    const carried = (previous?.events ?? []).filter((e) => e.sourceIds.includes(def.id) && !isExpired(e, now.getTime()));
    return {
      source: {
        id: def.id,
        name: def.name,
        homepage: def.homepage,
        feed: def.feed,
        ok: false,
        lastSuccess: prevSource?.lastSuccess ?? null,
        count: carried.length,
        error: (err as Error).message,
        stale: carried.length > 0,
      },
      events: carried,
    };
  }
}

/** The whole file: every source in order, then events de-duplicated and sorted by start. */
export function assemblePulse(results: SourceResult[], now: Date): { file: PulseFile; listings: number } {
  const listings = results.reduce((n, r) => n + r.events.length, 0);
  const events = dedupe(results.flatMap((r) => r.events)); // also sorts by actual start instant
  return { file: { generatedAt: now.toISOString(), timezone: 'America/New_York', sources: results.map((r) => r.source), events }, listings };
}

// ─── Previous snapshot validation (R1) ───────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const strings = (v: unknown, nonEmpty = false) => Array.isArray(v) && v.every(isStr) && (!nonEmpty || v.length > 0);

/** Why a previous event can't be carried over, or null when it can. */
function eventProblem(e: unknown): string | null {
  if (!isObj(e)) return 'not an object';
  if (!isStr(e.id)) return 'no id';
  if (!isStr(e.title)) return 'no title';
  if (!isDate(e.start)) return 'unreadable start';
  if (e.end !== undefined && !isDate(e.end)) return 'unreadable end';
  if (typeof e.allDay !== 'boolean') return 'no allDay flag';
  if (!strings(e.sourceIds, true)) return 'no sourceIds';
  if (!strings(e.tags) || !strings(e.categories)) return 'invalid tags or categories';
  return null;
}

/**
 * The parts of a previous pulse.json that are safe to carry over. The previous file is
 * normally our own deployed output, but it is read over the network, so it is checked rather
 * than trusted: anything that isn't an object is treated as absent; a missing or non-array
 * `sources` or `events` counts as empty; entries that couldn't be carried over safely
 * (including events whose dates can't be read, which would otherwise never expire) are left
 * out. Valid entries are returned unchanged. `dropped` summarizes what was left out.
 */
export function usablePrevious(raw: unknown): { file: PulseFile | null; dropped: string[] } {
  if (!isObj(raw)) return { file: null, dropped: raw === null || raw === undefined ? [] : ['the whole file (not an object)'] };
  const dropped: string[] = [];
  const count = new Map<string, number>();
  const note = (what: string) => count.set(what, (count.get(what) ?? 0) + 1);
  if (!Array.isArray(raw.sources)) dropped.push('sources (not a list)');
  if (!Array.isArray(raw.events)) dropped.push('events (not a list)');

  const sources: PulseSource[] = [];
  for (const s of Array.isArray(raw.sources) ? raw.sources : []) {
    if (!isObj(s) || !isStr(s.id)) note('source: no id');
    else if (s.lastSuccess !== null && s.lastSuccess !== undefined && !isDate(s.lastSuccess)) {
      note('source: unreadable lastSuccess');
      sources.push({ ...(s as unknown as PulseSource), lastSuccess: null });
    } else sources.push(s as unknown as PulseSource);
  }
  const events: PulseEvent[] = [];
  for (const e of Array.isArray(raw.events) ? raw.events : []) {
    const problem = eventProblem(e);
    if (problem) note(`event: ${problem}`);
    else events.push(e as unknown as PulseEvent);
  }
  for (const [what, n] of count) dropped.push(`${what} ×${n}`);
  return { file: { ...(raw as unknown as PulseFile), sources, events }, dropped };
}
