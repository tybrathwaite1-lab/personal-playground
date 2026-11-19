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

test('focus markers: only, skip and todo in code are found; the same words in comments and strings are not', () => {
  const src = [
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
  ].join('\n');
  const found = focusMarkers('x.test.ts', src);
  const expected = [
    /x\.test\.ts:2: imports "skip" from node:test/,
    /x\.test\.ts:3: test\.only\(\)/,
    /x\.test\.ts:4: it\.skip\(\)/,
    /x\.test\.ts:5: describe\.todo\(\)/,
    /x\.test\.ts:6: skip option/,
    /x\.test\.ts:7: todo option/,
    /x\.test\.ts:8: only option/,
    /x\.test\.ts:9: t\.skip\(\)/,
    /x\.test\.ts:10: t\.todo\(\)/,
    /x\.test\.ts:11: skip option/,
  ];
  for (const e of expected) assert.ok(found.some((f) => e.test(f)), `expected ${e} in ${JSON.stringify(found)}`);
  assert.equal(found.length, expected.length, JSON.stringify(found));

  const benign = [
    "import { test } from 'node:test';",
    '// test.only(...) is never used here; neither is it.skip() or { skip: true }',
    "/* describe.todo('x') */",
    "test('mentions test.skip( and { todo: true } in a string', () => {",
    "  const opts = { skip: 3, only: 'x' }; // a plain object, not test options",
    "  const doc = `t.skip() and test.only()`;",
    '  return [opts, doc];',
    '});',
  ].join('\n');
  assert.deepEqual(focusMarkers('benign.test.ts', benign), []);
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

test('end to end: the runner passes a clean tree and fails each untrustworthy one', () => {
  const clean = runner({ 'a.test.ts': PASSING, 'nested/b.test.ts': PASSING });
  assert.equal(clean.status, 0, clean.out);
  assert.match(clean.out, /Test integrity: 2 files discovered, 2 top-level tests ran\./);

  const cases: [string, Record<string, string>, RegExp][] = [
    ['skipped test', { 'a.test.ts': "import { test } from 'node:test';\ntest('x', { skip: true }, () => {});\n" }, /skip option on a test[\s\S]*"x" was skipped/],
    ['runtime skip', { 'a.test.ts': "import { test } from 'node:test';\ntest('x', (t) => { t.skip(); });\n" }, /t\.skip\(\)[\s\S]*"x" was skipped/],
    ['TODO test', { 'a.test.ts': "import { test } from 'node:test';\ntest.todo('x');\n" }, /test\.todo\(\)/],
    ['focused test', { 'a.test.ts': "import { test } from 'node:test';\ntest.only('x', () => {});\ntest('y', () => {});\n" }, /test\.only\(\)/],
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
