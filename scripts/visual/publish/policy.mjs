// @ts-check
/**
 * Publishing policy for visual-check artifacts: which runs are eligible, what may be
 * published, and how it is rendered. Pure functions only (no I/O, no network), so every rule
 * is unit-tested (tests/visual-publish.test.ts).
 *
 * Trust model: an artifact is produced by BRANCH code (the app, its build, package scripts and
 * dependencies all run in the capture job), so it is untrusted review material even when the
 * screenshot harness matches the default branch. The harness-identity check is a consistency
 * check, not an attestation. These rules bound what such material can be: allowlisted file
 * types and names, structurally sane JPEGs, a strictly validated report re-serialized from
 * known fields, and plain-text rendering of every artifact string.
 */
import { createHash } from 'node:crypto';

export const WIDTHS = [320, 390, 768, 1280, 1440];
/** Widths at which the harness runs axe and the keyboard checks (scripts/visual/run.ts). */
export const AXE_WIDTHS = [390, 1280];
export const KEY_WIDTHS = [390, 1280];
export const LIMITS = {
  maxZipBytes: 80 * 1024 * 1024,
  maxEntries: 400,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 120 * 1024 * 1024,
  maxReportBytes: 2 * 1024 * 1024,
  /** Results branch: at most this many branch folders, and this many files overall. */
  maxFolders: 40,
  maxResultFiles: 40 * 400,
};

/** The only artifact files accepted. REPORT.md from the artifact is never used (it's regenerated). */
const SHOT_SRC = `(?:${WIDTHS.join('|')})/[a-z0-9-]{1,40}(?:-fold)?\\.jpg`;
const STATE_SRC = 'states/[a-z0-9-]{1,60}\\.jpg';
const FILE_RE = new RegExp(`^(?:${SHOT_SRC}|${STATE_SRC}|report\\.json|REPORT\\.md)$`);
const DIR_RE = new RegExp(`^(?:${WIDTHS.join('|')}|states)/$`);
const STATE_FILE_RE = new RegExp(`^${STATE_SRC}$`);
const ROUTE_RE = /^[a-z0-9-]{1,40}$/;

/** @type {import('./zip.mjs').Limits} */
export const ZIP_LIMITS = {
  maxZipBytes: LIMITS.maxZipBytes,
  maxEntries: LIMITS.maxEntries,
  maxFileBytes: LIMITS.maxFileBytes,
  maxTotalBytes: LIMITS.maxTotalBytes,
  // Secondary zip-bomb check. The hard limits are the per-file/total caps above and the capped
  // decompression buffer. Screenshots with large flat areas can compress more than photos.
  maxRatio: (name) => (name.endsWith('.jpg') ? 50 : 200),
  isAllowedPath: (name) => FILE_RE.test(name),
  isAllowedDir: (name) => DIR_RE.test(name),
};

/**
 * Harness files that must be identical to the default branch for a run to be published. This
 * is a consistency check (the screenshots were taken by the reviewed harness configuration),
 * NOT proof that the artifact is trustworthy: app code, build config, package scripts and
 * dependencies remain branch-controlled.
 */
export const HARNESS_PATHS = ['.github/workflows/visual.yml', 'scripts/visual/run.ts', 'scripts/visual/selftest.ts', 'tests/fixtures/visual'];
export const VISUAL_WORKFLOW = { name: 'Visual check', path: '.github/workflows/visual.yml' };
export const RESULTS_BRANCH = 'visual-results';

/**
 * Contributors whose pushes may be published. Changing this list is a reviewed change to the
 * default branch. Both the pusher (`actor`) and whoever (re-)ran the workflow
 * (`triggering_actor`) must be on it.
 */
export const AUTHORIZED_ACTORS = ['tybrathwaite1-lab'];
/** Data/deployment branches that are never sources of visual results. */
export const RESERVED_BRANCHES = new Set([RESULTS_BRANCH, 'image-scout-results', 'gh-pages']);
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;

export class PolicyError extends Error {}

/**
 * Publication eligibility (separate from integrity): an authorized contributor's push to an
 * ordinary development branch. Returns the reasons a run is NOT eligible (empty = eligible).
 * @param {any} run  GET /repos/{repo}/actions/runs/{id}
 * @param {string} branch
 */
export function eligibility(run, branch) {
  const reasons = [];
  const actor = run?.actor?.login;
  const trig = run?.triggering_actor?.login;
  if (!AUTHORIZED_ACTORS.includes(actor)) reasons.push('pushed by an account that is not an authorized contributor');
  if (!AUTHORIZED_ACTORS.includes(trig)) reasons.push('run triggered by an account that is not an authorized contributor');
  if (
    typeof branch !== 'string' ||
    !BRANCH_RE.test(branch) ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.endsWith('/') ||
    branch.endsWith('.lock') ||
    RESERVED_BRANCHES.has(branch) ||
    /^(?:dependabot|renovate)\//.test(branch)
  )
    reasons.push('branch is not an eligible development branch');
  return reasons;
}

/**
 * Results folder for a source branch: a readable lowercase slug plus 12 hex digits of
 * sha256(full branch name), so distinct branches never share a folder (case, punctuation and
 * truncation differences included). Folder names can never equal README.md, .git, or any
 * other reserved path because of the hash suffix.
 */
export const FOLDER_SRC = '[a-z0-9](?:[a-z0-9._-]{0,46}[a-z0-9])?-[0-9a-f]{12}';
export const FOLDER_RE = new RegExp(`^${FOLDER_SRC}$`);
export function folderFor(/** @type {string} */ branch) {
  if (typeof branch !== 'string' || !branch || branch.length > 255 || RESERVED_BRANCHES.has(branch)) throw new PolicyError(`unusable branch name: ${JSON.stringify(String(branch).slice(0, 80))}`);
  const slug =
    branch
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .slice(0, 48)
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '') || 'branch';
  const f = `${slug}-${createHash('sha256').update(branch, 'utf8').digest('hex').slice(0, 12)}`;
  if (!FOLDER_RE.test(f)) throw new PolicyError(`unusable branch name: ${JSON.stringify(branch.slice(0, 80))}`);
  return f;
}

/** Every path that may exist on the results branch. Anything else fails the publish closed. */
const RESULT_RE = new RegExp(`^(?:README\\.md|(${FOLDER_SRC})/(meta\\.json|REPORT\\.md|report\\.json|${SHOT_SRC}|${STATE_SRC}))$`);
/** @returns {{ folder: string, name: string } | { folder: null, name: 'README.md' } | null} */
export function resultPath(/** @type {string} */ path) {
  const m = RESULT_RE.exec(path);
  if (!m) return null;
  return m[1] ? { folder: m[1], name: m[2] } : { folder: null, name: 'README.md' };
}

/**
 * The triggering run must be a successful push run of the visual workflow in THIS repository
 * (never a fork or pull_request run), matching the event payload.
 * @param {any} run  GET /repos/{repo}/actions/runs/{id}
 * @param {{ repo: string, runId: string, headSha: string, headBranch: string }} expected
 */
export function checkRun(run, expected) {
  const problems = [];
  if (!run || typeof run !== 'object') throw new PolicyError('run not found');
  if (String(run.id) !== String(expected.runId)) problems.push('run id mismatch');
  if (run.name !== VISUAL_WORKFLOW.name) problems.push(`unexpected workflow name ${JSON.stringify(run.name)}`);
  if (run.path !== VISUAL_WORKFLOW.path) problems.push(`unexpected workflow path ${JSON.stringify(run.path)}`);
  if (run.event !== 'push') problems.push(`event is ${JSON.stringify(run.event)}, not push`);
  if (run.status !== 'completed' || run.conclusion !== 'success') problems.push(`run not successful (${run.status}/${run.conclusion})`);
  if (run.head_sha !== expected.headSha || !/^[0-9a-f]{40}$/.test(String(run.head_sha))) problems.push('head sha mismatch');
  if (run.head_branch !== expected.headBranch) problems.push('head branch mismatch');
  if (run.repository?.full_name !== expected.repo) problems.push('run belongs to another repository');
  if (run.head_repository?.full_name !== expected.repo) problems.push('run comes from a fork');
  if (problems.length) throw new PolicyError(`refusing run ${expected.runId}: ${problems.join('; ')}`);
}

/**
 * Exactly one unexpired artifact named visual-<sha>, produced by that same run and commit.
 * @param {any} list  GET /repos/{repo}/actions/runs/{id}/artifacts
 * @param {{ runId: string, headSha: string }} expected
 */
export function selectArtifact(list, expected) {
  const name = `visual-${expected.headSha}`;
  const all = Array.isArray(list?.artifacts) ? list.artifacts : [];
  const matches = all.filter((/** @type {any} */ a) => a?.name === name);
  if (matches.length !== 1) throw new PolicyError(`expected exactly one artifact named ${name}, found ${matches.length}`);
  const a = matches[0];
  const problems = [];
  if (a.expired) problems.push('artifact expired');
  if (!Number.isInteger(a.id) || a.id <= 0) problems.push('bad artifact id');
  if (!(a.size_in_bytes > 0) || a.size_in_bytes > LIMITS.maxZipBytes) problems.push(`artifact size ${a.size_in_bytes} out of bounds`);
  if (a.workflow_run && String(a.workflow_run.id) !== String(expected.runId)) problems.push('artifact from another run');
  if (a.workflow_run && a.workflow_run.head_sha !== expected.headSha) problems.push('artifact from another commit');
  if (problems.length) throw new PolicyError(`refusing artifact: ${problems.join('; ')}`);
  return a;
}

/**
 * JPEG STRUCTURAL SANITY check (not a decoder and not a content inspection): SOI, a chain of
 * well-formed marker segments, exactly one well-formed baseline/progressive frame header before
 * the first scan, a scan header, and EOI. The frame width must equal the folder width (states
 * images: one of the harness widths). Returns the pixel width.
 * @param {string} name
 * @param {Buffer} b
 */
export function checkJpeg(name, b) {
  if (b.length < 128 || b[0] !== 0xff || b[1] !== 0xd8) throw new PolicyError(`not a JPEG: ${name}`);
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) throw new PolicyError(`truncated JPEG: ${name}`);
  const body = b.length - 2;
  let i = 2;
  /** @type {{ width: number, height: number } | null} */
  let frame = null;
  for (;;) {
    if (i + 4 > body) throw new PolicyError(`malformed JPEG (no scan): ${name}`);
    if (b[i] !== 0xff) throw new PolicyError(`malformed JPEG (expected a marker): ${name}`);
    const m = b[i + 1];
    if (m === 0xff) {
      i++; // fill byte
      continue;
    }
    if (m === 0x00 || m === 0x01 || m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) throw new PolicyError(`malformed JPEG (unexpected marker 0x${m.toString(16)}): ${name}`);
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > body) throw new PolicyError(`malformed JPEG (segment length): ${name}`);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (frame) throw new PolicyError(`malformed JPEG (multiple frame headers): ${name}`);
      if (len < 8) throw new PolicyError(`malformed JPEG frame header: ${name}`);
      const precision = b[i + 4];
      const height = b.readUInt16BE(i + 5);
      const width = b.readUInt16BE(i + 7);
      const comps = b[i + 9];
      if (precision !== 8 || comps < 1 || comps > 4 || len !== 8 + 3 * comps) throw new PolicyError(`malformed JPEG frame header: ${name}`);
      if (!width || !height) throw new PolicyError(`JPEG with a zero dimension: ${name}`);
      frame = { width, height };
    }
    if (m === 0xda) {
      if (!frame) throw new PolicyError(`JPEG without a frame header: ${name}`);
      if (len < 8) throw new PolicyError(`malformed JPEG scan header: ${name}`);
      break;
    }
    i += 2 + len;
  }
  const { width, height } = frame;
  if (height > 30000) throw new PolicyError(`implausible JPEG height: ${name}`);
  const folder = Number(name.split('/')[0]);
  if (WIDTHS.includes(folder) && width !== folder) throw new PolicyError(`width ${width} does not match folder ${folder}: ${name}`);
  if (!WIDTHS.includes(folder) && !WIDTHS.includes(width)) throw new PolicyError(`unexpected width ${width}: ${name}`);
  return width;
}

// ─── report.json: strict schema ──────────────────────────────────────────────
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const IMPACTS = new Set(['critical', 'serious', 'moderate', 'minor']);
const HOST_RE = /^(?:[A-Za-z0-9.-]{1,253}|\[[0-9A-Fa-f:.]{2,45}\])(?::\d{1,5})?$/;

/** @param {boolean} ok @param {string} what */
function req(ok, what) {
  if (!ok) throw new PolicyError(`report.json: ${what}`);
}
const isStr = (/** @type {unknown} */ v, max = 500) => typeof v === 'string' && v.length <= max;
const isInt = (/** @type {unknown} */ v, min = 0, max = 1e7) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isArr = (/** @type {unknown} */ v, max = 1000) => Array.isArray(v) && v.length <= max;

/**
 * @typedef {{ id: string, impact: string | null, nodes: number }} Violation
 * @typedef {{ route: string, width: number, file: string, fold: string, overflowPx: number,
 *   pageErrors: string[], axe: Violation[] | null }} Shot
 * @typedef {{ branch: string, commit: string, frozenTime: string, generatedAt: string,
 *   axeAvailable: true, widths: number[], routes: string[], shots: Shot[],
 *   states: { name: string, file: string, note: string | null, ok: boolean }[],
 *   keyboard: { width: number, route: string, checks: { name: string, pass: boolean, detail: string }[] }[],
 *   blockedHosts: string[] }} Report
 */

/**
 * Parse and STRICTLY validate report.json. Every required field must be present and well
 * formed (missing or malformed data is an error, never a silent default), every route × width
 * must have exactly one shot, accessibility results must exist where the harness runs axe
 * (and are recorded as "not run" elsewhere), and keyboard results must exist for each
 * keyboard width. Unknown fields are dropped; the result is what gets published.
 * @param {Buffer} b
 * @param {{ headSha: string, headBranch: string }} expected
 * @returns {Report}
 */
export function parseReport(b, expected) {
  if (b.length > LIMITS.maxReportBytes) throw new PolicyError('report.json too large');
  let j;
  try {
    j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
  } catch {
    throw new PolicyError('report.json is not valid UTF-8 JSON');
  }
  req(Boolean(j) && typeof j === 'object' && !Array.isArray(j), 'not an object');
  req(j.branch === expected.headBranch, 'branch does not match the run');
  req(j.commit === expected.headSha, 'commit does not match the run');
  req(isStr(j.frozenTime, 40) && ISO_RE.test(j.frozenTime), 'frozenTime missing or malformed');
  req(isStr(j.generatedAt, 40) && ISO_RE.test(j.generatedAt), 'generatedAt missing or malformed');
  req(j.axeAvailable === true, 'accessibility checks did not run (axeAvailable is not true)');
  req(isArr(j.widths, WIDTHS.length) && j.widths.length > 0 && j.widths.every((/** @type {unknown} */ w) => WIDTHS.includes(/** @type {number} */ (w))) && new Set(j.widths).size === j.widths.length, 'widths missing or malformed');
  req(isArr(j.routes, 40) && j.routes.length > 0 && j.routes.every((/** @type {unknown} */ r) => typeof r === 'string' && ROUTE_RE.test(r)) && new Set(j.routes).size === j.routes.length, 'routes missing or malformed');
  /** @type {number[]} */
  const widths = j.widths;
  /** @type {string[]} */
  const routes = j.routes;

  req(isArr(j.shots, 400), 'shots missing or malformed');
  /** @type {Shot[]} */
  const shots = [];
  const pairs = new Set();
  for (const s of j.shots) {
    req(Boolean(s) && typeof s === 'object', 'shot is not an object');
    req(routes.includes(s.route) && widths.includes(s.width), `shot for an undeclared route/width`);
    const key = `${s.route}@${s.width}`;
    req(!pairs.has(key), `duplicate shot ${key}`);
    pairs.add(key);
    req(s.file === `${s.width}/${s.route}.jpg` && s.fold === `${s.width}/${s.route}-fold.jpg`, `unexpected file names for ${key}`);
    req(typeof s.overflowPx === 'number' && Number.isFinite(s.overflowPx) && s.overflowPx >= 0 && s.overflowPx <= 1e6, `overflowPx missing or malformed for ${key}`);
    req(isArr(s.pageErrors, 50) && s.pageErrors.every((/** @type {unknown} */ e) => isStr(e, 20000)), `pageErrors missing or malformed for ${key}`);
    /** @type {Violation[] | null} */
    let axe = null;
    if (AXE_WIDTHS.includes(s.width)) {
      req(isArr(s.axe, 200), `accessibility results missing for ${key}`);
      axe = s.axe.map((/** @type {any} */ a) => {
        req(Boolean(a) && isStr(a.id, 80) && /^[a-z0-9-]{1,80}$/.test(a.id) && (a.impact === null || IMPACTS.has(a.impact)) && isInt(a.nodes), `malformed accessibility result for ${key}`);
        return { id: a.id, impact: a.impact, nodes: a.nodes };
      });
    } else {
      req(s.axe === undefined || s.axe === null, `unexpected accessibility results for ${key}`);
    }
    shots.push({ route: s.route, width: s.width, file: s.file, fold: s.fold, overflowPx: s.overflowPx, pageErrors: [...s.pageErrors], axe });
  }
  for (const w of widths) for (const r of routes) req(pairs.has(`${r}@${w}`), `missing shot ${r}@${w}`);

  req(isArr(j.states, 50), 'states missing or malformed');
  const states = j.states.map((/** @type {any} */ s) => {
    req(Boolean(s) && isStr(s.name, 200) && s.name.length > 0 && typeof s.file === 'string' && STATE_FILE_RE.test(s.file) && typeof s.ok === 'boolean' && (s.note === undefined || s.note === null || isStr(s.note, 500)), 'malformed state record');
    return { name: s.name, file: s.file, note: s.note ?? null, ok: s.ok };
  });
  req(new Set(states.map((/** @type {{ file: string }} */ s) => s.file)).size === states.length, 'duplicate state files');

  req(isArr(j.keyboard, KEY_WIDTHS.length), 'keyboard missing or malformed');
  const keyboard = j.keyboard.map((/** @type {any} */ k) => {
    req(Boolean(k) && KEY_WIDTHS.includes(k.width) && widths.includes(k.width) && k.route === 'home' && isArr(k.checks, 20) && k.checks.length > 0, 'malformed keyboard record');
    return {
      width: k.width,
      route: k.route,
      checks: k.checks.map((/** @type {any} */ c) => {
        req(Boolean(c) && isStr(c.name, 200) && c.name.length > 0 && typeof c.pass === 'boolean' && isStr(c.detail, 500), 'malformed keyboard check');
        return { name: c.name, pass: c.pass, detail: c.detail };
      }),
    };
  });
  for (const w of KEY_WIDTHS.filter((x) => widths.includes(x))) req(keyboard.filter((/** @type {{ width: number }} */ k) => k.width === w).length === 1, `keyboard results missing for ${w}px`);

  req(isArr(j.blockedHosts, 200) && j.blockedHosts.every((/** @type {unknown} */ h) => typeof h === 'string' && HOST_RE.test(h)), 'blockedHosts missing or malformed');

  return { branch: j.branch, commit: j.commit, frozenTime: j.frozenTime, generatedAt: j.generatedAt, axeAvailable: true, widths: [...widths], routes: [...routes], shots, states, keyboard, blockedHosts: [...j.blockedHosts] };
}

/**
 * Validate every artifact file. The report must reference every screenshot and every
 * screenshot it references must be present (no orphans, no gaps). Returns the files to publish
 * (REPORT.md excluded: it is regenerated; report.json re-serialized from validated fields).
 * @param {Map<string, Buffer>} files
 * @param {{ headSha: string, headBranch: string }} expected
 */
export function validateContents(files, expected) {
  const reportBuf = files.get('report.json');
  if (!reportBuf) throw new PolicyError('artifact has no report.json');
  const report = parseReport(reportBuf, expected);
  const referenced = new Set([...report.shots.flatMap((s) => [s.file, s.fold]), ...report.states.map((s) => s.file)]);
  /** @type {Map<string, Buffer>} */
  const out = new Map([['report.json', Buffer.from(JSON.stringify(report, null, 1))]]);
  for (const [name, data] of files) {
    if (name === 'REPORT.md' || name === 'report.json') continue;
    if (!name.endsWith('.jpg')) throw new PolicyError(`unexpected file: ${name}`);
    if (!referenced.has(name)) throw new PolicyError(`screenshot not referenced by report.json: ${name}`);
    checkJpeg(name, data);
    out.set(name, data);
  }
  for (const f of referenced) if (!out.has(f)) throw new PolicyError(`report.json references a missing screenshot: ${f}`);
  return { files: out, report };
}

// ─── Results branch metadata ────────────────────────────────────────────────
/**
 * @typedef {{ branch: string, folder: string, sha: string, runId: string, publishedAt: string }} Meta
 */

/** @param {Meta} m */
export function metaJson(m) {
  return Buffer.from(`${JSON.stringify({ branch: m.branch, folder: m.folder, sha: m.sha, runId: m.runId, publishedAt: m.publishedAt }, null, 1)}\n`);
}

/**
 * Strictly parse a folder's meta.json from the results branch.
 * @param {Buffer} b @param {string} folder
 * @returns {Meta}
 */
export function parseMeta(b, folder) {
  let j;
  try {
    j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
  } catch {
    throw new PolicyError(`${folder}/meta.json is not valid UTF-8 JSON`);
  }
  const keys = j && typeof j === 'object' && !Array.isArray(j) ? Object.keys(j).sort().join(',') : '';
  if (keys !== 'branch,folder,publishedAt,runId,sha') throw new PolicyError(`${folder}/meta.json has unexpected fields`);
  if (typeof j.branch !== 'string' || j.folder !== folder) throw new PolicyError(`${folder}/meta.json does not match its folder`);
  let f = '';
  try {
    f = folderFor(j.branch);
  } catch {
    f = '';
  }
  if (f !== folder) throw new PolicyError(`${folder}/meta.json branch does not map to its folder`);
  if (typeof j.sha !== 'string' || !/^[0-9a-f]{40}$/.test(j.sha)) throw new PolicyError(`${folder}/meta.json sha malformed`);
  if (typeof j.runId !== 'string' || !/^\d{1,20}$/.test(j.runId)) throw new PolicyError(`${folder}/meta.json runId malformed`);
  if (typeof j.publishedAt !== 'string' || !ISO_RE.test(j.publishedAt)) throw new PolicyError(`${folder}/meta.json publishedAt malformed`);
  return { branch: j.branch, folder, sha: j.sha, runId: j.runId, publishedAt: j.publishedAt };
}

/** Numeric comparison of run ids given as decimal strings. */
export function runIdCompare(/** @type {string} */ a, /** @type {string} */ b) {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ─── Rendering ──────────────────────────────────────────────────────────────
/**
 * Render untrusted text as an inline code span, so it can only ever display as plain text:
 * no HTML, no links or autolinks, no emphasis, no table breaks. Control, bidirectional and
 * invisible formatting characters become spaces; backticks and pipes are replaced with
 * look-alikes so the span and table cell can't be closed early.
 */
export function text(/** @type {unknown} */ s, max = 300) {
  let t = String(s)
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\ufff9-\ufffb]/g, ' ')
    .replace(/`/g, 'ˋ')
    .replace(/\|/g, '¦')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) t = `${t.slice(0, max - 1)}…`;
  return t ? `\`${t}\`` : '—';
}

/**
 * Render REPORT.md from a validated report. Only fixed template text, validated identifiers
 * (routes, widths, file names, hex SHAs, numeric run ids) and code-span-wrapped strings appear.
 * @param {{ repo: string, folder: string, branch: string, sha: string, runId: string }} meta
 * @param {Report} r
 */
export function renderReport(meta, r) {
  const L = [];
  const runUrl = `https://github.com/${meta.repo}/actions/runs/${meta.runId}`;
  const axeShots = r.shots.filter((s) => s.axe !== null);
  const flagged = (/** @type {Shot} */ s) => s.overflowPx > 1 || s.pageErrors.length > 0 || (s.axe?.length ?? 0) > 0;
  const rules = new Map();
  for (const s of axeShots) for (const a of s.axe ?? []) rules.set(`${a.id}|${a.impact ?? 'unknown'}`, (rules.get(`${a.id}|${a.impact ?? 'unknown'}`) ?? 0) + 1);
  const keyChecks = r.keyboard.reduce((n, k) => n + k.checks.length, 0);
  const keyFails = r.keyboard.reduce((n, k) => n + k.checks.filter((c) => !c.pass).length, 0);
  const widths = [...r.widths].sort((a, b) => a - b);
  const axeWidths = widths.filter((w) => AXE_WIDTHS.includes(w));

  L.push(`# Visual check: ${text(meta.branch, 120)}`, '');
  L.push(`Commit \`${meta.sha}\` · run [${meta.runId}](${runUrl}) · folder \`${meta.folder}\``, '');
  L.push(
    '> Untrusted review material: produced by branch code from synthetic fixtures with a frozen clock, validated and re-rendered by the reviewed `visual-publish` workflow. Artifact text is shown as plain text.',
    '',
  );
  L.push(`Frozen time ${text(r.frozenTime)} · generated ${text(r.generatedAt)}`, '');
  L.push(
    `**${r.shots.filter(flagged).length} of ${r.shots.length} screenshot(s) with findings** · overflow ${r.shots.filter((s) => s.overflowPx > 1).length} · page errors ${r.shots.filter((s) => s.pageErrors.length).length} · accessibility: ${rules.size} rule/impact pair(s) at ${axeWidths.map((w) => `${w}px`).join(', ') || '—'} (not run at other widths) · keyboard: ${keyFails} of ${keyChecks} check(s) failed`,
    '',
  );
  L.push(`| Route | ${widths.map((w) => `${w}px`).join(' | ')} |`, `|---|${widths.map(() => '---').join('|')}|`);
  for (const route of r.routes) {
    const cells = widths.map((w) => {
      const s = /** @type {Shot} */ (r.shots.find((x) => x.route === route && x.width === w));
      return `[<img src="${s.file}" width="120" alt="${route} at ${w}px">](${s.file}) [fold](${s.fold})${flagged(s) ? ' ⚠️' : ''}`;
    });
    L.push(`| \`#/${route === 'home' ? '' : route}\` | ${cells.join(' | ')} |`);
  }
  L.push('', '## Accessibility (WCAG A/AA, all impacts)', '');
  if (rules.size) {
    L.push('| Rule | Impact | Screenshots |', '|---|---|---|');
    for (const [k, n] of rules) {
      const [id, impact] = k.split('|');
      L.push(`| ${text(id)} | ${text(impact)} | ${n} of ${axeShots.length} |`);
    }
  } else L.push(`No violations in ${axeShots.length} checked screenshot(s).`);
  L.push('', '## Keyboard (verified checks)', '');
  for (const k of r.keyboard) {
    L.push(`**${k.width}px**`, '', '| Check | Result | Detail |', '|---|---|---|');
    for (const c of k.checks) L.push(`| ${text(c.name)} | ${c.pass ? '✅ pass' : '❌ fail'} | ${text(c.detail)} |`);
    L.push('');
  }
  const over = r.shots.filter((s) => s.overflowPx > 1);
  if (over.length) {
    L.push('## Horizontal overflow', '');
    for (const s of over) L.push(`- \`${s.route}\` @ ${s.width}px: ${Math.round(s.overflowPx)}px`);
    L.push('');
  }
  const errs = r.shots.filter((s) => s.pageErrors.length);
  if (errs.length) {
    L.push('## Page errors', '');
    for (const s of errs) L.push(`- \`${s.route}\` @ ${s.width}px: ${s.pageErrors.slice(0, 5).map((e) => text(e, 200)).join(' / ')}`);
    L.push('');
  }
  if (r.states.length) {
    L.push('## States (screenshot evidence)', '');
    for (const s of r.states) L.push(`- ${text(s.name, 200)}: [${s.file}](${s.file})${s.ok ? '' : ' ⚠️'}${s.note ? ` — ${text(s.note, 200)}` : ''}`);
    L.push('');
  }
  L.push('## Blocked external requests', '', r.blockedHosts.length ? r.blockedHosts.map((h) => text(h, 100)).join(', ') : 'none', '');
  return L.join('\n');
}

/**
 * Render the results branch README (one row per published folder).
 * @param {Meta[]} metas
 */
export function renderIndex(metas) {
  return [
    '# Visual check results',
    '',
    'Latest validated screenshot run per branch, published by the reviewed `visual-publish` workflow (default-branch code only).',
    'Untrusted review material produced by branch code from synthetic fixtures and a frozen clock; no personal data. This branch is rewritten on every publish.',
    '',
    '| Branch | Commit | Run | Report |',
    '|---|---|---|---|',
    ...[...metas]
      .sort((a, b) => a.folder.localeCompare(b.folder))
      .map((m) => `| ${text(m.branch, 120)} | \`${m.sha.slice(0, 12)}\` | ${m.runId} | [REPORT.md](${m.folder}/REPORT.md) |`),
    '',
  ].join('\n');
}
