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
