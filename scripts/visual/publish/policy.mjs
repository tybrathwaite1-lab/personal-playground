// @ts-check
/**
 * Publishing policy for visual-check artifacts: what may be published, from which runs, and how.
 * Pure functions only (no I/O), so every rule is unit-tested (tests/visual-publish.test.ts).
 */

export const WIDTHS = [320, 390, 768, 1280, 1440];
export const LIMITS = {
  maxZipBytes: 80 * 1024 * 1024,
  maxEntries: 400,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 120 * 1024 * 1024,
  maxReportBytes: 2 * 1024 * 1024,
};

/** The only files ever published. REPORT.md from the artifact is never used (it's regenerated). */
const FILE_RE = new RegExp(`^(?:(?:${WIDTHS.join('|')})/[a-z0-9-]{1,40}(?:-fold)?\\.jpg|states/[a-z0-9-]{1,60}\\.jpg|report\\.json|REPORT\\.md)$`);
const DIR_RE = new RegExp(`^(?:${WIDTHS.join('|')}|states)/$`);

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

/** Harness files that must be identical to the default branch for a run to be published. */
export const HARNESS_PATHS = ['.github/workflows/visual.yml', 'scripts/visual/run.ts', 'scripts/visual/selftest.ts', 'tests/fixtures/visual'];
export const VISUAL_WORKFLOW = { name: 'Visual check', path: '.github/workflows/visual.yml' };
export const RESULTS_BRANCH = 'visual-results';

export class PolicyError extends Error {}

/** Folder name for a source branch: [A-Za-z0-9._-] only, no leading dot, bounded length. */
export function folderFor(/** @type {string} */ branch) {
  const f = String(branch)
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 80);
  if (!f || f === RESULTS_BRANCH) throw new PolicyError(`unusable branch name: ${JSON.stringify(branch)}`);
  return f;
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
 * JPEG sanity: SOI/EOI markers and a frame header whose width is plausible for its folder.
 * Returns the pixel width.
 * @param {string} name
 * @param {Buffer} b
 */
export function checkJpeg(name, b) {
  if (b.length < 128 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) throw new PolicyError(`not a JPEG: ${name}`);
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) throw new PolicyError(`truncated JPEG: ${name}`);
  let i = 2;
  let width = 0;
  let height = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new PolicyError(`malformed JPEG: ${name}`);
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) throw new PolicyError(`malformed JPEG: ${name}`);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = b.readUInt16BE(i + 5);
      width = b.readUInt16BE(i + 7);
      break;
    }
    if (marker === 0xda) break; // start of scan without a frame header
    i += 2 + len;
  }
  if (!width || !height) throw new PolicyError(`JPEG without a frame header: ${name}`);
  if (height > 30000) throw new PolicyError(`implausible JPEG height: ${name}`);
  const folder = Number(name.split('/')[0]);
  if (WIDTHS.includes(folder) && width !== folder) throw new PolicyError(`width ${width} does not match folder ${folder}: ${name}`);
  if (!WIDTHS.includes(folder) && !WIDTHS.includes(width)) throw new PolicyError(`unexpected width ${width}: ${name}`);
  return width;
}

const str = (/** @type {unknown} */ v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const arr = (/** @type {unknown} */ v, max = 1000) => (Array.isArray(v) ? v.slice(0, max) : []);

/**
 * Parse report.json into a minimal, typed, length-capped summary. Unknown fields are dropped.
 * @param {Buffer} b
 */
export function parseReport(b) {
  if (b.length > LIMITS.maxReportBytes) throw new PolicyError('report.json too large');
  let j;
  try {
    j = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
  } catch {
    throw new PolicyError('report.json is not valid UTF-8 JSON');
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new PolicyError('report.json is not an object');
  if (!Array.isArray(j.shots) || !Array.isArray(j.widths)) throw new PolicyError('report.json missing shots/widths');
  return {
    frozenTime: str(j.frozenTime, 40),
    generatedAt: str(j.generatedAt, 40),
    axeAvailable: j.axeAvailable === true,
    shots: arr(j.shots, 200).map((/** @type {any} */ s) => ({
      route: str(s?.route, 40),
      width: num(s?.width),
      file: str(s?.file, 80),
      fold: str(s?.fold, 80),
      overflowPx: num(s?.overflowPx),
      pageErrors: arr(s?.pageErrors, 5).map((/** @type {unknown} */ e) => str(e, 200)),
      axe: arr(s?.axe, 50).map((/** @type {any} */ a) => ({ id: str(a?.id, 60), impact: str(a?.impact, 20), nodes: num(a?.nodes) })),
    })),
    keyboard: arr(j.keyboard, 10).map((/** @type {any} */ k) => ({
      width: num(k?.width),
      checks: arr(k?.checks, 20).map((/** @type {any} */ c) => ({ name: str(c?.name, 120), pass: c?.pass === true, detail: str(c?.detail, 200) })),
    })),
    blockedHosts: arr(j.blockedHosts, 50).map((/** @type {unknown} */ h) => str(h, 100)),
  };
}

/** Neutralize Markdown/HTML in untrusted text: it can only ever render as plain text. */
export function md(/** @type {string} */ s) {
  return String(s)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\`*_{}[\]()<>#+!|~&"']/g, (c) => `&#${c.charCodeAt(0)};`)
    .replace(/:\/\//g, '&#58;//');
}

/**
 * Render REPORT.md from the validated summary and the set of files that passed validation.
 * Links point only to files in the same folder that were actually published.
 * @param {{ folder: string, branch: string, sha: string, runUrl: string }} meta
 * @param {ReturnType<typeof parseReport>} r
 * @param {Set<string>} published
 */
export function renderReport(meta, r, published) {
  const L = [];
  const shotsBad = r.shots.filter((s) => s.overflowPx > 1 || s.pageErrors.length || s.axe.length);
  const rules = new Map();
  for (const s of r.shots) for (const a of s.axe) rules.set(`${a.id}|${a.impact}`, (rules.get(`${a.id}|${a.impact}`) ?? 0) + 1);
  const keyFails = r.keyboard.reduce((n, k) => n + k.checks.filter((c) => !c.pass).length, 0);
  L.push(`# Visual check: ${md(meta.branch)} @ ${md(meta.sha.slice(0, 7))}`, '');
  L.push('Published by the reviewed `visual-publish` workflow from a validated artifact. Synthetic fixtures and a frozen clock only. Text from the artifact is shown as plain text.', '');
  L.push(`Frozen time ${md(r.frozenTime)} · generated ${md(r.generatedAt)} · source run: ${meta.runUrl}`, '');
  L.push(
    `**${shotsBad.length} screenshot(s) with findings** · overflow ${r.shots.filter((s) => s.overflowPx > 1).length} · page errors ${r.shots.filter((s) => s.pageErrors.length).length} · accessibility ${r.axeAvailable ? `${rules.size} rule/impact pair(s)` : 'NOT RUN'} · keyboard checks failed ${keyFails}`,
    '',
  );
  const routes = [...new Set(r.shots.map((s) => s.route).filter((x) => /^[a-z0-9-]{1,40}$/.test(x)))];
  const widths = [...new Set(r.shots.map((s) => s.width))].filter((w) => WIDTHS.includes(w)).sort((a, b) => a - b);
  L.push(`| Route | ${widths.map((w) => `${w}px`).join(' | ')} |`, `|---|${widths.map(() => '---').join('|')}|`);
  for (const route of routes) {
    const cells = widths.map((w) => {
      const full = `${w}/${route}.jpg`;
      const fold = `${w}/${route}-fold.jpg`;
      const s = r.shots.find((x) => x.route === route && x.width === w);
      const flag = s && (s.overflowPx > 1 || s.pageErrors.length || s.axe.length) ? ' ⚠️' : '';
      const parts = [];
      if (published.has(full)) parts.push(`[<img src="${full}" width="120" alt="${route} at ${w}px">](${full})`);
      if (published.has(fold)) parts.push(`[fold](${fold})`);
      return parts.length ? parts.join(' ') + flag : '—';
    });
    L.push(`| \`#/${route === 'home' ? '' : route}\` | ${cells.join(' | ')} |`);
  }
  if (rules.size) {
    L.push('', '## Accessibility', '', '| Rule | Impact | Screenshots |', '|---|---|---|');
    for (const [k, n] of rules) {
      const [id, impact] = k.split('|');
      L.push(`| ${md(id)} | ${md(impact)} | ${n} |`);
    }
  }
  if (r.keyboard.length) {
    L.push('', '## Keyboard (verified checks)', '');
    for (const k of r.keyboard) {
      L.push(`**${num(k.width)}px**`, '', '| Check | Result | Detail |', '|---|---|---|');
      for (const c of k.checks) L.push(`| ${md(c.name)} | ${c.pass ? '✅ pass' : '❌ fail'} | ${md(c.detail)} |`);
      L.push('');
    }
  }
  const over = r.shots.filter((s) => s.overflowPx > 1);
  if (over.length) {
    L.push('', '## Horizontal overflow', '');
    for (const s of over) L.push(`- ${md(s.route)} @ ${num(s.width)}px: ${num(s.overflowPx)}px`);
  }
  const errs = r.shots.filter((s) => s.pageErrors.length);
  if (errs.length) {
    L.push('', '## Page errors', '');
    for (const s of errs) L.push(`- ${md(s.route)} @ ${num(s.width)}px: ${s.pageErrors.map(md).join(' / ')}`);
  }
  const states = [...published].filter((f) => f.startsWith('states/')).sort();
  if (states.length) {
    L.push('', '## States (screenshot evidence)', '');
    for (const f of states) L.push(`- [${f}](${f})`);
  }
  L.push('', '## Blocked external requests', '', r.blockedHosts.length ? r.blockedHosts.map(md).join(', ') : 'none', '');
  return L.join('\n');
}

/**
 * Validate every extracted file's content. Returns the files to publish (REPORT.md excluded:
 * it is regenerated) and the parsed report.
 * @param {Map<string, Buffer>} files
 */
export function validateContents(files) {
  const report = files.get('report.json');
  if (!report) throw new PolicyError('artifact has no report.json');
  const parsed = parseReport(report);
  /** @type {Map<string, Buffer>} */
  const out = new Map();
  let jpegs = 0;
  for (const [name, data] of files) {
    if (name === 'REPORT.md') continue;
    if (name === 'report.json') {
      out.set(name, Buffer.from(JSON.stringify(parsed, null, 1)));
      continue;
    }
    checkJpeg(name, data);
    jpegs++;
    out.set(name, data);
  }
  if (!jpegs) throw new PolicyError('artifact has no screenshots');
  return { files: out, report: parsed };
}
