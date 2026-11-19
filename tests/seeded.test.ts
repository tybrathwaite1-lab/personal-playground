/**
 * M2-3: the seeded randomness used by planner tests (tests/helpers/seeded.ts) is deterministic,
 * explores the planner's random choices, and reports the seed needed to reproduce a failure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { SEED_PLACES } from '../src/data/places.ts';
import { COMMUNITIES } from '../src/data/communities.ts';
import { EMPTY_DATA } from '../src/utils/storage.ts';
import { buildAdventure, type AdventureOptions } from '../src/utils/adventure.ts';
import { forEachSeed, iterationSeed, SEEDS, seeded, withSeed } from './helpers/seeded.ts';

const NOW = Date.parse('2026-11-17T19:00:00Z');
const base: AdventureOptions = {
  date: '2026-11-21', slot: 'afternoon', hours: 4, company: 'partner', budget: 'any', energy: 'any',
  radius: 10, transport: 'car', atmosphere: 'any', weather: 'any', familiarity: 'mix', indoorDay: false,
};
const inp = () => ({ places: SEED_PLACES, events: [], communities: COMMUNITIES, data: structuredClone(EMPTY_DATA) });

test('a seed always produces the same sequence; different seeds differ; values are in [0, 1)', () => {
  const take = (seed: number, n = 1000) => {
    const r = seeded(seed);
    return Array.from({ length: n }, r);
  };
  assert.deepEqual(take(12345), take(12345));
  assert.notDeepEqual(take(12345, 10), take(12346, 10));
  for (const v of take(SEEDS[0], 10_000)) assert.ok(v >= 0 && v < 1, String(v));
  // Pinned first values: a change to the generator would silently change every seeded test.
  assert.deepEqual(take(1, 3).map((v) => v.toFixed(10)), ['0.6270739406', '0.0027357212', '0.5274470400']);
});

test('there are 40 distinct fixed seeds, and property loops get distinct per-iteration seeds', () => {
  assert.equal(SEEDS.length, 40);
  assert.equal(new Set(SEEDS).size, 40);
  assert.ok(Object.isFrozen(SEEDS));
  assert.equal(new Set(Array.from({ length: 600 }, (_, i) => iterationSeed(i))).size, 600);
});

test('a failure names the seed (and iteration) needed to reproduce it', () => {
  const bad = SEEDS[7];
  assert.throws(
    () => forEachSeed((_rand, seed) => assert.notEqual(seed, bad, 'planner broke')),
    (e: Error) => {
      assert.match(e.message, new RegExp(`^seed ${bad} \\(reproduce with seeded\\(${bad}\\)\\): planner broke`));
      assert.ok(e.cause instanceof assert.AssertionError, 'original assertion kept as the cause');
      return true;
    },
  );
  assert.throws(() => withSeed(iterationSeed(42), () => assert.fail('boom'), 42), new RegExp(`^Error: iteration 42, seed ${iterationSeed(42)} \\(reproduce with seeded\\(${iterationSeed(42)}\\)\\): boom`));
  // Reproduction: running only the reported seed fails the same way.
  assert.throws(() => forEachSeed((_r, seed) => assert.notEqual(seed, bad), [bad]), new RegExp(`seed ${bad}`));
});

test('the 40 seeds explore the planner’s random choices (not one path repeated)', () => {
  // buildAdventure takes the timed pool when rand() < 0.65: both sides must be exercised.
  const first = SEEDS.map((s) => seeded(s)());
  assert.ok(first.some((v) => v < 0.65) && first.some((v) => v >= 0.65), 'both branches of the 0.65 split');
  const primaries = new Set<string>();
  forEachSeed((rand) => {
    const a = buildAdventure(inp(), base, rand, NOW);
    if (a) primaries.add(a.primary.key);
  });
  assert.ok(primaries.size >= 10, `only ${primaries.size} distinct primary picks across 40 seeds`);
});

test('repeated execution gives identical plans, in this process and in a fresh one', () => {
  const all = () => {
    const out: unknown[] = [];
    forEachSeed((rand) => out.push(buildAdventure(inp(), base, rand, NOW)));
    return JSON.stringify(out);
  };
  const a = all();
  assert.equal(all(), a, 'same process');
  // A separate Node process (fresh module state) produces the same plans.
  const script = [
    "import { SEED_PLACES } from './src/data/places.ts';",
    "import { COMMUNITIES } from './src/data/communities.ts';",
    "import { EMPTY_DATA } from './src/utils/storage.ts';",
    "import { buildAdventure } from './src/utils/adventure.ts';",
    "import { forEachSeed } from './tests/helpers/seeded.ts';",
    `const base = ${JSON.stringify(base)};`,
    'const out = [];',
    `forEachSeed((rand) => out.push(buildAdventure({ places: SEED_PLACES, events: [], communities: COMMUNITIES, data: structuredClone(EMPTY_DATA) }, base, rand, ${NOW})));`,
    'process.stdout.write(JSON.stringify(out));',
  ].join('\n');
  const env: NodeJS.ProcessEnv = { ...process.env, TSX_TSCONFIG_PATH: 'tsconfig.app.json' };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, a, 'fresh process');
});

test('negative: a planner regression that only some random choices reach is caught, with its seed', () => {
  // Stand-in for a real regression: a planner that ignores the budget whenever its random
  // draw falls in a narrow band. Under Math.random a run might miss it; the fixed seeds don't.
  const leaky = (rand: () => number) => (rand() < 0.1 ? { cost: 60 } : { cost: 10 });
  assert.throws(
    () => forEachSeed((rand) => assert.ok(leaky(rand).cost <= 25, 'over budget')),
    /^Error: seed \d+ \(reproduce with seeded\(\d+\)\): over budget/,
  );
});
