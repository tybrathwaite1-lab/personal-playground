/**
 * `npm test`: runs every test file under tests/ (any depth) with node:test, then fails unless
 * the run is trustworthy (scripts/test/policy.ts):
 *  - every test file was discovered, ran, and reported at least one real test;
 *  - no file is misnamed or misplaced (it would silently never run);
 *  - no test is focused, skipped or TODO, statically (source) or at run time;
 *  - nothing failed or was cancelled.
 *
 * Usage: tsx --tsconfig tsconfig.app.json scripts/test/run.ts [--root tests] [file ...]
 * Naming files runs only those (a partial run: the completeness check is skipped and says so).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { discover, focusMarkers, verifyRun, type RunEvent } from './policy.ts';

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const root = resolve(rootIdx >= 0 ? args.splice(rootIdx, 2)[1] : 'tests');
const only = args.map((a) => resolve(a));

const found = discover(root);
const files = only.length ? only : found.files;
const problems: string[] = only.length ? [] : [...found.problems];
for (const f of files) problems.push(...focusMarkers(f, readFileSync(f, 'utf8')));

const events: RunEvent[] = [];
const stream = run({ files, isolation: 'process', concurrency: true });
for (const type of ['test:pass', 'test:fail'] as const)
  stream.on(type, (d: { name: string; file?: string; nesting: number; skip?: unknown; todo?: unknown; details?: { error?: { failureType?: string } } }) =>
    events.push({ type, name: d.name, file: d.file, nesting: d.nesting, skip: d.skip, todo: d.todo, cancelled: d.details?.error?.failureType === 'cancelledByParent' }),
  );
const report = stream.compose(spec);
report.pipe(process.stdout, { end: false });

// After the reporter has printed everything (the source stream's events are complete by then).
report.on('end', () => {
  const summary = verifyRun(files, events);
  problems.push(...summary.problems);
  const real = [...summary.testsByFile.values()].reduce((a, b) => a + b, 0);
  const lines = [`\nTest integrity: ${files.length} files discovered${only.length ? ' (partial run: completeness not checked)' : ''}, ${real} top-level tests ran.`];
  if (problems.length) {
    lines.push(`✖ ${problems.length} integrity problem(s):`, ...problems.map((p) => `  - ${p.replace(`${process.cwd()}/`, '')}`));
    process.exitCode = 1;
  } else lines.push('✔ Every discovered file ran real tests; nothing focused, skipped, TODO, failed or cancelled.');
  console.log(lines.join('\n'));
});
