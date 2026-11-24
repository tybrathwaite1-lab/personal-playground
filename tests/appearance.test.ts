/**
 * Creative Slice 03, Phase 3.2: the appearance model. Device-local, separate from personal data
 * and Sync, per-atmosphere colour and type, tolerant of anything stored, and a preview → commit
 * or cancel state machine. Synthetic data only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  customFor,
  initialAppearanceState,
  isDirty,
  loadAppearance,
  parseAppearance,
  reduceAppearance,
  resolve,
  saveAppearance,
  serializeAppearance,
  shownAppearance,
  type Appearance,
  type AppearanceAction,
  type AppearanceState,
} from '../src/appearance/appearance.ts';
import { LOOKS } from '../src/appearance/looks.ts';
import { LOOKS as PROTOTYPE_LOOKS } from '../src/prototype/make-it-yours/journey.ts';
import { EMPTY_DATA, STORAGE_KEY, normalizeData, saveData } from '../src/utils/storage.ts';
import { syncEntries, withLegacySettings } from '../src/utils/sync.ts';
import { MemoryStorage, withStorage } from './helpers/memory-storage.ts';

const run = (s: AppearanceState, ...actions: AppearanceAction[]) => actions.reduce(reduceAppearance, s);
const studioNight: Appearance = { look: 'studio', custom: { studio: { palette: 'night', type: 'mono' } } };

test('the registry: three atmospheres, each with curated colour sets and type pairings, matching the approved prototype', () => {
  assert.deepEqual(
    LOOKS.map((l) => l.id),
    ['studio', 'quiet-room', 'underground'],
  );
  // The production registry and the Slice 02 prototype must not drift apart.
  assert.deepEqual(
    LOOKS.map((l) => ({ id: l.id, name: l.name, palettes: l.palettes, types: l.types })),
    PROTOTYPE_LOOKS.map((l) => ({ id: l.id, name: l.name, palettes: l.palettes, types: l.types })),
  );
  for (const l of LOOKS) {
    assert.equal(new Set(l.palettes.map((p) => p.id)).size, l.palettes.length, `${l.id}: unique colour sets`);
    assert.equal(new Set(l.types.map((t) => t.id)).size, l.types.length, `${l.id}: unique type pairings`);
  }
});

test('the default is the unchanged Playground: no atmosphere, nothing resolved', () => {
  assert.deepEqual(DEFAULT_APPEARANCE, { look: null, custom: {} });
  assert.equal(resolve(DEFAULT_APPEARANCE), null);
  assert.deepEqual(customFor(DEFAULT_APPEARANCE, 'quiet-room'), { palette: 'linen', type: 'book' }, 'curated defaults until adjusted');
  assert.deepEqual(resolve(studioNight), { look: 'studio', palette: 'night', type: 'mono' });
  assert.deepEqual(resolve({ look: 'underground', custom: {} }), { look: 'underground', palette: 'newsstand', type: 'poster' });
});

test('stored data of any shape reads back as a valid appearance', () => {
  const v = (x: Record<string, unknown>) => ({ v: 1, ...x });
  // Not an appearance at all.
  for (const raw of [null, undefined, 42, 'studio', [], {}, { look: 'studio' }, { v: 2, look: 'studio' }]) assert.deepEqual(parseAppearance(raw), DEFAULT_APPEARANCE, JSON.stringify(raw));
  // Unknown or malformed atmosphere: the default Playground.
  for (const look of ['brutalist', '', 7, true, { id: 'studio' }]) assert.equal(parseAppearance(v({ look })).look, null);
  // Unknown colour or type: that atmosphere's default for the bad half, the good half kept.
  assert.deepEqual(parseAppearance(v({ look: 'studio', custom: { studio: { palette: 'neon', type: 'mono' } } })), { look: 'studio', custom: { studio: { palette: 'poster', type: 'mono' } } });
  assert.deepEqual(parseAppearance(v({ look: 'studio', custom: { studio: { palette: 'night', type: 'comic' } } })), { look: 'studio', custom: { studio: { palette: 'night', type: 'sans' } } });
  // A colour set from another atmosphere isn't valid here.
  assert.deepEqual(parseAppearance(v({ look: 'studio', custom: { studio: { palette: 'linen', type: 'sans' } } })).custom, {});
  // Malformed per-look entries, unknown atmospheres and stray fields are dropped.
  assert.deepEqual(parseAppearance(v({ look: null, custom: { studio: 'night', 'quiet-room': null, brutalist: { palette: 'x' }, underground: { palette: 'forest', type: 'zine', extra: 1 } }, extra: true })), {
    look: null,
    custom: { underground: { palette: 'forest', type: 'zine' } },
  });
  // A non-object `custom` is ignored.
  assert.deepEqual(parseAppearance(v({ look: 'quiet-room', custom: ['sage'] })), { look: 'quiet-room', custom: {} });
});

test('persistence: round trip, nothing stored, corrupt JSON, blocked storage and failed writes', async () => {
  const s = new MemoryStorage();
  await withStorage(s, () => {
    assert.deepEqual(loadAppearance(), DEFAULT_APPEARANCE, 'nothing stored yet');
    assert.equal(saveAppearance(studioNight), true);
    assert.equal(s.data.get(APPEARANCE_KEY), '{"v":1,"look":"studio","custom":{"studio":{"palette":"night","type":"mono"}}}');
    assert.deepEqual(loadAppearance(), studioNight);
    s.data.set(APPEARANCE_KEY, '{not json');
    assert.deepEqual(loadAppearance(), DEFAULT_APPEARANCE, 'corrupt JSON');
    assert.equal(s.data.get(APPEARANCE_KEY), '{not json', 'reading never rewrites what is stored');
    s.data.set(APPEARANCE_KEY, serializeAppearance(studioNight));
    s.failWrites = true;
    assert.equal(saveAppearance({ look: 'quiet-room', custom: {} }), false, 'a failed write reports false');
    assert.deepEqual(loadAppearance(), studioNight, 'and leaves the previous value intact');
    s.failWrites = false;
    s.failReads = true;
    assert.deepEqual(loadAppearance(), DEFAULT_APPEARANCE, 'reads that throw give the default');
  });
  await withStorage('unavailable', () => {
    assert.deepEqual(loadAppearance(), DEFAULT_APPEARANCE);
    assert.equal(saveAppearance(studioNight), false);
  });
});

test('preview, then commit: the draft shows at once, is stored only on commit, and Cancel restores', () => {
  let s = initialAppearanceState(DEFAULT_APPEARANCE);
  assert.equal(shownAppearance(s), DEFAULT_APPEARANCE);
  s = run(s, { type: 'preview-look', look: 'quiet-room' });
  assert.equal(shownAppearance(s).look, 'quiet-room', 'instant preview');
  assert.equal(s.saved.look, null, 'not saved yet');
  assert.equal(isDirty(s), true);
  assert.equal(s.commits, 0);
  // Cancel: back to what was saved.
  s = run(s, { type: 'cancel' });
  assert.equal(s.draft, null);
  assert.equal(shownAppearance(s), DEFAULT_APPEARANCE);
  // Preview and commit.
  s = run(s, { type: 'preview-look', look: 'studio' }, { type: 'preview-custom', look: 'studio', palette: 'night', typeface: 'mono' }, { type: 'commit' });
  assert.deepEqual(s.saved, studioNight);
  assert.equal(s.draft, null);
  assert.equal(s.commits, 1);
  // Commit or cancel with nothing to keep changes nothing.
  assert.equal(run(s, { type: 'commit' }), s);
  assert.equal(run(s, { type: 'cancel' }), s);
  // A preview that returns to what's saved isn't dirty.
  const back = run(s, { type: 'preview-look', look: 'quiet-room' }, { type: 'preview-look', look: 'studio' });
  assert.equal(back.draft !== null, true);
  assert.equal(isDirty(back), false);
});

test('each atmosphere keeps its own colour and type through switching, cancelling and committing', () => {
  let s = initialAppearanceState(DEFAULT_APPEARANCE);
  s = run(
    s,
    { type: 'preview-look', look: 'studio' },
    { type: 'preview-custom', look: 'studio', palette: 'sherbet' },
    { type: 'preview-look', look: 'quiet-room' },
    { type: 'preview-custom', look: 'quiet-room', palette: 'lamplight', typeface: 'serif-sans' },
    { type: 'preview-look', look: 'studio' },
  );
  assert.deepEqual(resolve(shownAppearance(s)), { look: 'studio', palette: 'sherbet', type: 'sans' }, 'Studio adjustments survive a visit to the Quiet Room');
  s = run(s, { type: 'commit' }, { type: 'preview-look', look: 'quiet-room' });
  assert.deepEqual(resolve(shownAppearance(s)), { look: 'quiet-room', palette: 'lamplight', type: 'serif-sans' });
  // Adjust a look that isn't showing; cancelling drops that too.
  s = run(s, { type: 'preview-custom', look: 'underground', palette: 'forest' }, { type: 'cancel' });
  assert.equal(s.saved.custom.underground, undefined);
  assert.deepEqual(s.saved.custom.studio, { palette: 'sherbet', type: 'sans' });
  // Choosing the default keeps every atmosphere's adjustments for next time.
  s = run(s, { type: 'preview-look', look: null }, { type: 'commit' });
  assert.equal(resolve(s.saved), null);
  assert.deepEqual(Object.keys(s.saved.custom).sort(), ['quiet-room', 'studio']);
  // Returning an atmosphere to its defaults forgets the adjustment instead of storing defaults.
  s = run(s, { type: 'preview-custom', look: 'studio', palette: 'poster' }, { type: 'commit' });
  assert.equal(s.saved.custom.studio, undefined);
});

test('invalid preview requests are ignored, never stored', () => {
  const s = initialAppearanceState(studioNight);
  assert.equal(run(s, { type: 'preview-look', look: 'brutalist' as never }), s);
  assert.equal(run(s, { type: 'preview-custom', look: 'brutalist' as never, palette: 'x' }), s);
  const bad = run(s, { type: 'preview-custom', look: 'studio', palette: 'linen', typeface: 'comic' });
  assert.deepEqual(shownAppearance(bad).custom.studio, { palette: 'night', type: 'mono' }, 'unknown ids keep the current values');
});

test('a change from another tab updates what is saved, and a preview in progress is kept', () => {
  let s = run(initialAppearanceState(DEFAULT_APPEARANCE), { type: 'preview-look', look: 'underground' });
  s = run(s, { type: 'external', saved: studioNight });
  assert.deepEqual(s.saved, studioNight);
  assert.equal(shownAppearance(s).look, 'underground');
  assert.equal(s.commits, 0, 'an external change is not a commit (nothing is re-stored)');
  s = run(s, { type: 'cancel' });
  assert.deepEqual(shownAppearance(s), studioNight);
});

test('isolation: appearance never enters personal data, backups or Sync (including the legacy settings mirror)', async () => {
  const s = new MemoryStorage();
  await withStorage(s, () => {
    const data = { ...structuredClone(EMPTY_DATA), favorites: ['exp-1'] };
    saveData(data);
    const before = s.data.get(STORAGE_KEY);
    saveAppearance(studioNight);
    assert.equal(s.data.get(STORAGE_KEY), before, 'personal data untouched');
    assert.deepEqual([...s.data.keys()].sort(), [APPEARANCE_KEY, STORAGE_KEY].sort(), 'its own key only');
  });
  // Even stored inside personal data by mistake, normalisation drops it, so it can't sync or back up.
  const polluted = normalizeData({ ...EMPTY_DATA, appearance: studioNight, settings: { ...EMPTY_DATA.settings, appearance: studioNight } });
  assert.equal(JSON.stringify(polluted).includes('appearance'), false);
  const entries = withLegacySettings({ entries: syncEntries(polluted), meta: { stamps: {}, tombs: {} } }).entries;
  assert.equal(Object.keys(entries).some((k) => /appearance|look/i.test(k)), false);
  assert.equal(JSON.stringify(entries.settings).includes('appearance'), false);
  // The appearance code doesn't reach for personal data or Sync.
  for (const f of ['src/appearance/appearance.ts', 'src/appearance/looks.ts', 'src/hooks/useAppearance.tsx']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /useStore|useSync|utils\/storage|utils\/sync|STORAGE_KEY|PersonalData/, f);
  }
});
