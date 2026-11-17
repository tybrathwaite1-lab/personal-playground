import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIcs, zonedToIso } from '../src/utils/ics.ts';
import { dedupe, inRange, isExpired, normalizeIcs, nyDate, viewRange, formatWhen } from '../src/utils/pulse.ts';
import type { PulseEvent } from '../src/types/pulse.ts';

const ics = readFileSync(new URL('./fixtures/sample.ics', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-17T19:00:00Z'); // Tue 2pm New York

test('time zones: EST/EDT wall clock converts correctly', () => {
  assert.equal(zonedToIso(2026, 12, 12, 17, 0, 0, 'America/New_York'), '2026-12-12T17:00:00-05:00');
  assert.equal(zonedToIso(2026, 7, 4, 21, 0, 0, 'America/New_York'), '2026-07-04T21:00:00-04:00');
  assert.equal(nyDate(Date.parse('2026-11-18T03:30:00Z')), '2026-11-17'); // 10:30pm NY is still the 17th
});

test('parses, unfolds, unescapes and normalizes feed items', () => {
  const raw = parseIcs(ics);
  assert.equal(raw.length, 5);
  assert.equal(raw[0].location, 'Warehouse Arts District, 2nd Ave S, Saint Petersburg, FL, 33712, United States');
  const ev = raw.map((e) => normalizeIcs(e, 'spaa', new Date(NOW).toISOString())).filter(Boolean) as PulseEvent[];
  assert.equal(ev.length, 4, 'gala luncheon excluded');
  const walk = ev.find((e) => e.title === 'Second Saturday ArtWalk')!;
  assert.equal(walk.city, 'St. Petersburg');
  assert.equal(walk.free, true);
  assert.ok(walk.categories.includes('Art & exhibitions'));
  assert.equal(walk.address, '2nd Ave S, Saint Petersburg, FL, 33712');
  const expo = ev.find((e) => e.title.startsWith('Retro Futures'))!;
  assert.equal(expo.ongoing, true);
  assert.match(expo.priceNote!, /\$15/);
  const tourney = ev.find((e) => e.title === 'Tekken 8 Tournament')!;
  assert.equal(tourney.cancelled, true);
  assert.equal(tourney.city, 'Tampa');
  assert.ok(tourney.miles! > 10);
  const old = ev.find((e) => e.title === 'Old Thing')!;
  assert.ok(isExpired(old, NOW));
  assert.ok(!isExpired(walk, NOW));
});

test('views and ongoing exhibitions bucket by New York date', () => {
  const ev = parseIcs(ics).map((e) => normalizeIcs(e, 'spaa', '')).filter(Boolean) as PulseEvent[];
  const expo = ev.find((e) => e.ongoing)!;
  assert.ok(inRange(expo, viewRange('today', NOW)), 'running exhibitions show today');
  const walk = ev.find((e) => e.title === 'Second Saturday ArtWalk')!;
  assert.ok(!inRange(walk, viewRange('week', NOW)));
  assert.ok(inRange(walk, viewRange('upcoming', NOW)));
  assert.deepEqual(viewRange('weekend', NOW), ['2026-11-20', '2026-11-22']);
  assert.deepEqual(viewRange('weekend', Date.parse('2026-11-21T15:00:00Z')), ['2026-11-21', '2026-11-22']);
  assert.match(formatWhen(walk), /Sat, Dec 12 · 5 PM–9 PM/);
});

test('dedupe merges the same event from two sources', () => {
  const ev = parseIcs(ics).map((e) => normalizeIcs(e, 'spaa', '')).filter(Boolean) as PulseEvent[];
  const twin = { ...ev[0], id: 'mfa:x', sourceIds: ['mfa'], description: undefined };
  const out = dedupe([ev[0], twin]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sourceIds.sort(), ['mfa', 'spaa']);
});
