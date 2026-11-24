/**
 * Creative Slice 03, Phase 3.1 (safety net): forward compatibility of Sync.
 *
 * A future app version may sync data this version doesn't know about: a new `settings:*`
 * field (say, appearance) or a whole new entry kind (say, per-look customisation or visitor
 * interests). These tests run THIS version's real sync code (syncEntries, stampChanges,
 * mergeReplicas, withLegacySettings, fromEntries/normalizeData and the syncOnce loop) as the
 * "older client", against an in-memory GitHub and a simulated newer client, and check what
 * actually happens to those entries across round trips, restarts and edits.
 *
 * Tests only: no production code is changed. Synthetic data only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncError, type SyncConfig } from '../src/utils/github.ts';
import * as S from '../src/utils/sync.ts';
import { syncOnce, type SyncDeps } from '../src/utils/syncRun.ts';
import { EMPTY_DATA, normalizeData } from '../src/utils/storage.ts';
import type { PersonalData } from '../src/types/index.ts';

const CFG: SyncConfig = { owner: 'sample-owner', repo: 'sample-data', path: 'playground-data.json', token: 'synthetic-token-not-real' };

/** In-memory stand-in for the GitHub contents API (same contract as tests/sync-safeguards.test.ts). */
class FakeGitHub {
  file: S.RemoteFile | null = null;
  sha = 0;
  writes = 0;
  async verify() {}
  async read() {
    return { file: this.file ? structuredClone(this.file) : null, sha: this.file ? String(this.sha) : null };
  }
  async write(_c: SyncConfig, f: S.RemoteFile, sha: string | null) {
    if ((sha ?? null) !== (this.file ? String(this.sha) : null)) throw new SyncError('changed on GitHub', 'conflict');
    this.file = structuredClone(f);
    this.sha++;
    this.writes++;
    return String(this.sha);
  }
}

/**
 * This app version, as useStore and useSync run it: local data, persisted sync metadata, the
 * previous entries for change stamping, and the real syncOnce loop. `restart()` reloads from
 * what would be in localStorage (JSON + normalizeData), as a page reload does.
 */
class CurrentClient {
  data: PersonalData = structuredClone(EMPTY_DATA);
  meta: S.SyncMeta = S.EMPTY_META;
  entries = S.syncEntries(this.data);
  version = 0;
  edit(fn: (d: PersonalData) => PersonalData, t: number) {
    this.data = fn(structuredClone(this.data));
    const next = S.syncEntries(this.data);
    this.meta = S.stampChanges(this.entries, next, this.meta, t);
    this.entries = next;
    this.version++;
  }
  restart() {
    this.data = normalizeData(JSON.parse(JSON.stringify(this.data)));
    this.meta = JSON.parse(JSON.stringify(this.meta)) as S.SyncMeta;
    this.entries = S.syncEntries(this.data);
    this.version = 0;
  }
  sync(gh: FakeGitHub, t: number) {
    const deps: SyncDeps = {
      verify: () => gh.verify(),
      read: () => gh.read(),
      write: (c, f, s) => gh.write(c, f, s),
      getLocal: () => ({ entries: this.entries, meta: this.meta, version: this.version }),
      apply: (d, m, v) => {
        if (v !== this.version) return false;
        this.data = d;
        this.meta = m;
        this.entries = S.syncEntries(d);
        return true;
      },
      stillCurrent: () => true,
      now: () => t,
    };
    return syncOnce(CFG, deps);
  }
}

/**
 * A simulated newer version. It keeps every entry it syncs (it knows the new kinds), merges
 * with this version's mergeReplicas, and, like a future version whose normalizeData knew the
 * new setting, includes that setting in the legacy `settings` mirror it writes.
 */
class NewerClient {
  entries: S.Entries = {};
  meta: S.SyncMeta = S.EMPTY_META;
  constructor(readonly newSettings: string[]) {}
  set(changes: S.Entries, t: number, remove: string[] = []) {
    const next = { ...this.entries, ...changes };
    for (const k of remove) delete next[k];
    this.meta = S.stampChanges(this.entries, next, this.meta, t);
    this.entries = next;
  }
  async sync(gh: FakeGitHub, t: number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { file, sha } = await gh.read();
      const merged = S.mergeReplicas({ entries: this.entries, meta: this.meta }, file ? { entries: file.entries, meta: file.meta } : { entries: {}, meta: S.EMPTY_META }, t);
      const view = S.withLegacySettings(merged);
      if (view.entries.settings && typeof view.entries.settings === 'object') {
        const mirror = { ...(view.entries.settings as Record<string, unknown>) };
        for (const f of this.newSettings) if (`settings:${f}` in merged.entries) mirror[f] = merged.entries[`settings:${f}`];
        view.entries.settings = mirror;
      }
      const same = file && JSON.stringify(view.entries) === JSON.stringify(file.entries) && JSON.stringify(view.meta) === JSON.stringify(file.meta);
      if (!same) {
        try {
          await gh.write(CFG, { app: 'personal-playground', format: 1, updatedAt: new Date(t).toISOString(), entries: view.entries, meta: view.meta }, sha);
        } catch (e) {
          if (e instanceof SyncError && e.kind === 'conflict') continue;
          throw e;
        }
      }
      this.entries = merged.entries;
      this.meta = merged.meta;
      return;
    }
    throw new Error('newer client collided');
  }
}

const note = (id: string, title: string) => ({ id, title, category: 'Album' as const, tags: [], createdAt: '2026-11-01' });
const saved = (id: string, refId: string, title: string) => ({ id, kind: 'experience' as const, refId, title, savedAt: '2026-11-02T10:00:00.000Z' });
const APPEARANCE = { v: 1, look: 'studio', palette: 'night', type: 'mono' };

test('an unknown settings field from a newer version survives this version’s round trips, edits and restarts', async () => {
  const gh = new FakeGitHub();
  const newer = new NewerClient(['appearance']);
  const current = new CurrentClient();

  // An existing user on this version: a saved item, a note and a changed setting.
  current.edit((d) => ({ ...d, saved: [saved('s1', 'exp-new-game', 'New Game Discovery')], fieldNotes: [note('n1', 'Old note')], settings: { ...d.settings, radiusMiles: 25 } }), 1000);
  await current.sync(gh, 1100);

  // A newer version on another device adds a setting this version doesn't know.
  await newer.sync(gh, 1200);
  newer.set({ 'settings:appearance': APPEARANCE }, 2000);
  await newer.sync(gh, 2100);
  assert.deepEqual(gh.file!.entries['settings:appearance'], APPEARANCE);

  // This version syncs, edits something else, restarts, edits a setting, syncs again.
  await current.sync(gh, 2200);
  current.edit((d) => ({ ...d, fieldNotes: [note('n2', 'New note'), ...d.fieldNotes] }), 3000);
  await current.sync(gh, 3100);
  current.restart();
  current.edit((d) => ({ ...d, settings: { ...d.settings, weatherAware: false } }), 4000);
  await current.sync(gh, 4100);

  // The unknown setting is untouched on the remote: same value, same stamp, never tombstoned.
  const f = gh.file!;
  assert.deepEqual(f.entries['settings:appearance'], APPEARANCE);
  assert.equal(f.meta.stamps['settings:appearance'], 2000);
  assert.equal('settings:appearance' in f.meta.tombs, false);
  // This version's own data and settings are intact, locally and remotely.
  assert.deepEqual(current.data.saved.map((s) => s.id), ['s1']);
  assert.deepEqual(current.data.fieldNotes.map((n) => n.id).sort(), ['n1', 'n2']);
  assert.equal(current.data.settings.radiusMiles, 25);
  assert.equal(current.data.settings.weatherAware, false);
  assert.equal(f.entries['settings:radiusMiles'], 25);
  assert.equal(f.entries['settings:weatherAware'], false);

  // The newer device still has its setting and receives this version's changes.
  await newer.sync(gh, 4200);
  assert.deepEqual(newer.entries['settings:appearance'], APPEARANCE);
  assert.equal(newer.entries['settings:weatherAware'], false);
  assert.ok('fieldNotes:n2' in newer.entries);

  // A later change on the newer device still wins after this version syncs again.
  const changed = { ...APPEARANCE, look: 'quiet-room' };
  newer.set({ 'settings:appearance': changed }, 5000);
  await newer.sync(gh, 5100);
  await current.sync(gh, 5200);
  assert.deepEqual(gh.file!.entries['settings:appearance'], changed);
  assert.equal(gh.file!.meta.stamps['settings:appearance'], 5000);
});

test('unknown entry kinds from a newer version survive, update and delete correctly through this version', async () => {
  const gh = new FakeGitHub();
  const newer = new NewerClient([]);
  const current = new CurrentClient();
  current.edit((d) => ({ ...d, saved: [saved('s1', 'exp-home-cafe', 'Home Café')] }), 1000);
  await current.sync(gh, 1100);

  // Per-look customisation and visitor interests, as a future version might store them.
  const kinds = {
    'appearanceLook:studio': { palette: 'night', type: 'mono' },
    'appearanceLook:quiet-room': { palette: 'sage', type: 'book' },
    'visitorInterests:walks': true,
    'visitorInterests:music': true,
  };
  await newer.sync(gh, 1200);
  newer.set(kinds, 2000);
  await newer.sync(gh, 2100);

  // This version: sync, edit, restart, sync twice.
  await current.sync(gh, 2200);
  current.edit((d) => ({ ...d, saved: [saved('s2', 'exp-new-game', 'New Game Discovery'), ...d.saved] }), 3000);
  await current.sync(gh, 3100);
  current.restart();
  await current.sync(gh, 3200);
  for (const [k, v] of Object.entries(kinds)) {
    assert.deepEqual(gh.file!.entries[k], v, `${k} kept`);
    assert.equal(gh.file!.meta.stamps[k], 2000, `${k} stamp kept`);
  }
  assert.deepEqual(current.data.saved.map((s) => s.id).sort(), ['s1', 's2']);

  // The newer device changes one and deletes another; this version must not undo either.
  newer.set({ 'appearanceLook:studio': { palette: 'poster', type: 'sans' } }, 4000, ['visitorInterests:music']);
  await newer.sync(gh, 4100);
  current.edit((d) => ({ ...d, fieldNotes: [note('n1', 'Edit after the newer change')] }), 4200);
  await current.sync(gh, 4300);
  current.restart();
  await current.sync(gh, 4400);
  assert.deepEqual(gh.file!.entries['appearanceLook:studio'], { palette: 'poster', type: 'sans' });
  assert.equal('visitorInterests:music' in gh.file!.entries, false, 'a deletion is not resurrected');
  assert.equal(gh.file!.meta.tombs['visitorInterests:music'], 4000);
  assert.deepEqual(gh.file!.entries['visitorInterests:walks'], true);
  await newer.sync(gh, 4500);
  assert.equal('visitorInterests:music' in newer.entries, false);
  assert.ok('fieldNotes:n1' in newer.entries);
});

/** Two quiet periods of alternating syncs; returns the writes made in the second. */
async function quietWrites(gh: FakeGitHub, current: CurrentClient, newer: NewerClient) {
  for (let i = 0; i < 4; i++) {
    await current.sync(gh, 3000 + i * 10);
    await newer.sync(gh, 3005 + i * 10);
  }
  const before = gh.writes;
  for (let i = 0; i < 3; i++) {
    await current.sync(gh, 4000 + i * 10);
    await newer.sync(gh, 4005 + i * 10);
  }
  return gh.writes - before;
}

async function mixedSetup(mirrorsNewSetting: boolean) {
  const gh = new FakeGitHub();
  const newer = new NewerClient(mirrorsNewSetting ? ['appearance'] : []);
  const current = new CurrentClient();
  current.edit((d) => ({ ...d, settings: { ...d.settings, transport: 'bike' } }), 1000);
  await current.sync(gh, 1100);
  await newer.sync(gh, 1200);
  newer.set({ 'settings:appearance': APPEARANCE, 'appearanceLook:studio': { palette: 'night', type: 'mono' } }, 2000);
  await newer.sync(gh, 2100);
  return { gh, newer, current };
}

test('a newer version that keeps its new setting out of the legacy settings mirror settles with this version', async () => {
  const { gh, newer, current } = await mixedSetup(false);
  assert.equal(await quietWrites(gh, current, newer), 0, 'no writes once both agree');
  assert.deepEqual(gh.file!.entries['settings:appearance'], APPEARANCE);
  assert.ok('appearanceLook:studio' in gh.file!.entries);
  assert.equal(current.data.settings.transport, 'bike');
});

/**
 * FINDING (Phase 3.1, reported, not fixed): withLegacySettings rebuilds the `settings` mirror
 * through fromEntries → normalizeData, which drops fields this version doesn't know. If a newer
 * version puts a new setting into that mirror, the two versions rewrite the mirror differently
 * on every sync: nothing is lost, but each quiet sync makes another write (a commit in the
 * private repo). This characterises today's behaviour so a future design can't miss it: new
 * synced preferences must stay out of the legacy mirror (see the test above) or use their own
 * entry kind.
 */
test('characterisation: a newer version that mirrors a new setting ping-pongs writes with this version (data intact)', async () => {
  const { gh, newer, current } = await mixedSetup(true);
  const extra = await quietWrites(gh, current, newer);
  assert.equal(extra, 6, 'every one of the 6 quiet syncs writes');
  // Nothing is lost while it happens.
  assert.deepEqual(gh.file!.entries['settings:appearance'], APPEARANCE);
  assert.equal(gh.file!.meta.stamps['settings:appearance'], 2000);
  assert.ok('appearanceLook:studio' in gh.file!.entries);
  assert.equal(current.data.settings.transport, 'bike');
  assert.equal(newer.entries['settings:transport'], 'bike');
});

test('characterisation: this version keeps unknown synced entries only on the remote, not in its own data or backups', async () => {
  const gh = new FakeGitHub();
  const newer = new NewerClient(['appearance']);
  const current = new CurrentClient();
  await newer.sync(gh, 1000);
  newer.set({ 'settings:appearance': APPEARANCE, 'visitorInterests:walks': true }, 1100);
  await newer.sync(gh, 1200);
  await current.sync(gh, 1300);
  // Its personal data (what localStorage and backups hold) has no trace of them…
  assert.equal(JSON.stringify(current.data).includes('appearance'), false);
  assert.equal(JSON.stringify(current.data).includes('visitorInterests'), false);
  assert.equal('appearance' in current.data.settings, false);
  // …but its sync metadata remembers their stamps, which is what stops it deleting them.
  assert.equal(current.meta.stamps['settings:appearance'], 1100);
  assert.equal(current.meta.stamps['visitorInterests:walks'], 1100);
});
