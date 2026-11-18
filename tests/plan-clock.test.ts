/**
 * PP-004 final-verification tests (ChatGPT review of #22): overnight events and calendar-day
 * context, same-day plans after things have started, what the estimates include, and neutral
 * plan-level notes vs. real conflict warnings. Synthetic data, plus the public seed data for the
 * property test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_PLACES } from '../src/data/places.ts';
import { COMMUNITIES } from '../src/data/communities.ts';
import {
  LEAD_MINUTES,
  buildAdventure,
  candidates,
  clockLabel,
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

let n = 0;
const ev = (o: Partial<PulseEvent>): PulseEvent => ({
  id: `src:${++n}`, title: `Synthetic ${n}`, start: '2026-11-21T19:00:00-05:00', end: '2026-11-21T20:00:00-05:00', allDay: false, ongoing: false,
  venue: 'Hall', city: 'St. Petersburg', tags: [], categories: [`Cat ${n}`], cancelled: false, sourceIds: ['src'], verifiedAt: '2026-11-17T00:00:00Z', ...o,
});
const base: AdventureOptions = {
  date: '2026-11-21', slot: 'evening', hours: 6, company: 'solo', budget: 'any', energy: 'any',
  radius: 40, transport: 'car', atmosphere: 'any', weather: 'any', familiarity: 'mix', indoorDay: false,
};
const EARLIER = Date.parse('2026-11-17T12:00:00Z'); // planning days ahead
const at = (ny: string) => Date.parse(`2026-11-21T${ny}:00-05:00`); // "now" on the plan date
const inp = (events: PulseEvent[], places: Place[] = [], communities: Community[] = []) => ({ places, events, communities, data: structuredClone(EMPTY_DATA) });
const runs = (fn: () => void, times = 40) => {
  for (let i = 0; i < times; i++) fn();
};
const lateFriendly = SEED_PLACES.filter((p) => ['Arcades', 'Tea houses and cafés'].includes(p.categories[0]));
const walk = (o: Partial<Community> = {}): Community => ({
  id: 'com-walk', name: 'Synthetic Walk', kind: 'Walk', description: '', schedule: 'Saturdays 5–9 PM', cadence: 'weekly',
  rules: [{ weekday: 6, start: '17:00', end: '21:00' }], city: 'St. Petersburg', website: 'https://example.org', costNote: 'Free',
  interests: [], company: ['solo', 'partner', 'friends'], status: 'verified', verifiedOn: '2026-11-17', sourceNote: 'synthetic', ...o,
});

// ─── 1. Overnight events and calendar-day context ─────────────────────

test('a timed event belongs to the day it starts: last night’s 10 PM–2 AM event is not tonight’s plan', () => {
  const lastNight = ev({ start: '2026-11-20T22:00:00-05:00', end: '2026-11-21T02:00:00-05:00' });
  assert.equal(candidates(inp([lastNight]), base, EARLIER).length, 0, 'not offered on Nov 21');
  assert.equal(candidates(inp([lastNight]), { ...base, date: '2026-11-20' }, EARLIER).length, 1, 'offered on Nov 20');
});

test('multi-day and all-day listings still appear on every day they span', () => {
  const show = ev({ start: '2026-11-19T00:00:00-05:00', end: '2026-11-30T00:00:00-05:00', ongoing: true });
  const fair = ev({ start: '2026-11-21T00:00:00-05:00', end: '2026-11-22T00:00:00-05:00', allDay: true });
  const day = { ...base, slot: 'afternoon' as const };
  assert.equal(candidates(inp([show, fair]), day, EARLIER).length, 2);
});

test('an overnight event keeps its calendar context: “ends next day”, and the clock runs past midnight', () => {
  const late = ev({ start: '2026-11-21T23:00:00-05:00', end: '2026-11-22T01:00:00-05:00' });
  const s = eventStop(late, '2026-11-21');
  assert.equal(s.time, '11:00 PM–1:00 AM (ends next day)');
  assert.deepEqual(s.window, { kind: 'fixed', earliest: 23 * 60, latest: 23 * 60, end: 25 * 60 });
  const a = buildAdventure(inp([late]), { ...base, anchor: `event:${late.id}` }, Math.random, EARLIER)!;
  assert.equal(a.time.end, 25 * 60);
  assert.equal(clockLabel(a.time.end!), '1 AM (next day)');
  // Measured on another day's clock, a 12:30 AM start keeps its day: 24 h + 30 min after the 21st began.
  const afterMidnight = ev({ start: '2026-11-22T00:30:00-05:00', end: '2026-11-22T01:30:00-05:00' });
  assert.equal(eventStop(afterMidnight, '2026-11-21').window?.earliest, 24 * 60 + 30);
  assert.equal(eventStop(afterMidnight, '2026-11-22').window?.earliest, 30);
});

test('nothing is scheduled after a late event that would run past midnight', () => {
  const late = ev({ start: '2026-11-21T21:30:00-05:00', end: '2026-11-21T23:30:00-05:00' });
  runs(() => assert.equal(buildAdventure(inp([late], lateFriendly), { ...base, anchor: `event:${late.id}` }, Math.random, EARLIER)!.secondary, undefined));
  // ...but a place BEFORE an evening event is fine (the place is anchored, the event follows).
  const show = ev({ start: '2026-11-21T20:30:00-05:00', end: '2026-11-21T22:00:00-05:00' });
  const cafe = lateFriendly.find((p) => p.categories[0] === 'Tea houses and cafés')!;
  const sch = schedule(placeStop(cafe), eventStop(show, '2026-11-21'), 'car', planClock(base, EARLIER))!;
  assert.ok(sch, 'café then 8:30 PM show');
  assert.ok(sch.arrivals[0] >= 17 * 60 && sch.end <= 22 * 60);
});

test('a drop-in window that crosses midnight (8 PM – 1 AM) is measured on one clock', () => {
  const c = walk({ rules: [{ weekday: 6, start: '20:00', end: '01:00' }] });
  const s = communityStop(c, '2026-11-21');
  assert.deepEqual(s.window, { kind: 'drop-in', earliest: 20 * 60, latest: 25 * 60 - 45, end: 25 * 60 });
});

test('an anchor on another date is flagged and no same-day timetable is built around it', () => {
  const other = ev({ start: '2026-11-25T19:00:00-05:00', end: '2026-11-25T20:00:00-05:00' });
  const a = buildAdventure(inp([other], lateFriendly), { ...base, anchor: `event:${other.id}` }, Math.random, EARLIER)!;
  assert.match(a.warnings.join(' '), /isn’t on the date you chose \(2026-11-25\)/);
  assert.equal(a.secondary, undefined);
  assert.equal(a.time.start, undefined);
});

// ─── 2. Same-day plans after things have started ──────────────────────

test('same day: a fixed-start event that has begun, or starts too soon to reach, is not offered', () => {
  const started = ev({ start: '2026-11-21T19:00:00-05:00', end: '2026-11-21T21:00:00-05:00' });
  const tooSoon = ev({ start: '2026-11-21T20:10:00-05:00', end: '2026-11-21T21:00:00-05:00' });
  const reachable = ev({ start: '2026-11-21T20:45:00-05:00', end: '2026-11-21T21:45:00-05:00' });
  const keys = candidates(inp([started, tooSoon, reachable]), base, at('20:00')).map((s) => s.key);
  assert.deepEqual(keys, [`event:${reachable.id}`]);
  assert.equal(LEAD_MINUTES, 30);
});

test('same day: anchoring an event that already started is allowed but warned about', () => {
  const started = ev({ start: '2026-11-21T19:00:00-05:00', end: '2026-11-21T21:00:00-05:00' });
  const a = buildAdventure(inp([started], lateFriendly), { ...base, anchor: `event:${started.id}` }, Math.random, at('20:00'))!;
  assert.match(a.warnings.join(' '), /it already started at 7 PM/);
  assert.equal(a.secondary, undefined, 'no timetable built on an impossible arrival');
  const soon = ev({ start: '2026-11-21T20:10:00-05:00', end: '2026-11-21T21:00:00-05:00' });
  const b = buildAdventure(inp([soon]), { ...base, anchor: `event:${soon.id}` }, Math.random, at('20:00'))!;
  assert.match(b.warnings.join(' '), /starts at 8:10 PM — probably too soon to get there/);
});

test('same day: a drop-in already under way can still be joined, for a shorter visit', () => {
  const c = walk();
  const at7 = candidates(inp([], [], [c]), base, at('19:00')).find((s) => s.community)!;
  assert.ok(at7, 'joinable at 7 PM (5–9 PM window)');
  const a = buildAdventure(inp([], [], [c]), base, Math.random, at('19:00'))!;
  assert.equal(a.time.start, 19 * 60 + 30, 'arrive at now + lead');
  assert.equal(a.time.stops, 90, 'visit cut to the 9 PM close');
  assert.equal(candidates(inp([], [], [c]), base, at('20:30')).length, 0, 'too late to join at 8:30 PM');
});

test('fixed starts and drop-in windows are told apart', () => {
  assert.equal(eventStop(ev({}), '2026-11-21').window?.kind, 'fixed');
  assert.equal(communityStop(walk(), '2026-11-21').window?.kind, 'drop-in');
  assert.equal(communityStop(walk({ rules: [{ weekday: 6, start: '18:00' }] }), '2026-11-21').window?.kind, 'fixed');
  assert.equal(placeStop(lateFriendly[0]).window, undefined, 'places are flexible');
});

test('same day: a part of today that is already over offers nothing', () => {
  const clock = planClock({ ...base, slot: 'morning' }, at('20:00'));
  assert.equal(clock.over, true);
  assert.equal(candidates(inp([], SEED_PLACES), { ...base, slot: 'morning' }, at('20:00')).length, 0);
  assert.equal(buildAdventure(inp([], SEED_PLACES), { ...base, slot: 'morning' }, Math.random, at('20:00')), null);
  // Planned on an earlier day, the same morning is fine.
  assert.ok(candidates(inp([], SEED_PLACES), { ...base, slot: 'morning' }, EARLIER).length > 0);
});

test('same day: flexible places start no earlier than now + lead', () => {
  runs(() => {
    const a = buildAdventure(inp([], lateFriendly), base, Math.random, at('18:40'));
    if (a?.time.start !== undefined) assert.ok(a.time.start >= 18 * 60 + 40 + LEAD_MINUTES, String(a.time.start));
  });
});

test('property: same-day plans never arrive before now + lead, never place a stop past midnight, never miss a fixed start', () => {
  for (let i = 0; i < 500; i++) {
    const hh = 6 + (i % 17);
    const now = at(`${String(hh).padStart(2, '0')}:${i % 2 ? '15' : '45'}`);
    const o: AdventureOptions = { ...base, slot: (['morning', 'afternoon', 'evening'] as const)[i % 3], hours: ([2, 4, 6] as const)[i % 3], transport: (['car', 'walk', 'bike', 'transit'] as const)[i % 4], date: '2026-12-12', radius: 20 };
    const nowOn = now + (Date.parse('2026-12-12T12:00:00Z') - Date.parse('2026-11-21T12:00:00Z'));
    const a = buildAdventure({ places: SEED_PLACES, events: [], communities: COMMUNITIES, data: structuredClone(EMPTY_DATA) }, o, Math.random, nowOn);
    if (!a || a.time.start === undefined) continue;
    const clock = planClock(o, nowOn);
    assert.ok(a.time.start >= clock.floor, `start ${a.time.start} < floor ${clock.floor}`);
    const sch = schedule(a.primary, a.secondary, o.transport, clock)!;
    assert.ok(sch, 'the chosen plan is schedulable');
    sch.arrivals.forEach((t, k) => {
      const s = [a.primary, a.secondary][k]!;
      if (s.window) assert.ok(t <= s.window.latest, `${s.title} arrival after its last entry`);
      else assert.ok(t + s.minutes <= 24 * 60, `${s.title} runs past midnight`);
    });
  }
});

// ─── 3. What the estimates include ───────────────────────────────────

test('the plan says what time and cost leave out, per way of getting around', () => {
  const e = ev({});
  const car = buildAdventure(inp([e]), { ...base, anchor: `event:${e.id}` }, Math.random, EARLIER)!;
  assert.deepEqual(
    { ...car.scope, note: undefined },
    { travelToFirstStop: false, returnTrip: false, transportCost: false, foodTime: false, foodCost: false, note: undefined },
  );
  assert.equal(
    car.scope.note,
    'Time counts the stops and getting between them — not getting to the first stop, getting home or the food stop. Cost is per-person admission only — no parking, gas or food.',
  );
  const bus = buildAdventure(inp([e]), { ...base, transport: 'transit', anchor: `event:${e.id}` }, Math.random, EARLIER)!;
  assert.match(bus.scope.note, /no fares or food\./);
  const foot = buildAdventure(inp([e]), { ...base, slot: 'afternoon', hours: 2, transport: 'walk', anchor: `event:${e.id}` }, Math.random, EARLIER)!;
  assert.equal(foot.food, undefined);
  assert.equal(foot.scope.note, 'Time counts the stops and getting between them — not getting to the first stop or getting home. Cost is per-person admission only.');
});

// ─── 4. Neutral plan-level notes vs. real conflicts ──────────────────

test('missing company/energy info is ONE neutral plan-level note, never a warning', () => {
  const a1 = ev({ start: '2026-11-21T17:30:00-05:00', end: '2026-11-21T18:30:00-05:00' });
  const a2 = ev({ start: '2026-11-21T19:30:00-05:00', end: '2026-11-21T20:30:00-05:00' });
  runs(() => {
    const a = buildAdventure(inp([a1, a2]), { ...base, company: 'partner', energy: 'high', anchor: `event:${a1.id}` }, Math.random, EARLIER)!;
    assert.ok(a.secondary, 'two events');
    assert.deepEqual(a.warnings, []);
    const notes = a.info.filter((x) => /who it suits/.test(x));
    assert.equal(notes.length, 1, 'one line for the whole plan');
    assert.equal(notes[0], 'Not every listing says how active it is or who it suits best, so those preferences were only applied where it does.');
  });
});

test('real conflicts stay prominent warnings alongside the neutral note', () => {
  const pricey = ev({ priceNote: '$60', priceMin: 60, priceMax: 60 } as Partial<PulseEvent>);
  const a = buildAdventure(inp([pricey]), { ...base, company: 'friends', budget: 'u25', anchor: `event:${pricey.id}` }, Math.random, EARLIER)!;
  assert.match(a.warnings.join(' '), /over your budget/);
  assert.ok(a.info.some((x) => /who it suits best/.test(x)));
  assert.ok(!a.warnings.some((x) => /who it suits/.test(x)));
});
