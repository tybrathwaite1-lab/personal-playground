/**
 * PP-001 regression tests: distinct sessions and venues survive de-duplication,
 * genuine duplicates merge deterministically. All fixtures are synthetic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs } from '../src/utils/ics.ts';
import { byStart, dedupe, normalizeIcs, toNyIso } from '../src/utils/pulse.ts';
import type { PulseEvent } from '../src/types/pulse.ts';

const base: PulseEvent = {
  id: 'src-a:1',
  title: 'Glassblowing Demo',
  start: '2026-11-21T13:00:00-05:00',
  end: '2026-11-21T14:00:00-05:00',
  allDay: false,
  ongoing: false,
  venue: 'Hot Shop',
  address: '719 Central Ave, St. Petersburg, FL',
  city: 'St. Petersburg',
  miles: 0.5,
  tags: ['Small building projects'],
  categories: ['Workshops'],
  cancelled: false,
  sourceIds: ['src-a'],
  verifiedAt: '2026-11-17T10:00:00.000Z',
};
const ev = (o: Partial<PulseEvent>): PulseEvent => ({ ...base, ...o });

test('two sessions of the same event on the same day stay separate', () => {
  const one = ev({ id: 'src-a:1' });
  const three = ev({ id: 'src-a:2', start: '2026-11-21T15:00:00-05:00', end: '2026-11-21T16:00:00-05:00' });
  const out = dedupe([one, three]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.id), ['src-a:1', 'src-a:2']);
});

test('same title and time at different venues in one city stay separate', () => {
  const a = ev({ id: 'src-a:open-mic', title: 'Open Mic Night', venue: 'Bar One', address: '100 1st Ave N, St. Petersburg, FL' });
  const b = ev({ id: 'src-b:open-mic', title: 'Open Mic Night', venue: 'Cafe Two', address: '900 Central Ave, St. Petersburg, FL', sourceIds: ['src-b'] });
  assert.equal(dedupe([a, b]).length, 2);
});

test('the same event from two sources merges, even when one feed uses UTC', () => {
  const ny = ev({ id: 'src-b:99', sourceIds: ['src-b'], description: 'Short.' });
  const utc = ev({ id: 'src-a:7', start: '2026-11-21T18:00:00.000Z', end: '2026-11-21T19:00:00.000Z', description: 'A longer, richer description.' });
  const out = dedupe([ny, utc]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sourceIds, ['src-a', 'src-b']);
  assert.equal(out[0].description, 'A longer, richer description.');
});

test('normalized feed times are canonical New York instants', () => {
  assert.equal(toNyIso('2026-11-21T18:00:00.000Z'), '2026-11-21T13:00:00-05:00');
  assert.equal(toNyIso('2026-07-04T01:00:00Z'), '2026-07-03T21:00:00-04:00');
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART:20261121T010000Z',
    'SUMMARY:Late Show',
    'LOCATION:Studio\\, 1 Main St\\, St. Petersburg\\, FL',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const [raw] = parseIcs(ics);
  const e = normalizeIcs(raw, 'src-x', '')!;
  assert.equal(e.start, '2026-11-20T20:00:00-05:00', 'a UTC 01:00 start is 8 PM the previous evening in New York');
});

test('a listing without a venue merges with its one match, but never bridges two venues', () => {
  const venueA = ev({ id: 'a:1', title: 'Trivia', venue: 'Bar One', address: '100 1st Ave N, St. Petersburg, FL' });
  const venueB = ev({ id: 'b:1', title: 'Trivia', venue: 'Cafe Two', address: '900 Central Ave, St. Petersburg, FL', sourceIds: ['b'] });
  const unknown = ev({ id: 'c:1', title: 'Trivia', venue: undefined, address: undefined, sourceIds: ['c'] });
  assert.equal(dedupe([venueA, unknown]).length, 1, 'one plausible match → merged');
  assert.equal(dedupe([venueA, venueB, unknown]).length, 3, 'two plausible venues → ambiguous, kept apart');
  const elsewhere = ev({ id: 'd:1', title: 'Trivia', venue: undefined, address: undefined, city: 'Tampa', sourceIds: ['d'] });
  assert.equal(dedupe([venueA, elsewhere]).length, 2, 'conflicting cities never merge');
});

test('different names for the same street address merge', () => {
  const a = ev({ id: 'a:1', venue: 'MFA', address: '255 Beach Drive NE, St. Petersburg, FL' });
  const b = ev({ id: 'b:1', venue: 'Museum of Fine Arts', address: '255 Beach Dr NE, St. Petersburg, FL', sourceIds: ['b'] });
  assert.equal(dedupe([a, b]).length, 1);
});

test('"&" vs "and" and letter case do not create duplicates', () => {
  const a = ev({ id: 'a:1', title: 'Art & Jazz Night' });
  const b = ev({ id: 'b:1', title: 'ART AND JAZZ NIGHT', sourceIds: ['b'] });
  assert.equal(dedupe([a, b]).length, 1);
});

test('merged ids are stable whatever order the feeds arrive in', () => {
  const a = ev({ id: 'zeta:5', sourceIds: ['zeta'], description: 'Much longer description from zeta.' });
  const b = ev({ id: 'alpha:9', sourceIds: ['alpha'] });
  const x = dedupe([a, b]);
  const y = dedupe([b, a]);
  assert.deepEqual(x, y);
  assert.equal(x[0].id, 'alpha:9');
});

test('cancellation applies to the cancelled event only, not to other sessions', () => {
  const early = ev({ id: 'a:early', cancelled: true });
  const late = ev({ id: 'a:late', start: '2026-11-21T15:00:00-05:00', end: '2026-11-21T16:00:00-05:00' });
  const out = dedupe([early, late]);
  assert.equal(out.find((e) => e.id === 'a:early')!.cancelled, true);
  assert.equal(out.find((e) => e.id === 'a:late')!.cancelled, false);
  const sameButCancelledElsewhere = ev({ id: 'b:1', sourceIds: ['b'], cancelled: true });
  assert.equal(dedupe([ev({ id: 'a:1' }), sameButCancelledElsewhere])[0].cancelled, true, 'any source cancelling the same event marks it cancelled');
});

test('price fields stay paired when duplicates merge', () => {
  const free = ev({ id: 'b:1', sourceIds: ['b'], priceNote: 'Free (per listing)', free: true });
  const silent = ev({ id: 'a:1', description: 'A much longer description with no price at all.' });
  const [m] = dedupe([silent, free]);
  assert.equal(m.priceNote, 'Free (per listing)');
  assert.equal(m.free, true);
});

test('feed items without a UID keep one id per session', () => {
  const ics = (time: string) =>
    ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', `DTSTART;TZID=America/New_York:20261121T${time}`, 'SUMMARY:House Tour', 'LOCATION:Hall\\, 5 Main St\\, Tampa\\, FL', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const ten = normalizeIcs(parseIcs(ics('100000'))[0], 'tours', '')!;
  const two = normalizeIcs(parseIcs(ics('140000'))[0], 'tours', '')!;
  assert.notEqual(ten.id, two.id);
  assert.equal(ten.id, 'tours:house-tour-2026-11-21t1000-hall');
  assert.equal(dedupe([ten, two]).length, 2);
});

test('events sort by actual instant, not by string', () => {
  const lateNy = ev({ id: 'a:1', start: '2026-11-20T23:00:00-05:00' }); // 04:00Z on the 21st
  const earlyUtc = ev({ id: 'b:1', title: 'Other', start: '2026-11-21T01:00:00.000Z' }); // 8 PM NY on the 20th
  assert.deepEqual([lateNy, earlyUtc].sort(byStart).map((e) => e.id), ['b:1', 'a:1']);
});

// ─── Review revisions (independent review of #14) ─────────────────────

test('a matching venue name in two different known cities never merges', () => {
  const a = ev({ id: 'src-a:x', venue: 'City Hall', address: undefined, city: 'St. Petersburg' });
  const b = ev({ id: 'src-b:y', venue: 'City Hall', address: undefined, city: 'Tampa', sourceIds: ['src-b'] });
  assert.equal(dedupe([a, b]).length, 2);
});

test('a matching street address in two different known cities never merges', () => {
  const a = ev({ id: 'src-a:x', venue: 'Gallery A', address: '100 Main St, Dunedin, FL', city: 'Dunedin' });
  const b = ev({ id: 'src-b:y', venue: 'Gallery B', address: '100 Main St, Safety Harbor, FL', city: 'Safety Harbor', sourceIds: ['src-b'] });
  assert.equal(dedupe([a, b]).length, 2);
});

test('the same venue name at explicitly different street addresses never merges', () => {
  const a = ev({ id: 'src-a:x', venue: 'Coffee Co', address: '100 1st Ave N, St. Petersburg, FL' });
  const b = ev({ id: 'src-b:y', venue: 'Coffee Co', address: '2500 Central Ave, St. Petersburg, FL', sourceIds: ['src-b'] });
  assert.equal(dedupe([a, b]).length, 2);
});

test('incomplete venue info stays conservative: a venue-less listing merges into the only plausible match', () => {
  const full = ev({ id: 'src-a:1' });
  const bare = ev({ id: 'src-b:1', venue: undefined, address: undefined, city: undefined, sourceIds: ['src-b'] });
  assert.equal(dedupe([full, bare]).length, 1);
  const other = ev({ id: 'src-c:1', venue: 'Other Hall', address: '5 Elm St, St. Petersburg, FL', sourceIds: ['src-c'] });
  assert.equal(dedupe([full, other, bare]).length, 3, 'ambiguous between two venues: kept apart');
});

const ics = (body: string) =>
  parseIcs(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`);
const vevent = (o: { summary: string; start: string; location?: string; uid?: string; allDay?: boolean }) =>
  `BEGIN:VEVENT\r\n${o.uid ? `UID:${o.uid}\r\n` : ''}SUMMARY:${o.summary}\r\n${o.allDay ? `DTSTART;VALUE=DATE:${o.start}` : `DTSTART;TZID=America/New_York:${o.start}`}\r\n${o.location ? `LOCATION:${o.location}\r\n` : ''}END:VEVENT\r\n`;
const NOW = '2026-11-17T12:00:00.000Z';

test('UID-less fallback ids include the venue: same title and time at two venues get distinct ids', () => {
  const items = ics(
    vevent({ summary: 'Trivia Night', start: '20261204T190000', location: 'Bar One, 100 1st Ave N, St. Petersburg, FL' }) +
      vevent({ summary: 'Trivia Night', start: '20261204T190000', location: 'Cafe Two, 900 Central Ave, St. Petersburg, FL' }),
  );
  const events = items.map((i) => normalizeIcs(i, 'src-a', NOW)!);
  assert.notEqual(events[0].id, events[1].id);
  const out = dedupe(events);
  assert.equal(out.length, 2);
  assert.equal(new Set(out.map((e) => e.id)).size, 2);
});

test('all-day and midnight-timed occurrences of the same title stay separate with distinct ids', () => {
  const items = ics(
    vevent({ summary: 'Art Walk', start: '20261205', allDay: true, location: 'Gallery, 1 Main St, St. Petersburg, FL' }) +
      vevent({ summary: 'Art Walk', start: '20261205T000000', location: 'Gallery, 1 Main St, St. Petersburg, FL' }),
  );
  const events = items.map((i) => normalizeIcs(i, 'src-a', NOW)!);
  assert.equal(Date.parse(events[0].start), Date.parse(events[1].start), 'precondition: same instant');
  assert.notEqual(events[0].id, events[1].id);
  assert.equal(dedupe(events).length, 2);
});

test('daylight-saving fall-back: 1:30 AM EDT and 1:30 AM EST are distinct events with distinct ids', () => {
  const edt = '2026-11-01T05:30:00.000Z'; // 1:30 AM EDT
  const est = '2026-11-01T06:30:00.000Z'; // 1:30 AM EST, one hour later
  assert.equal(toNyIso(edt), '2026-11-01T01:30:00-04:00');
  assert.equal(toNyIso(est), '2026-11-01T01:30:00-05:00');
  const items = ics(
    `BEGIN:VEVENT\r\nSUMMARY:Late Set\r\nDTSTART:20261101T053000Z\r\nLOCATION:Club, 1 Main St, St. Petersburg, FL\r\nEND:VEVENT\r\n` +
      `BEGIN:VEVENT\r\nSUMMARY:Late Set\r\nDTSTART:20261101T063000Z\r\nLOCATION:Club, 1 Main St, St. Petersburg, FL\r\nEND:VEVENT\r\n`,
  );
  const events = items.map((i) => normalizeIcs(i, 'src-a', NOW)!);
  assert.notEqual(events[0].id, events[1].id);
  const out = dedupe(events);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.start), ['2026-11-01T01:30:00-04:00', '2026-11-01T01:30:00-05:00']);
});

test('ordinary times keep readable ids (no offset outside the repeated hour)', () => {
  const [e] = ics(vevent({ summary: 'Late Set', start: '20261101T023000', location: 'Club, 1 Main St, St. Petersburg, FL' })).map((i) => normalizeIcs(i, 'src-a', NOW)!);
  assert.match(e.id, /^src-a:late-set-2026-11-01t0230-club$/);
});

test('distinct events always leave dedupe with unique ids, even when inputs share one', () => {
  const a = ev({ id: 'src-a:dup', city: 'Tampa', venue: 'Library' , address: undefined});
  const b = ev({ id: 'src-a:dup', city: 'Largo', venue: 'Library', address: undefined });
  const out = dedupe([b, a]);
  assert.equal(out.length, 2);
  assert.equal(new Set(out.map((e) => e.id)).size, 2);
  assert.deepEqual(dedupe([a, b]).map((e) => e.id), out.map((e) => e.id), 'suffixes are order-independent');
});

test('merged price fields all come from one listing; missing ones are cleared, never inherited', () => {
  type Priced = PulseEvent & { priceMin?: number; priceMax?: number };
  // The richer listing (chosen as the base) has a structured price but no note/free flag...
  const richer = ev({ id: 'src-a:1', description: 'A much longer and richer description of the event.' }) as Priced;
  richer.priceMin = 10;
  richer.priceMax = 40;
  delete richer.priceNote;
  delete richer.free;
  // ...and the other listing says only "free" with no structured amounts.
  const other = ev({ id: 'src-b:1', sourceIds: ['src-b'], description: 'Short.', priceNote: 'Free', free: true });
  const [m] = dedupe([richer, other]) as Priced[];
  const fields = { priceNote: m.priceNote, free: m.free, priceMin: m.priceMin, priceMax: m.priceMax };
  const fromRicher = { priceNote: undefined, free: undefined, priceMin: 10, priceMax: 40 };
  const fromOther = { priceNote: 'Free', free: true, priceMin: undefined, priceMax: undefined };
  assert.ok(
    JSON.stringify(fields) === JSON.stringify(fromRicher) || JSON.stringify(fields) === JSON.stringify(fromOther),
    `mixed price record: ${JSON.stringify(fields)}`,
  );
  assert.equal(m.free === true && m.priceMin !== undefined, false, 'never "free" with another listing\'s amount');
});
