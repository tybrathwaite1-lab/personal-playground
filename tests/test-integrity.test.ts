/**
 * M2-1: the test suite can't pass for the wrong reason. Covers scripts/test/policy.ts (file
 * discovery, focus/skip/TODO detection by parsing source, run verification) and, end to end,
 * scripts/test/run.ts (what `npm test` runs) against synthetic test trees.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { discover, focusMarkers, verifyRun, type RunEvent } from '../scripts/test/policy.ts';

const tree = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'test-integrity-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
};
const rel = (root: string, files: string[]) => files.map((f) => f.slice(root.length + 1));
const PASSING = "import { test } from 'node:test';\ntest('ok', () => {});\n";

test('npm test runs the integrity runner over the whole tests/ tree', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts.test, 'tsx --tsconfig tsconfig.app.json scripts/test/run.ts');
});

test('the real tests/ tree: every test file is discovered and nothing would silently not run', () => {
  const d = discover(resolve('tests'));
  assert.deepEqual(d.problems, []);
  assert.ok(d.files.length >= 25, `found ${d.files.length} test files`);
  assert.ok(d.files.some((f) => f.endsWith('/test-integrity.test.ts')));
  for (const f of d.files) assert.deepEqual(focusMarkers(f, readFileSync(f, 'utf8')), [], f);
});

test('discovery: nested test files run; misnamed, misplaced and stray files are reported', () => {
  const root = tree({
    'a.test.ts': PASSING,
    'nested/deep/b.test.ts': PASSING,
    'c.spec.ts': PASSING,
    'd.test.tsx': PASSING,
    'e.test.mjs': PASSING,
    'f.tests.ts': PASSING,
    'notes.ts': '',
    'helpers/util.ts': '',
    'helpers/bad.test.ts': PASSING,
    'fixtures/data.json': '{}',
    'fixtures/legacy/old.ts': '',
    'fixtures/visual/x.test.ts': PASSING,
  });
  try {
    symlinkSync('/etc/hostname', join(root, 'link.test.ts'));
    const d = discover(root);
    assert.deepEqual(rel(root, d.files), ['a.test.ts', 'nested/deep/b.test.ts']);
    const expected = [
      /^c\.spec\.ts: looks like a test/,
      /^d\.test\.tsx: looks like a test/,
      /^e\.test\.mjs: looks like a test/,
      /^f\.tests\.ts: looks like a test/,
      /^notes\.ts: unexpected file in tests\//,
      /^helpers\/bad\.test\.ts: test-named file inside tests\/helpers\/ is never run/,
      /^fixtures\/visual\/x\.test\.ts: test-named file inside tests\/fixtures\/ is never run/,
      /^link\.test\.ts: symlinks are not allowed/,
    ];
    for (const e of expected) assert.ok(d.problems.some((p) => e.test(p)), `expected ${e} in ${JSON.stringify(d.problems)}`);
    assert.equal(d.problems.length, expected.length, JSON.stringify(d.problems));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Asserts the detector reports exactly the expected markers (each matched once, in any order). */
function expectMarkers(src: string, expected: RegExp[], file = 'x.test.ts') {
  const found = focusMarkers(file, src);
  for (const e of expected) assert.ok(found.some((f) => e.test(f)), `expected ${e} in ${JSON.stringify(found, null, 1)}`);
  assert.equal(found.length, expected.length, `unexpected markers: ${JSON.stringify(found, null, 1)}`);
}

test('focus markers: direct calls, options and context methods', () => {
  expectMarkers(
    [
      "import { test, describe, it } from 'node:test';",
      "import { skip as s } from 'node:test';",
      "test.only('a', () => {});",
      "it.skip('b', () => {});",
      "describe.todo('c');",
      "test('d', { skip: 'flaky' }, () => {});",
      "test('e', { todo: true }, () => {});",
      "test('f', { only: true }, () => {});",
      "test('g', (t) => { t.skip('runtime'); });",
      "test('h', (t) => { t.todo(); });",
      "test('i', { 'skip': process.env.CI === undefined }, () => {});",
    ].join('\n'),
    [/:2: imports "skip" from node:test/, /:3: test\.only/, /:4: it\.skip/, /:5: describe\.todo/, /:6: skip option on test\(\)/, /:7: todo option on test\(\)/, /:8: only option on test\(\)/, /:9: t\.skip/, /:10: t\.todo/, /:11: skip option on test\(\)/],
  );
});

test('focus markers: computed members, aliases, imported bindings and nested t.test', () => {
  expectMarkers(
    [
      "import check, { test as spec, it } from 'node:test';",
      "import * as nt from 'node:test';",
      "test0();",
      "check['only']('computed on the default import', () => {});",
      "spec[`skip`]('template-literal member on a renamed import', () => {});",
      "const s = it.todo;",
      "const alias = spec;",
      "alias.only('alias of a renamed import', () => {});",
      "const { skip: quietly, test: sub } = nt;",
      "sub('via destructured namespace', { todo: 'later' }, () => {});",
      "nt.test.only('namespace member', () => {});",
      "nt.skip('namespace export', () => {});",
      "spec('outer', async (t) => {",
      "  await t.test('nested option', { skip: true }, () => {});",
      "  await t.test('nested ctx', (u) => { u.todo(); });",
      "  await t.test.only('nested modifier', () => {});",
      "  await t['skip']();",
      "  await t.test('computed key', { ['only']: true }, () => {});",
      "});",
      "const m = 'only'; spec[m]('dynamic', () => {});",
      "function test0() {}",
    ].join('\n'),
    [
      /:4: check\.only/,
      /:5: spec\.skip/,
      /:6: it\.todo/,
      /:8: alias\.only/,
      /:9: destructures "skip" from nt/,
      /:10: todo option on sub\(\)/,
      /:11: nt\.test\.only/,
      /:12: nt\.skip/,
      /:14: skip option on t\.test\(\)/,
      /:15: u\.todo/,
      /:16: t\.test\.only/,
      /:17: t\.skip/,
      /:18: only option on t\.test\(\)/,
      /:20: dynamic member access on the test API \(spec\[m\]\)/,
    ],
  );
});

test('focus markers: no false positives from unrelated objects, comments, strings or plain options', () => {
  expectMarkers(
    [
      "import { test } from 'node:test';",
      '// test.only(...) is never used here; neither is it.skip() or { skip: true }',
      "/* describe.todo('x') */",
      'const queue = { skip() {}, only: 1, todo: [] as string[] };',
      "const page = { skip: (n: number) => n, ['only']: true };",
      'class Cursor { skip(n: number) { return n; } todo() {} static only() {} }',
      "test('unrelated members and text', () => {",
      "  queue.skip(); queue['todo'].push('x'); page.skip(2); new Cursor().skip(1); Cursor.only();",
      "  const opts = { skip: 3, only: 'x', todo: false }; // a plain object, not test options",
      "  const doc = `t.skip() and test.only() and { todo: true }`;",
      "  const t = { skip: () => 0 }; // a different t, outside any test callback's parameter list",
      '  [1, 2].map((x) => ({ skip: x }));',
      "  const it = { only: 1 }; void it.only; // not the node:test it (never imported)",
      '  return [opts, doc, t, queue, page];',
      '});',
    ].join('\n'),
    [],
    'benign.test.ts',
  );
  // A file that never imports node:test has no test API bindings at all.
  expectMarkers("const test = { only() {}, skip() {} };\ntest.only();\ntest.skip();\n", [], 'no-import.test.ts');
});

const ev = (e: Partial<RunEvent> & { name: string; file: string }): RunEvent => ({ type: 'test:pass', nesting: 0, ...e });

test('run verification: missing, empty, skipped, TODO, failed and cancelled files are problems', () => {
  const [a, b, c, d] = ['/t/a.test.ts', '/t/b.test.ts', '/t/c.test.ts', '/t/d.test.ts'];
  const ok = verifyRun([a, b], [ev({ name: 'one', file: a }), ev({ name: 'inner', file: a, nesting: 1 }), ev({ name: 'two', file: b })]);
  assert.deepEqual(ok.problems, []);
  assert.deepEqual([...ok.testsByFile.values()], [1, 1], 'nested tests are not counted as top-level tests');

  const bad = verifyRun(
    [a, b, c, d],
    [
      ev({ name: 'one', file: a }),
      ev({ name: b, file: b }), // a file with no tests is reported as one pass named after the file
      ev({ name: 'skipped', file: d, skip: 'flaky' }),
      ev({ name: 'later', file: d, todo: true }),
      ev({ name: 'boom', file: d, type: 'test:fail' }),
      ev({ name: 'stopped', file: d, nesting: 1, type: 'test:fail', cancelled: true }),
      ev({ name: 'stray', file: '/t/elsewhere.test.ts' }),
    ],
  );
  const expected = [
    /b\.test\.ts: ran no tests/,
    /c\.test\.ts: discovered but never reported/,
    /d\.test\.ts: "skipped" was skipped \(flaky\)/,
    /d\.test\.ts: "later" is marked TODO/,
    /d\.test\.ts: "boom" failed/,
    /d\.test\.ts: "stopped" was cancelled/,
    /elsewhere\.test\.ts: ran but was not discovered/,
  ];
  for (const e of expected) assert.ok(bad.problems.some((p) => e.test(p)), `expected ${e} in ${JSON.stringify(bad.problems)}`);
  assert.equal(bad.problems.length, expected.length, JSON.stringify(bad.problems));
});

/** Runs the real runner (scripts/test/run.ts) over a synthetic tests/ tree. */
function runner(files: Record<string, string>) {
  const root = tree(files);
  // Run as a fresh top-level runner, not as a child of this test process.
  const env: NodeJS.ProcessEnv = { ...process.env, TSX_TSCONFIG_PATH: 'tsconfig.app.json' };
  delete env.NODE_TEST_CONTEXT;
  try {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/run.ts', '--root', root], {
      encoding: 'utf8',
      env,
      timeout: 120_000,
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('end to end: an empty suite fails with an explicit diagnostic, not a runner error', () => {
  const cases: [string, Record<string, string>, RegExp][] = [
    ['empty directory', {}, /no test files discovered: an empty suite is never a pass/],
    ['only support files', { 'helpers/util.ts': 'export const x = 1;\n', 'fixtures/data.json': '{}' }, /no test files discovered: an empty suite is never a pass/],
    ['files with no tests', { 'a.test.ts': 'export const x = 1;\n' }, /no tests ran: an empty suite is never a pass/],
  ];
  for (const [name, files, expected] of cases) {
    const r = runner(files);
    assert.equal(r.status, 1, `${name}: must fail\n${r.out}`);
    assert.match(r.out, /✖ (\d+ )?integrity problem\(s\):/, `${name}: our diagnostic, not an incidental error\n${r.out}`);
    assert.match(r.out, expected, `${name}\n${r.out}`);
    assert.doesNotMatch(r.out, /Error \[ERR_|at Object\.<anonymous>|Unhandled/, `${name}: no runner crash\n${r.out}`);
  }
  const noTests = runner({ 'a.test.ts': 'export const x = 1;\n' });
  assert.match(noTests.out, /a\.test\.ts: ran no tests/);
  assert.match(noTests.out, /no tests ran: an empty suite is never a pass/);
});

test('end to end: without focus mode Node still runs every test, so .only is caught only statically', () => {
  const r = runner({ 'a.test.ts': "import { test } from 'node:test';\ntest.only('focused', () => {});\ntest('other', () => {});\n" });
  assert.equal(r.status, 1, r.out);
  // Observed runtime behaviour of this Node version: both tests run (no --test-only), nothing is skipped.
  assert.match(r.out, /Test integrity: 1 files discovered, 2 top-level tests ran\./, r.out);
  assert.match(r.out, /✔ focused/);
  assert.match(r.out, /✔ other/);
  assert.doesNotMatch(r.out, /was skipped/);
  // The only reported problem is the static marker.
  assert.match(r.out, /✖ 1 integrity problem\(s\):\n {2}- .*a\.test\.ts:2: test\.only\n/);
});

test('end to end: aliased, computed and nested markers fail the real runner; unrelated members pass', () => {
  const bad: [string, string, RegExp][] = [
    ['computed only', "import { test } from 'node:test';\ntest['only']('x', () => {});\n", /test\.only/],
    ['aliased skip', "import { test } from 'node:test';\nconst later = test.skip;\nlater('x', () => {});\ntest('y', () => {});\n", /test\.skip[\s\S]*"x" was skipped/],
    ['renamed import with todo option', "import { test as check } from 'node:test';\ncheck('x', { todo: true }, () => {});\n", /todo option on check\(\)[\s\S]*"x" is marked TODO/],
    ['nested t.test skip', "import { test } from 'node:test';\ntest('outer', async (t) => { await t.test('inner', { skip: true }, () => {}); });\n", /skip option on t\.test\(\)[\s\S]*"inner" was skipped/],
  ];
  for (const [name, src, expected] of bad) {
    const r = runner({ 'a.test.ts': src });
    assert.equal(r.status, 1, `${name}: must fail\n${r.out}`);
    assert.match(r.out, expected, `${name}\n${r.out}`);
  }
  const ok = runner({
    'a.test.ts': "import { test } from 'node:test';\nconst queue = { skip: () => 1, only: () => 2, todo: () => 3 };\ntest('uses unrelated skip/only/todo members', () => { queue.skip(); queue.only(); queue.todo(); });\n",
  });
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /✔ Every discovered file ran real tests/);
});

test('end to end: the runner passes a clean tree and fails each untrustworthy one', () => {
  const clean = runner({ 'a.test.ts': PASSING, 'nested/b.test.ts': PASSING });
  assert.equal(clean.status, 0, clean.out);
  assert.match(clean.out, /Test integrity: 2 files discovered, 2 top-level tests ran\./);

  const cases: [string, Record<string, string>, RegExp][] = [
    ['skipped test', { 'a.test.ts': "import { test } from 'node:test';\ntest('x', { skip: true }, () => {});\n" }, /skip option on test\(\)[\s\S]*"x" was skipped/],
    ['runtime skip', { 'a.test.ts': "import { test } from 'node:test';\ntest('x', (t) => { t.skip(); });\n" }, /t\.skip[\s\S]*"x" was skipped/],
    ['TODO test', { 'a.test.ts': "import { test } from 'node:test';\ntest.todo('x');\n" }, /test\.todo/],
    ['focused test', { 'a.test.ts': "import { test } from 'node:test';\ntest.only('x', () => {});\ntest('y', () => {});\n" }, /test\.only/],
    ['file with no tests', { 'a.test.ts': PASSING, 'b.test.ts': 'export const x = 1;\n' }, /b\.test\.ts: ran no tests/],
    ['file that fails to load', { 'a.test.ts': "import './missing.ts';\n" }, /a\.test\.ts: "[^"]*a\.test\.ts" failed/],
    ['misnamed test file', { 'a.test.ts': PASSING, 'b.spec.ts': PASSING }, /b\.spec\.ts: looks like a test/],
    ['failing test', { 'a.test.ts': "import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('x', () => assert.equal(1, 2));\n" }, /"x" failed/],
  ];
  for (const [name, files, expected] of cases) {
    const r = runner(files);
    assert.equal(r.status, 1, `${name}: must fail\n${r.out}`);
    assert.match(r.out, /integrity problem\(s\):/, name);
    assert.match(r.out, expected, `${name}\n${r.out}`);
  }
});
