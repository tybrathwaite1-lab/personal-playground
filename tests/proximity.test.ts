/**
 * PP-003 regression tests: proximity is only claimed when it is known. Synthetic data only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeo, parseIcs } from '../src/utils/ics.ts';
import { plausibleVenue } from '../src/utils/geo.ts';
import { normalizeIcs } from '../src/utils/pulse.ts';
import { buildAdventure, describeTravel, eventStop, placeStop, proximity, travelMinutes, type AdventureOptions } from '../src/utils/adventure.ts';
import { EMPTY_DATA } from '../src/utils/storage.ts';
import type { Place } from '../src/types/index.ts';
import type { PulseEvent } from '../src/types/pulse.ts';
import { forEachSeed } from './helpers/seeded.ts';

const NOW = Date.parse('2026-11-17T19:00:00Z');
const opts: AdventureOptions = {
  date: '2026-11-21', slot: 'afternoon', hours: 6, company: 'solo', budget: 'any', energy: 'any',
  radius: 40, transport: 'walk', atmosphere: 'any', weather: 'any', familiarity: 'mix', indoorDay: false,
};
const place = (o: Partial<Place>): Place => ({
  id: 'p1', name: 'Synthetic Gallery', categories: ['Art galleries'], description: '', neighborhood: 'Downtown', city: 'St. Petersburg',
  budget: 'free', interests: [], status: 'verified', ...o,
});
const event = (o: Partial<PulseEvent>): PulseEvent => ({
  id: 'src:e1', title: 'Synthetic Talk', start: '2026-11-21T13:00:00-05:00', end: '2026-11-21T14:00:00-05:00', allDay: false, ongoing: false,
  venue: 'Hall', city: 'St. Petersburg', tags: [], categories: ['Workshops and classes'], cancelled: false, sourceIds: ['src'], verifiedAt: '2026-11-17T00:00:00Z', ...o,
});

test('two places in the same city without pinned venues never claim an easy walk', () => {
  const a = placeStop(place({ id: 'a', neighborhood: 'Downtown' }));
  const b = placeStop(place({ id: 'b', categories: ['Record stores'], neighborhood: 'Grand Central' }));
  const p = proximity(a, b);
  assert.equal(p.kind, 'same-city');
  const line = describeTravel(p, 'walk');
  assert.doesNotMatch(line, /easy|walk\b/i);
  assert.match(line, /not verified/);
});

test('same named neighborhood is labelled as such, still not a measured distance', () => {
  const a = placeStop(place({ id: 'a' }));
  const b = placeStop(place({ id: 'b', categories: ['Record stores'] }));
  assert.match(describeTravel(proximity(a, b), 'walk'), /Both in Downtown, St\. Petersburg — exact distance not verified/);
});

test('pinned venues give a straight-line distance and a labelled estimate', () => {
  const a = eventStop(event({ id: 'src:a', geo: { lat: 27.7709, lon: -82.6359 } }));
  const b = placeStop(place({ coords: { lat: 27.7730, lon: -82.6400, source: 'synthetic', verifiedOn: '2026-11-17' } }));
  const p = proximity(a, b);
  assert.equal(p.kind, 'venue');
  const line = describeTravel(p, 'walk');
  assert.match(line, /straight line/);
  assert.match(line, /est\./);
  assert.ok(travelMinutes(p, 'walk') < 20);
});

test('different cities: center-to-center distance, labelled as such', () => {
  const a = placeStop(place({ id: 'a' }));
  const b = placeStop(place({ id: 'b', city: 'Gulfport', neighborhood: 'Waterfront', categories: ['Record stores'] }));
  const line = describeTravel(proximity(a, b), 'car');
  assert.match(line, /between St\. Petersburg and Gulfport \(city centers, straight line\)/);
});

test('no location at all is labelled unknown', () => {
  const a = placeStop(place({ id: 'a', city: 'Somewhere Else' }));
  const b = placeStop(place({ id: 'b' }));
  assert.equal(a.precision, 'unknown');
  assert.equal(describeTravel(proximity(a, b), 'car'), 'Distance between stops unknown — check the map');
});

test('unverified distances get a per-transport allowance, never zero minutes', () => {
  for (const t of ['walk', 'bike', 'transit', 'car'] as const) assert.ok(travelMinutes({ kind: 'same-city', city: 'X' }, t) >= 25, t);
});

test('walking: pinned venues farther than the walking hop are not paired', () => {
  const far = event({ id: 'src:far', title: 'Far Thing', categories: ['Markets'], geo: { lat: 27.8300, lon: -82.6400 } }); // ~4.4 mi north, still St. Pete
  const near = place({ id: 'near', coords: { lat: 27.7700, lon: -82.6380, source: 'synthetic', verifiedOn: '2026-11-17' } });
  forEachSeed((rand) => {
    const a = buildAdventure({ places: [near], events: [far], communities: [], data: structuredClone(EMPTY_DATA) }, { ...opts, anchor: 'place:near' }, rand, NOW)!;
    assert.equal(a.secondary, undefined, 'a 4-mile pair must not be offered on foot');
  });
});

test('verified-close pairs are preferred over unverified same-city ones', () => {
  const anchor = place({ id: 'anchor', coords: { lat: 27.7700, lon: -82.6380, source: 'synthetic', verifiedOn: '2026-11-17' } });
  // 3 PM starts leave time for the (flexible) gallery first; a flexible stop never starts before the afternoon.
  const at3 = { start: '2026-11-21T15:00:00-05:00', end: '2026-11-21T16:00:00-05:00' };
  const pinned = event({ id: 'src:pinned', title: 'Pinned', categories: ['Markets'], geo: { lat: 27.7720, lon: -82.6390 }, ...at3 });
  const unpinned = event({ id: 'src:unpinned', title: 'Unpinned', categories: ['Music'], ...at3 });
  forEachSeed((rand) => {
    const a = buildAdventure({ places: [anchor], events: [pinned, unpinned], communities: [], data: structuredClone(EMPTY_DATA) }, { ...opts, anchor: 'place:anchor' }, rand, NOW)!;
    assert.equal(a.secondary?.key, 'event:src:pinned');
    assert.equal(a.proximity.kind, 'venue');
  });
});

test('home distance says whether it is measured from the venue or the city center', () => {
  forEachSeed((rand) => {
    const a = buildAdventure({ places: [place({})], events: [], communities: [], data: structuredClone(EMPTY_DATA) }, { ...opts, anchor: 'place:p1' }, rand, NOW)!;
    assert.equal(a.homeBasis, 'city');
  });
});

test('ICS GEO: parsed when well-formed, rejected when malformed', () => {
  assert.deepEqual(parseGeo('27.7709;-82.6359'), { lat: 27.7709, lon: -82.6359 });
  assert.deepEqual(parseGeo(' 27.7709 ; -82.6359 '), { lat: 27.7709, lon: -82.6359 });
  for (const bad of [undefined, '', 'abc', '27.7;', '0;0', '95;10', '27.7;-200']) assert.equal(parseGeo(bad), undefined, String(bad));
});

test('publisher coordinates are used only when plausible for Tampa Bay and the stated city', () => {
  assert.ok(plausibleVenue({ lat: 27.7709, lon: -82.6359 }, 'St. Petersburg'));
  assert.equal(plausibleVenue({ lat: 40.7, lon: -74.0 }, 'St. Petersburg'), undefined, 'New York');
  assert.equal(plausibleVenue({ lat: 28.0197, lon: -82.7718 }, 'Tampa'), undefined, 'Dunedin coords on a Tampa listing');
  assert.deepEqual(plausibleVenue({ lat: 27.770912, lon: -82.635944 }), { lat: 27.7709, lon: -82.6359 }, 'rounded to ~10 m');
});

test('feed → event: GEO flows into geo and venue-based miles; implausible GEO falls back to city', () => {
  const ics = (geo: string) =>
    parseIcs(`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:g1\r\nSUMMARY:Talk\r\nDTSTART;TZID=America/New_York:20261121T130000\r\nLOCATION:Hall\\, 1 Main St\\, St. Petersburg\\, FL\r\nGEO:${geo}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`)[0];
  const good = normalizeIcs(ics('27.8000;-82.6400'), 'src', '')!;
  assert.deepEqual(good.geo, { lat: 27.8, lon: -82.64 });
  assert.equal(good.miles, 2.2);
  const bad = normalizeIcs(ics('51.5;-0.12'), 'src', '')!;
  assert.equal(bad.geo, undefined);
  assert.equal(bad.miles, 0);
});
