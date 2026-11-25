/**
 * PR 3, discovery experience: the unlisted preview file (src/discovery/preview.ts, built into
 * public/data/preview/living.json) and the preview page's data layer (src/preview/living/data.ts).
 * The production publication boundary (publicDiscoveryFile, discoveries.json) must not move.
 * Dates are always explicit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewDiscoveryFile, previewEligible, publicDiscoveryFile, type DiscoveryRecord } from '../src/discovery/index.ts';
import { connections, href, ID_PATTERN, longDate, lookup, parsePreview, PREVIEW_FILE } from '../src/preview/living/data.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const TODAY = '2026-11-25';
const content = (): DiscoveryRecord[] =>
  readdirSync(join(root, 'content/discoveries'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(root, 'content/discoveries', f), 'utf8')) as DiscoveryRecord);
const record = (over: Partial<DiscoveryRecord> & Record<string, unknown> = {}): DiscoveryRecord =>
  ({
    schemaVersion: 1,
    id: 'sample-a',
    status: 'ready',
    title: 'A sample',
    subject: 'Sample A',
    context: 'Concise context.',
    nature: 'work',
    credits: [{ name: 'A. Maker', role: 'Artist' }],
    tags: ['sample'],
    destination: { url: 'https://example.org/work', label: 'The work', verifiedAt: TODAY },
    sources: [{ label: 'A source', url: 'https://example.org/about', kind: 'reference', verifiedAt: TODAY }],
    ...over,
  }) as DiscoveryRecord;
const rel = (to: string, basis: 'fact' | 'editorial' = 'editorial', relation = 'relates to') => ({ to, relation, note: `Why ${to}.`, basis });
/** Every key at any depth. */
const keys = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(keys) : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]) : []);

// ─── The preview file ────────────────────────────────────────────────
test('the real content: the ten ready records, never SEED, with 5 of the 6 authored relations', () => {
  const records = content();
  const before = JSON.stringify(records);
  const file = previewDiscoveryFile(records, TODAY);
  assert.equal(file.preview, true);
  assert.equal(file.asOf, TODAY);
  assert.deepEqual(
    file.discoveries.map((r) => r.id),
    [
      'arboreal-serenade',
      'edgerton-high-speed-photography',
      'japanese-game-centers',
      'jazz-kissa',
      'low-tech-solar-website',
      'mauricio-lopez-60625',
      'nakagin-capsule-tower',
      'return-of-the-obra-dinn',
      'strandbeest',
      'william-onyeabor',
    ],
  );
  assert.ok(!JSON.stringify(file).includes('seed-erosion-blocks'), 'the draft and every claim about it stay out, notes included');
  const claims = file.discoveries.flatMap((r) => (r.related ?? []).map((x) => `${r.id}→${x.to}`));
  assert.deepEqual(claims.sort(), [
    'arboreal-serenade→edgerton-high-speed-photography',
    'jazz-kissa→mauricio-lopez-60625',
    'low-tech-solar-website→strandbeest',
    'mauricio-lopez-60625→arboreal-serenade',
    'return-of-the-obra-dinn→low-tech-solar-website',
  ]);
  assert.equal(JSON.stringify(records), before, 'the input is never modified');
  // Statuses stay as authored: ten ready, one draft, none published.
  assert.deepEqual(
    records.map((r) => r.status).sort(),
    [...Array(10).fill('ready'), 'draft'].sort(),
  );
});

test('the preview file carries no editor-only fields, no status and no publish date', () => {
  const records = content();
  const file = previewDiscoveryFile(records, TODAY);
  const all = new Set(keys(file.discoveries));
  for (const k of ['editorialNotes', 'linkReviews', 'status', 'publishDate']) assert.equal(all.has(k), false, k);
  // Even when the input carries unknown fields or editor notes.
  const noisy = previewDiscoveryFile([record({ editorialNotes: ['secret'], linkReviews: [], internal: 'x', destination: { url: 'https://example.org/work', label: 'L', verifiedAt: TODAY, note: 'x' } as never })], TODAY);
  assert.ok(!JSON.stringify(noisy).includes('secret'));
  assert.deepEqual(Object.keys(noisy.discoveries[0]).sort(), ['context', 'credits', 'destination', 'id', 'nature', 'schemaVersion', 'sources', 'subject', 'tags', 'title']);
  assert.deepEqual(Object.keys(noisy.discoveries[0].destination).sort(), ['label', 'url', 'verifiedAt']);
});

test('eligibility: ready and available published records; never drafts, future publications or unresolved link reviews', () => {
  const review = (decision: 'keep' | 'replace' | 'remove') => [{ url: 'https://example.org/work', finding: 'blocked', decision, note: 'n', reviewedAt: TODAY }];
  const records = [
    record({ id: 'ready-one' }),
    record({ id: 'a-draft', status: 'draft' }),
    record({ id: 'published-past', status: 'published', publishDate: '2026-11-01' }),
    record({ id: 'published-future', status: 'published', publishDate: '2026-12-01' }),
    record({ id: 'reviewed-keep', linkReviews: review('keep') as never }),
    record({ id: 'reviewed-replace', linkReviews: review('replace') as never }),
    record({ id: 'reviewed-remove', linkReviews: review('remove') as never }),
  ];
  assert.deepEqual(
    previewEligible(records, TODAY).map((r) => r.id),
    ['published-past', 'ready-one', 'reviewed-keep'],
  );
});

test('relations: kept only when the target is in the preview file; claims keep their wording and basis', () => {
  const file = previewDiscoveryFile(
    [
      record({ id: 'a', related: [rel('b', 'fact', 'was made with'), rel('c'), rel('nowhere'), rel('a')] }),
      record({ id: 'b' }),
      record({ id: 'c', status: 'draft' }),
    ],
    TODAY,
  );
  assert.deepEqual(file.discoveries[0].related, [{ to: 'b', relation: 'was made with', note: 'Why b.', basis: 'fact' }]);
  assert.equal('related' in file.discoveries[1], false, 'no claims, no field');
});

test('the production boundary is unchanged: the public file still ships nothing from the real content', () => {
  assert.deepEqual(publicDiscoveryFile({ editions: [], nodes: [], discoveries: content() }, TODAY), { asOf: TODAY, discoveries: [] });
});

test('the build writes both files: discoveries.json stays empty, the preview file holds the ten', () => {
  const run = () => {
    execFileSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/discoveries/build.ts'), '--strict', '--today', TODAY], { cwd: root, stdio: 'pipe' });
    return [readFileSync(join(root, 'public/data/discoveries.json'), 'utf8'), readFileSync(join(root, 'public', PREVIEW_FILE), 'utf8')];
  };
  const [pub, prev] = run();
  assert.deepEqual(run(), [pub, prev], 'deterministic');
  assert.deepEqual(JSON.parse(pub), { asOf: TODAY, discoveries: [] });
  const p = JSON.parse(prev);
  assert.equal(p.preview, true);
  assert.equal(p.discoveries.length, 10);
  assert.ok(!/seed-erosion-blocks|editorialNotes|linkReviews|"status"|publishDate/.test(prev));
  // Generated, never committed.
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^public\/data\/preview\/$/m);
});

// ─── The page's data layer ───────────────────────────────────────────
const fileWith = (discoveries: unknown[], extra: Record<string, unknown> = {}) => ({ preview: true, asOf: TODAY, discoveries, ...extra });
const real = () => parsePreview(previewDiscoveryFile(content(), TODAY))!;

test('parsePreview accepts only a preview file', () => {
  assert.equal(parsePreview(null), null);
  assert.equal(parsePreview({ asOf: TODAY, discoveries: [] }), null, 'the public discoveries file is not a preview file');
  assert.equal(parsePreview({ preview: true, asOf: 'soon', discoveries: [] }), null);
  assert.equal(parsePreview({ preview: true, asOf: TODAY, discoveries: {} }), null);
  assert.equal(real().list.length, 10);
});

test('parsePreview drops unusable records and never makes an unsafe link clickable', () => {
  const p = parsePreview(
    fileWith([
      record({ id: 'ok', sources: [{ label: 'good', url: 'https://example.org/a', kind: 'read', verifiedAt: TODAY }, { label: 'bad', url: 'javascript:alert(1)', kind: 'read', verifiedAt: TODAY }, { label: 'plain', url: 'http://example.org/b', kind: 'read', verifiedAt: TODAY }] }),
      record({ id: 'bad-destination', destination: { url: 'javascript:alert(1)', label: 'x', verifiedAt: TODAY } }),
      record({ id: 'http-destination', destination: { url: 'http://example.org/', label: 'x', verifiedAt: TODAY } }),
      record({ id: 'Not_An_Id' }),
      record({ id: 'no-title', title: '' }),
      record({ id: 'ok', title: 'A duplicate id: the first is kept' }),
    ]),
  )!;
  assert.deepEqual(p.list.map((r) => r.id), ['ok']);
  assert.deepEqual(p.get('ok')!.sources.map((s) => s.label), ['good']);
  assert.equal(p.get('ok')!.title, 'A sample');
});

test('lookup: no id is the index; unknown, malformed and unavailable ids look the same', () => {
  const p = real();
  assert.deepEqual(lookup(p, null), { kind: 'index' });
  assert.deepEqual(lookup(p, ''), { kind: 'index' });
  for (const d of ['seed-erosion-blocks', 'nope', '../drop', 'JAZZ-KISSA', 'jazz kissa', '<script>', 'constructor', '__proto__'])
    assert.deepEqual(lookup(p, d), { kind: 'missing' }, d);
  const found = lookup(p, 'jazz-kissa');
  assert.equal(found.kind, 'found');
  assert.equal(found.kind === 'found' && found.record.title, 'The art of listening');
  assert.ok(ID_PATTERN.test('mauricio-lopez-60625'));
});

test('connections: both directions, each claim exactly as authored (from → to), never reversed', () => {
  const p = real();
  const mauricio = connections(p, 'mauricio-lopez-60625');
  assert.deepEqual(
    mauricio.map((c) => [c.direction, c.other.id, c.from.id, c.claim.relation, c.to.id, c.claim.basis]),
    [
      ['outgoing', 'arboreal-serenade', 'mauricio-lopez-60625', 'also makes the overlooked audible, like', 'arboreal-serenade', 'editorial'],
      ['incoming', 'jazz-kissa', 'jazz-kissa', 'shares a focus on listening with', 'mauricio-lopez-60625', 'editorial'],
    ],
  );
  assert.deepEqual(connections(p, 'william-onyeabor'), [], 'no relationships: none invented');
  assert.deepEqual(connections(p, 'strandbeest').map((c) => [c.direction, c.other.id]), [['incoming', 'low-tech-solar-website']], 'the claim to SEED is gone; the one about it remains');
  // Documented claims come first, otherwise the graph's order.
  const mixed = parsePreview(fileWith([record({ id: 'x', related: [rel('y'), rel('z', 'fact')] }), record({ id: 'y' }), record({ id: 'z' })]))!;
  assert.deepEqual(connections(mixed, 'x').map((c) => c.other.id), ['z', 'y']);
});

test('links and dates', () => {
  assert.equal(href('jazz-kissa'), '#/preview/living?d=jazz-kissa');
  assert.equal(longDate('2026-11-25'), '25 November 2026');
  assert.equal(longDate('nope'), '');
});

// ─── Isolation ───────────────────────────────────────────────────────
const files = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? files(p) : [p];
  });

test('only the preview route reads the preview file, and the preview reads nothing personal', () => {
  const code = (f: string) => readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const readers = files('src').filter((f) => /\.tsx?$/.test(f) && /preview\/living\.json|PREVIEW_FILE/.test(code(f)));
  assert.deepEqual(readers.sort(), ['src/preview/living/Living.tsx', 'src/preview/living/data.ts']);
  for (const f of files('src/preview/living')) {
    const src = code(f);
    assert.doesNotMatch(src, /localStorage|sessionStorage|useStore|useSync|toggleSave|discoveries\.json|drop\.json|analytics|navigator\.sendBeacon/, f);
  }
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  assert.match(app, /lazy\(\(\) => import\('\.\/preview\/living\/Living'\)\)/, 'a lazy chunk');
  assert.equal(files('src').filter((f) => f !== 'src/App.tsx' && !f.startsWith('src/preview/living/') && /preview\/living/.test(code(f)) && f !== 'src/hooks/useRoute.ts').length, 0, 'nothing else links to it');
  assert.doesNotMatch(readFileSync(join(root, 'src/components/Layout.tsx'), 'utf8'), /preview/, 'never in navigation');
});
