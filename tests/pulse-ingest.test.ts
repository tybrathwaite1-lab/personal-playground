/**
 * M2-5: the Local Pulse ingest's decisions (scripts/pulse/assemble.ts, extracted unchanged from
 * scripts/pulse/ingest.ts): which events are kept, carried over or dropped when sources
 * succeed, return nothing, or fail; and how the previous pulse.json is used. Synthetic feeds
 * and a fixed clock only — no network. Existing normalization, de-duplication and price
 * parsing are covered in pulse.test.ts, pulse-dedupe.test.ts and pulse-price.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assemblePulse, sourceResult } from '../scripts/pulse/assemble.ts';
import type { PulseFile } from '../src/types/pulse.ts';
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

test('characterization: carried listings are not held to the horizon, and an unparseable start never expires', () => {
  // A fresh read drops events starting 120+ days ahead; carried ones are only checked for
  // expiry. A carried listing came from a previous run's horizon, so in practice it can only
  // be beyond today's horizon if the previous file was produced differently. An invalid start
  // makes isExpired false (NaN), so such a listing would be carried indefinitely.
  const prev = previousFile([prevEvent('alpha:far', ['alpha'], 200 * DAY), { ...prevEvent('alpha:garbled', ['alpha'], DAY), start: 'not a date' }]);
  const r = sourceResult(A, { ok: false, error: 'HTTP 403' }, prev, NOW);
  assert.deepEqual(r.events.map((e) => e.id), ['alpha:far', 'alpha:garbled']);
  // The fresh path drops the same far-future listing.
  assert.deepEqual(sourceResult(A, feed(at(200 * DAY)), null, NOW).events, []);
});

test('characterization (defect): a previous file without a sources array throws, which stops the whole ingest', () => {
  // ingest.ts reads `previous?.sources.find(...)` for every source, before its error handling.
  // loadPrevious only checks that the previous file is JSON, so JSON of another shape makes
  // this throw; main() then logs "Pulse ingest crashed" and writes no pulse.json at all, so
  // fresh results from healthy sources are lost too (the build continues; the app falls back).
  for (const bad of [{ events: [] }, { sources: {}, events: [] }, { sources: null, events: [] }] as unknown as PulseFile[])
    assert.throws(() => sourceResult(A, feed(at(DAY)), bad, NOW), TypeError, JSON.stringify(bad));
  // Carried listings without sourceIds throw on the failure path only.
  const noIds = { ...previousFile([]), events: [{ id: 'x', title: 'x', start: NOW.toISOString() }] } as unknown as PulseFile;
  assert.equal(sourceResult(A, feed(at(DAY)), noIds, NOW).source.ok, true, 'a successful read never looks at previous events');
  assert.throws(() => sourceResult(A, { ok: false, error: 'HTTP 403' }, noIds, NOW), TypeError);
  // A previous file with no events, or a missing source entry, is fine.
  assert.equal(sourceResult(A, { ok: false, error: 'HTTP 403' }, { ...previousFile([]), events: undefined } as unknown as PulseFile, NOW).source.stale, false);
  assert.equal(sourceResult(A, { ok: false, error: 'HTTP 403' }, { ...previousFile([]), sources: [] }, NOW).source.lastSuccess, null);
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
  assert.match(src, /import \{ assemblePulse, sourceResult, type FetchOutcome, type SourceResult \} from '\.\/assemble\.ts';/);
  assert.match(src, /const r = sourceResult\(def, outcome, previous, now, REPORT \? report : undefined\);/);
  assert.ok(!src.includes('parseIcs('), 'feeds are parsed once, inside sourceResult');
  assert.match(src, /assemblePulse\(results, now\)/);
  for (const dup of ['isExpired(', 'HORIZON_DAYS', 'dedupe(', 'stale:']) assert.ok(!src.includes(dup), `ingest.ts must not re-implement ${dup}`);
});
