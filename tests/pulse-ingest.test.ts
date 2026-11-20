/**
 * M2-5: the Local Pulse ingest's decisions (scripts/pulse/assemble.ts, extracted unchanged from
 * scripts/pulse/ingest.ts): which events are kept, carried over or dropped when sources
 * succeed, return nothing, or fail; and how the previous pulse.json is used. Synthetic feeds
 * and a fixed clock only — no network. Existing normalization, de-duplication and price
 * parsing are covered in pulse.test.ts, pulse-dedupe.test.ts and pulse-price.test.ts.
 * R1: validation of the previous snapshot (usablePrevious) before anything is carried over.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assemblePulse, sourceResult, usablePrevious } from '../scripts/pulse/assemble.ts';
import { A, at, B, DAY, feed, HOUR, NOW, prevEvent, previousFile, scenario, stamp, titles } from './helpers/pulse-fixtures.ts';

// ─── Successful reads: eligibility and boundaries ───────────────────

test('a successful read keeps upcoming events and reports the source as fresh', () => {
  const r = sourceResult(A, feed(at(2 * HOUR), at(3 * DAY)), null, NOW);
  assert.deepEqual(r.source, { id: 'alpha', name: 'Source alpha', homepage: A.homepage, feed: A.feed, ok: true, lastSuccess: NOW.toISOString(), count: 2 });
  assert.equal(r.inFeed, 2);
  assert.equal(r.events.length, 2);
  for (const e of r.events) {
    assert.deepEqual(e.sourceIds, ['alpha']);
    assert.equal(e.verifiedAt, NOW.toISOString());
    assert.match(e.start, /-05:00$/, 'normalized to New York wall clock');
  }
});

test('expiry boundaries: stated end, start + 3 h, and all-day + 24 h, compared with "now"', () => {
  const r = sourceResult(
    A,
    feed(
      at(-HOUR, { summary: 'ends exactly now', end: stamp(NOW.getTime()) }),
      at(-2 * HOUR, { summary: 'ended a second ago', end: stamp(NOW.getTime() - 1000) }),
      at(-3 * HOUR, { summary: 'started 3h ago, no end' }), // start + 3h == now → not expired
      at(-3 * HOUR - 1000, { summary: 'started 3h 1s ago, no end' }),
      { uid: 'allday-today', summary: 'all day today', start: '20261120', extra: [] },
      { uid: 'allday-yesterday', summary: 'all day yesterday', start: '20261119' },
    ),
    null,
    NOW,
  );
  assert.deepEqual(titles(r.events).sort(), ['all day today', 'ends exactly now', 'started 3h ago, no end']);
});

/** The product policy, pinned here independently of the production constant. */
const POLICY_HORIZON_DAYS = 120;

test('horizon: events starting 120 days or more ahead are left out of a fresh read (checked to the second)', () => {
  // iCalendar times have one-second resolution, so the boundary is tested one second either side.
  const H = POLICY_HORIZON_DAYS * DAY;
  const r = sourceResult(A, feed(at(H - 1000, { summary: 'just inside' }), at(H, { summary: 'exactly at the horizon' }), at(H + DAY, { summary: 'beyond' })), null, NOW);
  assert.deepEqual(titles(r.events), ['just inside']);
  assert.equal(r.inFeed, 3, 'all three were in the feed');
});

test('malformed or incomplete feed items are dropped; the rest of the source is kept', () => {
  const r = sourceResult(
    A,
    feed(
      at(DAY, { summary: 'good' }),
      at(DAY, { uid: 'no-title', summary: undefined }),
      at(DAY, { uid: 'blank-title', summary: '   ' }),
      { uid: 'no-start', summary: 'no start' },
      { uid: 'bad-start', summary: 'bad start', start: 'next tuesday' },
      at(2 * DAY, { uid: 'gala', summary: 'Annual Gala Luncheon' }), // excluded by content policy
      at(3 * DAY, { uid: 'cxl', summary: 'CANCELLED: Poetry night' }),
    ),
    null,
    NOW,
  );
  assert.deepEqual(titles(r.events).sort(), ['Poetry night', 'good']);
  assert.equal(r.events.find((e) => e.title === 'Poetry night')!.cancelled, true, 'cancellations are kept and flagged, not dropped');
  assert.equal(r.source.ok, true);
  assert.equal(r.source.count, 2);
});

test('an empty successful feed is fresh and empty: it does not carry over yesterday’s events', () => {
  const prev = previousFile([prevEvent('alpha:x', ['alpha'], DAY)]);
  const r = sourceResult(A, feed(), prev, NOW);
  assert.equal(r.source.ok, true);
  assert.equal(r.source.count, 0);
  assert.equal(r.source.stale, undefined);
  assert.deepEqual(r.events, []);
});

// ─── Failures and carryover ─────────────────────────────────────────

test('HTTP 403 (and other failures) carry over the source’s unexpired events and mark it stale', () => {
  const prev = previousFile([
    prevEvent('alpha:upcoming', ['alpha'], DAY),
    prevEvent('alpha:expired', ['alpha'], -DAY),
    prevEvent('beta:other-source', ['beta'], DAY),
    prevEvent('alpha+beta:shared', ['alpha', 'beta'], 2 * DAY),
  ]);
  const r = sourceResult(A, { ok: false, error: 'HTTP 403' }, prev, NOW);
  assert.deepEqual(r.source, { id: 'alpha', name: 'Source alpha', homepage: A.homepage, feed: A.feed, ok: false, lastSuccess: '2026-11-19T17:00:00.000Z', count: 2, error: 'HTTP 403', stale: true });
  assert.deepEqual(r.events.map((e) => e.id), ['alpha:upcoming', 'alpha+beta:shared']);
  assert.equal(r.events[0].verifiedAt, '2026-11-19T17:00:00.000Z', 'carried listings keep their last verification time');
  for (const error of ['HTTP 404', 'HTTP 500', 'This operation was aborted', 'fetch failed']) {
    const f = sourceResult(A, { ok: false, error }, prev, NOW);
    assert.equal(f.source.error, error);
    assert.equal(f.source.stale, true);
  }
});

test('a body that is not iCalendar (e.g. an HTML block page) is a failure with carryover', () => {
  const prev = previousFile([prevEvent('alpha:upcoming', ['alpha'], DAY)]);
  const r = sourceResult(A, { ok: true, text: '<html><body>Access denied</body></html>' }, prev, NOW);
  assert.equal(r.source.ok, false);
  assert.equal(r.source.error, 'Not an iCalendar feed');
  assert.deepEqual(r.events.map((e) => e.id), ['alpha:upcoming']);
});

test('a failure with nothing to carry over is not stale; with no previous file, lastSuccess is null', () => {
  const none = sourceResult(A, { ok: false, error: 'HTTP 403' }, null, NOW);
  assert.deepEqual(none.events, []);
  assert.equal(none.source.stale, false);
  assert.equal(none.source.lastSuccess, null);
  assert.equal(none.source.count, 0);
  const onlyExpired = sourceResult(A, { ok: false, error: 'HTTP 403' }, previousFile([prevEvent('alpha:old', ['alpha'], -DAY)]), NOW);
  assert.equal(onlyExpired.source.stale, false);
  assert.equal(onlyExpired.source.lastSuccess, '2026-11-19T17:00:00.000Z', 'last success is remembered even with nothing carried');
});

test('partial failure: the failing source carries over, the successful one is kept, and shared listings merge', () => {
  const prev = previousFile([prevEvent('alpha:upcoming', ['alpha'], DAY)]);
  // Beta succeeds with the same event alpha listed yesterday (same title, start and venue).
  const shared = prevEvent('alpha:shared', ['alpha'], 2 * DAY, { title: 'Jazz on the lawn', venue: 'Studio', city: 'St. Petersburg', start: '2026-11-22T12:00:00-05:00' });
  prev.events.push(shared);
  const results = [
    sourceResult(A, { ok: false, error: 'HTTP 403' }, prev, NOW),
    sourceResult(B, feed(at(5 * DAY, { summary: 'Beta only' }), { uid: 'b-jazz', summary: 'Jazz on the lawn', start: '20261122T170000Z', location: 'Studio, St. Petersburg, FL' }), prev, NOW),
  ];
  const { file, listings } = assemblePulse(results, NOW);
  assert.equal(listings, 4);
  assert.deepEqual(file.sources.map((s) => [s.id, s.ok, s.count, s.stale]), [
    ['alpha', false, 2, true],
    ['beta', true, 2, undefined],
  ]);
  assert.deepEqual(titles(file.events), ['Carried alpha:upcoming', 'Jazz on the lawn', 'Beta only'], 'sorted by start; successful results kept');
  assert.deepEqual(file.events.find((e) => e.title === 'Jazz on the lawn')!.sourceIds.sort(), ['alpha', 'beta'], 'carried and fresh copies merge');
  assert.equal(file.generatedAt, NOW.toISOString());
  assert.equal(file.timezone, 'America/New_York');
});

test('all sources failing with no previous file gives an empty, valid file (the app falls back to places)', () => {
  const { file } = assemblePulse([sourceResult(A, { ok: false, error: 'HTTP 403' }, null, NOW), sourceResult(B, { ok: false, error: 'fetch failed' }, null, NOW)], NOW);
  assert.deepEqual(file.events, []);
  assert.deepEqual(file.sources.map((s) => s.ok), [false, false]);
});

// ─── Previous snapshot handling (characterization) ─────────────────

test('characterization: carried listings are not held to the horizon', () => {
  // A fresh read drops events starting 120+ days ahead; carried ones are only checked for
  // expiry. A carried listing came from a previous run's horizon, so in practice it can only
  // be beyond today's horizon if the previous file was produced differently.
  const prev = previousFile([prevEvent('alpha:far', ['alpha'], 200 * DAY)]);
  const r = sourceResult(A, { ok: false, error: 'HTTP 403' }, usablePrevious(prev).file, NOW);
  assert.deepEqual(r.events.map((e) => e.id), ['alpha:far']);
  // The fresh path drops the same far-future listing.
  assert.deepEqual(sourceResult(A, feed(at(200 * DAY)), null, NOW).events, []);
});

// ─── Previous snapshot validation (R1) ──────────────────────────────

const failing = { ok: false as const, error: 'HTTP 403' };

test('a valid previous snapshot passes validation unchanged', () => {
  const prev = previousFile([prevEvent('alpha:a', ['alpha'], DAY, { end: new Date(NOW.getTime() + DAY + HOUR).toISOString(), url: 'https://example.org/a' }), prevEvent('both:b', ['alpha', 'beta'], 2 * DAY)]);
  const { file, dropped } = usablePrevious(structuredClone(prev));
  assert.deepEqual(file, prev);
  assert.deepEqual(dropped, []);
  // Carry-over from it is exactly what it was before validation existed.
  assert.deepEqual(sourceResult(A, failing, file, NOW), sourceResult(A, failing, prev, NOW));
});

test('a previous snapshot that is missing or not an object is treated as absent', () => {
  for (const raw of [null, undefined]) assert.deepEqual(usablePrevious(raw), { file: null, dropped: [] });
  for (const raw of [[], 'pulse', 42, true]) {
    const { file, dropped } = usablePrevious(raw);
    assert.equal(file, null, JSON.stringify(raw));
    assert.deepEqual(dropped, ['the whole file (not an object)']);
  }
  const r = sourceResult(A, failing, usablePrevious([]).file, NOW);
  assert.deepEqual([r.source.ok, r.source.stale, r.source.lastSuccess, r.events], [false, false, null, []]);
});

test('a previous snapshot without usable source or event lists no longer stops the ingest', () => {
  // Before R1 each of these made sourceResult throw a TypeError, and the ingest wrote no pulse.json.
  const events = [prevEvent('alpha:upcoming', ['alpha'], DAY)];
  for (const sources of [undefined, null, {}, 'x']) {
    const { file, dropped } = usablePrevious({ generatedAt: 'x', events, sources });
    assert.deepEqual(file!.sources, [], JSON.stringify(sources));
    assert.ok(dropped.includes('sources (not a list)'));
    const r = sourceResult(A, failing, file, NOW);
    assert.deepEqual(r.events.map((e) => e.id), ['alpha:upcoming'], 'valid events still carried over');
    assert.equal(r.source.lastSuccess, null);
    assert.equal(sourceResult(A, feed(at(DAY)), file, NOW).source.ok, true);
  }
  for (const evs of [undefined, null, {}, 'x']) {
    const { file, dropped } = usablePrevious({ ...previousFile([]), events: evs });
    assert.deepEqual(file!.events, []);
    assert.ok(dropped.includes('events (not a list)'));
    assert.equal(sourceResult(A, failing, file, NOW).source.lastSuccess, '2026-11-19T17:00:00.000Z', 'valid sources still used');
  }
});

test('invalid previous entries are left out; valid ones are carried over with their attribution', () => {
  const good = prevEvent('alpha:good', ['alpha'], DAY);
  const shared = prevEvent('both:shared', ['alpha', 'beta'], 2 * DAY);
  const bad: [unknown, string][] = [
    [null, 'not an object'],
    ['alpha:string', 'not an object'],
    [{ ...good, id: undefined }, 'no id'],
    [{ ...good, id: '' }, 'no id'],
    [{ ...good, title: undefined }, 'no title'],
    [{ ...good, start: 'not a date' }, 'unreadable start'],
    [{ ...good, start: undefined }, 'unreadable start'],
    [{ ...good, end: 'soon' }, 'unreadable end'],
    [{ ...good, allDay: 'no' }, 'no allDay flag'],
    [{ ...good, sourceIds: undefined }, 'no sourceIds'],
    [{ ...good, sourceIds: 'alpha' }, 'no sourceIds'],
    [{ ...good, sourceIds: [] }, 'no sourceIds'],
    [{ ...good, sourceIds: ['alpha', 7] }, 'no sourceIds'],
    [{ ...good, tags: null }, 'invalid tags or categories'],
    [{ ...good, categories: 'Music' }, 'invalid tags or categories'],
  ];
  const raw = { ...previousFile([]), events: [good, ...bad.map(([e]) => e), shared] };
  const { file, dropped } = usablePrevious(raw);
  assert.deepEqual(file!.events, [good, shared]);
  const expected = new Map<string, number>();
  for (const [, why] of bad) expected.set(`event: ${why}`, (expected.get(`event: ${why}`) ?? 0) + 1);
  assert.deepEqual(dropped, [...expected].map(([w, n]) => `${w} ×${n}`));

  const a = sourceResult(A, failing, file, NOW);
  const b = sourceResult(B, failing, file, NOW);
  assert.deepEqual(a.events.map((e) => e.id), ['alpha:good', 'both:shared']);
  assert.deepEqual(b.events.map((e) => e.id), ['both:shared'], 'a shared listing is carried for each of its sources');
  assert.deepEqual(a.events[1].sourceIds, ['alpha', 'beta'], 'attribution unchanged');
  assert.equal(a.source.stale, true);
});

test('unreadable dates can no longer keep a listing alive forever; expiry still applies to valid ones', () => {
  // isExpired() is false for an unreadable date, so before R1 such a listing was carried on every failing run.
  const raw = previousFile([{ ...prevEvent('alpha:garbled', ['alpha'], DAY), start: 'not a date' }, prevEvent('alpha:expired', ['alpha'], -DAY), prevEvent('alpha:ok', ['alpha'], DAY)]);
  const r = sourceResult(A, failing, usablePrevious(raw).file, NOW);
  assert.deepEqual(r.events.map((e) => e.id), ['alpha:ok']);
});

test('invalid source entries are left out, and an unreadable lastSuccess is forgotten rather than reported', () => {
  const p = previousFile([prevEvent('alpha:x', ['alpha'], DAY)]);
  const raw = { ...p, sources: [null, { name: 'no id' }, { ...p.sources[0], lastSuccess: 'yesterday' }, p.sources[1]] };
  const { file, dropped } = usablePrevious(raw);
  assert.deepEqual(file!.sources.map((s) => [s.id, s.lastSuccess]), [['alpha', null], ['beta', '2026-11-19T17:00:00.000Z']]);
  assert.deepEqual(dropped, ['source: no id ×2', 'source: unreadable lastSuccess ×1']);
  assert.equal(sourceResult(A, failing, file, NOW).source.lastSuccess, null);
  assert.equal(sourceResult(B, failing, file, NOW).source.lastSuccess, '2026-11-19T17:00:00.000Z');
});

// ─── Determinism ────────────────────────────────────────────────────

test('repeated runs give identical output, in this process and in other time zones', () => {
  const a = JSON.stringify(scenario());
  assert.equal(JSON.stringify(scenario()), a);
  // The same fixed inputs in a fresh process with a different system time zone: the ingest's
  // New York assumptions don't depend on where it runs.
  const script = "import { scenario } from './tests/helpers/pulse-fixtures.ts'; process.stdout.write(JSON.stringify(scenario()));";
  const env: NodeJS.ProcessEnv = { ...process.env, TSX_TSCONFIG_PATH: 'tsconfig.app.json' };
  delete env.NODE_TEST_CONTEXT;
  for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', env: { ...env, TZ: tz } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, a, `TZ=${tz}`);
  }
});

test('report mode: price-evidence errors are source failures with carryover, as before the extraction', () => {
  const prev = previousFile([prevEvent('alpha:upcoming', ['alpha'], DAY)]);
  let seen = 0;
  const ok = sourceResult(A, feed(at(DAY), at(2 * DAY)), prev, NOW, (raw) => (seen = raw.length));
  assert.equal(seen, 2, 'the hook receives the parsed feed');
  assert.equal(ok.source.ok, true);
  const failing = sourceResult(A, feed(at(DAY)), prev, NOW, () => {
    throw new Error('price evidence failed');
  });
  assert.deepEqual([failing.source.ok, failing.source.error, failing.source.stale], [false, 'price evidence failed', true]);
  assert.deepEqual(failing.events.map((e) => e.id), ['alpha:upcoming'], 'carried over, exactly as for a fetch failure');
  // The hook is not run for failed fetches or unparseable bodies.
  let calls = 0;
  sourceResult(A, { ok: false, error: 'HTTP 403' }, prev, NOW, () => calls++);
  sourceResult(A, { ok: true, text: '<html></html>' }, prev, NOW, () => calls++);
  assert.equal(calls, 0);
});

test('ingest.ts delegates its decisions to the tested functions (no second copy of the rules)', () => {
  const src = readFileSync('scripts/pulse/ingest.ts', 'utf8');
  assert.match(src, /import \{ assemblePulse, sourceResult, usablePrevious, type FetchOutcome, type SourceResult \} from '\.\/assemble\.ts';/);
  assert.match(src, /const \{ file, dropped \} = usablePrevious\(raw\);/, 'the previous snapshot is validated before use');
  assert.ok(!/as PulseFile\)/.test(src), 'no unchecked cast of the previous snapshot');
  assert.match(src, /const r = sourceResult\(def, outcome, previous, now, REPORT \? report : undefined\);/);
  assert.ok(!src.includes('parseIcs('), 'feeds are parsed once, inside sourceResult');
  assert.match(src, /assemblePulse\(results, now\)/);
  for (const dup of ['isExpired(', 'HORIZON_DAYS', 'dedupe(', 'stale:']) assert.ok(!src.includes(dup), `ingest.ts must not re-implement ${dup}`);
});
