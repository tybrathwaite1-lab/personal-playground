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

const RUNNER_EXPORTS = new Set(['test', 'it', 'describe', 'suite']);
const MODIFIERS = new Set(['only', 'skip', 'todo']);
const TEST_MODULE = /^(node:)?test$/;

/**
 * Focused/skipped/TODO markers in one test file's source (empty = none).
 *
 * Detection is tied to the node:test API, not to the words: it follows what the file imports
 * from node:test (default, named, renamed and namespace imports), simple aliases of those
 * bindings (`const check = test`), and the test-context parameter of test callbacks (`t`,
 * including nested `t.test(...)`). It then reports, on those bindings only:
 *  - modifier access, called or not: `test.only`, `it['skip']`, `nt.test.todo`, `t.skip()`,
 *    `const s = test.skip`, `const { only } = test`;
 *  - dynamic member access whose name can't be read statically (`test[name]`);
 *  - `only`/`skip`/`todo` options in an object literal passed to a test call (`t.test` too);
 *  - importing `only`/`skip`/`todo` from node:test.
 * Unrelated objects with `skip`/`only`/`todo` members, comments and strings are ignored.
 *
 * Known limits (by design; not a general JavaScript analyzer): bindings are tracked by name per
 * file, so shadowing isn't modelled; options passed through a variable, spread or function call,
 * aliases made through reassignment or other modules, and CommonJS `require` aren't followed.
 * The runner's runtime check still catches any skip or TODO that actually happens; a focused
 * test with no other marker is only caught statically.
 */
export function focusMarkers(fileName: string, source: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const at = (n: ts.Node) => `${fileName}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const runners = new Set<string>(); // identifiers bound to test/it/describe/suite
  const namespaces = new Set<string>(); // identifiers bound to the node:test module
  const contexts = new Set<string>(); // test-context parameters (t)

  // Pass 1: bindings from imports.
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !TEST_MODULE.test(st.moduleSpecifier.text)) continue;
    const clause = st.importClause;
    if (!clause) continue;
    if (clause.name) runners.add(clause.name.text); // import test from 'node:test'
    const nb = clause.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) namespaces.add(nb.name.text);
    if (nb && ts.isNamedImports(nb))
      for (const el of nb.elements) {
        const imported = (el.propertyName ?? el.name).text;
        if (RUNNER_EXPORTS.has(imported)) runners.add(el.name.text);
        if (MODIFIERS.has(imported)) out.push(`${at(el)}: imports "${imported}" from node:test`);
      }
  }

  /** The member name of `a.b` / `a['b']`, or null when it can't be read statically. */
  const memberName = (n: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | null =>
    ts.isPropertyAccessExpression(n) ? n.name.text : ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : null;
  /** Is this expression a test runner: a runner binding, ns.test/ns.it/…, or t.test? */
  const isRunner = (e: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(e)) return isRunner(e.expression);
    if (ts.isIdentifier(e)) return runners.has(e.text);
    if ((ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && ts.isIdentifier(e.expression)) {
      const name = memberName(e);
      if (namespaces.has(e.expression.text)) return name !== null && RUNNER_EXPORTS.has(name);
      if (contexts.has(e.expression.text)) return name === 'test';
    }
    return false;
  };
  const label = (e: ts.Expression) => e.getText(sf).replace(/\s+/g, '');

  const visit = (n: ts.Node) => {
    // Aliases: const check = test; const s = test.skip (reported at the access below).
    if (ts.isVariableDeclaration(n) && n.initializer) {
      if (ts.isIdentifier(n.name) && isRunner(n.initializer)) runners.add(n.name.text);
      // const { only, skip: s } = test  /  = nt  /  = t
      if (ts.isObjectBindingPattern(n.name) && (isRunner(n.initializer) || (ts.isIdentifier(n.initializer) && (namespaces.has(n.initializer.text) || contexts.has(n.initializer.text)))))
        for (const el of n.name.elements) {
          const key = el.propertyName && (ts.isIdentifier(el.propertyName) || ts.isStringLiteral(el.propertyName)) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : '';
          if (MODIFIERS.has(key)) out.push(`${at(el)}: destructures "${key}" from ${label(n.initializer)}`);
          else if (RUNNER_EXPORTS.has(key) && ts.isIdentifier(el.name)) runners.add(el.name.text);
        }
    }
    // Modifier access on a runner, the namespace or a test context, called or not.
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      const base = n.expression;
      const onApi = isRunner(base) || (ts.isIdentifier(base) && (namespaces.has(base.text) || contexts.has(base.text)));
      if (onApi) {
        const name = memberName(n);
        if (name === null) out.push(`${at(n)}: dynamic member access on the test API (${label(n)})`);
        else if (MODIFIERS.has(name)) out.push(`${at(n)}: ${label(base)}.${name}`);
      }
    }
    if (ts.isCallExpression(n) && isRunner(n.expression)) {
      // Options object: test('x', { skip: true }, fn), t.test('x', { only: true }, fn)
      for (const arg of n.arguments)
        if (ts.isObjectLiteralExpression(arg))
          for (const p of arg.properties) {
            const pn = p.name;
            const key = pn && (ts.isIdentifier(pn) || ts.isStringLiteral(pn)) ? pn.text : pn && ts.isComputedPropertyName(pn) && ts.isStringLiteralLike(pn.expression) ? pn.expression.text : '';
            if (MODIFIERS.has(key)) out.push(`${at(p)}: ${key} option on ${label(n.expression)}()`);
          }
      // The callback's first parameter is the test context.
      for (const arg of n.arguments)
        if ((ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) && arg.parameters[0] && ts.isIdentifier(arg.parameters[0].name)) contexts.add(arg.parameters[0].name.text);
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
