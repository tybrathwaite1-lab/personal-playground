/**
 * Discovery foundation (PR 1, collaboration/ARCHITECTURE_ASSESSMENT_V2.md): adapters, relation
 * semantics, availability and bounded neighbourhoods over synthetic fixtures, then a
 * characterisation of the real Weekly Drop content. Dates are always explicit, so nothing here
 * depends on the day the tests run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiscoveryGraph, fromDropItem, fromThreadNode, type DiscoveryContent } from '../src/discovery/index.ts';
import type { DropEdition, DropItem, DropRelation, ThreadNode } from '../src/types/drop.ts';

// ─── Fixtures ────────────────────────────────────────────────────────
const rel = (to: string, relation = 'influenced', basis: 'fact' | 'editorial' = 'fact', note = `A note about ${to}.`): DropRelation => ({ to, relation, note, basis });
const item = (id: string, related?: DropRelation[], extra: Partial<DropItem> = {}): DropItem => ({
  id,
  column: 'listen',
  format: 'brief',
  title: `Title ${id}`,
  dek: `Dek ${id}`,
  body: ['Body.'],
  why: 'Why.',
  freshness: 'archive',
  depth: 'accessible',
  tags: ['tag'],
  sources: [{ label: 'Source', url: `https://example.org/${id}`, kind: 'reference', verifiedAt: '2026-11-01' }],
  ...(related && { related }),
  ...extra,
});
const node = (id: string, related?: DropRelation[], extra: Partial<ThreadNode> = {}): ThreadNode => ({ id, title: `Node ${id}`, type: 'person', summary: `Summary ${id}`, ...(related && { related }), ...extra });
const edition = (issue: number, publishDate: string, items: DropItem[], status: DropEdition['status'] = 'published'): DropEdition => ({
  schemaVersion: 1,
  issue,
  slug: `issue-${issue}`,
  title: `Issue ${issue}`,
  theme: 'Theme',
  status,
  publishDate,
  intro: 'Intro.',
  featured: items[0]?.id ?? 'none',
  items,
});
const graph = (content: Partial<DiscoveryContent>, today = '2026-11-21') => createDiscoveryGraph({ editions: [], nodes: [], ...content }, { today });
const others = (g: ReturnType<typeof graph>, id: string) => g.relationsFor(id).map((v) => `${v.direction}:${v.other}:${v.claim.relation}`);

// ─── Adapters ────────────────────────────────────────────────────────
test('adapters keep ids, attribution and metadata exactly, and point back at the original record', () => {
  const it = item('sample-item', [rel('n1')], { year: '1998', creators: ['A. Creator', 'B. Creator'], image: 'img-sample', exploreMinutes: 20 });
  const ed = edition(4, '2026-11-20', [it]);
  const d = fromDropItem(it, ed);
  assert.equal(d.id, 'sample-item');
  assert.equal(d.kind, 'drop-item');
  assert.equal(d.title, it.title);
  assert.equal(d.context, it.dek);
  assert.equal(d.year, '1998');
  assert.deepEqual(d.creators, ['A. Creator', 'B. Creator']);
  assert.deepEqual(d.sources, it.sources, 'sources with their verifiedAt dates, as published');
  assert.equal(d.image, 'img-sample');
  assert.deepEqual(d.tags, ['tag']);
  assert.equal(d.column, 'listen');
  assert.deepEqual(d.edition, { issue: 4, slug: 'issue-4', title: 'Issue 4', publishDate: '2026-11-20' });
  assert.equal(d.record, it, 'the original record, not a copy');
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.creators) && Object.isFrozen(d.sources));
  assert.equal(Object.isFrozen(it), false, "the caller's record is never frozen or changed");

  const n = node('sample-node', [rel('x')], { year: '1972', url: 'https://example.org/n', type: 'hardware' });
  const dn = fromThreadNode(n);
  assert.deepEqual(
    { id: dn.id, kind: dn.kind, title: dn.title, context: dn.context, year: dn.year, url: dn.url, nodeType: dn.nodeType },
    { id: 'sample-node', kind: 'thread-node', title: n.title, context: n.summary, year: '1972', url: 'https://example.org/n', nodeType: 'hardware' },
  );
  assert.equal(dn.record, n);
});

test('missing optional metadata stays missing: nothing is invented', () => {
  const d = fromDropItem(item('bare'), edition(1, '2026-11-01', []));
  for (const k of ['year', 'image', 'url', 'nodeType'] as const) assert.equal(k in d, false, `no ${k}`);
  assert.deepEqual(d.creators, []);
  const n = fromThreadNode(node('bare-node'));
  for (const k of ['year', 'url', 'image', 'column', 'edition'] as const) assert.equal(k in n, false, `no ${k}`);
  assert.deepEqual(n.creators, [], 'nodes never get creators');
  assert.deepEqual(n.sources, [], 'nodes never get sources or verification dates');
});

// ─── Relations ───────────────────────────────────────────────────────
test('relations are traversable both ways; meaning always reads from → to', () => {
  const g = graph({ editions: [edition(1, '2026-11-01', [item('album', [rel('artist', 'recorded by')])])], nodes: [node('artist')] });
  const fromAlbum = g.relationsFor('album');
  const fromArtist = g.relationsFor('artist');
  assert.equal(fromAlbum.length, 1);
  assert.equal(fromArtist.length, 1);
  assert.deepEqual([fromAlbum[0].direction, fromAlbum[0].other], ['outgoing', 'artist']);
  assert.deepEqual([fromArtist[0].direction, fromArtist[0].other], ['incoming', 'album']);
  // The same claim object both ways: direction is traversal only, never a reversed claim.
  assert.equal(fromAlbum[0].claim, fromArtist[0].claim);
  assert.deepEqual(fromArtist[0].claim, { from: 'album', to: 'artist', relation: 'recorded by', note: 'A note about artist.', basis: 'fact' });
});

test('genuine duplicates collapse; reciprocal and differently-worded claims are kept', () => {
  const g = graph({
    nodes: [
      node('a', [
        rel('b', 'sampled', 'fact', 'First wording.'),
        rel('b', ' Sampled ', 'fact', 'Second wording of the same claim.'), // same from/to/relation/basis → duplicate
        rel('b', 'sampled', 'editorial'), // different basis → distinct
        rel('b', 'toured with'), // different relation → distinct
      ]),
      node('b', [rel('a', 'sampled')]), // reciprocal → distinct
    ],
  });
  assert.deepEqual(others(g, 'a'), ['outgoing:b:sampled', 'outgoing:b:sampled', 'outgoing:b:toured with', 'incoming:b:sampled']);
  assert.equal(g.relationsFor('a')[0].claim.note, 'First wording.', 'the first of a duplicate is kept, unchanged');
  assert.deepEqual(
    g.relationsFor('a').map((v) => v.claim.basis),
    ['fact', 'editorial', 'fact', 'fact'],
  );
  assert.deepEqual(g.problems.map((p) => p.kind), ['duplicate-claim']);
  // The neighbourhood lists b once, with every distinct claim between them.
  const n = g.neighbourhood('a')!;
  assert.deepEqual(n.inner.map((e) => e.discovery.id), ['b']);
  assert.equal(n.inner[0].relations.length, 4);
});

test('self-links are ignored; unknown targets are ignored and reported', () => {
  const g = graph({ nodes: [node('a', [rel('a'), rel('nowhere'), rel('b')]), node('b')] });
  assert.deepEqual(others(g, 'a'), ['outgoing:b:influenced']);
  assert.deepEqual(
    g.problems.map((p) => [p.kind, p.id]),
    [
      ['self-link', 'a'],
      ['unresolved-target', 'a'],
    ],
  );
  assert.deepEqual(g.relationsFor('nowhere'), [], 'unknown ids have no relations');
  assert.equal(g.get('nowhere'), null);
  assert.equal(g.neighbourhood('nowhere'), null);
});

test('id collisions keep the first available record and report the rest', () => {
  const g = graph({ editions: [edition(1, '2026-11-01', [item('shared')])], nodes: [node('shared'), node('other', [rel('shared')])] });
  assert.equal(g.get('shared')!.kind, 'drop-item', 'items come first, as in the thread panel');
  assert.deepEqual(g.problems.map((p) => [p.kind, p.id]), [['id-collision', 'shared']]);
  assert.deepEqual(others(g, 'shared'), ['incoming:other:influenced']);
});

// ─── Availability ────────────────────────────────────────────────────
test('scheduled and draft items are unavailable until published, and never leak through traversal', () => {
  const content: Partial<DiscoveryContent> = {
    editions: [
      edition(1, '2026-11-17', [item('live', [rel('hub')])]),
      edition(2, '2026-11-27', [item('soon', [rel('hub'), rel('live')])], 'scheduled'),
      edition(3, '2026-11-01', [item('draft', [rel('hub')])], 'draft'),
    ],
    nodes: [node('hub', [rel('soon', 'precedes'), rel('draft'), rel('far')]), node('far', [rel('soon')])],
  };
  const before = graph(content, '2026-11-21');
  assert.deepEqual(before.all().map((d) => d.id), ['live', 'hub', 'far']);
  assert.equal(before.get('soon'), null);
  assert.equal(before.get('draft'), null);
  assert.equal(before.neighbourhood('soon'), null);
  // Not reachable as a target, nor seen as an author, at any depth.
  assert.deepEqual(others(before, 'hub'), ['outgoing:far:influenced', 'incoming:live:influenced']);
  assert.deepEqual(others(before, 'far'), ['incoming:hub:influenced']);
  for (const id of ['live', 'hub', 'far']) {
    const n = before.neighbourhood(id, { innerLimit: 100, outerLimit: 100 })!;
    const reached = [n.centre, ...n.inner.map((e) => e.discovery), ...n.outer.map((e) => e.discovery)].map((d) => d.id);
    assert.ok(!reached.includes('soon') && !reached.includes('draft'), `${id}: ${reached}`);
    assert.ok(![...n.inner, ...n.outer].some((e) => e.relations.some((v) => ['soon', 'draft'].includes(v.claim.from) || ['soon', 'draft'].includes(v.claim.to))));
  }
  // Unavailable targets aren't problems: nothing in the diagnostics names scheduled content.
  assert.deepEqual(before.problems, []);

  // On its publish date (New York), the scheduled item appears with all its claims; drafts never do.
  const on = graph(content, '2026-11-27');
  assert.ok(on.has('soon'));
  assert.equal(on.has('draft'), false);
  assert.deepEqual(others(on, 'soon'), ['outgoing:hub:influenced', 'outgoing:live:influenced', 'incoming:far:influenced', 'incoming:hub:precedes']);
  assert.equal(graph(content, '2026-11-26').has('soon'), false, 'the day before, still unavailable');
});

test('today must be an explicit, real YYYY-MM-DD date', () => {
  for (const today of ['', '2026-11-31', '2026/11/21', 'today', undefined as unknown as string, '2026-11-21T00:00'])
    assert.throws(() => createDiscoveryGraph({ editions: [], nodes: [] }, { today }), RangeError, String(today));
});

// ─── Neighbourhoods ──────────────────────────────────────────────────
const web = () =>
  graph({
    nodes: [
      node('c', [rel('i1'), rel('i2'), rel('i3')]),
      node('i1', [rel('o1'), rel('o2'), rel('c', 'answers')]),
      node('i2', [rel('o2'), rel('i3'), rel('o3')]),
      node('i3', [rel('o4')]),
      node('o1', [rel('x1')]), // third degree from c
      node('o2'),
      node('o3', [rel('c')]), // points back at the centre: still a direct relation of c
      node('o4'),
      node('lonely'),
      node('x1'),
    ],
  });

test('neighbourhoods: inner = direct relations; outer = strictly second-degree; depth never exceeds two', () => {
  const g = web();
  const n = g.neighbourhood('c')!;
  assert.equal(n.centre.id, 'c');
  assert.deepEqual(n.inner.map((e) => [e.discovery.id, e.via]), [['i1', 'c'], ['i2', 'c'], ['i3', 'c'], ['o3', 'c']]);
  // i1 has two claims with c (c → i1 and i1 → c): both kept.
  assert.deepEqual(n.inner[0].relations.map((v) => `${v.direction}:${v.claim.from}->${v.claim.to}`), ['outgoing:c->i1', 'incoming:i1->c']);
  assert.deepEqual(n.outer.map((e) => [e.discovery.id, e.via]), [['o1', 'i1'], ['o2', 'i1'], ['o4', 'i3']]);
  assert.ok(!n.outer.some((e) => e.discovery.id === 'x1'), 'third degree is never reached');
  assert.ok(!n.outer.some((e) => ['c', 'i1', 'i2', 'i3', 'o3'].includes(e.discovery.id)), 'outer never repeats the centre or a direct relation');
  assert.deepEqual(n.omitted, { inner: 0, outer: 0 });
  assert.deepEqual(g.neighbourhood('c', { depth: 1 })!.outer, [], 'depth 1: no outer ring');
  for (const depth of [0, 3, 1.5, -1]) assert.throws(() => g.neighbourhood('c', { depth: depth as 1 }), RangeError, `depth ${depth}`);
});

test('neighbourhoods respect inner and outer limits and report what they left out', () => {
  const g = web();
  const n = g.neighbourhood('c', { innerLimit: 2, outerLimit: 1 })!;
  assert.deepEqual(n.inner.map((e) => e.discovery.id), ['i1', 'i2']);
  assert.deepEqual(n.outer.map((e) => e.discovery.id), ['o1'], 'grown only from the shown inner ring');
  assert.ok(!n.outer.some((e) => e.discovery.id === 'i3'), 'a direct relation left out by the limit is not demoted to the outer ring');
  assert.deepEqual(n.omitted, { inner: 2, outer: 1 }, 'o2 is left out (o3 is direct; o4 is reached only via i3, which is not shown)');
  const zero = g.neighbourhood('c', { innerLimit: 0 })!;
  assert.deepEqual([zero.inner.length, zero.outer.length, zero.omitted.inner], [0, 0, 4]);
  for (const bad of [-1, 1.5, Number.NaN]) {
    assert.throws(() => g.neighbourhood('c', { innerLimit: bad }), RangeError);
    assert.throws(() => g.neighbourhood('c', { outerLimit: bad }), RangeError);
  }
});

test('cycles, disconnected discoveries and empty graphs are handled safely', () => {
  const cycle = graph({ nodes: [node('a', [rel('b')]), node('b', [rel('c')]), node('c', [rel('a')])] });
  const n = cycle.neighbourhood('a')!;
  assert.deepEqual(n.inner.map((e) => e.discovery.id), ['b', 'c'], 'in a triangle, both others are direct');
  assert.deepEqual(n.outer, []);
  const lonely = web().neighbourhood('lonely')!;
  assert.deepEqual([lonely.inner, lonely.outer, lonely.omitted], [[], [], { inner: 0, outer: 0 }]);
  const empty = graph({});
  assert.deepEqual([empty.all(), empty.problems, empty.relationsFor('x')], [[], [], []]);
  assert.equal(empty.neighbourhood('x'), null);
});

test('results are deterministic: same content, date and options give identical output', () => {
  const content = {
    editions: [edition(2, '2026-11-10', [item('b-item', [rel('zz'), rel('aa')])]), edition(1, '2026-11-01', [item('a-item', [rel('aa')])])],
    nodes: [node('zz', [rel('aa')]), node('aa', [rel('b-item')])],
  };
  const snap = () => {
    const g = graph(content);
    return JSON.stringify({ all: g.all().map((d) => d.id), rel: g.all().map((d) => others(g, d.id)), n: g.all().map((d) => g.neighbourhood(d.id, { innerLimit: 3, outerLimit: 3 })) }, (k, v) => (k === 'record' ? undefined : v));
  };
  assert.equal(snap(), snap());
  const g = graph(content);
  assert.deepEqual(g.all().map((d) => d.id), ['a-item', 'b-item', 'zz', 'aa'], 'items by issue then position, then nodes in file order');
  // Outgoing in authored order; incoming by author id (code units), whatever the input order.
  assert.deepEqual(others(g, 'aa'), ['outgoing:b-item:influenced', 'incoming:a-item:influenced', 'incoming:b-item:influenced', 'incoming:zz:influenced']);
  assert.equal(g.relationsFor('aa'), g.relationsFor('aa'), 'stable, cached result');
  assert.ok(Object.isFrozen(g.relationsFor('aa')) && Object.isFrozen(g.neighbourhood('aa')));
});

// ─── The real Weekly Drop content ────────────────────────────────────
const root = fileURLToPath(new URL('..', import.meta.url));
const editionFiles = readdirSync(join(root, 'content/drop/editions')).filter((f) => f.endsWith('.json')).sort();
const real: DiscoveryContent = {
  editions: editionFiles.map((f) => JSON.parse(readFileSync(join(root, 'content/drop/editions', f), 'utf8')) as DropEdition),
  nodes: JSON.parse(readFileSync(join(root, 'content/drop/nodes.json'), 'utf8')) as ThreadNode[],
};

test('characterisation: the real Drop content on 2026-11-21 (two editions published)', () => {
  const g = createDiscoveryGraph(real, { today: '2026-11-21' });
  assert.deepEqual(g.problems, [], 'no duplicates, self-links, unknown targets or collisions');
  const items = g.all().filter((d) => d.kind === 'drop-item');
  assert.equal(items.length, 12, 'issues 1 and 2, six items each');
  assert.equal(g.all().length, 12 + real.nodes.length);
  // A documented claim keeps its meaning from both ends.
  const thief = g.relationsFor('thief-1981').find((v) => v.other === 'michael-mann')!;
  assert.deepEqual([thief.direction, thief.claim.basis, thief.claim.from, thief.claim.to], ['outgoing', 'fact', 'thief-1981', 'michael-mann']);
  const fromMann = g.relationsFor('michael-mann').filter((v) => v.other === 'thief-1981');
  assert.deepEqual(fromMann.map((v) => [v.direction, v.claim.from]).sort(), [['incoming', 'thief-1981'], ['outgoing', 'michael-mann']], 'the reciprocal pair stays two distinct claims');
  // Scheduled content (issue 3 on 2026-11-27) is invisible: Samurai Champloo's link to it is absent.
  assert.equal(g.has('nujabes-champloo'), false);
  assert.ok(!g.relationsFor('samurai-champloo').some((v) => v.other === 'nujabes-champloo'));
  for (const d of g.all()) {
    const n = g.neighbourhood(d.id)!;
    const ids = [...n.inner, ...n.outer].map((e) => e.discovery.id);
    assert.ok(ids.every((id) => g.has(id)), `${d.id}: only available discoveries`);
    assert.ok(n.inner.length <= 6 && n.outer.length <= 12, `${d.id}: within the default limits`);
  }
  // Every item keeps its attribution exactly.
  for (const d of items) assert.deepEqual(d.sources, (d.record as DropItem).sources);
});

test('characterisation: on 2026-11-27 issue 3 publishes, with its reciprocal Champloo claims', () => {
  const g = createDiscoveryGraph(real, { today: '2026-11-27' });
  assert.equal(g.all().filter((d) => d.kind === 'drop-item').length, 18);
  const pair = g.relationsFor('nujabes-champloo').filter((v) => v.other === 'samurai-champloo');
  assert.deepEqual(pair.map((v) => v.direction).sort(), ['incoming', 'outgoing'], 'both authored claims, neither reversed');
  assert.ok(pair.every((v) => (v.direction === 'outgoing' ? v.claim.from === 'nujabes-champloo' : v.claim.from === 'samurai-champloo')));
  assert.deepEqual(g.problems, []);
});

// ─── Isolation ───────────────────────────────────────────────────────
test('the module is isolated: nothing in the app imports it, and it imports no UI', () => {
  const files = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((f) => {
      const p = join(dir, f);
      return statSync(join(root, p)).isDirectory() ? files(p) : [p];
    });
  // Resolve every relative import in the app and check none lands in src/discovery.
  const importers = files('src')
    .filter((f) => /\.(tsx?)$/.test(f) && !f.startsWith('src/discovery/'))
    .filter((f) =>
      [...readFileSync(join(root, f), 'utf8').matchAll(/(?:from|import\()\s*['"](\.{1,2}\/[^'"]*)['"]/g)].some((m) => {
        const target = join(dirname(f), m[1]);
        return target === 'src/discovery' || target.startsWith('src/discovery/');
      }),
    );
  // The resolver does see real imports (here: src/utils/discovery, a different module).
  assert.ok(files('src').some((f) => [...readFileSync(join(root, f), 'utf8').matchAll(/from\s*['"](\.{1,2}\/[^'"]*)['"]/g)].some((m) => join(dirname(f), m[1]) === 'src/utils/discovery')));
  assert.deepEqual(importers, [], 'src/discovery is not wired into any route or component yet (src/utils/discovery is a different module)');
  for (const f of files('src/discovery')) {
    const src = readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const i of imports) assert.match(i, /^\.\/|^\.\.\/types\/drop$|^\.\.\/utils\/dropValidate$/, `${f} imports ${i}`);
    assert.doesNotMatch(src, /localStorage|sessionStorage|fetch\(|Date\.now|new Date\(\)/, `${f}: no storage, network or clock`);
  }
});
