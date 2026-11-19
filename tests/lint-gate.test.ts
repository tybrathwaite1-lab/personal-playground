/**
 * M2-7: lint is a blocking gate. The existing ESLint configuration and rules are unchanged;
 * what changed is that a lint error or warning now fails `npm run lint`, and that step fails
 * the Check workflow and the production build (and therefore the deploy).
 *
 * The negative tests run the real ESLint binary, with the exact flags from the `lint` script
 * and the repository's eslint.config.js, on synthetic source passed through stdin (no file is
 * written to the repository).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

type Step = { name?: string; run?: string; uses?: string; 'continue-on-error'?: unknown };
type Workflow = { jobs: Record<string, { steps?: Step[]; needs?: string | string[]; 'continue-on-error'?: unknown }> };
const load = (f: string) => yaml.load(readFileSync(`.github/workflows/${f}`, 'utf8')) as Workflow;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const require = createRequire(import.meta.url);
const ESLINT_BIN = join(dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js');

/** The lint script's flags (everything after `eslint .`), applied to stdin as `as`. */
function lint(source: string, as: string) {
  const [bin, target, ...flags] = (pkg.scripts.lint as string).split(/\s+/);
  assert.equal(bin, 'eslint');
  assert.equal(target, '.');
  const r = spawnSync(process.execPath, [ESLINT_BIN, ...flags, '--stdin', '--stdin-filename', as], { input: source, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('the lint script lints the whole repository and fails on warnings as well as errors', () => {
  assert.equal(pkg.scripts.lint, 'eslint . --max-warnings 0');
});

test('lint blocks Check and the production build: no continue-on-error, before tests and deploy', () => {
  for (const [file, job] of [
    ['check.yml', 'check'],
    ['deploy.yml', 'build'],
  ] as const) {
    const j = load(file).jobs[job];
    assert.equal(j['continue-on-error'], undefined, `${file} › ${job}: the job itself must not continue on error`);
    const lintSteps = (j.steps ?? []).filter((s) => /\bnpm run lint\b/.test(s.run ?? ''));
    assert.equal(lintSteps.length, 1, `${file} › ${job}: exactly one lint step`);
    assert.equal(lintSteps[0].run, 'npm run lint');
    assert.equal(lintSteps[0]['continue-on-error'], undefined, `${file} › ${job}: lint must block`);
    const names = (j.steps ?? []).map((s) => s.run ?? s.uses ?? '');
    const at = names.indexOf('npm run lint');
    assert.ok(at >= 0 && at < names.findIndex((n) => /^npm test$/.test(n)), `${file} › ${job}: lint runs before the tests`);
  }
  // The deploy can only run after the build job, lint included, has succeeded.
  const d = load('deploy.yml');
  assert.equal(d.jobs.deploy.needs, 'build');
  const build = d.jobs.build.steps ?? [];
  assert.ok(
    build.findIndex((s) => s.run === 'npm run lint') < build.findIndex((s) => s.uses?.startsWith('actions/upload-pages-artifact@')),
    'lint runs before the Pages artifact is uploaded',
  );
});

test('negative: a lint error fails the gate (src, scripts and tests are all linted)', () => {
  const unused = 'export function f() {\n  const unused = 1;\n  return 2;\n}\n';
  for (const as of ['src/utils/lint-probe.ts', 'scripts/lint-probe.ts', 'tests/lint-probe.test.ts']) {
    const r = lint(unused, as);
    assert.equal(r.status, 1, `${as}: must fail\n${r.out}`);
    assert.match(r.out, /'unused' is assigned a value but never used\s+@typescript-eslint\/no-unused-vars/, as);
  }
  const hooks = lint("import { useState } from 'react';\nexport function C({ on }: { on: boolean }) {\n  if (on) useState(0);\n  return null;\n}\n", 'src/components/LintProbe.tsx');
  assert.equal(hooks.status, 1, hooks.out);
  assert.match(hooks.out, /react-hooks\/rules-of-hooks/);
});

test('negative: a lint warning alone fails the gate (--max-warnings 0)', () => {
  const src = [
    "import { useEffect } from 'react';",
    'export function C({ id }: { id: string }) {',
    '  useEffect(() => {',
    '    console.log(id);',
    '  }, []);',
    '  return null;',
    '}',
    '',
  ].join('\n');
  const r = lint(src, 'src/components/LintProbe.tsx');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /warning\s+React Hook useEffect has a missing dependency: 'id'/);
  assert.match(r.out, /0 errors, 1 warning/);
  assert.match(r.out, /ESLint found too many warnings \(maximum: 0\)/);
});

test('positive: clean code passes the gate', () => {
  const r = lint("import { useEffect } from 'react';\nexport function C({ id }: { id: string }) {\n  useEffect(() => {\n    console.log(id);\n  }, [id]);\n  return null;\n}\n", 'src/components/LintProbe.tsx');
  assert.equal(r.status, 0, r.out);
});
