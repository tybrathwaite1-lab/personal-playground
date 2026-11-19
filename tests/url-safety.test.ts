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
 * data (and, for Drop, is validated as https by scripts/drop/build.ts). `DEFECT`: the URL can
 * come from imported or synced personal data and is rendered without isSafeUrl; see HANDOFF
 * (M2-4) and the characterization test below.
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
  'src/pages/FieldNotes.tsx: n.url': 'DEFECT: personal data (backup import, sync) rendered without isSafeUrl',
  'src/pages/Digital.tsx: random.url': 'DEFECT: personal websites (backup import, sync) rendered without isSafeUrl',
  'src/pages/Digital.tsx: w.url': 'DEFECT: personal websites (backup import, sync) rendered without isSafeUrl',
  'src/pages/Plan.tsx: e.links[0].url': 'DEFECT: custom experiences (backup import, sync) rendered without isSafeUrl',
};

const isSafeCallOn = (n: ts.Node, text: string, sf: ts.SourceFile): boolean => {
  let found = false;
  const visit = (x: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === 'isSafeUrl' && x.arguments[0]?.getText(sf) === text) found = true;
    else ts.forEachChild(x, visit);
  };
  visit(n);
  return found;
};

/** Is `node` (an href expression) rendered only when isSafeUrl(<same expression>) is true? */
function guarded(node: ts.Expression, sf: ts.SourceFile): boolean {
  const text = node.getText(sf);
  for (let cur: ts.Node = node; cur.parent; cur = cur.parent) {
    const p = cur.parent;
    // isSafeUrl(x) && <a href={x}>  /  isSafeUrl(x) ? <a href={x}> : …
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && p.right === cur && isSafeCallOn(p.left, text, sf)) return true;
    if (ts.isConditionalExpression(p) && p.whenTrue === cur && isSafeCallOn(p.condition, text, sf)) return true;
    // list.filter((l) => isSafeUrl(l.url)).map((l) => <a href={l.url}>)
    if (ts.isArrowFunction(cur) && ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'map') {
      const src = p.expression.expression;
      if (ts.isCallExpression(src) && ts.isPropertyAccessExpression(src.expression) && src.expression.name.text === 'filter') {
        const f = src.arguments[0];
        const mapParam = cur.parameters[0]?.name.getText(sf);
        if (f && (ts.isArrowFunction(f) || ts.isFunctionExpression(f))) {
          const fParam = f.parameters[0]?.name.getText(sf);
          if (mapParam && fParam && isSafeCallOn(f.body, text.replace(new RegExp(`^${mapParam}\\b`), fParam), sf)) return true;
        }
      }
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
  const out: Href[] = [];
  for (const file of files.sort()) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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
  assert.deepEqual(g.sort(), ['src/components/AdventurePanel.tsx: s.url', 'src/components/ExperienceCard.tsx: l.url', 'src/components/PlaceCard.tsx: place.website', 'src/pages/Pulse.tsx: e.url']);
  // Every reviewed entry still exists (no stale exceptions).
  const reviewedNow = new Set(hrefs.filter((h) => h.status === 'reviewed').map((h) => `${h.file}: ${h.expr}`));
  assert.deepEqual(Object.keys(REVIEWED).filter((k) => !reviewedNow.has(k)), []);
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
});

test('characterization (DEFECT): imported data keeps unsafe URLs, and React 18 renders them as-is', async () => {
  // Backup import and sync both go through normalizeData, which does not validate URLs inside
  // field notes, websites or custom experiences.
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
