// @ts-check
/**
 * Privileged publisher for visual-check results (run by .github/workflows/visual-publish.yml).
 *
 * Runs ONLY reviewed default-branch code (checked out at the workflow's own commit), with zero
 * npm dependencies. Everything it reads from the branch, the artifact and the existing results
 * branch is untrusted data:
 *   1. verify the triggering run (repo, workflow path/name, push event, success, sha, branch);
 *   2. eligibility: an authorized contributor's push to an ordinary development branch;
 *   3. freshness: the branch must still point at the run's commit;
 *   4. consistency: the branch's screenshot harness must be identical (git object ids) to the
 *      trusted checkout's. This is NOT an attestation: app code, build config, package scripts
 *      and dependencies are branch-controlled, so the artifact remains untrusted review material;
 *   5. select exactly one matching artifact, download it with a byte cap (the storage redirect
 *      is fetched without credentials), parse and validate it in memory (zip.mjs, policy.mjs);
 *   6. import the existing results branch WITHOUT checking it out: every entry must be a
 *      regular file at an expected path and every folder must re-validate (meta, report,
 *      JPEGs), otherwise the publish fails closed. Fetch failures fail closed; only a branch
 *      that is absent from the remote starts empty;
 *   7. refuse stale runs (an older run id than the results already published for the branch),
 *      re-check freshness, build a brand-new tree from validated blobs plus regenerated
 *      REPORT.md/README.md, and push one parentless commit with --force-with-lease.
 * Nothing from the artifact or the results branch is ever executed, checked out, or used as
 * git configuration. The token is used for authenticated API reads and the final push; it is
 * held in this process's memory for the whole run but never placed on a command line, in a
 * URL, in the environment of child processes (except the push, via an env-scoped header), or
 * in any output.
 *
 * Env: GH_TOKEN, REPO, RUN_ID, HEAD_SHA, HEAD_BRANCH, DEFAULT_BRANCH, TRUSTED_SHA, plus
 * optional GITHUB_API_URL / PUBLISH_GIT_URL / PUBLISH_NO_AUTH / GITHUB_STEP_SUMMARY (the
 * overrides exist for tests).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readZip } from './zip.mjs';
import {
  HARNESS_PATHS,
  LIMITS,
  RESULTS_BRANCH,
  ZIP_LIMITS,
  PolicyError,
  checkRun,
  eligibility,
  folderFor,
  metaJson,
  parseMeta,
  renderIndex,
  renderReport,
  resultPath,
  runIdCompare,
  selectArtifact,
  text,
  validateContents,
} from './policy.mjs';

const env = (/** @type {string} */ k) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing environment variable ${k}`);
  return v;
};

function summary(/** @type {string} */ s) {
  console.log(s);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${s}\n`);
}

/**
 * Child-process environment for git: no token, no user/system git configuration (so nothing
 * like url.insteadOf or credential helpers can interfere), no prompts.
 */
const GIT_ENV = () => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  HOME: process.env.HOME ?? tmpdir(),
  LANG: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'github-actions[bot]',
  GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'github-actions[bot]',
  GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
});

/**
 * Run git with an argument array (never a shell).
 * @param {string} cwd @param {string[]} args
 * @param {{ env?: Record<string, string>, input?: string | Buffer, buffer?: boolean, maxBuffer?: number }} [o]
 */
function git(cwd, args, o = {}) {
  const out = execFileSync('git', args, {
    cwd,
    env: { ...GIT_ENV(), ...(o.env ?? {}) },
    input: o.input,
    maxBuffer: o.maxBuffer ?? 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return o.buffer ? out : out.toString('utf8').trim();
}
const gitText = (/** @type {string} */ cwd, /** @type {string[]} */ args, o = {}) => /** @type {string} */ (git(cwd, args, o));

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

/** Current branch heads on the remote. Fails (throws) rather than guessing when unreachable. */
function remoteHeads(/** @type {string} */ cwd, /** @type {string} */ gitUrl) {
  /** @type {Map<string, string>} */
  const heads = new Map();
  for (const line of gitText(cwd, ['ls-remote', '--heads', gitUrl]).split('\n')) {
    if (!line) continue;
    const [oid, ref] = line.split('\t');
    if (!/^[0-9a-f]{40}$/.test(oid) || !ref?.startsWith('refs/heads/')) throw new Error('unexpected ls-remote output');
    heads.set(ref.slice('refs/heads/'.length), oid);
  }
  return heads;
}

/** Paths of the harness that differ between the trusted checkout (HEAD) and `sha`. */
function harnessDiffers(/** @type {string} */ repoDir, /** @type {string} */ sha) {
  const differs = [];
  const id = (/** @type {string} */ rev) => {
    try {
      return gitText(repoDir, ['rev-parse', '--verify', '--quiet', rev]);
    } catch {
      return '';
    }
  };
  for (const p of HARNESS_PATHS) {
    const a = id(`HEAD:${p}`);
    if (!a || a !== id(`${sha}:${p}`)) differs.push(p);
  }
  return differs;
}

/**
 * Read blobs with one `git cat-file --batch` call. Sizes were bounded by the caller.
 * @param {string} repo @param {string[]} oids
 * @returns {Map<string, Buffer>}
 */
function readBlobs(repo, oids) {
  /** @type {Map<string, Buffer>} */
  const out = new Map();
  if (!oids.length) return out;
  const buf = /** @type {Buffer} */ (git(repo, ['cat-file', '--batch'], { input: `${oids.join('\n')}\n`, buffer: true, maxBuffer: LIMITS.maxTotalBytes + LIMITS.maxReportBytes * 4 + 1024 * 1024 }));
  let p = 0;
  for (const oid of oids) {
    const nl = buf.indexOf(0x0a, p);
    if (nl < 0) throw new Error('unexpected cat-file output');
    const [got, type, size] = buf.subarray(p, nl).toString('latin1').split(' ');
    const n = Number(size);
    if (got !== oid || type !== 'blob' || !Number.isSafeInteger(n) || nl + 1 + n + 1 > buf.length) throw new Error(`results branch: cannot read blob ${oid}`);
    out.set(oid, buf.subarray(nl + 1, nl + 1 + n));
    p = nl + 1 + n + 1;
  }
  return out;
}

/**
 * @typedef {{ meta: import('./policy.mjs').Meta, report: import('./policy.mjs').Report,
 *   blobs: Map<string, string> }} Folder   blobs: validated JPEG name → blob oid
 */

/**
 * Import the existing results branch as untrusted data, without a checkout. Every entry must be
 * a regular, non-executable file at an expected path, within limits, and every folder must
 * re-validate. Anything unexpected throws: the publish fails closed and the branch is left
 * untouched.
 * @param {string} work  fresh repository (no checkout) to fetch into
 * @param {string} gitUrl
 * @param {string | null} oid  current tip from ls-remote; null when the branch is absent
 * @returns {Map<string, Folder>}
 */
function importResults(work, gitUrl, oid) {
  /** @type {Map<string, Folder>} */
  const folders = new Map();
  if (!oid) return folders;
  try {
    gitText(work, ['fetch', '--quiet', '--no-tags', '--depth=1', gitUrl, oid]);
  } catch {
    throw new Error(`cannot fetch ${RESULTS_BRANCH} (${oid.slice(0, 12)}); refusing to publish over results that could not be read`);
  }
  if (gitText(work, ['cat-file', '-t', oid]) !== 'commit') throw new PolicyError(`${RESULTS_BRANCH} does not point at a commit`);
  const listing = /** @type {Buffer} */ (git(work, ['ls-tree', '-r', '-l', '-z', '--full-tree', oid], { buffer: true })).toString('latin1');
  /** @type {Map<string, { meta?: string, report?: string, jpgs: Map<string, string> }>} */
  const raw = new Map();
  let count = 0;
  for (const rec of listing.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const [mode, type, blob, sizeStr] = rec.slice(0, tab).split(/ +/);
    const path = rec.slice(tab + 1);
    if (++count > LIMITS.maxResultFiles) throw new PolicyError(`${RESULTS_BRANCH} has too many files`);
    if (mode !== '100644' || type !== 'blob') throw new PolicyError(`${RESULTS_BRANCH} contains a non-regular entry (mode ${mode}): ${JSON.stringify(path.slice(0, 120))}`);
    const rp = resultPath(path);
    if (!rp) throw new PolicyError(`${RESULTS_BRANCH} contains an unexpected path: ${JSON.stringify(path.slice(0, 120))}`);
    const size = Number(sizeStr);
    if (!Number.isSafeInteger(size) || size > (path.endsWith('.jpg') ? LIMITS.maxFileBytes : LIMITS.maxReportBytes)) throw new PolicyError(`${RESULTS_BRANCH} file too large: ${path}`);
    if (!rp.folder) continue; // README.md is regenerated
    const f = raw.get(rp.folder) ?? { jpgs: new Map() };
    raw.set(rp.folder, f);
    if (raw.size > LIMITS.maxFolders) throw new PolicyError(`${RESULTS_BRANCH} has too many folders`);
    if (rp.name === 'meta.json') f.meta = blob;
    else if (rp.name === 'report.json') f.report = blob;
    else if (rp.name.endsWith('.jpg')) f.jpgs.set(rp.name, blob);
    // REPORT.md is regenerated from the validated report.
  }
  for (const [folder, f] of raw) {
    if (!f.meta || !f.report) throw new PolicyError(`${RESULTS_BRANCH}/${folder} is incomplete (meta.json and report.json required)`);
    const blobs = readBlobs(work, [f.meta, f.report, ...f.jpgs.values()]);
    const meta = parseMeta(/** @type {Buffer} */ (blobs.get(f.meta)), folder);
    /** @type {Map<string, Buffer>} */
    const files = new Map([['report.json', /** @type {Buffer} */ (blobs.get(f.report))]]);
    for (const [name, b] of f.jpgs) files.set(name, /** @type {Buffer} */ (blobs.get(b)));
    let validated;
    try {
      validated = validateContents(files, { headSha: meta.sha, headBranch: meta.branch });
    } catch (e) {
      throw new PolicyError(`${RESULTS_BRANCH}/${folder} failed validation: ${e instanceof Error ? e.message : String(e)}`);
    }
    folders.set(folder, { meta, report: validated.report, blobs: f.jpgs });
  }
  return folders;
}

/** Store a buffer as a blob in `repo` (no filters, no attributes) and return its id. */
const hashBlob = (/** @type {string} */ repo, /** @type {Buffer} */ data) => gitText(repo, ['hash-object', '-w', '--no-filters', '--stdin'], { input: data });

/** @returns {{ published: false, reason: string } } */
function notPublished(/** @type {string} */ reason, /** @type {string} */ message) {
  summary(`Not published: ${message}`);
  return { published: false, reason };
}

export async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw new Error(`Node 20+ required (have ${process.versions.node})`);
  const token = env('GH_TOKEN');
  delete process.env.GH_TOKEN; // never inherited by child processes
  const repo = env('REPO');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new Error('bad repository name');
  const runId = env('RUN_ID');
  const headSha = env('HEAD_SHA');
  const headBranch = env('HEAD_BRANCH');
  const defaultBranch = env('DEFAULT_BRANCH');
  const trustedSha = env('TRUSTED_SHA');
  if (!/^\d{1,20}$/.test(runId) || !/^[0-9a-f]{40}$/.test(headSha) || !/^[0-9a-f]{40}$/.test(trustedSha)) throw new Error('bad run id or sha');
  const apiBase = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
  const gitUrl = process.env.PUBLISH_GIT_URL ?? `https://github.com/${repo}.git`;
  const repoDir = process.cwd(); // the trusted checkout of the workflow's own commit
  if (gitText(repoDir, ['rev-parse', 'HEAD']) !== trustedSha) throw new Error('trusted checkout is not the workflow commit');
  const label = `${text(headBranch, 80)} @ \`${headSha}\` (run ${runId})`;

  // 1. Provenance of the triggering run.
  const run = await api(`${apiBase}/repos/${repo}/actions/runs/${runId}`, token);
  checkRun(run, { repo, runId, headSha, headBranch });

  // 2. Eligibility: authorized contributors, ordinary development branches.
  const ineligible = eligibility(run, headBranch);
  if (ineligible.length) return notPublished('ineligible', `${label}: ${ineligible.join('; ')}. The artifact remains downloadable from the run.`);
  const folder = folderFor(headBranch);

  // 3. Freshness: only the branch's current head is published.
  const heads = remoteHeads(repoDir, gitUrl);
  if (heads.get(headBranch) !== headSha) return notPublished('stale', `${label}: the branch has moved on or was deleted since this run.`);

  // 4. Consistency with the reviewed harness (not an attestation; see the header).
  gitText(repoDir, ['fetch', '--quiet', '--no-tags', '--depth=1', gitUrl, headSha]);
  const differs = harnessDiffers(repoDir, headSha);
  if (differs.length) return notPublished('harness-differs', `${label} changes the screenshot harness (${differs.join(', ')}) relative to the default branch. Its artifact remains downloadable from the run; it can be published once the harness change is reviewed and merged.`);

  // 5. Artifact selection, bounded download, in-memory validation.
  const art = selectArtifact(await api(`${apiBase}/repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`, token), { runId, headSha });
  const zip = await download(`${apiBase}/repos/${repo}/actions/artifacts/${art.id}/zip`, token);
  const { files, report } = validateContents(readZip(zip, ZIP_LIMITS), { headSha, headBranch });

  const work = mkdtempSync(join(tmpdir(), 'visual-results-'));
  try {
    gitText(work, ['init', '--quiet']);
    // 6. Existing results: untrusted, imported without a checkout, fail closed.
    const resultsOid = heads.get(RESULTS_BRANCH) ?? null;
    const existing = importResults(work, gitUrl, resultsOid);
    const prev = existing.get(folder);
    if (prev && prev.meta.branch !== headBranch) throw new PolicyError(`results folder ${folder} belongs to another branch`);
    if (prev && runIdCompare(prev.meta.runId, runId) > 0) return notPublished('stale', `${label}: newer results (run ${prev.meta.runId}) are already published for this branch.`);

    // 7. Build a brand-new tree: validated blobs + regenerated reports, nothing else.
    const live = new Set();
    for (const b of heads.keys()) {
      try {
        live.add(folderFor(b));
      } catch {
        /* reserved or unusable names have no folder */
      }
    }
    const keep = [...existing.values()].filter((f) => f.meta.folder !== folder && (live.has(f.meta.folder) || f.meta.folder === folderFor(defaultBranch)));
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const meta = { branch: headBranch, folder, sha: headSha, runId, publishedAt: now };
    /** @type {string[]} */
    const index = [];
    const add = (/** @type {string} */ path, /** @type {string} */ oid) => index.push(`100644 ${oid}\t${path}`);
    for (const f of keep) {
      add(`${f.meta.folder}/meta.json`, hashBlob(work, metaJson(f.meta)));
      add(`${f.meta.folder}/report.json`, hashBlob(work, Buffer.from(JSON.stringify(f.report, null, 1))));
      add(`${f.meta.folder}/REPORT.md`, hashBlob(work, Buffer.from(renderReport({ repo, folder: f.meta.folder, branch: f.meta.branch, sha: f.meta.sha, runId: f.meta.runId }, f.report))));
      for (const [name, oid] of f.blobs) add(`${f.meta.folder}/${name}`, oid);
    }
    add(`${folder}/meta.json`, hashBlob(work, metaJson(meta)));
    for (const [name, data] of files) add(`${folder}/${name}`, hashBlob(work, data));
    add(`${folder}/REPORT.md`, hashBlob(work, Buffer.from(renderReport({ repo, folder, branch: headBranch, sha: headSha, runId }, report))));
    add('README.md', hashBlob(work, Buffer.from(renderIndex([...keep.map((f) => f.meta), meta]))));
    for (const line of index) if (!resultPath(line.slice(line.indexOf('\t') + 1))) throw new Error(`internal: unexpected output path ${line}`);
    const indexFile = join(work, '.git', 'publish-index');
    gitText(work, ['update-index', '--add', '--index-info'], { input: `${index.join('\n')}\n`, env: { GIT_INDEX_FILE: indexFile } });
    const tree = gitText(work, ['write-tree'], { env: { GIT_INDEX_FILE: indexFile } });
    const commit = gitText(work, ['commit-tree', tree, '-m', `Visual results: ${folder} @ ${headSha} (run ${runId})`]);

    // Re-check freshness immediately before pushing.
    const now2 = remoteHeads(repoDir, gitUrl);
    if (now2.get(headBranch) !== headSha) return notPublished('stale', `${label}: the branch moved on while publishing.`);
    if ((now2.get(RESULTS_BRANCH) ?? null) !== resultsOid) throw new Error(`${RESULTS_BRANCH} changed while publishing; nothing was pushed`);
    const auth =
      process.env.PUBLISH_NO_AUTH === '1'
        ? {}
        : {
            GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
            GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
          };
    gitText(work, ['push', '--quiet', `--force-with-lease=refs/heads/${RESULTS_BRANCH}:${resultsOid ?? ''}`, gitUrl, `${commit}:refs/heads/${RESULTS_BRANCH}`], { env: auth });
    summary(`Published ${label} → \`${RESULTS_BRANCH}/${folder}\` (${files.size} files${resultsOid ? '' : ', new branch'}): https://github.com/${repo}/blob/${RESULTS_BRANCH}/${folder}/REPORT.md`);
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
