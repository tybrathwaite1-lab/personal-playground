/**
 * PP-008 regression tests. A fake, in-memory GitHub stands in for the real API.
 * Synthetic data only: no real repositories, tokens or personal data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncError, type SyncConfig } from '../src/utils/github.ts';
import * as S from '../src/utils/sync.ts';
import { syncOnce, type SyncDeps } from '../src/utils/syncRun.ts';
import { EMPTY_DATA } from '../src/utils/storage.ts';
import type { PersonalData } from '../src/types/index.ts';

const CFG: SyncConfig = { owner: 'someone', repo: 'playground-data', path: 'playground-data.json', token: 'test-token-not-real' };

/** In-memory stand-in for the GitHub repo + contents API. */
class FakeGitHub {
  visibility: 'private' | 'public' | 'missing' = 'private';
  status = 200;
  file: S.RemoteFile | null = null;
  sha = 0;
  writes = 0;
  reads = 0;
  /** Simulate another device writing between our read and our write, once. */
  conflictOnce: (() => void) | null = null;
  onRead: (() => void) | null = null;

  async verify() {
    if (this.status === 401) throw new SyncError('token rejected', 'auth');
    if (this.visibility === 'public') throw new SyncError('Sync stopped: that repository is public.', 'public');
    if (this.visibility === 'missing') throw new SyncError('Sync stopped: not confirmed private.', 'public');
  }
  async read() {
    this.reads++;
    this.onRead?.();
    if (this.status === 401) throw new SyncError('token rejected', 'auth');
    return { file: this.file ? structuredClone(this.file) : null, sha: this.file ? String(this.sha) : null };
  }
  async write(_c: SyncConfig, f: S.RemoteFile, sha: string | null) {
    if (this.conflictOnce) {
      const other = this.conflictOnce;
      this.conflictOnce = null;
      other();
    }
    if ((sha ?? null) !== (this.file ? String(this.sha) : null)) throw new SyncError('changed on GitHub', 'conflict');
    this.file = structuredClone(f);
    this.sha++;
    this.writes++;
    return String(this.sha);
  }
}

/** A device with local data + sync metadata, like useStore keeps. */
class Device {
  data: PersonalData = structuredClone(EMPTY_DATA);
  meta: S.SyncMeta = S.EMPTY_META;
  entries = S.syncEntries(this.data);
  version = 0;
  connected = true;
  edit(fn: (d: PersonalData) => PersonalData, t: number) {
    this.data = fn(structuredClone(this.data));
    const next = S.syncEntries(this.data);
    this.meta = S.stampChanges(this.entries, next, this.meta, t);
    this.entries = next;
    this.version++;
  }
  deps(gh: FakeGitHub, t: number): SyncDeps {
    return {
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
      stillCurrent: () => this.connected,
      now: () => t,
    };
  }
  sync(gh: FakeGitHub, t: number) {
    return syncOnce(CFG, this.deps(gh, t));
  }
}

const note = (id: string, title: string) => ({ id, title, category: 'Album' as const, tags: [], createdAt: '2026-11-01' });

test('a private repo syncs normally', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  a.edit((d) => ({ ...d, fieldNotes: [note('n1', 'Synthetic note')] }), 1000);
  assert.equal(await a.sync(gh, 1100), 'synced');
  assert.equal(gh.writes, 1);
  assert.equal(gh.file!.entries['fieldNotes:n1'] !== undefined, true);
});

test('if the repo becomes public, sync stops before reading or writing', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  a.edit((d) => ({ ...d, fieldNotes: [note('n1', 'First')] }), 1000);
  await a.sync(gh, 1100);
  gh.visibility = 'public';
  a.edit((d) => ({ ...d, fieldNotes: [...d.fieldNotes, note('n2', 'Private thought')] }), 2000);
  await assert.rejects(a.sync(gh, 2100), (e: SyncError) => e.kind === 'public');
  assert.equal(gh.writes, 1, 'nothing new written to the public repo');
  assert.equal(gh.reads, 1, 'did not even read');
  assert.equal(a.data.fieldNotes.length, 2, 'local data is untouched');
  assert.equal(gh.file!.entries['fieldNotes:n2'], undefined);
});

test('fails closed when privacy cannot be confirmed', async () => {
  const gh = new FakeGitHub();
  gh.visibility = 'missing';
  const a = new Device();
  a.edit((d) => ({ ...d, favorites: ['pl-x'] }), 1000);
  await assert.rejects(a.sync(gh, 1100), (e: SyncError) => e.kind === 'public');
  assert.equal(gh.writes, 0);
});

test('privacy is re-checked before every attempt, including retries after a conflict', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  const b = new Device();
  b.edit((d) => ({ ...d, favorites: ['pl-b'] }), 900);
  await b.sync(gh, 950);
  a.edit((d) => ({ ...d, favorites: ['pl-a'] }), 1000);
  // Between A's read and A's write: B writes again AND the repo is made public.
  gh.conflictOnce = () => {
    gh.file = { ...gh.file!, updatedAt: 'other' };
    gh.sha++;
    gh.visibility = 'public';
  };
  await assert.rejects(a.sync(gh, 1100), (e: SyncError) => e.kind === 'public');
  assert.equal(gh.file!.entries['favorites:pl-a'], undefined, 'the retry never wrote to the now-public repo');
});

test('an expired or revoked token stops sync without writing', async () => {
  const gh = new FakeGitHub();
  gh.status = 401;
  const a = new Device();
  a.edit((d) => ({ ...d, favorites: ['pl-x'] }), 1000);
  await assert.rejects(a.sync(gh, 1100), (e: SyncError) => e.kind === 'auth');
  assert.equal(gh.writes, 0);
});

test('disconnecting during a sync stops it before writing or applying', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  a.edit((d) => ({ ...d, fieldNotes: [note('n1', 'Local only')] }), 1000);
  gh.onRead = () => {
    a.connected = false; // the user taps Disconnect while the read is in flight
  };
  assert.equal(await a.sync(gh, 1100), 'aborted');
  assert.equal(gh.writes, 0);
  assert.equal(a.data.fieldNotes.length, 1, 'local data kept');
});

test('a write conflict re-reads and merges, so both devices’ changes survive', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  const b = new Device();
  a.edit((d) => ({ ...d, fieldNotes: [note('a1', 'From A')] }), 1000);
  b.edit((d) => ({ ...d, fieldNotes: [note('b1', 'From B')] }), 1001);
  // B's sync lands between A's read and A's write.
  gh.conflictOnce = () => {
    void b; // B writes its own version of the file
    const merged = S.mergeReplicas({ entries: b.entries, meta: b.meta }, gh.file ? { entries: gh.file.entries, meta: gh.file.meta } : { entries: {}, meta: S.EMPTY_META }, 1050);
    gh.file = { app: 'personal-playground', format: 1, updatedAt: 'b', entries: merged.entries, meta: merged.meta };
    gh.sha++;
  };
  assert.equal(await a.sync(gh, 1100), 'synced');
  const ids = Object.keys(gh.file!.entries).filter((k) => k.startsWith('fieldNotes:'));
  assert.deepEqual(ids.sort(), ['fieldNotes:a1', 'fieldNotes:b1']);
});

test('a deletion made offline reaches the other device', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  const b = new Device();
  a.edit((d) => ({ ...d, fieldNotes: [note('n1', 'Keep'), note('n2', 'Delete me')] }), 1000);
  await a.sync(gh, 1100);
  await b.sync(gh, 1200);
  assert.equal(b.data.fieldNotes.length, 2);
  // A goes offline, deletes n2, comes back days later.
  a.edit((d) => ({ ...d, fieldNotes: d.fieldNotes.filter((n) => n.id !== 'n2') }), 5_000);
  await a.sync(gh, 400_000_000);
  await b.sync(gh, 400_000_100);
  assert.deepEqual(b.data.fieldNotes.map((n) => n.id), ['n1']);
});

test('different settings changed on two devices both survive; the same setting → newer wins', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  const b = new Device();
  await a.sync(gh, 1000);
  await b.sync(gh, 1001);
  a.edit((d) => ({ ...d, settings: { ...d.settings, readerNotes: 'Synthetic reader notes' } }), 2000);
  b.edit((d) => ({ ...d, settings: { ...d.settings, weatherAware: false } }), 2001);
  await a.sync(gh, 2100);
  await b.sync(gh, 2200);
  await a.sync(gh, 2300);
  for (const dv of [a, b]) {
    assert.equal(dv.data.settings.readerNotes, 'Synthetic reader notes');
    assert.equal(dv.data.settings.weatherAware, false);
  }
  a.edit((d) => ({ ...d, settings: { ...d.settings, radiusMiles: 20 } }), 3000);
  b.edit((d) => ({ ...d, settings: { ...d.settings, radiusMiles: 5 } }), 3001);
  await a.sync(gh, 3100);
  await b.sync(gh, 3200);
  await a.sync(gh, 3300);
  assert.equal(a.data.settings.radiusMiles, 5);
  assert.equal(b.data.settings.radiusMiles, 5);
});

test('an old-format sync file (single settings entry) upgrades without losing anything', () => {
  const oldSettings = { ...EMPTY_DATA.settings, radiusMiles: 20, readerNotes: 'Older notes' };
  const remote = { entries: { settings: oldSettings, 'favorites:pl-x': true }, meta: { stamps: { settings: 5000, 'favorites:pl-x': 5000 }, tombs: {} } };
  // A freshly upgraded device whose local meta still has the old single stamp.
  const localData = { ...structuredClone(EMPTY_DATA), settings: oldSettings };
  const local = { entries: S.syncEntries(localData), meta: { stamps: { settings: 5000 }, tombs: {} } };
  const merged = S.mergeReplicas(local, remote, 6000);
  assert.equal(merged.entries.settings, undefined, 'no single settings entry is written any more');
  assert.equal(merged.entries['settings:radiusMiles'], 20);
  assert.equal(merged.entries['settings:readerNotes'], 'Older notes');
  assert.equal(merged.meta.stamps['settings:radiusMiles'], 5000);
  assert.equal(S.fromEntries(merged.entries).settings.radiusMiles, 20);
  assert.deepEqual(S.upgradeReplica(S.upgradeReplica(remote)), S.upgradeReplica(remote), 'idempotent');
});

test('a device still on the old version keeps working with upgraded devices', () => {
  // Upgraded device changed one setting at t=7000.
  const upgraded = { entries: { 'settings:weatherAware': false, 'settings:radiusMiles': 10 }, meta: { stamps: { 'settings:weatherAware': 7000, 'settings:radiusMiles': 5000 }, tombs: {} } };
  // Old device last edited its whole settings object at t=6000 (older than the change above).
  const old = { entries: { settings: { ...EMPTY_DATA.settings, weatherAware: true, radiusMiles: 10 } }, meta: { stamps: { settings: 6000 }, tombs: {} } };
  const m1 = S.mergeReplicas(upgraded, old, 8000);
  assert.equal(m1.entries['settings:weatherAware'], false, 'newer per-field change wins over an older whole-object write');
  // Old device then edits settings at t=9000: its newer write wins (the old behavior), nothing breaks.
  const oldLater = { entries: { settings: { ...EMPTY_DATA.settings, weatherAware: true, radiusMiles: 40 } }, meta: { stamps: { settings: 9000 }, tombs: {} } };
  const m2 = S.mergeReplicas(m1, oldLater, 9500);
  assert.equal(m2.entries['settings:radiusMiles'], 40);
  assert.equal(m2.entries['settings:weatherAware'], true);
});
