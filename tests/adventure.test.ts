import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_PLACES } from '../src/data/places.ts';
import { COMMUNITIES } from '../src/data/communities.ts';
import { EMPTY_DATA } from '../src/utils/storage.ts';
import { buildAdventure, candidates, CATEGORY_PROFILE, type AdventureOptions } from '../src/utils/adventure.ts';
import { milesBetween } from '../src/utils/geo.ts';
import { PLACE_CATEGORIES } from '../src/data/places.ts';

const base: AdventureOptions = {
  date: '2026-11-21', slot: 'afternoon', hours: 4, company: 'partner', budget: 'any', energy: 'any',
  radius: 10, transport: 'car', atmosphere: 'any', weather: 'any', familiarity: 'mix', indoorDay: false,
};
const inp = { places: SEED_PLACES, events: [], communities: COMMUNITIES, data: structuredClone(EMPTY_DATA) };
const NOW = Date.parse('2026-11-17T19:00:00Z');

test('every place category has a profile', () => {
  for (const c of PLACE_CATEGORIES) assert.ok(CATEGORY_PROFILE[c], c);
});

test('adventures are geographically sensible and respect constraints', () => {
  for (let i = 0; i < 300; i++) {
    const o = { ...base, slot: (['morning', 'afternoon', 'evening'] as const)[i % 3], company: (['solo', 'partner', 'friends'] as const)[i % 3], transport: (['car', 'walk', 'bike'] as const)[i % 3] };
    const a = buildAdventure(inp, o, Math.random, NOW);
    if (!a) continue;
    for (const s of [a.primary, a.secondary].filter(Boolean)) {
      assert.ok(!s!.coords || milesBetween({ lat: 27.7676, lon: -82.6403 }, s!.coords) <= o.radius, 'within radius');
      if (s!.place && o.slot === 'evening') assert.ok(!CATEGORY_PROFILE[s!.place.categories[0]].daytimeOnly, `${s!.title} in evening`);
      if (s!.place && o.company === 'partner') assert.ok(CATEGORY_PROFILE[s!.place.categories[0]].date, `${s!.title} on a date`);
    }
    if (a.secondary && a.primary.coords && a.secondary.coords) {
      const hop = milesBetween(a.primary.coords, a.secondary.coords);
      assert.ok(hop <= { car: 12, walk: 1.5, bike: 4, transit: 6 }[o.transport], `hop ${hop}`);
    }
  }
});

test('Tampa is out of the default 10-mile radius but in at 20', () => {
  const near = candidates(inp, base, NOW).filter((s) => s.cityName === 'Tampa');
  assert.equal(near.length, 0);
  const far = candidates(inp, { ...base, radius: 20 }, NOW).filter((s) => s.cityName === 'Tampa');
  assert.ok(far.length > 0);
});

test('free budget only uses places with a known free cost', () => {
  for (const s of candidates(inp, { ...base, budget: 'free' }, NOW)) assert.deepEqual(s.cost, [0, 0], s.title);
});

test('recurring community shows on its date and anchors work', () => {
  const sat = { ...base, date: '2026-12-12', slot: 'evening' as const };
  assert.ok(candidates(inp, sat, NOW).some((s) => s.key === 'community:com-second-saturday'));
  const a = buildAdventure(inp, { ...base, anchor: 'place:pl-weedon' }, Math.random, NOW)!;
  assert.equal(a.primary.key, 'place:pl-weedon');
});
