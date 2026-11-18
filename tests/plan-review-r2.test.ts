/**
 * PR #22 review, revision 2 (ChatGPT): targeted correctness fixes.
 *  A. drop-in arrivals respect the chosen part of the day (future dates, primary + secondary)
 *  B. fixed-start events keep their published duration (no 4-hour cap → no hidden overlap)
 *  C. anchors: known preference mismatches are warnings; missing listing info stays neutral
 * Deterministic: fixed "now", fixed rand. Synthetic data, plus seed places for C.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_PLACES } from '../src/data/places.ts';
import {
  CATEGORY_PROFILE,
  buildAdventure,
  candidates,
  communityStop,
  eventStop,
  planClock,
  placeStop,
  schedule,
  type AdventureOptions,
} from '../src/utils/adventure.ts';
import { EMPTY_DATA } from '../src/utils/storage.ts';
import type { Community, Place } from '../src/types/index.ts';
import type { PulseEvent } from '../src/types/pulse.ts';

const EARLIER = Date.parse('2026-11-17T12:00:00Z'); // future-date planning
const first = () => 0; // deterministic picks
const base: AdventureOptions = {
  date: '2026-11-21', slot: 'afternoon', hours: 6, company: 'solo', budget: 'any', energy: 'any',
  radius: 40, transport: 'car', atmosphere: 'any', weather: 'any', familiarity: 'mix', indoorDay: false,
};
const inp = (o: { events?: PulseEvent[]; places?: Place[]; communities?: Community[] }) => ({
  places: o.places ?? [], events: o.events ?? [], communities: o.communities ?? [], data: structuredClone(EMPTY_DATA),
});
const dropIn = (start: string, end: string, o: Partial<Community> = {}): Community => ({
  id: 'com-dropin', name: 'Synthetic Drop-in', kind: 'Market', description: '', schedule: `Saturdays ${start}–${end}`, cadence: 'weekly',
  rules: [{ weekday: 6, start, end }], city: 'St. Petersburg', website: 'https://example.org', costNote: 'Free',
  interests: [], company: ['solo', 'partner', 'friends'], status: 'verified', verifiedOn: '2026-11-17', sourceNote: 'synthetic', ...o,
});
let n = 0;
const ev = (start: string, end: string | undefined, o: Partial<PulseEvent> = {}): PulseEvent => ({
  id: `src:r2-${++n}`, title: `Synthetic ${n}`, start: `2026-11-21T${start}:00-05:00`, end: end ? `2026-11-21T${end}:00-05:00` : undefined,
  allDay: false, ongoing: false, venue: 'Hall', city: 'St. Petersburg', tags: [], categories: [`Cat ${n}`], cancelled: false,
  sourceIds: ['src'], verifiedAt: '2026-11-17T00:00:00Z', ...o,
});
const clock = (o: Partial<AdventureOptions> = {}) => planClock({ ...base, ...o }, EARLIER);

// ─── A. Drop-in arrivals respect the selected slot ────────────────────

test('A: a 10 AM–4 PM drop-in in an afternoon plan starts at noon, not 10 AM', () => {
  const market = dropIn('10:00', '16:00');
  const a = buildAdventure(inp({ communities: [market] }), base, first, EARLIER)!;
  assert.equal(a.primary.key, 'community:com-dropin');
  assert.equal(a.time.start, 12 * 60);
  assert.equal(a.time.stops, 120, 'full estimated visit fits before 4 PM');
});

test('A: the same all-day drop-in starts at each slot’s boundary (future date)', () => {
  const s = communityStop(dropIn('10:00', '20:00'), '2026-11-21');
  assert.equal(schedule(s, undefined, 'car', clock({ slot: 'morning' }))!.start, 10 * 60, 'morning: opens at 10');
  assert.equal(schedule(s, undefined, 'car', clock({ slot: 'afternoon' }))!.start, 12 * 60, 'afternoon: from noon');
  assert.equal(schedule(s, undefined, 'car', clock({ slot: 'evening' }))!.start, 17 * 60, 'evening: from 5 PM');
  // A window that is over before the slot begins isn't offered at all.
  assert.equal(candidates(inp({ communities: [dropIn('10:00', '16:00')] }), { ...base, slot: 'evening' }, EARLIER).length, 0);
});

test('A: a drop-in SECONDARY also waits for the slot start after an earlier fixed stop', () => {
  const breakfast = eventStop(ev('09:00', '10:00'), '2026-11-21'); // fixed, before the afternoon
  const market = communityStop(dropIn('10:00', '16:00'), '2026-11-21');
  const sch = schedule(breakfast, market, 'car', clock())!;
  assert.equal(sch.arrivals[1], 12 * 60, 'not 10:25 AM');
  assert.equal(sch.wait, 12 * 60 - (10 * 60 + 25));
});

test('A: valid overnight drop-in attendance is unaffected', () => {
  const late = communityStop(dropIn('20:00', '01:00'), '2026-11-21');
  assert.equal(schedule(late, undefined, 'car', clock({ slot: 'evening' }))!.start, 20 * 60);
  const sameDay = planClock({ ...base, slot: 'evening' }, Date.parse('2026-11-21T23:00:00-05:00'));
  const sch = schedule(late, undefined, 'car', sameDay)!;
  assert.equal(sch.start, 23 * 60 + 30, 'join at now + lead');
  assert.equal(sch.visits[0], 90, 'until 1 AM');
  assert.equal(sch.end, 25 * 60);
});

// ─── B. Published fixed-event durations ───────────────────────────────

test('B: a 5-hour fixed event keeps its published end (no 4-hour cap)', () => {
  const fest = eventStop(ev('12:00', '17:00'), '2026-11-21');
  assert.equal(fest.minutes, 300);
  assert.deepEqual(fest.window, { kind: 'fixed', earliest: 12 * 60, latest: 12 * 60, end: 17 * 60 });
});

test('B: nothing overlaps the real end of a long event', () => {
  const festEv = ev('12:00', '17:00', { categories: ['Festivals'] });
  const talk430 = ev('16:30', '17:30', { categories: ['Workshops and classes'] });
  const talk530 = ev('17:30', '18:30', { categories: ['Workshops and classes'] });
  const fest = eventStop(festEv, '2026-11-21');
  assert.equal(schedule(fest, eventStop(talk430, '2026-11-21'), 'car', clock()), null, '4:30 PM overlaps a 5 PM end');
  const ok = schedule(fest, eventStop(talk530, '2026-11-21'), 'car', clock())!;
  assert.deepEqual([ok.arrivals[1], ok.wait], [17 * 60 + 30, 5], '5:30 PM fits after 5 PM + 25 min');
  const a = buildAdventure(inp({ events: [festEv, talk430] }), { ...base, anchor: `event:${festEv.id}` }, first, EARLIER)!;
  assert.equal(a.secondary, undefined);
  assert.equal(a.time.end, 17 * 60);
});

test('B: a long event is flagged against a shorter outing and never picked at random', () => {
  const festEv = ev('12:00', '17:00');
  const a = buildAdventure(inp({ events: [festEv] }), { ...base, hours: 4, anchor: `event:${festEv.id}` }, first, EARLIER)!;
  assert.ok(a.warnings.some((x) => /runs about 5 hr — longer than the ~4 hours/.test(x)));
  assert.equal(buildAdventure(inp({ events: [festEv] }), { ...base, hours: 4 }, first, EARLIER), null);
});

test('B: estimated durations are kept where nothing is published or attendance is flexible', () => {
  assert.equal(eventStop(ev('13:00', '13:30'), '2026-11-21').minutes, 30, 'short published duration is used as-is');
  assert.equal(eventStop(ev('13:00', undefined), '2026-11-21').minutes, 120, 'no end → estimate');
  assert.equal(eventStop(ev('13:00', '12:00'), '2026-11-21').minutes, 120, 'invalid end → estimate');
  assert.equal(eventStop(ev('00:00', undefined, { allDay: true, end: '2026-11-22T00:00:00-05:00' }), '2026-11-21').minutes, 120, 'all-day → estimate');
  assert.equal(eventStop(ev('10:00', undefined, { ongoing: true, end: '2026-11-30T17:00:00-05:00' }), '2026-11-21').minutes, 120, 'exhibition → estimate');
  assert.equal(communityStop(dropIn('10:00', '16:00'), '2026-11-21').minutes, 120, 'drop-in → estimated visit');
});

// ─── C. Anchors: known mismatches vs missing information ──────────────

const fgc = SEED_PLACES.find((p) => p.categories[0] === 'Fighting game tournaments')!;
const gallery = SEED_PLACES.find((p) => p.categories[0] === 'Art galleries')!;

test('C: a place anchor’s known mismatches are warnings, and the plan is still built', () => {
  const prof = CATEGORY_PROFILE['Fighting game tournaments'];
  assert.deepEqual([prof.date, prof.energy, prof.indoor, prof.vibes.includes('chill')], [false, 'medium', true, false], 'precondition');
  const o = { ...base, company: 'partner' as const, energy: 'high' as const, atmosphere: 'chill' as const, weather: 'outdoor' as const, anchor: `place:${fgc.id}` };
  const a = buildAdventure(inp({ places: [fgc, gallery] }), o, first, EARLIER)!;
  const w = a.warnings.join(' ');
  for (const re of [/isn’t usually suited to a date/, /usually medium energy, not high/, /isn’t usually chill/, /it’s indoors/]) assert.match(w, re);
  assert.notEqual(a.time.start, undefined, 'preference mismatches don’t block the timetable');
  assert.ok(!a.info.some((x) => /suits|active|indoors/.test(x)), 'known facts are not reported as missing info');
});

test('C: an event anchor — known atmosphere/indoor clash warns; unknown energy/company stays neutral info', () => {
  const market = ev('13:00', '15:00', { categories: ['Markets'], indoor: false });
  const a = buildAdventure(inp({ events: [market] }), { ...base, company: 'partner', energy: 'low', atmosphere: 'chill', weather: 'indoor', anchor: `event:${market.id}` }, first, EARLIER)!;
  assert.match(a.warnings.join(' '), /isn’t listed as chill, it’s outdoors/);
  assert.ok(!a.warnings.some((x) => /active|suits best/.test(x)));
  assert.ok(a.info.some((x) => /how active it is or who it suits best/.test(x)));
});

test('C: a forecast-driven indoor preference names the reason', () => {
  const market = ev('13:00', '15:00', { categories: ['Markets'], indoor: false });
  const a = buildAdventure(inp({ events: [market] }), { ...base, weather: 'auto', indoorDay: true, anchor: `event:${market.id}` }, first, EARLIER)!;
  assert.match(a.warnings.join(' '), /it’s outdoors and the forecast looks wet/);
});

test('C: a community anchor not listed for this company warns; its unknown atmosphere is info', () => {
  const soloOnly = dropIn('13:00', '17:00', { id: 'com-solo', company: ['solo'] });
  const a = buildAdventure(inp({ communities: [soloOnly] }), { ...base, company: 'friends', atmosphere: 'playful', anchor: 'community:com-solo' }, first, EARLIER)!;
  assert.match(a.warnings.join(' '), /isn’t listed as suited to a group of friends/);
  assert.ok(a.info.some((x) => /its atmosphere/.test(x)));
});

test('C: an anchor that matches every known preference raises no warning', () => {
  const a = buildAdventure(inp({ places: [gallery] }), { ...base, company: 'partner', energy: 'low', atmosphere: 'cultured', weather: 'indoor', anchor: `place:${gallery.id}` }, first, EARLIER)!;
  assert.deepEqual(a.warnings, []);
  assert.equal(placeStop(gallery).window, undefined);
});

test('C: timing conflicts still block the timetable; preference conflicts do not', () => {
  const tomorrow = ev('13:00', '14:00', { start: '2026-11-22T13:00:00-05:00', end: '2026-11-22T14:00:00-05:00', indoor: false });
  const a = buildAdventure(inp({ events: [tomorrow], places: [gallery] }), { ...base, weather: 'indoor', anchor: `event:${tomorrow.id}` }, first, EARLIER)!;
  assert.match(a.warnings.join(' '), /isn’t on the date you chose \(2026-11-22\).*it’s outdoors/);
  assert.equal(a.time.start, undefined);
  assert.equal(a.secondary, undefined);
});
