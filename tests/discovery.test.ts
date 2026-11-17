import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_EXPERIENCES as X } from '../src/data/experiences.ts';
import { SEED_PLACES as P, PLACE_CATEGORIES } from '../src/data/places.ts';
import { SEED_WEBSITES as W } from '../src/data/websites.ts';
import { SEED_INTERESTS as I } from '../src/data/interests.ts';
import { CURATED as C } from '../src/data/curated.ts';
import * as D from '../src/utils/discovery.ts';
import { FILTER_GROUPS } from '../src/utils/labels.ts';

const unique = (a: string[]) => new Set(a).size === a.length;

test('seed data ids are unique and references resolve', () => {
  for (const [name, list] of [['exp', X], ['place', P], ['web', W], ['interest', I]] as const)
    assert.ok(unique(list.map((x) => x.id)), `duplicate ${name} ids`);
  const pids = new Set(P.map((p) => p.id));
  const xids = new Set(X.map((x) => x.id));
  for (const e of X) {
    for (const id of e.placeIds ?? []) assert.ok(pids.has(id), `${e.id} -> missing place ${id}`);
    assert.ok(e.cost.min <= e.cost.max && e.duration.min <= e.duration.max, `bad range ${e.id}`);
    assert.ok(e.moods.length && e.company.length && e.environments.length, `empty facets ${e.id}`);
  }
  for (const c of C) for (const id of c.experienceIds) assert.ok(xids.has(id), `curated ${c.id} -> ${id}`);
  for (const p of P) for (const c of p.categories) assert.ok(PLACE_CATEGORIES.includes(c), `category ${p.id}`);
  assert.ok(X.length >= 40);
});

test('every single filter option has at least one match', () => {
  for (const g of FILTER_GROUPS)
    for (const o of g.options) {
      const f = { ...D.DEFAULT_FILTERS, [g.key]: o.value } as typeof D.DEFAULT_FILTERS;
      assert.ok(D.filterExperiences(X, f).length > 0, `${g.key}=${o.value}`);
    }
});

test('picks never repeat until the pool is exhausted', () => {
  const cand = D.filterExperiences(X, { ...D.DEFAULT_FILTERS, mood: 'relax' });
  let seen: string[] = [];
  let last: string | null = null;
  const got = new Set<string>();
  for (let i = 0; i < cand.length; i++) {
    const r = D.pickExperience(cand, seen, last);
    seen = r.seen;
    last = r.pick!.id;
    assert.ok(!got.has(last), 'repeated before cycle');
    got.add(last);
  }
  const r2 = D.pickExperience(cand, seen, last);
  assert.ok(r2.cycled && r2.pick!.id !== last);
});

test('relaxation suggestions never silently drop filters', () => {
  const f = { ...D.DEFAULT_FILTERS, mood: 'connect', time: 'fullDay', budget: 'free', energy: 'high', environment: 'online' } as typeof D.DEFAULT_FILTERS;
  assert.equal(D.filterExperiences(X, f).length, 0);
  const r = D.suggestRelaxations(X, f);
  for (const s of r) assert.ok(D.filterExperiences(X, { ...f, [s.key]: D.DEFAULT_FILTERS[s.key] }).length === s.count);
});
