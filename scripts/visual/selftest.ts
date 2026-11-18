/**
 * Self-test for the visual harness (scripts/visual/run.ts). Regression evidence that its checks
 * FAIL on deliberately broken input and pass on a clean page, and that accessibility testing can
 * never be silently skipped. Runs in CI before the real visual check; needs Chromium and the
 * dev dependencies.
 *
 *   npx tsx scripts/visual/selftest.ts
 *
 * Fixtures: tests/fixtures/visual/selftest/{good,broken}/index.html (synthetic, no network).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIX = join(ROOT, 'tests/fixtures/visual/selftest');

interface Run {
  code: number;
  out: string;
  report?: {
    axeAvailable: boolean;
    axeSummary: { id: string; impact: string | null }[];
    shots: { overflowPx: number; pageErrors: string[] }[];
    keyboard: { width: number; checks: { name: string; pass: boolean }[] }[];
  };
}

function run(fixture: 'good' | 'broken', args: string[], env: Record<string, string> = {}): Run {
  const out = mkdtempSync(join(tmpdir(), 'pp-visual-selftest-'));
  const r = spawnSync('npx', ['tsx', 'scripts/visual/run.ts', '--dist', join(FIX, fixture), '--routes', 'home', '--widths', '390,1280', '--out', out, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 180_000,
  });
  let report: Run['report'];
  try {
    report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as Run['report'];
  } catch {
    report = undefined;
  }
  rmSync(out, { recursive: true, force: true });
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, report };
}

const results: { name: string; pass: boolean; detail: string }[] = [];
function expect(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name} — ${detail}`);
}
const failedKeys = (r: Run) => (r.report?.keyboard ?? []).flatMap((k) => k.checks.filter((c) => !c.pass).map((c) => `${c.name}@${k.width}`));

// 1. Clean page, strict: everything passes.
{
  const r = run('good', ['--strict']);
  expect('clean page passes --strict', r.code === 0, `exit ${r.code}`);
  expect('clean page: axe ran', r.report?.axeAvailable === true, `axeAvailable=${r.report?.axeAvailable}`);
  expect('clean page: no accessibility violations', r.report?.axeSummary.length === 0, JSON.stringify(r.report?.axeSummary.map((a) => a.id)));
  expect('clean page: all keyboard checks pass', failedKeys(r).length === 0 && (r.report?.keyboard.length ?? 0) === 2, failedKeys(r).join('; ') || 'all pass at 390 and 1280');
  if (r.code !== 0) console.log(r.out.slice(-1500));
}

// 2. Broken page, strict: each kind of check fails.
{
  const r = run('broken', ['--strict']);
  const ids = r.report?.axeSummary.map((a) => `${a.id}:${a.impact}`) ?? [];
  expect('broken page fails --strict', r.code === 1, `exit ${r.code}`);
  expect('detects horizontal overflow', (r.report?.shots ?? []).every((s) => s.overflowPx > 1), (r.report?.shots ?? []).map((s) => s.overflowPx).join(', '));
  expect('detects the page error (thrown in a timer)', (r.report?.shots ?? []).every((s) => s.pageErrors.some((e) => /deliberate page error/.test(e))), String((r.report?.shots ?? [])[0]?.pageErrors));
  expect('detects low contrast (serious)', ids.includes('color-contrast:serious'), ids.join(', '));
  expect('keeps non-serious violations (server-side image map, minor)', ids.includes('server-side-image-map:minor'), ids.join(', '));
  const k = failedKeys(r).join('; ');
  expect('keyboard: missing skip link fails', /First stop is a skip link@/.test(k), k);
  expect('keyboard: trap fails progression', /Focus keeps progressing.*@/.test(k), k);
  expect('keyboard: missing focus indicator fails', /focus indicator.*@/.test(k), k);
  expect('keyboard: Shift+Tab failure detected', /Shift\+Tab.*@/.test(k), k);
}

// 3. Broken page, report-only: findings recorded, run succeeds (baseline mode is preserved).
{
  const r = run('broken', []);
  expect('report-only mode still exits 0 with findings', r.code === 0 && (r.report?.axeSummary.length ?? 0) > 0, `exit ${r.code}, ${r.report?.axeSummary.length} rules`);
}

// 4. axe expected but missing: fails in report-only AND strict mode.
for (const mode of [[], ['--strict']]) {
  const r = run('good', mode, { PP_VISUAL_AXE_MODULE: '@axe-core/not-installed' });
  expect(`missing axe fails${mode.length ? ' (--strict)' : ' (report-only)'}`, r.code === 1 && /Accessibility checks are required/.test(r.out), `exit ${r.code}`);
}

// 5. --strict can't be combined with --no-axe.
{
  const r = run('good', ['--strict', '--no-axe']);
  expect('--strict --no-axe is refused', r.code === 1 && /cannot be combined with --no-axe/.test(r.out), `exit ${r.code}`);
}

// 6. Explicit --no-axe (local diagnostics) runs, and the report says axe did not run.
{
  const r = run('good', ['--no-axe']);
  expect('--no-axe runs and is labelled', r.code === 0 && r.report?.axeAvailable === false, `exit ${r.code}, axeAvailable=${r.report?.axeAvailable}`);
}

const failed = results.filter((x) => !x.pass);
console.log(`\nSelf-test: ${results.length - failed.length}/${results.length} expectations met.`);
if (failed.length) process.exit(1);
