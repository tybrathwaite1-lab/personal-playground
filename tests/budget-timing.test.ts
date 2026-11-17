/**
 * PP-004 regression tests: outings fit the budget and time together, never overlap,
 * and say out loud what couldn't be checked. Synthetic data only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_PLACES } from '../src/data/places.ts';
import { COMMUNITIES } from '../src/data/communities.ts';
import { buildAdventure, candidates, sequence, eventStop, type AdventureOptions } from '../src/utils/adventure.ts';
import { EMPTY_DATA } from '../src/utils/storage.ts';
import type { Community } from '../src/types/index.ts';
import type { PulseEvent } from '../src/types/pulse.ts';

const NOW = Date.parse('2026-11-17T19:00:00Z');
const base: AdventureOptions = {
  date: '2026-11-21', slot: 'afternoon', hours: 4, company: 'solo', budget: 'any', energy: 'any',
  radius: 40, transport: 'car', atmosphere: 'any', weather: 'any', familiarity: 'mix', indoorDay: false,
};
let n = 0;
const ev = (o: Partial<PulseEvent> & { priceMin?: number; priceMax?: number }): PulseEvent => ({
  id: `src:${++n}`, title: `Synthetic ${n}`, start: '2026-11-21T13:00:00-05:00', end: '2026-11-21T14:00:00-05:00', allDay: false, ongoing: false,
  venue: 'Hall', city: 'St. Petersburg', tags: [], categories: [`Cat ${n}`], cancelled: false, sourceIds: ['src'], verifiedAt: '2026-11-17T00:00:00Z', ...o,
});
const inp = (events: PulseEvent[], communities: Community[] = []) => ({ places: [], events, communities, data: structuredClone(EMPTY_DATA) });
const runs = (fn: () => void, times = 40) => {
  for (let i = 0; i < times; i++) fn();
};
const priced = (min: number, max = min) => ({ priceNote: `$${min}`, priceMin: min, priceMax: max }) as Partial<PulseEvent>;

test('combined budget: two $20 stops never make an "under $25" outing', () => {
  const a = ev({ ...priced(20) });
  const b = ev({ ...priced(20), start: '2026-11-21T15:00:00-05:00', end: '2026-11-21T16:00:00-05:00' });
  runs(() => {
    const adv = buildAdventure(inp([a, b]), { ...base, budget: 'u25', anchor: `event:${a.id}` }, Math.random, NOW)!;
    assert.equal(adv.secondary, undefined);
  });
  const c = ev({ ...priced(5), start: '2026-11-21T15:00:00-05:00', end: '2026-11-21T16:00:00-05:00' });
  const adv = buildAdventure(inp([a, c]), { ...base, budget: 'u25', anchor: `event:${a.id}` }, Math.random, NOW)!;
  assert.equal(adv.secondary?.key, `event:${c.id}`, '$20 + $5 fits');
  assert.equal(adv.cost.min, 25);
});

test('the top of a price range above the budget is disclosed', () => {
  const a = ev({ ...priced(10, 40) });
  const adv = buildAdventure(inp([a]), { ...base, budget: 'u25', anchor: `event:${a.id}` }, Math.random, NOW)!;
  assert.ok(adv.warnings.some((x) => /up to \$40/.test(x)), adv.warnings.join(' | '));
});

test('overlapping timed stops are never paired', () => {
  const a = ev({ start: '2026-11-21T13:00:00-05:00', end: '2026-11-21T15:00:00-05:00' }); // 1–3 PM
  const b = ev({ start: '2026-11-21T14:00:00-05:00', end: '2026-11-21T15:00:00-05:00' }); // 2 PM
  runs(() => assert.equal(buildAdventure(inp([a, b]), { ...base, anchor: `event:${a.id}` }, Math.random, NOW)!.secondary, undefined));
});

test('a later timed stop is paired only if travel fits before it; the wait is counted', () => {
  const a = ev({ start: '2026-11-21T13:00:00-05:00', end: '2026-11-21T15:00:00-05:00' }); // 1–3 PM
  const b = ev({ start: '2026-11-21T15:30:00-05:00', end: '2026-11-21T16:30:00-05:00' }); // 3:30 PM
  // By car the unverified allowance is 25 min → arrive 3:25, wait 5 min.
  assert.deepEqual(sequence(eventStop(a), eventStop(b), 'car'), { travel: 25, wait: 5 });
  // On foot it's 40 min → 3:40, too late for 3:30.
  assert.equal(sequence(eventStop(a), eventStop(b), 'walk'), null);
  const adv = buildAdventure(inp([a, b]), { ...base, anchor: `event:${a.id}` }, Math.random, NOW)!;
  assert.equal(adv.secondary?.key, `event:${b.id}`);
  assert.deepEqual(adv.time, { stops: 180, travel: 25, wait: 5, total: 210, budget: 240, start: 13 * 60, end: 16 * 60 + 30 });
});

test('a timed stop that starts before the first one is never listed second', () => {
  const a = ev({ start: '2026-11-21T15:00:00-05:00', end: '2026-11-21T16:00:00-05:00' });
  const earlier = ev({ start: '2026-11-21T13:00:00-05:00', end: '2026-11-21T14:00:00-05:00' });
  runs(() => assert.equal(buildAdventure(inp([a, earlier]), { ...base, anchor: `event:${a.id}` }, Math.random, NOW)!.secondary, undefined));
});

test('total time including travel must fit — no hidden slack', () => {
  const a = ev({ start: '2026-11-21T13:00:00-05:00', end: '2026-11-21T14:00:00-05:00' }); // 60 min
  const b = ev({ start: '2026-11-21T14:30:00-05:00', end: '2026-11-21T15:30:00-05:00' }); // 60 min
  // 2 hours: 60 + 25 travel + 5 wait + 60 = 150 > 120 (the old rule allowed +30 min over).
  runs(() => assert.equal(buildAdventure(inp([a, b]), { ...base, hours: 2, anchor: `event:${a.id}` }, Math.random, NOW)!.secondary, undefined));
});

test('a primary longer than the time available is never picked at random; an anchored one is flagged', () => {
  const long = ev({ start: '2026-11-21T13:00:00-05:00', end: '2026-11-21T16:00:00-05:00' }); // 3 hr
  runs(() => assert.equal(buildAdventure(inp([long]), { ...base, hours: 2 }, Math.random, NOW), null));
  const adv = buildAdventure(inp([long]), { ...base, hours: 2, anchor: `event:${long.id}` }, Math.random, NOW)!;
  assert.equal(adv.primary.key, `event:${long.id}`);
  assert.ok(adv.warnings.some((x) => /longer than the ~2 hours/.test(x)));
});

const meetup: Community = {
  id: 'com-synthetic', name: 'Synthetic Meetup', kind: 'Meetup', description: '', schedule: 'Saturdays, 5–9 PM', cadence: 'weekly',
  rules: [{ weekday: 6, start: '17:00', end: '21:00' }], city: 'St. Petersburg', website: 'https://example.org', costNote: 'Free',
  interests: [], company: ['solo', 'partner', 'friends'], status: 'verified', verifiedOn: '2026-11-17', sourceNote: 'synthetic',
};

test('a community only appears in the part of the day its published time allows', () => {
  const at = (slot: AdventureOptions['slot']) => candidates(inp([], [meetup]), { ...base, slot }, NOW).some((s) => s.key === 'community:com-synthetic');
  assert.equal(at('morning'), false);
  assert.equal(at('afternoon'), false);
  assert.equal(at('evening'), true);
  // The real Second Saturday ArtWalk (5–9 PM) no longer shows up in a morning plan.
  const sat = { ...base, date: '2026-12-12', radius: 10 };
  assert.ok(!candidates({ ...inp([], COMMUNITIES), places: SEED_PLACES }, { ...sat, slot: 'morning' }, NOW).some((s) => s.key === 'community:com-second-saturday'));
});

test('anchors outside the filters are used but the conflicts are spelled out', () => {
  const other = ev({ start: '2026-11-25T13:00:00-05:00', end: '2026-11-25T14:00:00-05:00', ...priced(60) });
  const adv = buildAdventure(inp([other]), { ...base, budget: 'u25', anchor: `event:${other.id}` }, Math.random, NOW)!;
  assert.equal(adv.primary.key, `event:${other.id}`);
  const note = adv.warnings.join(' ');
  assert.match(note, /isn’t on the date you chose \(2026-11-25\)/);
  assert.match(note, /over your budget/);
});

test('an anchor that no longer exists is disclosed, not silently replaced', () => {
  const a = ev({});
  const adv = buildAdventure(inp([a]), { ...base, anchor: 'event:src:gone' }, Math.random, NOW)!;
  assert.ok(adv.warnings.some((x) => /isn’t listed any more/.test(x)));
});

test('filters listings can’t answer are disclosed; food is never in the estimate', () => {
  const a = ev({});
  const adv = buildAdventure(inp([a]), { ...base, energy: 'high', company: 'partner', anchor: `event:${a.id}` }, Math.random, NOW)!;
  assert.ok(adv.info.some((x) => /how active it is/.test(x) && /who it suits best/.test(x)), adv.info.join(' | '));
  assert.equal(adv.cost.excludesFood, true);
  const unpriced = buildAdventure(inp([ev({})]), { ...base, hours: 6 }, Math.random, NOW)!;
  assert.equal(unpriced.cost.unknown, true);
  assert.ok(unpriced.info.some((x) => /doesn’t list a price/.test(x)));
});

test('property: random plans from the real seed data always fit budget, time and order', () => {
  const caps = { free: 0, u25: 25, u50: 50, u100: 100, any: Infinity } as const;
  for (let i = 0; i < 600; i++) {
    const o: AdventureOptions = {
      ...base,
      date: ['2026-11-21', '2026-12-12', '2026-11-19'][i % 3],
      slot: (['morning', 'afternoon', 'evening'] as const)[i % 3],
      hours: ([2, 4, 6] as const)[i % 3],
      budget: (['free', 'u25', 'u50', 'u100', 'any'] as const)[i % 5],
      transport: (['car', 'walk', 'bike', 'transit'] as const)[i % 4],
      radius: 20,
    };
    const adv = buildAdventure({ places: SEED_PLACES, events: [], communities: COMMUNITIES, data: structuredClone(EMPTY_DATA) }, o, Math.random, NOW);
    if (!adv) continue;
    assert.ok(adv.primary.minutes <= o.hours * 60, 'primary fits');
    if (adv.secondary) {
      assert.ok(adv.time.total <= o.hours * 60, `total ${adv.time.total}`);
      const cap = caps[o.budget];
      if (cap !== Infinity) {
        assert.ok(!adv.cost.unknown);
        assert.ok(cap === 0 ? adv.cost.max === 0 : adv.cost.min <= cap, `cost ${adv.cost.min} > ${cap}`);
      }
      assert.notEqual(sequence(adv.primary, adv.secondary, o.transport), null);
    }
  }
});
