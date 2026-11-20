/**
 * M2-4: safe URLs. `isSafeUrl` (src/utils/helpers.ts) decides which links the app will render
 * from data it doesn't control. These tests pin its behaviour, and a structural scan of every
 * JSX `href` checks where it is applied at rendering boundaries. Browser interaction coverage
 * comes in M2-6.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { isSafeUrl, normalizeUrl } from '../src/utils/helpers.ts';
import { normalizeData, parseBackup, EMPTY_DATA } from '../src/utils/storage.ts';

test('isSafeUrl accepts only absolute http(s) URLs', () => {
  for (const ok of [
    'https://example.org',
    'https://example.org/path?q=1#x',
    'http://example.org',
    'HTTPS://EXAMPLE.ORG/',
    'https://user:pass@example.org/',
    'https://example.org:8443/a',
    'https://xn--bcher-kva.example/',
    'https://例え.テスト/パス',
    '  https://example.org  ', // the URL parser trims surrounding whitespace
  ])
    assert.equal(isSafeUrl(ok), true, ok);
});

test('isSafeUrl rejects script, data and other schemes, including obfuscated forms', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    '\tjavascript:alert(1)',
    'java\tscript:alert(1)', // tabs and newlines inside the scheme are removed by URL parsing
    'java\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'javascript&colon;alert(1)', // not decoded by URL parsing: no scheme, so it is relative and rejected
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'file:///etc/passwd',
    'ftp://example.org',
    'blob:https://example.org/uuid',
    'about:blank',
    'mailto:a@example.org',
    'tel:+15555550100',
    'chrome://settings',
  ])
    assert.equal(isSafeUrl(bad), false, JSON.stringify(bad));
});

test('isSafeUrl rejects missing, relative and malformed values', () => {
  for (const bad of [undefined, '', ' ', 'example.org', '/relative/path', '//example.org', '#/discover', '?q=1', 'https://', 'http://exa mple.org', 'https://[::1', '%68ttps://example.org'])
    assert.equal(isSafeUrl(bad), false, JSON.stringify(bad));
  // Values that aren't strings at runtime (e.g. from imported data): the URL parser coerces
  // them with String(), exactly as React does when rendering an href, so the check and the
  // rendered link agree. Objects and numbers don't make valid URLs.
  for (const v of [null, 42, {}]) assert.equal(isSafeUrl(v as unknown as string), false, JSON.stringify(v));
  assert.equal(isSafeUrl(['https://example.org'] as unknown as string), true, 'coerced to "https://example.org" (safe)');
  assert.equal(isSafeUrl(['javascript:alert(1)'] as unknown as string), false);
});

test('normalizeUrl adds https:// to bare hosts; the result still goes through isSafeUrl', () => {
  assert.equal(normalizeUrl('  example.org '), 'https://example.org');
  assert.equal(normalizeUrl('http://example.org'), 'http://example.org');
  assert.equal(normalizeUrl(''), '');
  // A javascript: URL becomes an https URL to a host named "javascript" — harmless, and still validated.
  assert.equal(normalizeUrl('javascript:alert(1)'), 'https://javascript:alert(1)');
  assert.equal(isSafeUrl(normalizeUrl('javascript:alert(1)')), false, 'port "alert(1)" is not a valid URL');
});

// ─── Rendering boundaries ────────────────────────────────────────────

type Href = { file: string; line: number; expr: string; status: 'constant' | 'builder' | 'guarded' | 'reviewed' };

/** Builders whose output is always an internal hash route or an https URL they construct. */
const BUILDERS = new Set(['href', 'directionsLink', 'mapsLink']);

/**
 * Unguarded hrefs from data, each reviewed. `bundled`: the URL comes from source-controlled
 * data (and, for Drop, is validated as https by scripts/drop/build.ts). URLs from personal
 * data (input, backup import, sync) are never reviewed here: they must be guarded.
 */
const REVIEWED: Record<string, string> = {
  'src/components/EditorialImage.tsx: meta.sourceUrl': 'bundled: editorial image credits in src/data/images.ts',
  'src/pages/Drop.tsx: s.url': 'bundled: Drop sources, https-only per the Drop validator',
  'src/pages/Drop.tsx: current.url': 'bundled: Drop items, https-only per the Drop validator',
  'src/pages/Drop.tsx: c.url': 'bundled: Drop items, https-only per the Drop validator',
  'src/pages/Pulse.tsx: s.homepage': 'bundled: Pulse source list (src/data/pulseSources.ts) mirrored into pulse.json by CI',
  'src/pages/Pulse.tsx: c.website': 'bundled: communities (src/data/communities.ts)',
  'src/pages/Home.tsx: p.to': 'internal: a hash route from a static list',
  'src/pages/Collection.tsx: link.href': 'guarded upstream: linkFor() returns isSafeUrl(s.url) ? … : null for external links',
};

/**
 * Does `cond` being truthy guarantee that isSafeUrl(<text>) returned true? A deliberately small,
 * conservative reading of boolean structure (no control- or data-flow analysis):
 *  - `isSafeUrl(text)` itself (the exact rendered expression, as written) → yes;
 *  - `a && b` → yes if either side guarantees it (both must be truthy);
 *  - `a || b` → only if both sides guarantee it;
 *  - parentheses are looked through;
 *  - anything else — negation, comparisons, a call that merely contains isSafeUrl, a different
 *    argument, a variable holding the result — → no.
 */
function guarantees(cond: ts.Expression, text: string, sf: ts.SourceFile): boolean {
  if (ts.isParenthesizedExpression(cond)) return guarantees(cond.expression, text, sf);
  if (ts.isCallExpression(cond)) return ts.isIdentifier(cond.expression) && cond.expression.text === 'isSafeUrl' && cond.arguments.length === 1 && cond.arguments[0].getText(sf) === text;
  if (ts.isBinaryExpression(cond)) {
    if (cond.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return guarantees(cond.left, text, sf) || guarantees(cond.right, text, sf);
    if (cond.operatorToken.kind === ts.SyntaxKind.BarBarToken) return guarantees(cond.left, text, sf) && guarantees(cond.right, text, sf);
  }
  return false;
}

/** The value a filter predicate returns: an expression body, or a block that is exactly `return <expr>;`. */
function predicateResult(f: ts.ArrowFunction | ts.FunctionExpression): ts.Expression | undefined {
  if (!ts.isBlock(f.body)) return f.body;
  const [only, ...rest] = f.body.statements;
  return !rest.length && only && ts.isReturnStatement(only) ? only.expression : undefined;
}

const rootName = (text: string) => /^[A-Za-z_$][\w$]*/.exec(text)?.[0];
const declaresParam = (fn: ts.SignatureDeclaration, name: string | undefined, sf: ts.SourceFile) => !!name && fn.parameters.some((p) => new RegExp(`\\b${name}\\b`).test(p.name.getText(sf)));

/**
 * Is `node` (an href expression) rendered only when isSafeUrl(<the same expression>) returned
 * true? Recognised, and only these:
 *  - `<guard> && …<a href={x}>…` with the href inside the right operand;
 *  - `<guard> ? …<a href={x}>… : …` with the href inside the true branch;
 *  - `list.filter((l) => <guard on l.url>).map((l) => …<a href={l.url}>…)`;
 * where <guard> satisfies `guarantees()`. Walking outward stops at a function whose parameters
 * rebind the href's root name (a guard outside it is about a different value).
 */
function guarded(node: ts.Expression, sf: ts.SourceFile): boolean {
  const text = node.getText(sf);
  const root = rootName(text);
  for (let cur: ts.Node = node; cur.parent; cur = cur.parent) {
    const p = cur.parent;
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && p.right === cur && guarantees(p.left, text, sf)) return true;
    if (ts.isConditionalExpression(p) && p.whenTrue === cur && guarantees(p.condition, text, sf)) return true;
    if ((ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) && declaresParam(cur, root, sf)) {
      // list.filter((l) => <guard>).map((l) => <a href={l.url}>): the only way through a rebinding.
      if (ts.isCallExpression(p) && p.arguments[0] === cur && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'map') {
        const src = p.expression.expression;
        if (ts.isCallExpression(src) && ts.isPropertyAccessExpression(src.expression) && src.expression.name.text === 'filter') {
          const f = src.arguments[0];
          const mapParam = cur.parameters[0]?.name;
          if (f && (ts.isArrowFunction(f) || ts.isFunctionExpression(f)) && mapParam && ts.isIdentifier(mapParam) && f.parameters[0] && ts.isIdentifier(f.parameters[0].name) && mapParam.text === root) {
            const result = predicateResult(f);
            const renamed = text.replace(new RegExp(`^${root}\\b`), f.parameters[0].name.text);
            if (result && guarantees(result, renamed, sf)) return true;
          }
        }
      }
      return false;
    }
  }
  return false;
}

function scanHrefs(): Href[] {
  const root = 'src';
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith('.tsx')) files.push(join(d, e.name));
    }
  };
  walk(root);
  return files.sort().flatMap((file) => scanSource(file, readFileSync(file, 'utf8')));
}

/** Classifies every JSX href in one file's source. */
function scanSource(file: string, source: string): Href[] {
  const out: Href[] = [];
  {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'href' && n.initializer) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        const rel = relative('.', file);
        if (ts.isStringLiteral(n.initializer)) out.push({ file: rel, line, expr: n.initializer.text, status: 'constant' });
        else if (ts.isJsxExpression(n.initializer) && n.initializer.expression) {
          const e = n.initializer.expression;
          const expr = e.getText(sf);
          let status: Href['status'] | null = null;
          if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) status = 'constant';
          else if (ts.isTemplateExpression(e) && /^(#|https:\/\/[a-z0-9.-]+\/)/.test(e.head.text)) status = 'builder';
          else if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && BUILDERS.has(e.expression.text)) status = 'builder';
          else if (ts.isIdentifier(e) && /^[A-Z][A-Z0-9_]*$/.test(e.text)) status = 'constant';
          else if (guarded(e, sf)) status = 'guarded';
          else if (`${rel}: ${expr}` in REVIEWED) status = 'reviewed';
          out.push({ file: rel, line, expr, status: status ?? ('UNREVIEWED' as Href['status']) });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

test('every JSX href is a constant, a trusted builder, guarded by isSafeUrl, or explicitly reviewed', () => {
  const hrefs = scanHrefs();
  assert.ok(hrefs.length >= 60, `found ${hrefs.length} hrefs`);
  const unreviewed = hrefs.filter((h) => !['constant', 'builder', 'guarded', 'reviewed'].includes(h.status)).map((h) => `${h.file}:${h.line} ${h.expr}`);
  assert.deepEqual(unreviewed, [], 'new unguarded hrefs: guard them with isSafeUrl or review them in REVIEWED');
  // The isSafeUrl guards the app relies on today are all recognised.
  const g = hrefs.filter((h) => h.status === 'guarded').map((h) => `${h.file}: ${h.expr}`);
  assert.deepEqual(g.sort(), [
    'src/components/AdventurePanel.tsx: s.url',
    'src/components/ExperienceCard.tsx: l.url',
    'src/components/PlaceCard.tsx: place.website',
    ...PERSONAL_DATA_BOUNDARIES.map((b) => `${b.file}: ${b.expr}`),
    'src/pages/Pulse.tsx: e.url',
  ].sort());
  assert.ok(!Object.values(REVIEWED).some((why) => /DEFECT|personal/i.test(why)), 'no personal-data URL is a reviewed exception');
  // Every reviewed entry still exists (no stale exceptions).
  const reviewedNow = new Set(hrefs.filter((h) => h.status === 'reviewed').map((h) => `${h.file}: ${h.expr}`));
  assert.deepEqual(Object.keys(REVIEWED).filter((k) => !reviewedNow.has(k)), []);
});

/**
 * The four boundaries M2-4 found rendering personal-data URLs (field notes, websites, custom
 * experience links) without isSafeUrl. Each is now guarded; `guard` is the exact source text
 * whose removal must be caught.
 */
const PERSONAL_DATA_BOUNDARIES = [
  { file: 'src/pages/Digital.tsx', expr: 'random.url', guard: 'random && isSafeUrl(random.url) &&', unguarded: 'random &&' },
  { file: 'src/pages/Digital.tsx', expr: 'w.url', guard: '{isSafeUrl(w.url) ? (', unguarded: '{true ? (' },
  { file: 'src/pages/FieldNotes.tsx', expr: 'n.url', guard: '{isSafeUrl(n.url) && (', unguarded: '{n.url && (' },
  { file: 'src/pages/Plan.tsx', expr: 'e.links[0].url', guard: '(isSafeUrl(e.links[0].url) ? (', unguarded: '(e.links[0].url ? (' },
];

test('the four personal-data URL boundaries are guarded, and removing any guard is caught', () => {
  for (const b of PERSONAL_DATA_BOUNDARIES) {
    const src = readFileSync(b.file, 'utf8');
    assert.equal(src.split(b.guard).length - 1, 1, `${b.file}: guard text found exactly once`);
    const now = scanSource(b.file, src).filter((h) => h.expr === b.expr);
    assert.deepEqual(now.map((h) => h.status), ['guarded'], `${b.file}: ${b.expr} is guarded`);
    // Remove the guard (keeping the code otherwise valid): the href becomes unreviewed.
    const removed = scanSource(b.file, src.replace(b.guard, b.unguarded)).filter((h) => h.expr === b.expr);
    assert.deepEqual(removed.map((h) => h.status), ['UNREVIEWED'], `${b.file}: removing the guard on ${b.expr} must be caught`);
  }
});

test('mutation: removing an isSafeUrl guard, or adding an unguarded data href, is detected', () => {
  // The scanner reads the real sources; here the guard logic is exercised on edited copies.
  const check = (src: string) => {
    const sf = ts.createSourceFile('x.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let result: boolean | undefined;
    const visit = (n: ts.Node) => {
      if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'href' && n.initializer && ts.isJsxExpression(n.initializer)) result = guarded(n.initializer.expression!, sf);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return result;
  };
  assert.equal(check('const A = ({ p }) => <>{isSafeUrl(p.website) && <a href={p.website}>x</a>}</>;'), true);
  assert.equal(check('const A = ({ p }) => <>{p.website && <a href={p.website}>x</a>}</>;'), false, 'guard removed');
  assert.equal(check('const A = ({ p, q }) => <>{isSafeUrl(q.website) && <a href={p.website}>x</a>}</>;'), false, 'guard on a different value');
  assert.equal(check('const A = ({ p }) => <>{isSafeUrl(p.website) || <a href={p.website}>x</a>}</>;'), false, 'wrong operator');
  assert.equal(check('const A = ({ p }) => (isSafeUrl(p.url) ? <a href={p.url}>x</a> : null);'), true);
  assert.equal(check('const A = ({ p }) => (isSafeUrl(p.url) ? null : <a href={p.url}>x</a>);'), false, 'link in the unsafe branch');
  assert.equal(check('const A = ({ e }) => <>{e.links.filter((l) => isSafeUrl(l.url)).map((l) => <a href={l.url}>x</a>)}</>;'), true);
  assert.equal(check('const A = ({ e }) => <>{e.links.filter((l) => l.url).map((l) => <a href={l.url}>x</a>)}</>;'), false, 'filter without isSafeUrl');
  assert.equal(check('const A = ({ e }) => <>{e.links.map((l) => <a href={l.url}>x</a>)}</>;'), false, 'no filter');
  // Positive predicates that are still accepted.
  assert.equal(check('const A = ({ p, ok }) => <>{ok && isSafeUrl(p.url) && <a href={p.url}>x</a>}</>;'), true, 'conjunction with another condition');
  assert.equal(check('const A = ({ p }) => <>{(isSafeUrl(p.url)) && <div><a href={p.url}>x</a></div>}</>;'), true, 'parentheses, nested JSX');
  assert.equal(check('const A = ({ e }) => <>{e.links.filter((l) => { return isSafeUrl(l.url); }).map((l) => <a href={l.url}>x</a>)}</>;'), true, 'block-bodied filter');
  assert.equal(check('const A = ({ e }) => <>{e.links.filter((l) => l.visible && isSafeUrl(l.url)).map((l) => <a href={l.url}>x</a>)}</>;'), true, 'filter conjunction');
  // False positives the previous recursive search accepted; each is now rejected.
  const rejected: [string, string][] = [
    ['negated guard', 'const A = ({ p }) => <>{!isSafeUrl(p.url) && <a href={p.url}>x</a>}</>;'],
    ['negated in a conditional', 'const A = ({ p }) => (!isSafeUrl(p.url) ? <a href={p.url}>x</a> : null);'],
    ['OR bypass', 'const A = ({ p }) => <>{(isSafeUrl(p.url) || p.trusted) && <a href={p.url}>x</a>}</>;'],
    ['OR with a constant', 'const A = ({ p }) => <>{(isSafeUrl(p.url) || true) && <a href={p.url}>x</a>}</>;'],
    ['compared to false', 'const A = ({ p }) => <>{isSafeUrl(p.url) === false && <a href={p.url}>x</a>}</>;'],
    ['nested inside an unrelated call', 'const A = ({ p }) => <>{log(isSafeUrl(p.url)) && <a href={p.url}>x</a>}</>;'],
    ['nested inside an array', 'const A = ({ p }) => <>{[isSafeUrl(p.url)].length && <a href={p.url}>x</a>}</>;'],
    ['result stored in a variable', 'const A = ({ p }) => { const ok = isSafeUrl(p.url); return <>{ok && <a href={p.url}>x</a>}</>; };'],
    ['guard in the false branch only', 'const A = ({ p }) => (isSafeUrl(p.url) ? null : <a href={p.url}>x</a>);'],
    ['guard on an outer value shadowed by a parameter', 'const A = ({ l, list }) => <>{isSafeUrl(l.url) && list.map((l) => <a href={l.url}>x</a>)}</>;'],
    ['negated filter predicate', 'const A = ({ e }) => <>{e.links.filter((l) => !isSafeUrl(l.url)).map((l) => <a href={l.url}>x</a>)}</>;'],
    ['OR filter predicate', 'const A = ({ e }) => <>{e.links.filter((l) => isSafeUrl(l.url) || l.trusted).map((l) => <a href={l.url}>x</a>)}</>;'],
    ['filter that ignores the check', 'const A = ({ e }) => <>{e.links.filter((l) => { isSafeUrl(l.url); return true; }).map((l) => <a href={l.url}>x</a>)}</>;'],
    ['filter checking a different field', 'const A = ({ e }) => <>{e.links.filter((l) => isSafeUrl(l.label)).map((l) => <a href={l.url}>x</a>)}</>;'],
    ['filter by a named function', 'const A = ({ e }) => <>{e.links.filter(safe).map((l) => <a href={l.url}>x</a>)}</>;'],
    ['map parameter renamed away from the filtered one', 'const A = ({ e, l }) => <>{e.links.filter((m) => isSafeUrl(m.url)).map((k) => <a href={l.url}>x</a>)}</>;'],
  ];
  const accepted = rejected.filter(([, src]) => check(src) !== false).map(([name]) => name);
  assert.deepEqual(accepted, [], `accepted as guarded: ${accepted.join('; ')}`);
});

test('characterization: imported records keep their URLs as-is, and React 18 renders unsafe hrefs, so render-time guards are the protection', async () => {
  // Backup import and sync both go through normalizeData, which does not validate (or rewrite)
  // URLs inside field notes, websites or custom experiences: personal records are kept intact,
  // and the rendering boundaries above decide what becomes a link.
  const raw = {
    ...EMPTY_DATA,
    fieldNotes: [{ id: 'fn-1', title: 'x', url: 'javascript:alert(document.domain)', tags: [], createdAt: '2026-01-01' }],
    websites: [{ id: 'w-1', name: 'x', url: 'javascript:alert(1)', custom: true }],
  };
  const imported = parseBackup(JSON.stringify({ app: 'personal-playground', exportedAt: '2026-01-01', data: raw }));
  assert.ok(imported.ok);
  assert.equal(imported.ok && imported.data.fieldNotes[0].url, 'javascript:alert(document.domain)');
  assert.equal(normalizeData(raw).websites[0].url, 'javascript:alert(1)');
  // React 18 (the installed version) does not sanitize javascript: hrefs — it only warns — so
  // render-time isSafeUrl is the protection. React 19 would block them; this pins today's behaviour.
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { version } = await import('react');
  assert.match(version, /^18\./, 'installed React major');
  const restore = console.error;
  console.error = () => {}; // React's dev warning about javascript: URLs
  try {
    assert.equal(renderToStaticMarkup(createElement('a', { href: 'javascript:alert(1)' }, 'x')), '<a href="javascript:alert(1)">x</a>');
  } finally {
    console.error = restore;
  }
});
