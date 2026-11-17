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

// ─── Review revisions (independent review of #18) ─────────────────────

test('repo made public during the read (no write conflict): the pre-write check stops the write', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  a.edit((d) => ({ ...d, fieldNotes: [note('n1', 'Synthetic')] }), 1000);
  gh.onRead = () => {
    gh.visibility = 'public';
  };
  await assert.rejects(a.sync(gh, 1100), (e: SyncError) => e.kind === 'public');
  assert.equal(gh.writes, 0);
  assert.equal(gh.file, null);
});

// verifyRepo itself, against mocked fetch responses (no network).
const realFetch = globalThis.fetch;
async function verifyWith(response: () => Promise<Response> | Response): Promise<SyncError | null> {
  const { verifyRepo } = await import('../src/utils/github.ts');
  globalThis.fetch = (async () => response()) as typeof fetch;
  try {
    await verifyRepo(CFG);
    return null;
  } catch (e) {
    if (e instanceof SyncError) return e;
    throw e; // any non-SyncError escaping verifyRepo is itself a failure
  } finally {
    globalThis.fetch = realFetch;
  }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('verifyRepo: explicit private repo with push access passes', async () => {
  assert.equal(await verifyWith(() => json({ private: true, permissions: { push: true } })), null);
});

test('verifyRepo fails closed on public, missing, malformed or non-boolean privacy', async () => {
  const cases: [string, () => Response][] = [
    ['public', () => json({ private: false })],
    ['missing field', () => json({ name: 'x' })],
    ['string "true"', () => json({ private: 'true' })],
    ['null', () => json({ private: null })],
    ['JSON null body', () => json(null)],
    ['malformed JSON', () => new Response('{"private": tru', { status: 200 })],
    ['empty body', () => new Response('', { status: 200 })],
  ];
  for (const [name, res] of cases) {
    const e = await verifyWith(res);
    assert.equal(e?.kind, 'public', `${name} must stop sync`);
  }
});

test('verifyRepo: unsuccessful responses stop sync with the right kind', async () => {
  assert.equal((await verifyWith(() => json({}, 401)))?.kind, 'auth');
  assert.equal((await verifyWith(() => json({}, 403)))?.kind, 'auth');
  assert.equal((await verifyWith(() => json({}, 404)))?.kind, 'notfound');
  assert.equal((await verifyWith(() => json({}, 500)))?.kind, 'network');
  assert.equal((await verifyWith(() => Promise.reject(new TypeError('offline'))))?.kind, 'network');
  assert.equal((await verifyWith(() => json({ private: true, permissions: { push: false } })))?.kind, 'auth');
});

test('sameConfig compares owner, repo, path and token', async () => {
  const { sameConfig } = await import('../src/utils/github.ts');
  assert.equal(sameConfig(CFG, { ...CFG }), true);
  for (const k of ['owner', 'repo', 'path', 'token'] as const) assert.equal(sameConfig(CFG, { ...CFG, [k]: 'other' }), false, k);
  assert.equal(sameConfig(CFG, null), false);
});

test('a round started for one config stops when only the path changes', async () => {
  const gh = new FakeGitHub();
  const a = new Device();
  a.edit((d) => ({ ...d, favorites: ['pl-x'] }), 1000);
  const { sameConfig } = await import('../src/utils/github.ts');
  let current: SyncConfig = CFG;
  gh.onRead = () => {
    current = { ...CFG, path: 'elsewhere.json' };
  };
  const out = await syncOnce(CFG, { ...a.deps(gh, 1100), stillCurrent: () => sameConfig(current, CFG) });
  assert.equal(out, 'aborted');
  assert.equal(gh.writes, 0);
});

test('an older legacy settings value never resurrects a newer per-field deletion', () => {
  const r = {
    entries: { settings: { ...EMPTY_DATA.settings, retiredOption: 'old' } },
    meta: { stamps: { settings: 5000 }, tombs: { 'settings:retiredOption': 9000 } },
  };
  const up = S.upgradeReplica(r);
  assert.equal('settings:retiredOption' in up.entries, false);
  assert.equal(up.meta.tombs['settings:retiredOption'], 9000);
  // ...but a legacy value written AFTER the deletion is a newer change and wins.
  const newer = S.upgradeReplica({ ...r, meta: { stamps: { settings: 10000 }, tombs: { 'settings:retiredOption': 9000 } } });
  assert.equal(newer.entries['settings:retiredOption'], 'old');
  // Merged through mergeReplicas with a device that has the tombstone:
  const m = S.mergeReplicas({ entries: {}, meta: { stamps: {}, tombs: { 'settings:retiredOption': 9000 } } }, r, 9500);
  assert.equal('settings:retiredOption' in m.entries, false);
});

test('reading back our own legacy mirror changes nothing (per-field stamps survive)', () => {
  const r = { entries: { 'settings:radiusMiles': 20, 'settings:weatherAware': false }, meta: { stamps: { 'settings:radiusMiles': 1000, 'settings:weatherAware': 3000 }, tombs: {} } };
  const mirrored = S.withLegacySettings(r);
  assert.equal(mirrored.meta.stamps.settings, 3000);
  const back = S.upgradeReplica(mirrored);
  assert.equal(back.meta.stamps['settings:radiusMiles'], 1000);
  assert.equal(back.meta.stamps['settings:weatherAware'], 3000);
});

// ─── Mixed versions: the previous app version's REAL sync code (tests/fixtures/legacy) ───
import * as V1 from './fixtures/legacy/sync-v1.ts';

/** A device still running the previous version: its own serialization, merge, rebuild and loop. */
class OldDevice {
  data: PersonalData = structuredClone(EMPTY_DATA);
  meta: V1.SyncMeta = V1.EMPTY_META;
  entries = V1.syncEntries(this.data);
  edit(fn: (d: PersonalData) => PersonalData, t: number) {
    this.data = fn(structuredClone(this.data));
    const next = V1.syncEntries(this.data);
    this.meta = V1.stampChanges(this.entries, next, this.meta, t);
    this.entries = next;
  }
  /** Mirrors the loop in the previous useSync.tsx (main 7a69ad8): read → merge → write if changed → apply. */
  async sync(gh: FakeGitHub, t: number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { file, sha } = await gh.read();
      const merged = V1.mergeReplicas({ entries: this.entries, meta: this.meta }, file ? { entries: file.entries, meta: file.meta } : { entries: {}, meta: V1.EMPTY_META }, t);
      if (!file || JSON.stringify(merged.entries) !== JSON.stringify(file.entries) || JSON.stringify(merged.meta) !== JSON.stringify(file.meta)) {
        try {
          await gh.write(CFG, { app: 'personal-playground', format: 1, updatedAt: String(t), entries: merged.entries, meta: merged.meta }, sha);
        } catch (e) {
          if (e instanceof SyncError && e.kind === 'conflict') continue;
          throw e;
        }
      }
      this.data = V1.fromEntries(merged.entries);
      this.meta = merged.meta;
      this.entries = V1.syncEntries(this.data);
      return;
    }
    throw new Error('old client collided');
  }
}

test('mixed versions: old → new → old round trip keeps data and settings flowing both ways', async () => {
  const gh = new FakeGitHub();
  const oldD = new OldDevice();
  const newD = new Device();
  // Old device creates data and settings first (an existing user).
  oldD.edit((d) => ({ ...d, fieldNotes: [note('o1', 'From old')], settings: { ...d.settings, readerNotes: 'Old notes' } }), 1000);
  await oldD.sync(gh, 1100);
  // New device joins: reads the old single-entry format.
  await newD.sync(gh, 1200);
  assert.equal(newD.data.settings.readerNotes, 'Old notes');
  assert.deepEqual(newD.data.fieldNotes.map((n) => n.id), ['o1']);
  // New device changes a setting and adds a note.
  newD.edit((d) => ({ ...d, fieldNotes: [note('n1', 'From new'), ...d.fieldNotes], settings: { ...d.settings, radiusMiles: 25 } }), 2000);
  await newD.sync(gh, 2100);
  // Old device must SEE the new device's setting (via the legacy mirror).
  await oldD.sync(gh, 2200);
  assert.equal(oldD.data.settings.radiusMiles, 25);
  assert.equal(oldD.data.settings.readerNotes, 'Old notes');
  assert.deepEqual(oldD.data.fieldNotes.map((n) => n.id).sort(), ['n1', 'o1']);
  // Old device later edits a different setting; the new device's earlier change must not be reverted.
  oldD.edit((d) => ({ ...d, settings: { ...d.settings, weatherAware: false } }), 3000);
  await oldD.sync(gh, 3100);
  await newD.sync(gh, 3200);
  assert.equal(newD.data.settings.radiusMiles, 25);
  assert.equal(newD.data.settings.weatherAware, false);
  assert.equal(newD.data.settings.readerNotes, 'Old notes');
  // And back to the old device once more.
  await oldD.sync(gh, 3300);
  assert.equal(oldD.data.settings.radiusMiles, 25);
  assert.equal(oldD.data.settings.weatherAware, false);
});

test('mixed versions: deletions cross versions, and the two clients settle (no write ping-pong)', async () => {
  const gh = new FakeGitHub();
  const oldD = new OldDevice();
  const newD = new Device();
  newD.edit((d) => ({ ...d, fieldNotes: [note('a', 'A'), note('b', 'B')] }), 1000);
  await newD.sync(gh, 1100);
  await oldD.sync(gh, 1200);
  oldD.edit((d) => ({ ...d, fieldNotes: d.fieldNotes.filter((n) => n.id !== 'a') }), 2000);
  await oldD.sync(gh, 2100);
  await newD.sync(gh, 2200);
  assert.deepEqual(newD.data.fieldNotes.map((n) => n.id), ['b']);
  newD.edit((d) => ({ ...d, fieldNotes: [] }), 3000);
  await newD.sync(gh, 3100);
  await oldD.sync(gh, 3200);
  assert.deepEqual(oldD.data.fieldNotes, []);
  // Quiet period: repeated syncs on both sides must stop writing.
  for (let i = 0; i < 3; i++) {
    await newD.sync(gh, 4000 + i);
    await oldD.sync(gh, 4100 + i);
  }
  const settled = gh.writes;
  await newD.sync(gh, 5000);
  await oldD.sync(gh, 5100);
  assert.equal(gh.writes, settled, 'no further writes once both clients agree');
});
