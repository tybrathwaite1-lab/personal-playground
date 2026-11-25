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
import { isPermittedImageLicense, PERMITTED_IMAGE_LICENSES } from '../src/data/imageLicenses.ts';
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
  assert.ok(validateDiscoveryRecord(record({ image: 'img-thin' }), { images: thin }).errors.some((e) => /lacks credit, https source or alt text/.test(e.message)));
  // Every registry entry carries a licence from the one policy list.
  for (const i of IMAGES) assert.ok(isPermittedImageLicense(i.license), i.id);
});

test('image licences: the approved open-licence policy is enforced, not just present', () => {
  // Complete metadata, licence outside the policy: rejected (review finding 2).
  const complete = { credit: 'A. Photographer', sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg', alt: 'A photo' };
  const disallowed = ['All rights reserved', 'CC BY-NC 4.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 4.0', 'Fair use', 'cc by 4.0', 'CC BY 4.0 ', 'GPL', '', 42, undefined];
  for (const license of disallowed) {
    const images = new Map([['img-x', { ...complete, license }]]);
    const e = validateDiscoveryRecord(record({ image: 'img-x' }), { images }).errors.map((x) => x.message);
    assert.ok(e.some((m) => /is not in the approved open-licence policy/.test(m)), `${String(license)}: ${JSON.stringify(e)}`);
  }
  // Every licence in the policy is accepted, with the same metadata.
  for (const license of PERMITTED_IMAGE_LICENSES) {
    const images = new Map([['img-x', { ...complete, license }]]);
    assert.deepEqual(validateDiscoveryRecord(record({ image: 'img-x' }), { images }).errors, [], license);
  }
  // The policy is the one the registry's own type uses (unchanged: CC0, PD, CC BY and CC BY-SA 2.0–4.0).
  assert.deepEqual([...PERMITTED_IMAGE_LICENSES], ['CC0', 'Public domain', 'CC BY 2.0', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 2.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0']);
  assert.match(readFileSync(join(root, 'src/data/images.ts'), 'utf8'), /license: ImageLicense;/);
  // Image-free records stay valid.
  assert.deepEqual(errs(record()), []);
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

test('Edition 001 relationships: six editorial claims, one direction each, Onyeabor unconnected', () => {
  const claims = real.flatMap(({ raw }) => (raw.related ?? []).map((x) => ({ from: raw.id, ...x })));
  assert.equal(claims.length, 6);
  // The owner removed two associations; nothing replaced them.
  const has = (a: string, b: string) => claims.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a));
  assert.equal(has('jazz-kissa', 'japanese-game-centers'), false);
  assert.equal(has('nakagin-capsule-tower', 'seed-erosion-blocks'), false);
  assert.ok(has('strandbeest', 'seed-erosion-blocks'), 'the Strandbeest → SEED claim stays in the source record');
  assert.ok(claims.every((c) => c.basis === 'editorial'), 'interpretive associations, not claims of influence');
  const pairs = claims.map((c) => [c.from, c.to].sort().join('|'));
  assert.equal(new Set(pairs).size, 6, 'no pair is authored twice: traversal gives both directions');
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
  assert.deepEqual(kissa.inner.map((e) => e.discovery.id), ['mauricio-lopez-60625']);
  assert.deepEqual(kissa.outer.map((e) => [e.discovery.id, e.via]), [['arboreal-serenade', 'mauricio-lopez-60625']]);
  // Five of the six would be available (SEED's one remaining claim waits for SEED), in public data too.
  const asPublishedFile = publicDiscoveryFile({ editions, nodes, discoveries: asPublished }, '2026-11-25');
  assert.equal(asPublishedFile.discoveries.reduce((n, r) => n + (r.related?.length ?? 0), 0), 5);
  assert.equal(asPublishedFile.discoveries.find((r) => r.id === 'strandbeest')!.related, undefined, 'its only claim targets the draft');
  assert.ok(!JSON.stringify(asPublishedFile).includes('seed-erosion-blocks'));
  // And on the real data with real statuses, nothing standalone is available.
  assert.equal(createDiscoveryGraph({ editions, nodes, discoveries: real.map((r) => r.raw) }, { today: '2026-11-25' }).all().filter((d) => d.kind === 'standalone').length, 0);
});

test('the public file ships only public records, sorted, without editor-only fields, input untouched', () => {
  const rs = [
    record({ id: 'b-live', status: 'published', publishDate: '2026-11-20', editorialNotes: ['private'], linkReviews: [{ url: 'https://example.org/work', finding: 'transient-failure', decision: 'keep', note: 'n', reviewedAt: '2026-11-21' }] }),
    record({ id: 'a-live', status: 'published', publishDate: '2026-11-25' }),
    record({ id: 'c-ready', status: 'ready' }),
    record({ id: 'd-later', status: 'published', publishDate: '2026-11-26' }),
  ];
  const before = JSON.stringify(rs);
  const f = publicDiscoveryFile({ editions: [], nodes: [], discoveries: rs }, '2026-11-25');
  assert.equal(f.asOf, '2026-11-25');
  assert.deepEqual(f.discoveries.map((r) => r.id), ['a-live', 'b-live']);
  assert.ok(f.discoveries.every((r) => !('editorialNotes' in r) && !('linkReviews' in r)), 'editor-only fields never ship');
  assert.equal(JSON.stringify(f), JSON.stringify(publicDiscoveryFile({ editions: [], nodes: [], discoveries: [...rs].reverse() }, '2026-11-25')), 'file order never matters');
  assert.equal(JSON.stringify(rs), before, 'the input records are not modified');
});

test('public fields are an explicit allowlist: unknown fields never ship, at any depth (review finding 1)', () => {
  const full = record({
    id: 'full',
    status: 'published',
    publishDate: '2026-11-20',
    year: '1999',
    image: IMAGES[0].id,
    tags: ['a', 'b'],
    credits: [{ name: 'A. Maker', role: 'Artist', secretCredit: 'X1' } as never],
    destination: { url: 'https://example.org/work', label: 'The work', verifiedAt: '2026-11-20', availability: 'intermittent', internalDest: 'X2' } as never,
    sources: [{ label: 'A source', url: 'https://example.org/about', kind: 'press', verifiedAt: '2026-11-20', memo: 'X3' } as never],
    related: [{ to: 'other', relation: 'echoes', note: 'Shared note.', basis: 'editorial', aside: 'X4' } as never],
    editorialNotes: ['X5'],
    linkReviews: [{ url: 'https://example.org/work', finding: 'blocked', decision: 'keep', note: 'X6', reviewedAt: '2026-11-20' }],
    unknownTop: 'X7',
  } as never);
  const other = record({ id: 'other', status: 'published', publishDate: '2026-11-20' });
  const out = publicDiscoveryFile({ editions: [], nodes: [], discoveries: [full, other] }, '2026-11-25');
  const json = JSON.stringify(out);
  for (const x of ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'secretCredit', 'internalDest', 'memo', 'aside', 'unknownTop', 'editorialNotes', 'linkReviews']) assert.ok(!json.includes(x), `${x} must not ship`);
  // Every supported field survives intact.
  assert.deepEqual(out.discoveries.find((r) => r.id === 'full'), {
    schemaVersion: 1,
    id: 'full',
    status: 'published',
    publishDate: '2026-11-20',
    title: 'A sample',
    subject: 'Sample subject',
    context: 'Concise context.',
    nature: 'work',
    credits: [{ name: 'A. Maker', role: 'Artist' }],
    year: '1999',
    tags: ['a', 'b'],
    destination: { url: 'https://example.org/work', label: 'The work', verifiedAt: '2026-11-20', availability: 'intermittent' },
    sources: [{ label: 'A source', url: 'https://example.org/about', kind: 'press', verifiedAt: '2026-11-20' }],
    related: [{ to: 'other', relation: 'echoes', note: 'Shared note.', basis: 'editorial' }],
    image: IMAGES[0].id,
  });
  assert.equal((full as unknown as Record<string, unknown>).unknownTop, 'X7', 'the input is not modified');
});

test('public relations: only targets available on the build date ship (review finding 3)', () => {
  const r = (to: string) => ({ to, relation: `links to ${to}`, note: `NOTE-${to}`, basis: 'editorial' as const });
  const item = (id: string) => ({ id, column: 'listen', format: 'brief', title: id, dek: 'd', body: ['b'], why: 'w', freshness: 'archive', depth: 'accessible', tags: [], sources: [{ label: 's', url: 'https://example.org/s', kind: 'press', verifiedAt: '2026-11-01' }] });
  const edition = (issue: number, publishDate: string, items: unknown[], status = 'published') => ({ schemaVersion: 1, issue, slug: `i${issue}`, title: `I${issue}`, theme: 't', status, publishDate, intro: 'i', featured: 'x', items });
  const editions = [edition(1, '2026-11-01', [item('drop-live')]), edition(2, '2026-12-01', [item('drop-future')], 'scheduled'), edition(3, '2026-11-01', [item('drop-draft')], 'draft')] as unknown as DropEdition[];
  const nodes: ThreadNode[] = [{ id: 'a-node', title: 'Node', type: 'person', summary: 's' }];
  const discoveries = [
    record({ id: 'source', status: 'published', publishDate: '2026-11-01', related: [r('a-draft'), r('a-ready'), r('a-future'), r('nowhere'), r('a-live'), r('drop-live'), r('drop-future'), r('drop-draft'), r('a-node'), r('a-boundary')] }),
    record({ id: 'a-draft', status: 'draft', publishDate: '2026-11-01' }),
    record({ id: 'a-ready', status: 'ready', publishDate: '2026-11-01' }),
    record({ id: 'a-future', status: 'published', publishDate: '2026-12-01' }),
    record({ id: 'a-live', status: 'published', publishDate: '2026-11-10' }),
    record({ id: 'a-boundary', status: 'published', publishDate: '2026-11-25' }),
  ];
  const shipped = (today: string) => publicDiscoveryFile({ editions, nodes, discoveries }, today).discoveries.find((d) => d.id === 'source')!;
  const now = shipped('2026-11-25');
  // Draft, ready, future, nonexistent, future Drop item and draft Drop item: absent, notes included.
  assert.deepEqual(now.related!.map((x) => x.to), ['a-live', 'drop-live', 'a-node', 'a-boundary'], 'authored order kept');
  const json = JSON.stringify(publicDiscoveryFile({ editions, nodes, discoveries }, '2026-11-25'));
  for (const gone of ['a-draft', 'a-ready', 'a-future', 'nowhere', 'drop-future', 'drop-draft']) {
    assert.ok(!now.related!.some((x) => x.to === gone), gone);
    assert.ok(!json.includes(`NOTE-${gone}`), `${gone}: its note doesn't ship`);
  }
  // Direction, relation, basis and note are preserved for the ones that ship.
  assert.deepEqual(now.related![0], { to: 'a-live', relation: 'links to a-live', note: 'NOTE-a-live', basis: 'editorial' });
  // The boundary: a target published on the build date counts; the day before, it doesn't.
  assert.ok(!shipped('2026-11-24').related!.some((x) => x.to === 'a-boundary'));
  // On its publication date a previously unavailable target appears, with no change to the source record.
  const later = shipped('2026-12-01').related!.map((x) => x.to);
  assert.ok(later.includes('a-future') && later.includes('drop-future'));
  assert.ok(!later.includes('a-draft') && !later.includes('a-ready') && !later.includes('nowhere') && !later.includes('drop-draft'));
  assert.equal(discoveries[0].related!.length, 10, 'the editorial source record keeps every claim');
  // A record whose every claim is unavailable ships with no related field at all.
  const lone = publicDiscoveryFile({ editions: [], nodes: [], discoveries: [record({ id: 'lone', status: 'published', publishDate: '2026-11-01', related: [r('a-draft')] }), discoveries[1]] }, '2026-11-25');
  assert.equal('related' in lone.discoveries[0], false);
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
