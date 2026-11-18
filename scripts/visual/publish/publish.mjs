// @ts-check
/**
 * Privileged publisher for visual-check results (run by .github/workflows/visual-publish.yml).
 *
 * Runs ONLY reviewed default-branch code, with zero npm dependencies, and treats the artifact
 * as untrusted data:
 *   1. verify the triggering run (repo, workflow path/name, push event, success, sha, branch);
 *   2. publish only if the branch's screenshot harness is byte-identical to the default
 *      branch's (git tree/blob ids), so screenshots come from the reviewed harness and its
 *      synthetic fixtures; otherwise skip (the artifact is still downloadable from the run);
 *   3. select exactly one matching artifact and download it with a byte cap (the storage
 *      redirect is fetched without credentials);
 *   4. parse and validate the zip in memory (zip.mjs), then validate contents (policy.mjs);
 *   5. regenerate REPORT.md from validated data and push a single parentless commit to
 *      `visual-results`. The token is used for that push only, via an env-scoped header.
 * Nothing from the artifact is ever executed or interpreted as code.
 *
 * Env: GH_TOKEN, REPO, RUN_ID, HEAD_SHA, HEAD_BRANCH, DEFAULT_BRANCH, plus optional
 * GITHUB_API_URL / PUBLISH_GIT_URL / GITHUB_STEP_SUMMARY (the overrides exist for tests).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readZip } from './zip.mjs';
import { HARNESS_PATHS, LIMITS, RESULTS_BRANCH, ZIP_LIMITS, checkRun, folderFor, renderReport, selectArtifact, validateContents } from './policy.mjs';

const env = (/** @type {string} */ k) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing environment variable ${k}`);
  return v;
};

function summary(/** @type {string} */ text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

/** Run git with an argument array (never a shell). */
function git(/** @type {string} */ cwd, /** @type {string[]} */ args, /** @type {Record<string,string>} */ extraEnv = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GH_TOKEN: '', ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** @param {string} url @param {string} token */
async function api(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${new URL(url).pathname}`);
  return res.json();
}

/** Download the artifact zip with a byte cap. The redirect target is fetched WITHOUT credentials. */
async function download(/** @type {string} */ url, /** @type {string} */ token) {
  const first = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, redirect: 'manual' });
  let res = first;
  if (first.status >= 300 && first.status < 400) {
    const loc = first.headers.get('location');
    if (!loc) throw new Error('artifact redirect without location');
    const target = new URL(loc, url);
    if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname))) throw new Error('refusing non-https artifact location');
    res = await fetch(target, { redirect: 'error' });
  }
  if (!res.ok || !res.body) throw new Error(`artifact download failed (${res.status})`);
  const chunks = [];
  let n = 0;
  for await (const chunk of res.body) {
    n += chunk.length;
    if (n > LIMITS.maxZipBytes) throw new Error('artifact download exceeds size limit');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** True when every harness path has the same git object id at `sha` and at HEAD (the default branch). */
function harnessMatches(/** @type {string} */ repoDir, /** @type {string} */ sha) {
  const differs = [];
  for (const p of HARNESS_PATHS) {
    let a = '';
    let b = '';
    try {
      a = git(repoDir, ['rev-parse', '--verify', '--quiet', `HEAD:${p}`]);
    } catch {
      a = '';
    }
    try {
      b = git(repoDir, ['rev-parse', '--verify', '--quiet', `${sha}:${p}`]);
    } catch {
      b = '';
    }
    if (!a || a !== b) differs.push(p);
  }
  return differs;
}

export async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw new Error(`Node 20+ required (have ${process.versions.node})`);
  const token = env('GH_TOKEN');
  const repo = env('REPO');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new Error('bad repository name');
  const runId = env('RUN_ID');
  const headSha = env('HEAD_SHA');
  const headBranch = env('HEAD_BRANCH');
  const defaultBranch = env('DEFAULT_BRANCH');
  if (!/^\d+$/.test(runId) || !/^[0-9a-f]{40}$/.test(headSha)) throw new Error('bad run id or sha');
  const apiBase = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
  const gitUrl = process.env.PUBLISH_GIT_URL ?? `https://github.com/${repo}.git`;
  const repoDir = process.cwd(); // the trusted clone of the default branch

  // 1. Provenance of the triggering run.
  const run = await api(`${apiBase}/repos/${repo}/actions/runs/${runId}`, token);
  checkRun(run, { repo, runId, headSha, headBranch });
  const folder = folderFor(headBranch);

  // 2. Only publish what the reviewed harness produced.
  git(repoDir, ['fetch', '--quiet', '--no-tags', '--depth=1', gitUrl, headSha]);
  const differs = harnessMatches(repoDir, headSha);
  if (differs.length) {
    summary(`Not published: \`${folder}\` @ ${headSha.slice(0, 7)} changes the screenshot harness (${differs.join(', ')}) relative to \`${defaultBranch}\`. Its artifact remains downloadable from run ${runId}; it can be published once the harness change is reviewed and merged.`);
    return { published: false, reason: 'harness-differs', differs };
  }

  // 3–4. Artifact selection, bounded download, in-memory validation.
  const art = selectArtifact(await api(`${apiBase}/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`, token), { runId, headSha });
  const zip = await download(`${apiBase}/repos/${repo}/actions/artifacts/${art.id}/zip`, token);
  const { files, report } = validateContents(readZip(zip, ZIP_LIMITS));

  // 5. Write to a fresh worktree of visual-results and push one parentless commit.
  const work = mkdtempSync(join(tmpdir(), 'visual-results-'));
  try {
    git(work, ['init', '--quiet']);
    git(work, ['config', 'user.name', 'github-actions[bot]']);
    git(work, ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    let existing = false;
    try {
      git(work, ['fetch', '--quiet', '--no-tags', '--depth=1', gitUrl, `refs/heads/${RESULTS_BRANCH}`]);
      git(work, ['checkout', '--quiet', 'FETCH_HEAD']);
      existing = true;
    } catch {
      existing = false;
    }
    // Replace this branch's folder; prune folders whose source branch no longer exists.
    rmSync(join(work, folder), { recursive: true, force: true });
    const live = new Set(
      git(work, ['ls-remote', '--heads', gitUrl])
        .split('\n')
        .map((l) => l.split('\t')[1]?.replace(/^refs\/heads\//, '') ?? '')
        .filter(Boolean)
        .map((b) => {
          try {
            return folderFor(b);
          } catch {
            return '';
          }
        }),
    );
    for (const d of readdirSync(work, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === '.git') continue;
      if (d.name !== folderFor(defaultBranch) && !live.has(d.name)) rmSync(join(work, d.name), { recursive: true, force: true });
    }
    for (const [name, data] of files) {
      const dest = join(work, folder, name);
      mkdirSync(join(dest, '..'), { recursive: true });
      writeFileSync(dest, data, { flag: 'wx' });
    }
    const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
    writeFileSync(join(work, folder, 'REPORT.md'), renderReport({ folder, branch: headBranch, sha: headSha, runUrl }, report, new Set(files.keys())), { flag: 'wx' });
    const folders = readdirSync(work, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '.git')
      .map((d) => d.name)
      .sort();
    writeFileSync(
      join(work, 'README.md'),
      [
        '# Visual check results',
        '',
        'Latest validated screenshot run per branch, published by the reviewed `visual-publish` workflow (default-branch code only).',
        'Synthetic fixtures and a frozen clock only; no personal data. This branch is rewritten on every publish.',
        '',
        '| Branch folder | Report |',
        '|---|---|',
        ...folders.map((f) => `| \`${f}\` | [REPORT.md](${f}/REPORT.md) |`),
        '',
      ].join('\n'),
    );
    git(work, ['add', '-A']);
    const tree = git(work, ['write-tree']);
    const commit = git(work, ['commit-tree', tree, '-m', `Visual results: ${folder} @ ${headSha.slice(0, 7)} (run ${runId})`]);
    const auth = process.env.PUBLISH_NO_AUTH === '1' ? {} : {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `http.https://github.com/.extraheader`,
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
    };
    git(work, ['push', '--quiet', '--force', gitUrl, `${commit}:refs/heads/${RESULTS_BRANCH}`], auth);
    summary(`Published \`${folder}\` @ ${headSha.slice(0, 7)} → \`${RESULTS_BRANCH}\` (${files.size} files${existing ? '' : ', new branch'}): https://github.com/${repo}/blob/${RESULTS_BRANCH}/${folder}/REPORT.md`);
    return { published: true, folder, files: [...files.keys()].sort() };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('publish.mjs')) {
  main().catch((e) => {
    // Never echo the token; errors here are policy/validation messages.
    console.error(`::error::Visual publish refused: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
