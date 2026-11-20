/**
 * Synthetic Pulse ingest fixtures (M2-5): a fixed clock, source definitions, an iCalendar feed
 * builder and yesterday's pulse.json. Used by tests/pulse-ingest.test.ts and, for the
 * time-zone check, by a fresh Node process.
 */
import { assemblePulse, sourceResult, type FetchOutcome } from '../../scripts/pulse/assemble.ts';
import type { PulseSourceDef } from '../../src/data/pulseSources.ts';
import type { PulseEvent, PulseFile } from '../../src/types/pulse.ts';

export const NOW = new Date('2026-11-20T17:00:00Z'); // Fri 12:00 New York
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const def = (id: string): PulseSourceDef => ({ id, name: `Source ${id}`, homepage: `https://${id}.example/events`, feed: `https://${id}.example/feed.ics`, kind: 'ics', covers: 'test', verified: true });
export const A = def('alpha');
export const B = def('beta');

/** iCalendar UTC stamp for an instant. */
export const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export type V = { uid?: string; summary?: string; start?: string; end?: string; location?: string; extra?: string[] };
export const vevent = (v: V) =>
  ['BEGIN:VEVENT', v.uid && `UID:${v.uid}`, v.summary !== undefined && `SUMMARY:${v.summary}`, v.start && `DTSTART:${v.start}`, v.end && `DTEND:${v.end}`, v.location && `LOCATION:${v.location}`, ...(v.extra ?? []), 'END:VEVENT']
    .filter(Boolean)
    .join('\r\n');
export const feed = (...events: V[]): FetchOutcome => ({ ok: true, text: ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.map(vevent), 'END:VCALENDAR'].join('\r\n') });
export const at = (offsetMs: number, extra: Partial<V> = {}): V => ({ uid: `u${offsetMs}`, summary: `Gallery night ${offsetMs}`, start: stamp(NOW.getTime() + offsetMs), location: 'Studio, 600 Central Ave, St. Petersburg, FL', ...extra });

/** A carried-over listing as it would appear in yesterday's pulse.json. */
export const prevEvent = (id: string, sourceIds: string[], startOffset: number, extra: Partial<PulseEvent> = {}): PulseEvent => ({
  id,
  title: `Carried ${id}`,
  start: new Date(NOW.getTime() + startOffset).toISOString(),
  allDay: false,
  ongoing: false,
  tags: [],
  categories: ['Cultural events'],
  cancelled: false,
  sourceIds,
  verifiedAt: '2026-11-19T17:00:00.000Z',
  ...extra,
});
export const previousFile = (events: PulseEvent[], lastSuccess = '2026-11-19T17:00:00.000Z'): PulseFile => ({
  generatedAt: '2026-11-19T17:00:00.000Z',
  timezone: 'America/New_York',
  sources: [A, B].map((d) => ({ id: d.id, name: d.name, homepage: d.homepage, feed: d.feed, ok: true, lastSuccess, count: 1 })),
  events,
});
export const titles = (events: PulseEvent[]) => events.map((e) => e.title);

/** A fixed mixed scenario: one source failing with carryover, one succeeding. */
export const scenario = () => {
  const prev = previousFile([prevEvent('alpha:upcoming', ['alpha'], DAY), prevEvent('alpha:expired', ['alpha'], -DAY)]);
  return assemblePulse(
    [sourceResult(A, { ok: false, error: 'HTTP 403' }, prev, NOW), sourceResult(B, feed(at(2 * HOUR), at(9 * DAY, { summary: 'Free outdoor market', extra: ['DESCRIPTION:Free admission.'] }), { uid: 'allday', summary: 'Open studios', start: '20261121' }), prev, NOW)],
    NOW,
  ).file;
};

