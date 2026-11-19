/**
 * Test-suite integrity policy (M2-1), used by scripts/test/run.ts and its own tests.
 *
 *  - discover(): every test file under tests/, at any depth, is found by name; anything else
 *    outside tests/fixtures and tests/helpers that looks like it was meant to be a test (or is
 *    an unexpected file) is reported, so a misnamed or misplaced test can't silently not run.
 *  - focusMarkers(): finds focused, skipped and TODO tests by parsing the TypeScript source,
 *    so the same words in comments, strings or fixtures don't count.
 *  - verifyRun(): checks the runner's events: every discovered file ran at least one real
 *    test, nothing was skipped or marked TODO, and nothing failed or was cancelled.
 */
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

export const TEST_SUFFIX = '.test.ts';
/** Directories under tests/ that hold support code or data, never tests. */
export const SUPPORT_DIRS = ['fixtures', 'helpers'];

export interface Discovery {
  files: string[]; // absolute paths of test files to run
  problems: string[];
}

const posix = (p: string) => p.split(sep).join('/');

/** Finds every test file under `root` (normally tests/) and reports files that would never run. */
export function discover(root: string): Discovery {
  const files: string[] = [];
  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, e.name);
      const rel = posix(relative(root, abs));
      const top = rel.split('/')[0];
      if (e.isSymbolicLink()) {
        problems.push(`${rel}: symlinks are not allowed in tests/`);
      } else if (e.isDirectory()) {
        walk(abs);
      } else if (SUPPORT_DIRS.includes(top) && rel.includes('/')) {
        // Support code and data. A file here named like a test would never run, so flag it.
        if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) problems.push(`${rel}: test-named file inside tests/${top}/ is never run; move it out of ${top}/ or rename it`);
      } else if (e.name.endsWith(TEST_SUFFIX)) {
        files.push(abs);
      } else if (/\.(test|spec|tests)\.[cm]?[jt]sx?$/.test(e.name) || /\.spec\.ts$/.test(e.name)) {
        problems.push(`${rel}: looks like a test but only *${TEST_SUFFIX} files run; rename it`);
      } else {
        problems.push(`${rel}: unexpected file in tests/ (tests must be *${TEST_SUFFIX}; support code goes in tests/helpers/, data in tests/fixtures/)`);
      }
    }
  };
  walk(root);
  return { files, problems };
}

const RUNNERS = new Set(['test', 'it', 'describe', 'suite']);
const MODIFIERS = new Set(['only', 'skip', 'todo']);

/** Focused/skipped/TODO markers in one test file's source (empty = none). */
export function focusMarkers(fileName: string, source: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const at = (n: ts.Node) => `${fileName}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node) => {
    // import { skip, only, todo } from 'node:test'
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && /^(node:)?test$/.test(n.moduleSpecifier.text)) {
      const named = n.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) for (const el of named.elements) if (MODIFIERS.has((el.propertyName ?? el.name).text)) out.push(`${at(el)}: imports "${(el.propertyName ?? el.name).text}" from node:test`);
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      // test.only(...), it.skip(...), describe.todo(...), t.skip(), t.todo()
      if (ts.isPropertyAccessExpression(callee) && MODIFIERS.has(callee.name.text)) {
        const base = callee.expression;
        if (ts.isIdentifier(base)) out.push(`${at(n)}: ${base.text}.${callee.name.text}()`);
      }
      // test('name', { only: true | skip | todo }, fn)
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression.text : '';
      if (RUNNERS.has(name) || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'test')) {
        for (const arg of n.arguments)
          if (ts.isObjectLiteralExpression(arg))
            for (const p of arg.properties) {
              const key = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : '';
              if (MODIFIERS.has(key)) out.push(`${at(p)}: ${key} option on a test`);
            }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The subset of node:test reporter events the run check needs. */
export interface RunEvent {
  type: 'test:pass' | 'test:fail';
  name: string;
  file?: string;
  nesting: number;
  skip?: unknown;
  todo?: unknown;
  cancelled?: boolean;
}

export interface RunSummary {
  testsByFile: Map<string, number>;
  problems: string[];
}

/** Checks a completed run against the discovered files (empty problems = the suite is trustworthy). */
export function verifyRun(expected: string[], events: RunEvent[]): RunSummary {
  const testsByFile = new Map<string, number>(expected.map((f) => [f, 0]));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const file = e.file ?? '(unknown file)';
    seen.add(file);
    const label = `${file}: "${e.name}"`;
    if (e.skip !== undefined && e.skip !== false) problems.push(`${label} was skipped${typeof e.skip === 'string' ? ` (${e.skip})` : ''}`);
    if (e.todo !== undefined && e.todo !== false) problems.push(`${label} is marked TODO${typeof e.todo === 'string' ? ` (${e.todo})` : ''}`);
    if (e.type === 'test:fail') problems.push(`${label} ${e.cancelled ? 'was cancelled' : 'failed'}`);
    if (!testsByFile.has(file)) {
      problems.push(`${file}: ran but was not discovered`);
      continue;
    }
    // A file with no tests (or that failed to load) is reported as one test named after the file.
    const fileLevel = e.nesting === 0 && e.name === e.file;
    if (e.nesting === 0 && !fileLevel) testsByFile.set(file, (testsByFile.get(file) ?? 0) + 1);
  }
  for (const f of expected) {
    if (!seen.has(f)) problems.push(`${f}: discovered but never reported by the runner`);
    else if ((testsByFile.get(f) ?? 0) === 0) problems.push(`${f}: ran no tests`);
  }
  return { testsByFile, problems: [...new Set(problems)] };
}
