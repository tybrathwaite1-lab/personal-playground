/**
 * PP-011: reproducible builds and supported Actions runtimes.
 * The lockfile must match package.json and resolve only from the npm registry with integrity
 * hashes; every workflow installs with `npm ci`, runs a supported Node, and uses only GitHub's
 * own actions pinned to full commit SHAs at releases verified to use the node24 runtime.
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

/** Releases verified (2026-11-18, from each action's action.yml) to run on node24 or be composite. */
const MIN_VERSION: Record<string, number> = {
  'actions/checkout': 7,
  'actions/setup-node': 7,
  'actions/cache': 6,
  'actions/upload-artifact': 7,
  'actions/configure-pages': 6,
  'actions/upload-pages-artifact': 5,
  'actions/deploy-pages': 5,
};

test('workflows use only GitHub actions pinned to full SHAs at supported releases', () => {
  let count = 0;
  for (const f of workflows) {
    for (const line of read(`.github/workflows/${f}`).split('\n')) {
      const m = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/.exec(line);
      if (!m) continue;
      count++;
      const pin = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40})$/.exec(m[1]);
      assert.ok(pin, `${f}: ${m[1]} must be pinned to a full commit SHA`);
      const [, action] = pin!;
      assert.ok(action in MIN_VERSION, `${f}: ${action} is not an allowlisted GitHub action`);
      const v = /#\s*v(\d+)\.\d+\.\d+\s*$/.exec(m[2]);
      assert.ok(v, `${f}: ${action} needs a "# vX.Y.Z" comment naming the pinned release`);
      assert.ok(Number(v![1]) >= MIN_VERSION[action], `${f}: ${action} v${v![1]} is older than the verified node24 release`);
    }
  }
  assert.ok(count >= 15, 'found the workflow steps');
});

test('workflows install reproducibly on a supported Node', () => {
  for (const f of workflows) {
    const y = read(`.github/workflows/${f}`)
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    assert.equal(/\bnpm (?:install|i)\b/.test(y), false, `${f}: use npm ci, not npm install`);
    for (const m of y.matchAll(/node-version:\s*['"]?(\d+)/g)) assert.ok(Number(m[1]) >= 22, `${f}: node-version ${m[1]} is unsupported`);
  }
  assert.match(read('.github/workflows/deploy.yml'), /run: npm ci --no-audit --no-fund/);
});
