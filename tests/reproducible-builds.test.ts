/**
 * PP-011: reproducible builds and supported Actions runtimes.
 * The lockfile must match package.json and resolve only from the npm registry with integrity
 * hashes; every workflow installs with `npm ci` on the Node version in `.nvmrc`, and uses only
 * GitHub's own actions pinned to the full commit SHAs in the trusted manifest
 * (.github/action-pins.json), whose provenance verify-action-pins.yml checks upstream.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const workflows = readdirSync(new URL('../.github/workflows/', import.meta.url)).filter((f) => f.endsWith('.yml'));

test('package-lock.json matches package.json and resolves only from the registry with integrity', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.name, pkg.name);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies, 'dependencies in sync');
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies, 'devDependencies in sync');
  const entries = Object.entries(lock.packages as Record<string, { resolved?: string; integrity?: string; link?: boolean }>).filter(([k, v]) => k && !v.link);
  assert.ok(entries.length > 100);
  for (const [k, v] of entries) {
    assert.match(v.resolved ?? '', /^https:\/\/registry\.npmjs\.org\//, `${k} resolved from the npm registry`);
    assert.match(v.integrity ?? '', /^sha512-/, `${k} has a sha512 integrity hash`);
  }
  // Exact pins stay exact.
  assert.equal(lock.packages['node_modules/playwright-core'].version, pkg.devDependencies['playwright-core']);
  assert.equal(lock.packages['node_modules/@axe-core/playwright'].version, pkg.devDependencies['@axe-core/playwright']);
});

type Pin = { action: string; tag: string; sha: string; runtime: string; verified: string };
const MANIFEST = JSON.parse(read('.github/action-pins.json')) as { pins: Pin[] };

/** Every `uses:` reference in a workflow file's text, with its "# vX.Y.Z" release comment. */
function usesRefs(file: string, text: string) {
  const refs: { file: string; ref: string; comment: string }[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/.exec(line);
    if (m) refs.push({ file, ref: m[1], comment: m[2] });
  }
  return refs;
}

/** Problems with workflow action references against the trusted manifest (empty = all good). */
function pinProblems(refs: ReturnType<typeof usesRefs>, pins: Pin[]): string[] {
  const out: string[] = [];
  const byAction = new Map(pins.map((p) => [p.action, p]));
  if (byAction.size !== pins.length) out.push('manifest lists an action twice');
  for (const p of pins) {
    if (!/^actions\/[\w.-]+$/.test(p.action)) out.push(`${p.action}: only GitHub's own actions are trusted`);
    if (!/^[0-9a-f]{40}$/.test(p.sha)) out.push(`${p.action}: SHA must be a full 40-character commit`);
    if (!/^v\d+\.\d+\.\d+$/.test(p.tag)) out.push(`${p.action}: tag must be an exact release`);
    if (!['node24', 'composite'].includes(p.runtime)) out.push(`${p.action}: runtime ${p.runtime} is not supported`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.verified)) out.push(`${p.action}: missing verification date`);
  }
  const used = new Set<string>();
  for (const { file, ref, comment } of refs) {
    const m = /^([\w.-]+\/[\w.-]+)@(\S+)$/.exec(ref);
    const pin = m && byAction.get(m[1]);
    if (!m || !pin) {
      out.push(`${file}: ${ref} is not in the trusted manifest`);
      continue;
    }
    used.add(pin.action);
    if (m[2] !== pin.sha) out.push(`${file}: ${pin.action}@${m[2]} does not match the trusted SHA ${pin.sha}`);
    const tag = /#\s*(v\d+\.\d+\.\d+)\s*$/.exec(comment)?.[1];
    if (tag !== pin.tag) out.push(`${file}: ${pin.action} comment names ${tag ?? 'no release'}, manifest says ${pin.tag}`);
  }
  for (const p of pins) if (!used.has(p.action)) out.push(`${p.action}: trusted but unused; remove it from the manifest`);
  return out;
}

const allRefs = () => workflows.flatMap((f) => usesRefs(f, read(`.github/workflows/${f}`)));

test('workflows use only GitHub actions pinned to full SHAs at supported releases (trusted manifest)', () => {
  const refs = allRefs();
  assert.ok(refs.length >= 20, 'found the workflow steps');
  assert.deepEqual(pinProblems(refs, MANIFEST.pins), []);
  assert.equal(MANIFEST.pins.length, 8);
});

test('mutation evidence: the manifest check rejects unpinned, moved, mislabelled and unknown actions', () => {
  const refs = allRefs();
  const checkout = MANIFEST.pins.find((p) => p.action === 'actions/checkout')!;
  const cases: [string, ReturnType<typeof usesRefs>, Pin[], RegExp][] = [
    ['tag instead of SHA', [...refs, { file: 'x.yml', ref: 'actions/checkout@v7', comment: '' }], MANIFEST.pins, /actions\/checkout@v7 does not match the trusted SHA/],
    ['different commit', [...refs, { file: 'x.yml', ref: `actions/checkout@${'0'.repeat(40)}`, comment: ' # v7.0.1' }], MANIFEST.pins, /does not match the trusted SHA/],
    ['comment names another release', [...refs, { file: 'x.yml', ref: `actions/checkout@${checkout.sha}`, comment: ' # v7.0.2' }], MANIFEST.pins, /comment names v7\.0\.2, manifest says v7\.0\.1/],
    ['third-party action', [...refs, { file: 'x.yml', ref: `evil/action@${'a'.repeat(40)}`, comment: ' # v1.0.0' }], MANIFEST.pins, /evil\/action@\w+ is not in the trusted manifest/],
    ['manifest entry with a short SHA', refs, MANIFEST.pins.map((p) => (p === checkout ? { ...p, sha: p.sha.slice(0, 7) } : p)), /SHA must be a full 40-character commit/],
    ['manifest entry on an old runtime', refs, MANIFEST.pins.map((p) => (p === checkout ? { ...p, runtime: 'node20' } : p)), /runtime node20 is not supported/],
    ['stale trusted entry', refs, [...MANIFEST.pins, { action: 'actions/stale', tag: 'v1.0.0', sha: 'b'.repeat(40), runtime: 'node24', verified: '2026-11-18' }], /actions\/stale: trusted but unused/],
  ];
  for (const [name, r, pins, expected] of cases) {
    const v = pinProblems(r, pins);
    assert.ok(v.some((m) => expected.test(m)), `${name}: expected ${expected}, got ${JSON.stringify(v)}`);
  }
});

test('Node version is aligned: .nvmrc, engines, lockfile, CI and docs', () => {
  const nvmrc = read('.nvmrc').trim();
  assert.equal(nvmrc, '24');
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.engines.node, `>=${nvmrc} <${Number(nvmrc) + 1}`);
  assert.deepEqual(lock.packages[''].engines, pkg.engines, 'lockfile root engines match package.json');
  let setups = 0;
  for (const f of workflows) {
    const text = read(`.github/workflows/${f}`);
    assert.ok(!/node-version:/.test(text), `${f}: use node-version-file: .nvmrc, not a literal version`);
    const n = (text.match(/uses: actions\/setup-node@/g) ?? []).length;
    assert.equal((text.match(/node-version-file: \.nvmrc/g) ?? []).length, n, `${f}: every setup-node reads .nvmrc`);
    setups += n;
  }
  assert.ok(setups >= 7);
  assert.match(read('README.md'), /Requires Node 24 \(`\.nvmrc`/);
});

test('workflows install reproducibly on a supported Node', () => {
  for (const f of workflows) {
    const y = read(`.github/workflows/${f}`)
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    assert.equal(/\bnpm (?:install|i)\b/.test(y), false, `${f}: use npm ci, not npm install`);
  }
  assert.match(read('.github/workflows/deploy.yml'), /run: npm ci --no-audit --no-fund/);
});
