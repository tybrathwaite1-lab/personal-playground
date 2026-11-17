import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import type { DropEdition, ThreadNode } from '../src/types/drop.ts';
import { validateEdition, validateLibrary, visibleEditions } from '../src/utils/dropValidate.ts';
import { SEED_PLACES } from '../src/data/places.ts';
import { COMMUNITIES } from '../src/data/communities.ts';

const dir = new URL('../content/drop/editions/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const editions = files.map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as DropEdition);
const nodes = JSON.parse(readFileSync(new URL('../content/drop/nodes.json', import.meta.url), 'utf8')) as ThreadNode[];
const ctx = { knownPlaces: new Set(SEED_PLACES.map((p) => p.id)), knownCommunities: new Set(COMMUNITIES.map((c) => c.id)) };

test('every edition in the repo is valid', () => {
  assert.ok(editions.length >= 8);
  for (const [i, e] of editions.entries()) {
    const r = validateEdition(e, ctx);
    assert.deepEqual(r.errors, [], `${files[i]}: ${JSON.stringify(r.errors)}`);
  }
  const lib = validateLibrary(editions, nodes);
  assert.deepEqual(lib.errors, []);
});

test('editions appear on their publish date (New York) and drafts never do', () => {
  const ids = (d: string) => visibleEditions(editions, d).map((e) => e.issue);
  assert.deepEqual(ids('2026-11-17'), [1]);
  assert.deepEqual(ids('2026-11-20'), [2, 1]);
  const draft = { ...editions[0], issue: 99, slug: 'x', status: 'draft' as const, publishDate: '2026-01-02' };
  assert.ok(!visibleEditions([...editions, draft], '2027-06-01').some((e) => e.issue === 99));
});

test('validator catches common import mistakes', () => {
  const bad = { ...editions[0], featured: 'nope', items: [{ ...editions[0].items[0], sources: [{ label: 'x', url: 'http://insecure', kind: 'reference', verifiedAt: '2026-13-01' }] }] };
  const r = validateEdition(bad);
  const paths = r.errors.map((e) => e.path).join(' ');
  assert.match(paths, /featured/);
  assert.match(paths, /items\[0\]\.sources\[0\]\.url/);
  assert.match(paths, /verifiedAt/);
  assert.match(paths, /items/); // fewer than 3
  const contemporary = { ...editions[0], items: editions[0].items.map((it) => ({ ...it, freshness: 'contemporary', year: undefined })) };
  assert.ok(validateEdition(contemporary).errors.some((e) => e.path.endsWith('.year')), 'recent items must state a year');
});
