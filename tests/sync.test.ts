import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/utils/sync.ts';
import { EMPTY_DATA, parseBackup, buildBackup, mergeData, normalizeData } from '../src/utils/storage.ts';
import type { PersonalData } from '../src/types/index.ts';

class Dev {
  data: PersonalData = structuredClone(EMPTY_DATA);
  meta = S.EMPTY_META;
  prev = S.syncEntries(this.data);
  edit(fn: (d: PersonalData) => PersonalData, t: number) {
    this.data = fn(structuredClone(this.data));
    const next = S.syncEntries(this.data);
    this.meta = S.stampChanges(this.prev, next, this.meta, t);
    this.prev = next;
  }
  sync(remote: { entries: S.Entries; meta: S.SyncMeta } | null, t: number) {
    const m = S.mergeReplicas({ entries: this.prev, meta: this.meta }, remote ?? { entries: {}, meta: S.EMPTY_META }, t);
    this.data = S.fromEntries(m.entries);
    this.prev = S.syncEntries(this.data);
    this.meta = m.meta;
    return m;
  }
}
const note = (id: string, title: string, t: string) => ({ id, title, category: 'Album' as const, tags: [], createdAt: t });

test('two devices merge edits, deletions and concurrent changes', () => {
  const A = new Dev(), B = new Dev();
  let remote: ReturnType<Dev['sync']> | null = null;
  A.edit((d) => ({ ...d, fieldNotes: [note('n1', 'Madvillainy', '2026-01-01')], favorites: ['pl-weedon'] }), 1000);
  remote = A.sync(remote, 1001);
  B.edit((d) => ({ ...d, fieldNotes: [note('n2', 'Aquemini', '2026-01-02')] }), 1100);
  remote = B.sync(remote, 1101);
  assert.equal(B.data.fieldNotes.length, 2);
  A.sync(remote, 1200);
  A.edit((d) => ({ ...d, fieldNotes: d.fieldNotes.filter((n) => n.id !== 'n1'), interests: d.interests!.map((i, k) => (k === 0 ? { ...i, name: 'Drawing (ink)' } : i)) }), 1300);
  B.edit((d) => ({ ...d, interests: S.fromEntries(S.syncEntries(d)).interests!.map((i, k) => (k === 1 ? { ...i, name: 'Graffiti & letters' } : i)) }), 1310);
  remote = A.sync(remote, 1400);
  remote = B.sync(remote, 1500);
  A.sync(remote, 1600);
  for (const dv of [A, B]) {
    assert.ok(!dv.data.fieldNotes.some((x) => x.id === 'n1'), 'deleted note came back');
    assert.equal(dv.data.interests![0].name, 'Drawing (ink)');
    assert.equal(dv.data.interests![1].name, 'Graffiti & letters');
  }
  A.edit((d) => ({ ...d, fieldNotes: d.fieldNotes.map((x) => ({ ...x, notes: 'A' })) }), 2000);
  B.edit((d) => ({ ...d, fieldNotes: d.fieldNotes.map((x) => ({ ...x, notes: 'B' })) }), 2100);
  remote = A.sync(remote, 2200);
  remote = B.sync(remote, 2300);
  A.sync(remote, 2400);
  assert.equal(A.data.fieldNotes[0].notes, 'B');
  const before = JSON.stringify(A.data);
  A.sync(remote, 2500);
  assert.equal(JSON.stringify(A.data), before, 'sync is idempotent');
});

test('backup round-trip and merge', () => {
  const b = buildBackup({ ...EMPTY_DATA, favorites: ['a'] });
  const p = parseBackup(JSON.stringify(b));
  assert.ok(p.ok && p.data.favorites[0] === 'a');
  assert.equal(parseBackup('nope').ok, false);
  assert.equal(normalizeData(null).version, 1);
  assert.equal(mergeData({ ...EMPTY_DATA, favorites: ['a'] }, { ...EMPTY_DATA, favorites: ['a', 'b'] }).favorites.length, 2);
});
