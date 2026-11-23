/**
 * Creative Slice 01: the atmosphere rules. Hour boundaries, Auto vs a manual choice, safe
 * storage (missing, invalid, blocked), and that every atmosphere only ever paints tested surfaces.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATMOSPHERE_KEY,
  ATMOSPHERE_SURFACES,
  ATMOSPHERES,
  atmosphereAt,
  isChoice,
  loadAtmosphereChoice,
  resolveAtmosphere,
  saveAtmosphereChoice,
} from '../src/utils/atmosphere.ts';
import { SURFACES } from '../src/components/graphic/Surface.tsx';
import { MemoryStorage, withStorage } from './helpers/memory-storage.ts';

const at = (h: number, m = 0) => new Date(2026, 10, 21, h, m, 0);

test('atmosphereAt: morning 06:00–10:59, afternoon 11:00–17:59, after hours 18:00–05:59 (local time)', () => {
  const cases: [number, number, string][] = [
    [0, 0, 'after-hours'],
    [5, 59, 'after-hours'],
    [6, 0, 'morning'],
    [10, 59, 'morning'],
    [11, 0, 'afternoon'],
    [17, 59, 'afternoon'],
    [18, 0, 'after-hours'],
    [23, 59, 'after-hours'],
  ];
  for (const [h, m, want] of cases) assert.equal(atmosphereAt(at(h, m)), want, `${h}:${String(m).padStart(2, '0')}`);
  // Every minute of the day maps to exactly one atmosphere, in three contiguous runs.
  const day = Array.from({ length: 24 * 60 }, (_, i) => atmosphereAt(at(Math.floor(i / 60), i % 60)));
  const runs = day.filter((a, i) => i === 0 || a !== day[i - 1]);
  assert.deepEqual(runs, ['after-hours', 'morning', 'afternoon', 'after-hours']);
});

test('Auto follows the clock; a manual choice ignores it', () => {
  assert.equal(resolveAtmosphere('auto', at(7)), 'morning');
  assert.equal(resolveAtmosphere('auto', at(21)), 'after-hours');
  for (const a of ATMOSPHERES) for (const h of [3, 8, 14, 20]) assert.equal(resolveAtmosphere(a.id, at(h)), a.id);
});

test('the choice persists per device; Auto clears it; anything unrecognised reads as Auto', async () => {
  const s = new MemoryStorage();
  await withStorage(s, () => {
    assert.equal(loadAtmosphereChoice(), 'auto', 'nothing stored');
    saveAtmosphereChoice('after-hours');
    assert.equal(s.data.get(ATMOSPHERE_KEY), 'after-hours');
    assert.equal(loadAtmosphereChoice(), 'after-hours');
    saveAtmosphereChoice('auto');
    assert.equal(s.data.has(ATMOSPHERE_KEY), false, 'choosing Auto removes the stored choice');
    for (const bad of ['', 'night', 'AUTO', '{"x":1}', 'null']) {
      s.data.set(ATMOSPHERE_KEY, bad);
      assert.equal(loadAtmosphereChoice(), 'auto', bad);
    }
  });
  assert.equal(isChoice('morning'), true);
  assert.equal(isChoice(7), false);
});

test('blocked or failing storage never breaks the selector', async () => {
  await withStorage('unavailable', () => {
    assert.equal(loadAtmosphereChoice(), 'auto');
    assert.doesNotThrow(() => saveAtmosphereChoice('morning'));
  });
  const s = new MemoryStorage();
  s.failReads = true;
  s.failWrites = true;
  await withStorage(s, () => {
    assert.equal(loadAtmosphereChoice(), 'auto');
    assert.doesNotThrow(() => saveAtmosphereChoice('afternoon'));
  });
});

test('each atmosphere paints only tested surfaces, and each looks different', () => {
  const tested = new Set<string>(SURFACES);
  for (const a of ATMOSPHERES) {
    const t = ATMOSPHERE_SURFACES[a.id];
    assert.ok(tested.has(t.cover) && tested.has(t.band), `${a.id}: ${t.cover}/${t.band}`);
    assert.notEqual(t.cover, t.band, `${a.id}: the cover and the Window band differ`);
  }
  const covers = ATMOSPHERES.map((a) => ATMOSPHERE_SURFACES[a.id].cover);
  assert.equal(new Set(covers).size, 3, 'three distinct covers');
});
