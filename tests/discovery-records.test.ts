/**
 * PR 2, editorial content foundation: standalone discovery records (content/discoveries),
 * their validation, the public build, link-check classes and graph integration. Dates are
 * always explicit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGES } from '../src/data/images.ts';
import { availableRecords, createDiscoveryGraph, fromDiscoveryRecord, publicDiscoveryFile, validateDiscoveryLibrary, validateDiscoveryRecord, type DiscoveryRecord } from '../src/discovery/index.ts';
import type { DropEdition, ThreadNode } from '../src/types/drop.ts';
import { classifyLink, NEEDS_REVIEW } from '../scripts/discoveries/linkClass.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const images = new Map(IMAGES.map((i) => [i.id, i]));
const ctx = { images, today: '2026-11-25' };
const record = (over: Partial<DiscoveryRecord> & Record<string, unknown> = {}): DiscoveryRecord =>
  ({
    schemaVersion: 1,
    id: 'sample-discovery',
    status: 'ready',
    title: 'A sample',
    subject: 'Sample subject',
    context: 'Concise context.',
    nature: 'work',
    credits: [{ name: 'A. Maker', role: 'Artist' }],
    tags: ['sample'],
    destination: { url: 'https://example.org/work', label: 'The work', verifiedAt: '2026-11-25' },
    sources: [{ label: 'A source', url: 'https://example.org/about', kind: 'reference', verifiedAt: '2026-11-25' }],
    ...over,
  }) as DiscoveryRecord;
const errs = (r: unknown) => validateDiscoveryRecord(r, ctx).errors.map((e) => `${e.path.replace(/^discovery( \([^)]*\))?/, '')}: ${e.message}`);

// ─── Record validation ───────────────────────────────────────────────
test('a complete record is valid; missing optional imagery is fine', () => {
  assert.deepEqual(errs(record()), []);
  assert.equal('image' in record(), false);
  assert.deepEqual(validateDiscoveryRecord(record(), ctx).warnings, []);
});

test('required metadata and creator attribution', () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ['schema version', { schemaVersion: 2 }, /^\.schemaVersion: must be 1/],
    ['id', { id: 'Not Kebab' }, /\.id: must be kebab-case/],
    ['status', { status: 'live' }, /\.status: must be draft, ready or published/],
    ['published without a date', { status: 'published' }, /\.publishDate: is required when published/],
    ['bad date', { publishDate: '2026-02-30' }, /\.publishDate: must be a real/],
    ['title', { title: ' ' }, /\.title: is required/],
    ['subject', { subject: undefined }, /\.subject: is required/],
    ['context', { context: '' }, /\.context: is required/],
    ['context too long', { context: 'x'.repeat(701) }, /keep it under 700/],
    ['nature', { nature: 'thing' }, /\.nature: must be work or subject/],
    ['a work without credits', { credits: [] }, /a work must credit its creator/],
    ['a credit without a role', { credits: [{ name: 'A. Maker' }] }, /credits\[0\]: needs a name and a role/],
    ['credits not an array', { credits: 'A. Maker' }, /credits: must be an array/],
    ['tags', { tags: ['ok', ''] }, /\.tags: must be an array of text/],
    ['no destination', { destination: undefined }, /\.destination: is required/],
    ['destination label', { destination: { url: 'https://example.org/', label: '', verifiedAt: '2026-11-25' } }, /destination\.label: is required/],
    ['destination availability', { destination: { url: 'https://example.org/', label: 'x', verifiedAt: '2026-11-25', availability: 'sometimes' } }, /availability: must be/],
    ['no sources', { sources: [] }, /\.sources: needs at least one/],
    ['source kind', { sources: [{ label: 'x', url: 'https://example.org/', kind: 'blog', verifiedAt: '2026-11-25' }] }, /sources\[0\]\.kind: unknown kind "blog"/],
    ['verification in the future', { sources: [{ label: 'x', url: 'https://example.org/', kind: 'press', verifiedAt: '2026-12-01' }] }, /verifiedAt: is in the future/],
    ['no verification date', { destination: { url: 'https://example.org/', label: 'x' } }, /destination\.verifiedAt: must be a real/],
  ];
  for (const [label, over, msg] of cases) {
    const e = errs(record(over));
    assert.ok(e.some((x) => msg.test(x)), `${label}: ${JSON.stringify(e)}`);
  }
  // A subject (a place or practice) may have no credits; a work may not.
  assert.deepEqual(errs(record({ nature: 'subject', credits: [] })), []);
  assert.deepEqual(errs('not an object'), [': must be an object']);
  assert.ok(validateDiscoveryRecord(record({ surprise: 1 }), ctx).warnings.some((w) => /unknown field/.test(w.message)));
});

test('destinations and sources must be safe https URLs', () => {
  const bad = [`javascript:alert(1)`, 'http://example.org/', ' https://example.org/', 'https//example.org', 'data:text/html,x', '/relative', 42];
  for (const url of bad) {
    assert.ok(errs(record({ destination: { url, label: 'x', verifiedAt: '2026-11-25' } })).some((e) => /destination\.url: must be an https URL/.test(e)), String(url));
    assert.ok(errs(record({ sources: [{ label: 'x', url, kind: 'press', verifiedAt: '2026-11-25' }] })).some((e) => /sources\[0\]\.url: must be an https URL/.test(e)), String(url));
  }
});

test('relations: Drop rules, no self-links, and duplicates (including conflicting notes) are errors', () => {
  const r = (related: unknown[]) => errs(record({ related }));
  assert.ok(r([{ to: 'x', relation: 'echoes' }]).some((e) => /related\[0\]: needs to, relation and note/.test(e)));
  assert.ok(r([{ to: 'x', relation: 'echoes', note: 'n', basis: 'rumour' }]).some((e) => /basis: must be fact or editorial/.test(e)));
  assert.ok(r([{ to: 'sample-discovery', relation: 'echoes', note: 'n', basis: 'editorial' }]).some((e) => /relates to itself/.test(e)));
  assert.ok(errs(record({ related: 'x' })).some((e) => /related: must be an array/.test(e)));
  const one = { to: 'other', relation: 'echoes', note: 'One wording.', basis: 'editorial' };
  assert.ok(r([one, { ...one }]).some((e) => /duplicates an earlier claim/.test(e)));
  assert.ok(r([one, { ...one, relation: ' Echoes ', note: 'Another wording.' }]).some((e) => /with a different note; keep one wording/.test(e)), 'conflicting notes for the same claim');
  // Distinct claims between the same pair are fine: a different relation, or a different basis.
  assert.deepEqual(r([one, { ...one, relation: 'answers', note: 'x' }, { ...one, basis: 'fact', note: 'y' }]), []);
});

test('imagery is optional, but when present it must be in the registry with its rights recorded', () => {
  const real = IMAGES[0];
  assert.deepEqual(errs(record({ image: real.id })), [], 'a registered, licensed image');
  assert.ok(errs(record({ image: 'img-not-registered' })).some((e) => /is not in the image registry/.test(e)));
  const thin = new Map([['img-thin', { license: 'CC BY 4.0', credit: '', sourceUrl: 'https://commons.wikimedia.org/x', alt: 'A' }]]);
  assert.ok(validateDiscoveryRecord(record({ image: 'img-thin' }), { images: thin }).errors.some((e) => /lacks license, credit/.test(e.message)));
  // Every registry entry carries a licence from the allowed list (the policy isn't broadened here).
  for (const i of IMAGES) assert.ok(/^(CC0|Public domain|CC BY(-SA)? [234]\.0)$/.test(i.license), i.id);
});

test('link reviews: about the record\'s own links; a published record cannot carry an unresolved one', () => {
  const review = { url: 'https://example.org/work', finding: 'permanent-failure', decision: 'replace', note: 'Moved.', reviewedAt: '2026-11-25' };
  assert.deepEqual(errs(record({ linkReviews: [review] })), [], 'allowed while not published');
  assert.ok(errs(record({ status: 'published', publishDate: '2026-11-25', linkReviews: [review] })).some((e) => /unresolved link review/.test(e)));
  assert.deepEqual(errs(record({ status: 'published', publishDate: '2026-11-25', linkReviews: [{ ...review, decision: 'keep', finding: 'transient-failure' }] })), []);
  assert.ok(errs(record({ linkReviews: [{ ...review, url: 'https://elsewhere.example/' }] })).some((e) => /must be one of this record's links/.test(e)));
  assert.ok(errs(record({ linkReviews: [{ ...review, decision: 'ignore' }] })).some((e) => /decision: must be keep, replace or remove/.test(e)));
});

// ─── Shared id namespace ─────────────────────────────────────────────
test('ids share one namespace with Drop items and thread nodes', () => {
  const lib = (records: DiscoveryRecord[]) => validateDiscoveryLibrary(records, { itemIds: ['thief-1981'], nodeIds: ['dreamcast'] });
  assert.deepEqual(lib([record()]).errors, []);
  assert.deepEqual(lib([record({ id: 'thief-1981' })]).errors.map((e) => e.message), ['id collides with a Weekly Drop item']);
  assert.deepEqual(lib([record({ id: 'dreamcast' })]).errors.map((e) => e.message), ['id collides with a thread node']);
  assert.deepEqual(lib([record(), record()]).errors.map((e) => e.message), ['id used by two discovery records']);
  const dangling = lib([record({ related: [{ to: 'nowhere', relation: 'echoes', note: 'n', basis: 'editorial' }] })]);
  assert.deepEqual(dangling.errors, []);
  assert.deepEqual(dangling.warnings.map((w) => w.message), ["target doesn't exist yet"]);
});

// ─── Availability ────────────────────────────────────────────────────
test('only published records on or after their date are available; drafts and ready never are', () => {
  const rs = [
    record({ id: 'draft-one', status: 'draft', publishDate: '2026-01-01' }),
    record({ id: 'ready-one', status: 'ready', publishDate: '2026-01-01' }),
    record({ id: 'live-b', status: 'published', publishDate: '2026-11-25' }),
    record({ id: 'live-a', status: 'published', publishDate: '2026-11-01' }),
    record({ id: 'future', status: 'published', publishDate: '2026-11-26' }),
  ];
  assert.deepEqual(availableRecords(rs, '2026-11-25').map((r) => r.id), ['live-a', 'live-b'], 'sorted by id; boundary date included');
  assert.deepEqual(availableRecords(rs, '2026-11-24').map((r) => r.id), ['live-a']);
  assert.deepEqual(availableRecords(rs, '2026-11-26').map((r) => r.id), ['future', 'live-a', 'live-b']);
});

test('graph integration: standalone records join the graph; unavailable ones never leak', () => {
  const rel = (to: string, relation = 'echoes') => ({ to, relation, note: `About ${to}.`, basis: 'editorial' as const });
  const discoveries = [
    record({ id: 'kissa', status: 'published', publishDate: '2026-11-20', nature: 'subject', credits: [], related: [rel('wall'), rel('arcade'), rel('dreamcast')] }),
    record({ id: 'wall', status: 'published', publishDate: '2026-11-20', related: [rel('tree')] }),
    record({ id: 'tree', status: 'published', publishDate: '2026-12-01' }), // scheduled
    record({ id: 'arcade', status: 'ready' }), // not published
  ];
  const nodes: ThreadNode[] = [{ id: 'dreamcast', title: 'Dreamcast', type: 'hardware', summary: 'S.', related: [rel('kissa', 'recalls')] }];
  const g = createDiscoveryGraph({ editions: [], nodes, discoveries }, { today: '2026-11-25' });
  assert.deepEqual(g.all().map((d) => `${d.kind}:${d.id}`), ['standalone:kissa', 'standalone:wall', 'thread-node:dreamcast']);
  assert.deepEqual(
    g.relationsFor('kissa').map((v) => `${v.direction}:${v.other}:${v.claim.from}->${v.claim.to}`),
    ['outgoing:wall:kissa->wall', 'outgoing:dreamcast:kissa->dreamcast', 'incoming:dreamcast:dreamcast->kissa'],
    'reciprocal claims (kissa→dreamcast, dreamcast→kissa) are both kept, unreversed',
  );
  const n = g.neighbourhood('kissa')!;
  const reached = [...n.inner, ...n.outer].map((e) => e.discovery.id);
  assert.ok(!reached.includes('tree') && !reached.includes('arcade'), `no leak: ${reached}`);
  assert.equal(g.get('tree'), null);
  assert.deepEqual(g.problems, [], 'unpublished targets are silent');
  // The adapter keeps credits with roles, the destination and sources apart, and nothing invented.
  const d = fromDiscoveryRecord(record({ credits: [{ name: 'A. Maker', role: 'Artist' }] }));
  assert.deepEqual([d.kind, d.creators, d.credits, d.destination?.url, d.sources.length, 'image' in d], ['standalone', ['A. Maker'], [{ name: 'A. Maker', role: 'Artist' }], 'https://example.org/work', 1, false]);
  // Once published (in memory), 'tree' appears via 'wall' at depth 2 only.
  const later = createDiscoveryGraph({ editions: [], nodes, discoveries }, { today: '2026-12-01' });
  assert.deepEqual(later.neighbourhood('kissa')!.outer.map((e) => [e.discovery.id, e.via]), [['tree', 'wall']]);
});

// ─── Link-check classes ──────────────────────────────────────────────
test('link checks distinguish invalid, permanent, blocked, transient and intentional', () => {
  const u = 'https://example.org/';
  assert.equal(classifyLink('http://example.org/', { status: 200 }), 'invalid');
  assert.equal(classifyLink('javascript:alert(1)', { status: 200 }), 'invalid');
  for (const s of [200, 204, 301, 302]) assert.equal(classifyLink(u, { status: s }), 'ok');
  for (const s of [404, 410]) assert.equal(classifyLink(u, { status: s }), 'permanent');
  assert.equal(classifyLink(u, { error: 'ENOTFOUND' }), 'permanent');
  for (const s of [401, 403, 451]) assert.equal(classifyLink(u, { status: s }), 'blocked');
  for (const s of [408, 429, 500, 502, 503]) assert.equal(classifyLink(u, { status: s }), 'transient');
  for (const e of ['AbortError', 'ECONNRESET', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT']) assert.equal(classifyLink(u, { error: e }), 'transient');
  // A destination that's offline by design (solar-powered) is intentional, not a failure…
  assert.equal(classifyLink(u, { error: 'ECONNREFUSED' }, 'intermittent'), 'intentional');
  assert.equal(classifyLink(u, { status: 503 }, 'intermittent'), 'intentional');
  // …but a 404 or a missing host is still permanent, whatever the record says.
  assert.equal(classifyLink(u, { status: 404 }, 'intermittent'), 'permanent');
  assert.equal(classifyLink(u, { error: 'ENOTFOUND' }, 'intermittent'), 'permanent');
  assert.deepEqual([...NEEDS_REVIEW].sort(), ['blocked', 'permanent'], 'transient and intentional never need a decision');
  // The checker is report-only by default and isn't wired into CI (no network dependence).
  const ci = readFileSync(join(root, '.github/workflows/check.yml'), 'utf8');
  assert.doesNotMatch(ci, /links:discoveries|discoveries\/check-links/);
});

// ─── The real content ────────────────────────────────────────────────
const dir = join(root, 'content/discoveries');
const real = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: f, raw: JSON.parse(readFileSync(join(dir, f), 'utf8')) as DiscoveryRecord }));
const editions = readdirSync(join(root, 'content/drop/editions'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(root, 'content/drop/editions', f), 'utf8')) as DropEdition);
const nodes = JSON.parse(readFileSync(join(root, 'content/drop/nodes.json'), 'utf8')) as ThreadNode[];

test('Edition 001 shortlist: eleven records, all valid, none published; each file is named for its id', () => {
  assert.equal(real.length, 11);
  for (const { file, raw } of real) {
    const v = validateDiscoveryRecord(raw, ctx, file);
    assert.deepEqual(v.errors, [], file);
    assert.deepEqual(v.warnings, [], file);
    assert.equal(file, `${raw.id}.json`);
    assert.notEqual(raw.status, 'published', `${raw.id}: publication is a separate owner decision`);
    assert.equal(raw.image, undefined, `${raw.id}: no image is cleared yet`);
  }
  assert.deepEqual(real.filter((r) => r.raw.status === 'draft').map((r) => r.raw.id), ['seed-erosion-blocks'], 'the one unresolved record stays a draft');
  const lib = validateDiscoveryLibrary(real.map((r) => r.raw), { itemIds: editions.flatMap((e) => e.items.map((i) => i.id)), nodeIds: nodes.map((n) => n.id) });
  assert.deepEqual(lib.errors, [], 'no collisions with Drop items or nodes');
  assert.deepEqual(lib.warnings, [], 'every relation target exists');
});

test('Edition 001 relationships: eight editorial claims, one direction each, Onyeabor unconnected', () => {
  const claims = real.flatMap(({ raw }) => (raw.related ?? []).map((x) => ({ from: raw.id, ...x })));
  assert.equal(claims.length, 8);
  assert.ok(claims.every((c) => c.basis === 'editorial'), 'interpretive associations, not claims of influence');
  const pairs = claims.map((c) => [c.from, c.to].sort().join('|'));
  assert.equal(new Set(pairs).size, 8, 'no pair is authored twice: traversal gives both directions');
  assert.ok(!claims.some((c) => c.from === 'william-onyeabor' || c.to === 'william-onyeabor'));
  // In memory, as if every ready record were published today: the graph has no problems, and the
  // draft (SEED) and its two claims stay out.
  const asPublished = real.map(({ raw }) => (raw.status === 'ready' ? { ...raw, status: 'published' as const, publishDate: '2026-11-25' } : raw));
  const g = createDiscoveryGraph({ editions, nodes, discoveries: asPublished }, { today: '2026-11-25' });
  assert.deepEqual(g.problems, []);
  assert.equal(g.all().filter((d) => d.kind === 'standalone').length, 10);
  assert.equal(g.get('seed-erosion-blocks'), null);
  assert.ok(!g.relationsFor('strandbeest').some((v) => v.other === 'seed-erosion-blocks'));
  assert.deepEqual(g.relationsFor('william-onyeabor'), []);
  const kissa = g.neighbourhood('jazz-kissa')!;
  assert.deepEqual(kissa.inner.map((e) => e.discovery.id), ['mauricio-lopez-60625', 'japanese-game-centers']);
  assert.deepEqual(kissa.outer.map((e) => [e.discovery.id, e.via]), [['arboreal-serenade', 'mauricio-lopez-60625']]);
  // And on the real data with real statuses, nothing standalone is available.
  assert.equal(createDiscoveryGraph({ editions, nodes, discoveries: real.map((r) => r.raw) }, { today: '2026-11-25' }).all().filter((d) => d.kind === 'standalone').length, 0);
});

test('the public file ships only public records, without editor-only fields, deterministically', () => {
  const rs = [
    record({ id: 'b-live', status: 'published', publishDate: '2026-11-20', editorialNotes: ['private'], linkReviews: [{ url: 'https://example.org/work', finding: 'transient-failure', decision: 'keep', note: 'n', reviewedAt: '2026-11-21' }] }),
    record({ id: 'a-live', status: 'published', publishDate: '2026-11-25' }),
    record({ id: 'c-ready', status: 'ready' }),
    record({ id: 'd-later', status: 'published', publishDate: '2026-11-26' }),
  ];
  const f = publicDiscoveryFile(rs, '2026-11-25');
  assert.equal(f.asOf, '2026-11-25');
  assert.deepEqual(f.discoveries.map((r) => r.id), ['a-live', 'b-live']);
  assert.ok(f.discoveries.every((r) => !('editorialNotes' in r) && !('linkReviews' in r)), 'editor-only fields never ship');
  assert.equal(JSON.stringify(f), JSON.stringify(publicDiscoveryFile([...rs].reverse(), '2026-11-25')), 'file order never matters');
  assert.equal(rs[0].editorialNotes?.length, 1, 'the input records are not modified');
});

test('the build script writes that file from the real content (nothing is published yet)', () => {
  const run = () => {
    execFileSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/discoveries/build.ts'), '--strict', '--today', '2026-11-25'], { cwd: root, stdio: 'pipe' });
    return readFileSync(join(root, 'public/data/discoveries.json'), 'utf8');
  };
  const a = run();
  assert.equal(a, run(), 'same input and date → identical bytes');
  assert.deepEqual(JSON.parse(a), { asOf: '2026-11-25', discoveries: [] });
});
