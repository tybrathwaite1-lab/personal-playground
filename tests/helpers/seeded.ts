/**
 * Deterministic randomness for planner tests (M2-3).
 *
 * The planner takes a `rand` function. Tests used to pass `Math.random`, so every run explored
 * different choices and a failure could not be reproduced. Tests now pass a seeded generator:
 * the same seed always gives the same sequence, every run explores the same 40 seeds, and a
 * failure names its seed.
 *
 * To reproduce a failure, run the reported seed alone: `forEachSeed(fn, [seed])` or
 * `fn(seeded(seed), seed)`.
 */

/** mulberry32: a small, well-known 32-bit PRNG. Returns floats in [0, 1), like Math.random. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 40 fixed seeds every repeated planner test runs (spread across the 32-bit range). */
export const SEEDS: readonly number[] = Object.freeze(Array.from({ length: 40 }, (_, i) => (Math.imul(i + 1, 0x9e3779b1) >>> 0)));

/** A distinct, fixed seed for iteration `i` of a longer property loop. */
export const iterationSeed = (i: number): number => (SEEDS[i % SEEDS.length] ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0;

/** Rethrows `err` with the seed (and iteration, when given) needed to reproduce it. */
export function withSeed<T>(seed: number, fn: () => T, iteration?: number): T {
  try {
    return fn();
  } catch (err) {
    const where = iteration === undefined ? `seed ${seed}` : `iteration ${iteration}, seed ${seed}`;
    const msg = err instanceof Error ? err.message : String(err);
    const e = new Error(`${where} (reproduce with seeded(${seed})): ${msg}`, { cause: err });
    throw e;
  }
}

/** Runs `fn` once per seed (default: all 40), each with its own seeded generator. */
export function forEachSeed(fn: (rand: () => number, seed: number) => void, seeds: readonly number[] = SEEDS): void {
  for (const seed of seeds) withSeed(seed, () => fn(seeded(seed), seed));
}
