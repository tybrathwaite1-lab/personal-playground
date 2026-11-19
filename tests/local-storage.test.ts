/**
 * M2-4: local storage resilience. Personal data, "seen" history and sync metadata must
 * survive storage that is missing, corrupted, or throws on read or write, without crashing
 * the app or losing the in-memory state. Behaviour is pinned as it is today.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_DATA, loadData, loadSeen, saveData, saveSeen, STORAGE_KEY, SEEN_KEY } from '../src/utils/storage.ts';
import { EMPTY_META, loadMeta, saveMeta } from '../src/utils/sync.ts';
import { MemoryStorage, withStorage } from './helpers/memory-storage.ts';

const META_KEY = 'personal-playground:sync-meta';
const sample = () => ({ ...structuredClone(EMPTY_DATA), favorites: ['exp-1'], settings: { ...EMPTY_DATA.settings, radiusMiles: 25 } });

test('round trip: saved data, seen history and sync metadata load back unchanged', async () => {
  const s = new MemoryStorage();
  await withStorage(s, () => {
    assert.equal(saveData(sample()), true);
    assert.deepEqual(loadData(), sample());
    saveSeen({ relax: ['a', 'b'] });
    assert.deepEqual(loadSeen(), { relax: ['a', 'b'] });
    const meta = { stamps: { 'favorites:exp-1': 5 }, tombs: { 'saved:x': 6 } };
    saveMeta(meta);
    assert.deepEqual(loadMeta(), meta);
  });
});

test('nothing stored yet: empty defaults', async () => {
  await withStorage(new MemoryStorage(), () => {
    assert.deepEqual(loadData(), EMPTY_DATA);
    assert.deepEqual(loadSeen(), {});
    assert.deepEqual(loadMeta(), EMPTY_META);
  });
});

test('corrupted values fall back to defaults instead of throwing', async () => {
  const s = new MemoryStorage();
  await withStorage(s, () => {
    for (const bad of ['{truncated', 'undefined', '', '\u0000\u0001', '"just a string"', '[1,2,3]', 'null', '42']) {
      s.data.set(STORAGE_KEY, bad);
      s.data.set(SEEN_KEY, bad);
      s.data.set(META_KEY, bad);
      assert.deepEqual(loadData(), EMPTY_DATA, `data: ${JSON.stringify(bad)}`);
      assert.deepEqual(loadSeen(), {}, `seen: ${JSON.stringify(bad)}`);
      assert.deepEqual(loadMeta(), EMPTY_META, `meta: ${JSON.stringify(bad)}`);
    }
    // Partly valid data keeps what is valid and repairs the rest.
    s.data.set(STORAGE_KEY, JSON.stringify({ favorites: ['a', 7, null, 'b'], settings: { radiusMiles: -3, transport: 'rocket', location: { lat: 'x' } }, saved: 'nope' }));
    const d = loadData();
    assert.deepEqual(d.favorites, ['a', 'b']);
    assert.equal(d.settings.radiusMiles, 10);
    assert.equal(d.settings.transport, 'car');
    assert.equal(d.settings.location, null);
    assert.deepEqual(d.saved, []);
    // Sync metadata missing either half is treated as empty.
    s.data.set(META_KEY, JSON.stringify({ stamps: {} }));
    assert.deepEqual(loadMeta(), EMPTY_META);
  });
});

test('storage unavailable (blocked site data): reads give defaults, writes report or ignore failure', async () => {
  await withStorage('unavailable', () => {
    assert.deepEqual(loadData(), EMPTY_DATA);
    assert.deepEqual(loadSeen(), {});
    assert.deepEqual(loadMeta(), EMPTY_META);
    assert.equal(saveData(sample()), false, 'the caller is told personal data was not saved');
    assert.doesNotThrow(() => saveSeen({ a: [] }));
    assert.doesNotThrow(() => saveMeta(EMPTY_META));
  });
});

test('reads that throw give defaults; writes that throw (quota) leave the previous value intact', async () => {
  const s = new MemoryStorage();
  await withStorage(s, () => {
    saveData(sample());
    s.failReads = true;
    assert.deepEqual(loadData(), EMPTY_DATA);
    assert.deepEqual(loadSeen(), {});
    assert.deepEqual(loadMeta(), EMPTY_META);
    s.failReads = false;
    s.failWrites = true;
    assert.equal(saveData({ ...sample(), favorites: ['changed'] }), false);
    assert.doesNotThrow(() => saveSeen({ x: ['y'] }));
    assert.doesNotThrow(() => saveMeta({ stamps: { k: 1 }, tombs: {} }));
    s.failWrites = false;
    assert.deepEqual(loadData().favorites, ['exp-1'], 'the last good save is still there');
  });
});

test('characterization: the empty fallback is a shallow copy of EMPTY_DATA', async () => {
  // loadData returns { ...EMPTY_DATA }, so its arrays are EMPTY_DATA's own. The store only
  // ever replaces arrays (immutable updates), so nothing mutates them today; an in-place
  // push on a fallback would leak into every later fallback. Pinned so a change is deliberate.
  await withStorage(new MemoryStorage(), () => {
    const d = loadData();
    assert.notEqual(d, EMPTY_DATA);
    assert.equal(d.saved, EMPTY_DATA.saved);
    assert.equal(d.settings, EMPTY_DATA.settings);
    assert.deepEqual(EMPTY_DATA.saved, [], 'EMPTY_DATA itself is still empty');
  });
});
