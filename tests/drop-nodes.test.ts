/**
 * Thread-node hardening (D-N in collaboration/ARCHITECTURE_ASSESSMENT_V2.md). The thread library
 * (content/drop/nodes.json) is validated at build like the editions: required fields, a known
 * type, relations shaped as on items, and URLs that are absolute https and pass isSafeUrl.
 * Invalid nodes are reported and left out of public/data/drop.json. Preventive hardening: every
 * existing node is valid and ships unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLibrary, validateNodes } from '../src/utils/dropValidate.ts';
import type { ThreadNode } from '../src/types/drop.ts';

const real = JSON.parse(readFileSync(new URL('../content/drop/nodes.json', import.meta.url), 'utf8')) as unknown[];
const valid = { id: 'sample-node', title: 'Sample node', type: 'album', summary: 'A sample thread stop.' };

test('every existing thread node is valid and kept exactly as it is', () => {
  const r = validateNodes(real);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.nodes.length, real.length);
  assert.deepEqual(r.nodes, real, 'the same records, unchanged, in the same order');
  assert.ok(real.length >= 37);
  // Some existing nodes have https URLs and relations, so both rules are exercised on real data.
  assert.ok(r.nodes.filter((n) => n.url).length >= 30);
  assert.ok(r.nodes.filter((n) => n.related?.length).length >= 10);
});

test('the file must be an array; anything else ships no nodes', () => {
  for (const raw of [null, {}, 'nodes', 42, { nodes: [valid] }]) {
    const r = validateNodes(raw);
    assert.deepEqual(r.nodes, [], JSON.stringify(raw));
    assert.deepEqual(r.errors, [{ path: 'nodes', message: 'must be an array of thread nodes' }]);
  }
  assert.deepEqual(validateNodes([]), { errors: [], warnings: [], nodes: [] });
});

test('malformed records and missing required fields are errors, and those nodes are left out', () => {
  const cases: [string, unknown, RegExp][] = [
    ['not an object', 'sample-node', /must be an object/],
    ['an array', [valid], /must be an object/],
    ['null', null, /must be an object/],
    ['missing id', { ...valid, id: undefined }, /\.id: must be kebab-case/],
    ['id not kebab-case', { ...valid, id: 'Sample Node' }, /\.id: must be kebab-case/],
    ['missing title', { ...valid, title: undefined }, /\.title: is required/],
    ['blank title', { ...valid, title: '   ' }, /\.title: is required/],
    ['missing summary', { ...valid, summary: undefined }, /\.summary: is required/],
    ['missing type', { ...valid, type: undefined }, /\.type: unknown type "undefined"/],
    ['unknown type', { ...valid, type: 'podcast' }, /\.type: unknown type "podcast"/],
    ['inherited name as type', { ...valid, type: 'constructor' }, /\.type: unknown type "constructor"/],
    ['year not text', { ...valid, year: 1998 }, /\.year: must be text when present/],
    ['related not an array', { ...valid, related: { to: 'x' } }, /\.related: must be an array/],
    ['relation missing note', { ...valid, related: [{ to: 'x', relation: 'sampled', basis: 'fact' }] }, /\.related\[0\]: needs to, relation and note/],
    ['relation with bad basis', { ...valid, related: [{ to: 'x', relation: 'sampled', note: 'A note.', basis: 'rumour' }] }, /\.related\[0\]\.basis: must be fact or editorial/],
  ];
  for (const [label, node, msg] of cases) {
    const r = validateNodes([valid, node]);
    assert.equal(r.nodes.length, 1, `${label}: only the valid node ships`);
    assert.equal(r.nodes[0].id, 'sample-node', label);
    assert.ok(r.errors.length >= 1, label);
    assert.ok(r.errors.every((e) => e.path.startsWith('nodes[1]')), `${label}: errors name the record (${JSON.stringify(r.errors)})`);
    assert.ok(r.errors.some((e) => msg.test(`${e.path}: ${e.message}`)), `${label}: ${JSON.stringify(r.errors)}`);
  }
});

const PAYLOAD = 'window.__ppUnsafeRan=1';
const UNSAFE: [string, unknown][] = [
  ['javascript:', `javascript:${PAYLOAD}`],
  ['mixed-case javascript:', `JaVaScRiPt:${PAYLOAD}`],
  ['space-prefixed javascript:', ` javascript:${PAYLOAD}`],
  ['data:', `data:text/html,<script>${PAYLOAD}</script>`],
  ['vbscript:', 'vbscript:msgbox(1)'],
  ['plain http', 'http://example.com/sample'],
  ['protocol-relative', '//example.com/sample'],
  ['relative', '/sample'],
  ['missing colon', 'https//example.com/sample'],
  ['https with no host', 'https://'],
  ['space-prefixed https', ' https://example.com/sample'],
  ['contains whitespace', 'https://example.com/a b'],
  ['tab in scheme', 'ht\ttps://example.com/'],
  ['empty', ''],
  ['not a string', 42],
  ['an object', { href: 'https://example.com/' }],
];

test('unsafe or non-https URLs are errors, and those nodes never ship', () => {
  for (const [label, url] of UNSAFE) {
    const r = validateNodes([{ ...valid, url }]);
    assert.deepEqual(r.nodes, [], `${label}: left out`);
    assert.deepEqual(
      r.errors.map((e) => `${e.path}: ${e.message}`),
      ['nodes[0] (sample-node).url: must be an https URL'],
      label,
    );
  }
});

test('valid https URLs pass, and a node without a URL is fine', () => {
  for (const url of ['https://example.org', 'https://example.org/path?q=1#x', 'https://EXAMPLE.ORG/', 'https://xn--bcher-kva.example/', 'https://example.org:8443/a']) {
    const r = validateNodes([{ ...valid, url }]);
    assert.deepEqual(r.errors, [], url);
    assert.equal(r.nodes[0].url, url, `${url}: kept exactly`);
  }
  assert.deepEqual(validateNodes([valid]).nodes, [valid]);
  // The scheme must be written "https://", exactly as for item sources (not unsafe, just one form).
  assert.deepEqual(validateNodes([{ ...valid, url: 'HTTPS://example.org/' }]).nodes, []);
  // Extra fields from a future version are left alone, and the record is kept as written.
  const extra = { ...valid, futureField: { x: 1 } };
  assert.deepEqual(validateNodes([extra]).nodes, [extra]);
});

test('the library checks still run on validated nodes (collisions, dangling relations)', () => {
  const nodes = validateNodes([valid, { ...valid, title: 'Same id' }]).nodes as ThreadNode[];
  assert.equal(nodes.length, 2, 'per-record validation keeps both');
  assert.ok(validateLibrary([], nodes).errors.some((e) => /collides/.test(e.message)), 'the collision is still an error');
  const dangling = validateLibrary([], validateNodes([{ ...valid, related: [{ to: 'nowhere', relation: 'sampled', note: 'A note.', basis: 'fact' }] }]).nodes);
  assert.ok(dangling.warnings.some((w) => /doesn't exist yet/.test(w.message)), 'dangling relations stay warnings, as before');
});

test('the build validates nodes and leaves invalid ones out of drop.json', () => {
  const build = readFileSync(new URL('../scripts/drop/build.ts', import.meta.url), 'utf8');
  assert.match(build, /validateNodes\(raw\)/);
  assert.match(build, /nodes = checked\.nodes;/);
  assert.match(build, /errorCount \+= checked\.errors\.length;/);
  assert.doesNotMatch(build, /JSON\.parse\(readFileSync\(nodesPath, 'utf8'\)\) as ThreadNode\[\]/, 'no unvalidated cast');
});
