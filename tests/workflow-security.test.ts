/**
 * M1 (security): GitHub Actions permission boundaries and credential handling.
 *
 * The workflows are parsed as YAML and checked against an explicit policy:
 *  - the workflow-level token is never writable; write scopes exist only on allowlisted jobs,
 *    and a job's own `permissions:` block (which replaces the workflow default) is what counts;
 *  - every checkout disables persisted credentials;
 *  - tokens and secrets reach steps only through step-level `env`, never `run:` text, URLs,
 *    `with:` inputs or job/workflow env;
 *  - privileged jobs (any write scope) run no npm/npx/tsx, so third-party package code never
 *    runs with a writable token;
 *  - image scout keeps its read-only/write-enabled split and doesn't swallow failures.
 * The checker itself is tested against deliberately weakened copies of the real workflows,
 * so each rule is shown to catch the regression it exists for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import yaml from 'js-yaml';

type Steps = { uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, unknown>; 'continue-on-error'?: unknown; name?: string }[];
type Job = { permissions?: unknown; steps?: Steps; env?: Record<string, unknown>; needs?: unknown };
type Workflow = { permissions?: unknown; env?: Record<string, unknown>; jobs: Record<string, Job> };

const dir = new URL('../.github/workflows/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.yml')).sort();
const load = (f: string) => yaml.load(readFileSync(new URL(f, dir), 'utf8')) as Workflow;
const real = () => Object.fromEntries(files.map((f) => [f, load(f)])) as Record<string, Workflow>;

/** The only write scopes any job may hold, by workflow file and job. Everything else is read-only. */
const ALLOWED_WRITES: Record<string, Record<string, string[]>> = {
  'deploy.yml': { deploy: ['id-token', 'pages'] },
  'image-scout.yml': { publish: ['contents'] },
  'visual-publish.yml': { publish: ['contents'] },
};

const TOKEN_EXPR = /\$\{\{[^}]*\b(?:github\.token|secrets\.)[^}]*\}\}/i;
const PACKAGE_CODE = /(^|[\s;&|(])(npm|npx|tsx|yarn|pnpm)\b/m;

function writeScopes(perms: unknown, where: string, out: string[]): string[] {
  if (perms === undefined) return [];
  if (typeof perms === 'string') {
    out.push(`${where}: permissions must be an explicit map, not "${perms}"`);
    return perms === 'write-all' ? ['*'] : [];
  }
  if (perms === null || typeof perms !== 'object') {
    out.push(`${where}: unrecognised permissions value`);
    return [];
  }
  return Object.entries(perms as Record<string, string>)
    .filter(([, v]) => v === 'write')
    .map(([k]) => k)
    .sort();
}

/** Every policy violation in a set of parsed workflows (empty = compliant). */
function violations(workflows: Record<string, Workflow>): string[] {
  const out: string[] = [];
  for (const [file, wf] of Object.entries(workflows)) {
    if (wf.permissions === undefined) out.push(`${file}: no workflow-level permissions (the repository default would apply)`);
    const top = writeScopes(wf.permissions, `${file}`, out);
    if (top.length) out.push(`${file}: workflow-level token has write scopes (${top.join(', ')}); grant them on the job that needs them`);
    for (const [k, v] of Object.entries(wf.env ?? {})) if (TOKEN_EXPR.test(String(v))) out.push(`${file}: workflow env ${k} carries a token; use step-level env`);

    for (const [jobName, job] of Object.entries(wf.jobs)) {
      const where = `${file} › ${jobName}`;
      // A job-level block replaces the workflow default entirely.
      const effective = job.permissions !== undefined ? job.permissions : wf.permissions;
      const writes = writeScopes(effective, where, job.permissions !== undefined ? out : []);
      const allowed = ALLOWED_WRITES[file]?.[jobName] ?? [];
      const extra = writes.filter((w) => !allowed.includes(w));
      if (extra.length) out.push(`${where}: unexpected write scopes (${extra.join(', ')})`);
      for (const [k, v] of Object.entries(job.env ?? {})) if (TOKEN_EXPR.test(String(v))) out.push(`${where}: job env ${k} carries a token; use step-level env`);

      for (const [i, step] of (job.steps ?? []).entries()) {
        const s = `${where} › step ${i + 1}${step.name ? ` (${step.name})` : ''}`;
        if (step.uses?.startsWith('actions/checkout@') && step.with?.['persist-credentials'] !== false) out.push(`${s}: checkout must set persist-credentials: false`);
        if (step.run && TOKEN_EXPR.test(step.run)) out.push(`${s}: token or secret interpolated into run:`);
        if (step.run && /\$\{\{[^}]*token[^}]*\}\}/i.test(step.run)) out.push(`${s}: token expression interpolated into run:`);
        if (step.run && /https:\/\/[^\s"']*:\$/.test(step.run)) out.push(`${s}: credentials embedded in a URL`);
        for (const [k, v] of Object.entries(step.with ?? {})) if (TOKEN_EXPR.test(String(v))) out.push(`${s}: token passed as input ${k}`);
        if (writes.length && step.run && PACKAGE_CODE.test(step.run)) out.push(`${s}: privileged job runs package code (${PACKAGE_CODE.exec(step.run)![2]})`);
        if (writes.length && step.uses?.startsWith('actions/setup-node@')) out.push(`${s}: privileged job sets up Node packages`);
      }
    }
  }
  return out;
}

const clone = <T>(v: T): T => structuredClone(v);
const steps = (wf: Workflow, job: string) => wf.jobs[job].steps!;
const findStep = (wf: Workflow, job: string, pred: (s: Steps[number]) => boolean) => {
  const s = steps(wf, job).find(pred);
  assert.ok(s, `fixture step in ${job}`);
  return s!;
};

test('the real workflows satisfy the permission and credential policy', () => {
  const wfs = real();
  assert.ok(files.length >= 7, 'found the workflows');
  assert.deepEqual(violations(wfs), []);
});

test('effective permissions: only the allowlisted jobs can write, each with exactly its scopes', () => {
  const wfs = real();
  const writers: string[] = [];
  for (const [file, wf] of Object.entries(wfs))
    for (const [job, j] of Object.entries(wf.jobs)) {
      const w = writeScopes(j.permissions !== undefined ? j.permissions : wf.permissions, '', []);
      if (w.length) writers.push(`${file} › ${job}: ${w.join(', ')}`);
    }
  assert.deepEqual(writers.sort(), ['deploy.yml › deploy: id-token, pages', 'image-scout.yml › publish: contents', 'visual-publish.yml › publish: contents']);
  // deploy.yml: the build job (npm ci, tests, external fetches) and smoke get no Pages or OIDC rights.
  const d = wfs['deploy.yml'];
  assert.deepEqual(d.permissions, { contents: 'read' });
  assert.deepEqual(d.jobs.build.permissions, { contents: 'read', pages: 'read' });
  assert.equal(d.jobs.smoke.permissions, undefined, 'smoke inherits the read-only default');
  assert.deepEqual(d.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
  assert.deepEqual(d.jobs.deploy.steps!.map((s) => s.uses?.split('@')[0]), ['actions/deploy-pages']);
});

test('image scout: read-only generation and a write-enabled publish job split by an artifact', () => {
  const wf = real()['image-scout.yml'];
  assert.deepEqual(Object.keys(wf.jobs), ['generate', 'publish']);
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.deepEqual(wf.jobs.generate.permissions, { contents: 'read' });
  assert.deepEqual(wf.jobs.publish.permissions, { contents: 'write' });
  assert.equal(wf.jobs.publish.needs, 'generate');

  const gen = steps(wf, 'generate');
  assert.ok(gen.some((s) => s.uses?.startsWith('actions/upload-artifact@') && s.with?.['if-no-files-found'] === 'error'), 'generation uploads its results and fails when there are none');
  const pub = steps(wf, 'publish');
  assert.equal(pub[0].uses?.split('@')[0], 'actions/download-artifact', 'publish starts from the artifact');
  assert.ok(!pub.some((s) => s.uses?.startsWith('actions/checkout@')), 'publish checks out no repository code');

  // Genuine failures are not swallowed: the scout and every publish step must succeed, and no
  // script masks a failing command with `|| true`.
  const scout = findStep(wf, 'generate', (s) => /scripts\/images\/scout\.ts/.test(s.run ?? ''));
  assert.equal(scout['continue-on-error'], undefined);
  for (const s of pub) assert.equal(s['continue-on-error'], undefined, `${s.name ?? s.uses}: must not continue on error`);
  for (const job of Object.values(wf.jobs)) for (const s of job.steps ?? []) assert.ok(!/\|\|\s*true\b/.test(s.run ?? ''), `${s.name ?? s.uses}: no "|| true"`);
  const optional = gen.filter((s) => s['continue-on-error'] === true).map((s) => s.name ?? '');
  assert.deepEqual(optional.map((n) => /\(optional\)$/.test(n)), [true, true], 'only the two labelled optional snapshots may fail softly');

  // The push gets the token from step env through an env-scoped git header only.
  const push = findStep(wf, 'publish', (s) => /git push/.test(s.run ?? ''));
  assert.equal(push.env?.GH_TOKEN, '${{ github.token }}');
  assert.match(push.run!, /GIT_CONFIG_KEY_0="http\.https:\/\/github\.com\/\.extraheader"/);
  assert.match(push.run!, /git push -f --quiet "https:\/\/github\.com\/\$REPO\.git"/);
  assert.match(push.run!, /set -euo pipefail/);
  const check = findStep(wf, 'publish', (s) => /plain files/.test(s.name ?? ''));
  assert.match(check.run!, /! -type f ! -type d/, 'rejects symlinks and special files');
  assert.match(check.run!, /set -euo pipefail/);
});

test('mutation evidence: each rule catches a deliberately weakened workflow', () => {
  const cases: [string, (w: Record<string, Workflow>) => void, RegExp][] = [
    ['Pages/OIDC write moved back to workflow level', (w) => (w['deploy.yml'].permissions = { contents: 'read', pages: 'write', 'id-token': 'write' }), /deploy\.yml: workflow-level token has write scopes \(id-token, pages\)/],
    ['OIDC granted to the build job', (w) => (w['deploy.yml'].jobs.build.permissions = { contents: 'read', 'id-token': 'write' }), /deploy\.yml › build: unexpected write scopes \(id-token\)/],
    ['job-level write-all override', (w) => (w['check.yml'].jobs.check.permissions = 'write-all'), /check\.yml › check: permissions must be an explicit map|check\.yml › check: unexpected write scopes \(\*\)/],
    ['job inherits an elevated workflow default', (w) => (w['visual.yml'].permissions = { contents: 'write' }), /visual\.yml › \w+: unexpected write scopes \(contents\)/],
    ['workflow without explicit permissions', (w) => delete w['styleguide.yml'].permissions, /styleguide\.yml: no workflow-level permissions/],
    ['generation job made writable', (w) => (w['image-scout.yml'].jobs.generate.permissions = { contents: 'write' }), /image-scout\.yml › generate: unexpected write scopes \(contents\)/],
    ['checkout persists credentials', (w) => delete findStep(w['check.yml'], 'check', (s) => !!s.uses?.startsWith('actions/checkout@')).with!['persist-credentials'], /check\.yml › check › step 1: checkout must set persist-credentials: false/],
    ['token interpolated into a push URL', (w) => (findStep(w['image-scout.yml'], 'publish', (s) => /git push/.test(s.run ?? '')).run = 'git push "https://x-access-token:${{ github.token }}@github.com/o/r" HEAD:x'), /token or secret interpolated into run:/],
    ['credentials embedded in a URL via env', (w) => (findStep(w['image-scout.yml'], 'publish', (s) => /git push/.test(s.run ?? '')).run = 'git push "https://x-access-token:$GH_TOKEN@github.com/o/r" HEAD:x'), /credentials embedded in a URL/],
    ['token in job env', (w) => (w['image-scout.yml'].jobs.publish.env = { GH_TOKEN: '${{ github.token }}' }), /job env GH_TOKEN carries a token/],
    ['token passed as an action input', (w) => (findStep(w['image-scout.yml'], 'publish', (s) => !!s.uses).with!.token = '${{ secrets.GITHUB_TOKEN }}'), /token passed as input token/],
    ['package code in a privileged job', (w) => steps(w['image-scout.yml'], 'publish').push({ run: 'npm ci --no-audit' }), /image-scout\.yml › publish › step \d+: privileged job runs package code \(npm\)/],
    ['tsx in the deploy job', (w) => steps(w['deploy.yml'], 'deploy').push({ run: 'npx tsx scripts/x.ts' }), /deploy\.yml › deploy › step \d+: privileged job runs package code \(npx\)/],
  ];
  for (const [name, mutate, expected] of cases) {
    const w = clone(real());
    mutate(w);
    const v = violations(w);
    assert.ok(v.some((m) => expected.test(m)), `${name}: expected a violation matching ${expected}, got ${JSON.stringify(v)}`);
  }
});

test('npm install-script policy: strict mode on, every package with an install script reviewed', () => {
  const npmrc = readFileSync(new URL('../.npmrc', import.meta.url), 'utf8');
  assert.match(npmrc, /^strict-allow-scripts=true$/m);
  assert.ok(!/dangerously-allow-all-scripts|^ignore-scripts=false/m.test(npmrc));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const policy = pkg.allowScripts as Record<string, boolean>;
  const withScripts = [...new Set(Object.entries(lock.packages as Record<string, { hasInstallScript?: boolean }>).filter(([, v]) => v.hasInstallScript).map(([k]) => k.split('node_modules/').pop()!))].sort();
  assert.deepEqual(withScripts, ['esbuild', 'fsevents', 'sharp'], 'packages with install scripts (review any change)');
  // Each is covered; none is approved: their prebuilt platform binaries work without the scripts
  // (proved in CI by the build, the screenshot harness and tests/native-deps.test.ts).
  assert.deepEqual(policy, { esbuild: false, fsevents: false, sharp: false });
});
