/**
 * End-to-end tests for the privileged publisher (scripts/visual/publish/publish.mjs): the real
 * script runs as a child process against a local mock of the GitHub API and real local git
 * repositories. No network, synthetic data only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { folderFor } from '../scripts/visual/publish/policy.mjs';
import { goodArtifact, makeZip, fakeJpeg, sampleReport, artifactEntries } from './helpers/zipBuilder.ts';

const PUBLISH = fileURLToPath(new URL('../scripts/visual/publish/publish.mjs', import.meta.url));
const TOKEN = 'ghs_TESTTOKEN_must_never_be_printed';
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: ENV, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const gIn = (cwd: string, input: string | Buffer, extra: Record<string, string>, ...args: string[]) => execFileSync('git', args, { cwd, input, encoding: 'utf8', env: { ...ENV, ...extra }, stdio: ['pipe', 'pipe', 'pipe'] }).trim();

interface World {
  dir: string;
  origin: string;
  work: string;
  trusted: string;
  sha: Record<string, string>;
}

function commitFile(w: World, branch: string, from: string | null, path: string, content: string) {
  if (from) g(w.work, 'checkout', '--quiet', '-B', branch, from);
  mkdirSync(dirname(join(w.work, path)), { recursive: true });
  writeFileSync(join(w.work, path), content);
  g(w.work, 'add', '-A');
  g(w.work, '-c', 'user.email=t@example.org', '-c', 'user.name=Test', 'commit', '--quiet', '-m', `${branch}: ${path}`);
  g(w.work, 'push', '--quiet', '--force', w.origin, `${branch}:refs/heads/${branch}`);
  w.sha[branch] = g(w.work, 'rev-parse', 'HEAD');
}

/** origin (bare) with main, feature/x (app change only) and feature/h (harness change). */
function makeWorld(): World {
  const dir = mkdtempSync(join(tmpdir(), 'pp-publish-e2e-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  g(dir, 'init', '--quiet', '--bare', '-b', 'main', origin);
  g(dir, 'init', '--quiet', '-b', 'main', work);
  const w: World = { dir, origin, work, trusted: join(dir, 'trusted'), sha: {} };
  for (const [p, s] of [
    ['.github/workflows/visual.yml', 'name: Visual check\n'],
    ['scripts/visual/run.ts', '// harness\n'],
    ['scripts/visual/selftest.ts', '// selftest\n'],
    ['tests/fixtures/visual/pulse.json', '{}\n'],
  ]) {
    mkdirSync(dirname(join(work, p)), { recursive: true });
    writeFileSync(join(work, p), s);
  }
  commitFile(w, 'main', null, 'src/app.txt', 'v1\n');
  commitFile(w, 'feature/x', 'main', 'src/app.txt', 'v2\n');
  commitFile(w, 'feature/h', 'main', 'scripts/visual/run.ts', '// harness changed on a branch\n');
  g(dir, 'clone', '--quiet', '--depth=1', '--branch', 'main', `file://${origin}`, w.trusted);
  return w;
}

interface Mock {
  run: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  zip: Buffer;
}

async function publish(w: World, branch: string, mock: (sha: string, runId: number) => Mock, o: { runId?: number; sha?: string; trustedSha?: string } = {}) {
  const sha = o.sha ?? w.sha[branch];
  const runId = o.runId ?? 77;
  const m = mock(sha, runId);
  const seen: { path: string; auth: boolean }[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const path = (req.url ?? '').split('?')[0];
    seen.push({ path, auth: Boolean(req.headers.authorization) });
    const json = (x: unknown) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(x));
    if (path === `/repos/o/r/actions/runs/${runId}`) return json(m.run);
    if (path === `/repos/o/r/actions/runs/${runId}/artifacts`) return json(m.artifacts);
    if (path === '/repos/o/r/actions/artifacts/5/zip') return res.writeHead(302, { Location: `http://127.0.0.1:${(server.address() as { port: number }).port}/blob/a.zip?sig=x` }).end();
    if (path === '/blob/a.zip') return res.writeHead(200, { 'Content-Type': 'application/zip' }).end(m.zip);
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const port = (server.address() as { port: number }).port;
  const summaryFile = join(w.dir, `summary-${Date.now()}-${Math.random()}.md`);
  const result = await new Promise<{ code: number; out: string }>((ok) => {
    execFile(
      process.execPath,
      [PUBLISH],
      {
        cwd: w.trusted,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: w.dir,
          GH_TOKEN: TOKEN,
          REPO: 'o/r',
          RUN_ID: String(runId),
          HEAD_SHA: sha,
          HEAD_BRANCH: branch,
          DEFAULT_BRANCH: 'main',
          TRUSTED_SHA: o.trustedSha ?? g(w.trusted, 'rev-parse', 'HEAD'),
          GITHUB_API_URL: `http://127.0.0.1:${port}`,
          PUBLISH_GIT_URL: `file://${w.origin}`,
          PUBLISH_NO_AUTH: '1',
          GITHUB_STEP_SUMMARY: summaryFile,
        },
      },
      (err, stdout, stderr) => ok({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` }),
    );
  });
  server.close();
  let summary = '';
  try {
    summary = readFileSync(summaryFile, 'utf8');
  } catch {
    summary = '';
  }
  return { ...result, seen, summary };
}

const runFor = (sha: string, branch: string, runId = 77, patch: Record<string, unknown> = {}) => ({
  id: runId,
  name: 'Visual check',
  path: '.github/workflows/visual.yml',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  head_sha: sha,
  head_branch: branch,
  repository: { full_name: 'o/r' },
  head_repository: { full_name: 'o/r' },
  actor: { login: 'tybrathwaite1-lab' },
  triggering_actor: { login: 'tybrathwaite1-lab' },
  ...patch,
});
const artifactsFor = (sha: string, runId = 77) => ({ artifacts: [{ id: 5, name: `visual-${sha}`, size_in_bytes: 1000, expired: false, workflow_run: { id: runId, head_sha: sha } }] });
const good =
  (branch: string) =>
  (sha: string, runId = 77): Mock => ({ run: runFor(sha, branch, runId), artifacts: artifactsFor(sha, runId), zip: goodArtifact({ sha, branch }) });
const tree = (w: World) => g(w.origin, 'ls-tree', '-r', '--name-only', 'visual-results').split('\n').sort();
const resultsOid = (w: World) => {
  try {
    return g(w.origin, 'rev-parse', '--verify', '--quiet', 'refs/heads/visual-results');
  } catch {
    return null;
  }
};
const show = (w: World, path: string) => g(w.origin, 'show', `visual-results:${path}`);

/** Replace visual-results in origin with a crafted tree (for trust-boundary tests). */
function craftResults(w: World, entries: { path: string; mode?: string; data?: Buffer | string; oid?: string }[]) {
  const scratch = mkdtempSync(join(w.dir, 'craft-'));
  g(scratch, 'init', '--quiet');
  // Objects from the last valid publish (kept under a tag, which is not a branch head).
  g(scratch, 'fetch', '--quiet', `file://${w.origin}`, 'refs/tags/valid-results');
  const lines = entries.map((e) => `${e.mode ?? '100644'} ${e.oid ?? gIn(scratch, e.data ?? '', {}, 'hash-object', '-w', '--stdin')}\t${e.path}`);
  const idx = join(scratch, '.git', 'craft-index');
  gIn(scratch, `${lines.join('\n')}\n`, { GIT_INDEX_FILE: idx }, 'update-index', '--add', '--index-info');
  const t = gIn(scratch, '', { GIT_INDEX_FILE: idx }, 'write-tree');
  const c = gIn(scratch, '', { GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@example.org', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@example.org' }, 'commit-tree', t, '-m', 'crafted');
  g(scratch, 'push', '--quiet', '--force', `file://${w.origin}`, `${c}:refs/heads/visual-results`);
  return c;
}
/** Current visual-results entries (mode, oid, path). */
const entriesOf = (w: World) =>
  g(w.origin, 'ls-tree', '-r', 'visual-results')
    .split('\n')
    .map((l) => {
      const [meta, path] = l.split('\t');
      const [mode, , oid] = meta.split(' ');
      return { mode, oid, path };
    });

const FX = folderFor('feature/x');
const FMAIN = folderFor('main');

test('publishes a valid artifact: validated files, regenerated report, metadata, parentless commit, no credentials to storage', async () => {
  const w = makeWorld();
  try {
    const r = await publish(w, 'feature/x', good('feature/x'));
    assert.equal(r.code, 0, r.out);
    const shots = artifactEntries().filter((e) => e.name.endsWith('.jpg')).map((e) => `${FX}/${e.name}`);
    assert.equal(shots.length, 124);
    assert.deepEqual(tree(w), ['README.md', `${FX}/REPORT.md`, `${FX}/meta.json`, `${FX}/report.json`, ...shots].sort());
    const report = show(w, `${FX}/REPORT.md`);
    assert.match(report, /reviewed `visual-publish` workflow/);
    assert.match(report, new RegExp(`Commit \`${w.sha['feature/x']}\` · run \\[77\\]`), 'full SHA and run id recorded');
    assert.equal(/phish|onerror|evil\.example/.test(report), false, 'branch-authored REPORT.md never published');
    const meta = JSON.parse(show(w, `${FX}/meta.json`));
    assert.deepEqual({ ...meta, publishedAt: 'x' }, { branch: 'feature/x', folder: FX, sha: w.sha['feature/x'], runId: '77', publishedAt: 'x' });
    assert.match(show(w, 'README.md'), new RegExp(`\`feature/x\` \\| \`${w.sha['feature/x'].slice(0, 12)}\` \\| 77 \\| \\[REPORT\\.md\\]\\(${FX}/REPORT\\.md\\)`));
    assert.equal(g(w.origin, 'rev-list', '--parents', '-n1', 'visual-results').split(' ').length, 1, 'single parentless commit');
    assert.ok(r.seen.filter((s) => s.path.startsWith('/repos/')).every((s) => s.auth), 'API calls authenticated');
    const blob = r.seen.filter((s) => s.path.startsWith('/blob/'));
    assert.equal(blob.length, 1, 'artifact fetched from storage exactly once');
    assert.equal(blob[0].auth, false, 'no credentials sent to artifact storage');
    assert.equal(r.out.includes(TOKEN) || r.summary.includes(TOKEN), false, 'token never printed');
    assert.match(r.summary, new RegExp(`Published \`feature/x\`.*→ \`visual-results/${FX}\``));
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('re-validates and carries other folders forward; prunes folders of deleted branches (default branch always kept)', async () => {
  const w = makeWorld();
  try {
    assert.equal((await publish(w, 'feature/x', good('feature/x'))).code, 0);
    const before = entriesOf(w).filter((e) => e.path.endsWith('.jpg') && e.path.startsWith(`${FX}/`));
    assert.equal((await publish(w, 'main', good('main'), { runId: 78 })).code, 0);
    assert.ok(tree(w).some((p) => p.startsWith(`${FX}/`)) && tree(w).some((p) => p.startsWith(`${FMAIN}/`)));
    const after = entriesOf(w).filter((e) => e.path.endsWith('.jpg') && e.path.startsWith(`${FX}/`));
    assert.deepEqual(after, before, 'carried screenshots are the same validated blobs');
    assert.match(show(w, 'README.md'), /`feature\/x`[\s\S]*`main`|`main`[\s\S]*`feature\/x`/);
    g(w.origin, 'branch', '-D', 'feature/x');
    assert.equal((await publish(w, 'main', good('main'), { runId: 79 })).code, 0);
    assert.equal(tree(w).some((p) => p.startsWith(`${FX}/`)), false, 'deleted branch pruned');
    assert.ok(tree(w).some((p) => p.startsWith(`${FMAIN}/`)));
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('branches whose names would collide get separate folders', async () => {
  const w = makeWorld();
  try {
    commitFile(w, 'feature-x', 'main', 'src/app.txt', 'v3\n');
    commitFile(w, 'Feature/X', 'main', 'src/app.txt', 'v4\n');
    for (const [i, b] of ['feature/x', 'feature-x', 'Feature/X'].entries()) assert.equal((await publish(w, b, good(b), { runId: 80 + i })).code, 0, b);
    const folders = new Set(tree(w).filter((p) => p.includes('/')).map((p) => p.split('/')[0]));
    assert.equal(folders.size, 3);
    for (const b of ['feature/x', 'feature-x', 'Feature/X']) assert.equal(JSON.parse(show(w, `${folderFor(b)}/meta.json`)).branch, b);
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('does not publish when the branch changed the screenshot harness', async () => {
  const w = makeWorld();
  try {
    const r = await publish(w, 'feature/h', good('feature/h'));
    assert.equal(r.code, 0, r.out);
    assert.match(r.summary, /Not published: `feature\/h`.*changes the screenshot harness \(scripts\/visual\/run\.ts\)/);
    assert.equal(resultsOid(w), null);
    assert.equal(r.seen.some((s) => s.path.includes('/artifacts')), false, 'artifact never even fetched');
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('stale publication: a moved branch or an older run never replaces newer results', async () => {
  const w = makeWorld();
  try {
    const old = w.sha['feature/x'];
    commitFile(w, 'feature/x', 'feature/x', 'src/app.txt', 'v5\n');
    let r = await publish(w, 'feature/x', good('feature/x'), { sha: old });
    assert.equal(r.code, 0, r.out);
    assert.match(r.summary, /Not published: .*moved on or was deleted/);
    assert.equal(resultsOid(w), null);
    assert.equal(r.seen.some((s) => s.path.includes('/artifacts')), false);

    assert.equal((await publish(w, 'feature/x', good('feature/x'), { runId: 90 })).code, 0);
    const published = resultsOid(w);
    r = await publish(w, 'feature/x', good('feature/x'), { runId: 89 });
    assert.equal(r.code, 0, r.out);
    assert.match(r.summary, /Not published: .*newer results \(run 90\)/);
    assert.equal(resultsOid(w), published, 'previous results intact');
    assert.equal(JSON.parse(show(w, `${FX}/meta.json`)).runId, '90');
    // A re-run attempt of the same run may republish.
    assert.equal((await publish(w, 'feature/x', good('feature/x'), { runId: 90 })).code, 0);
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('partial diagnostic runs stay artifact-only; carried folders that are no longer standard are dropped', async () => {
  const w = makeWorld();
  try {
    assert.equal((await publish(w, 'main', good('main'), { runId: 70 })).code, 0);
    const previous = resultsOid(w);
    const partial = (sha: string, id: number): Mock => ({ ...good('feature/x')(sha, id), zip: goodArtifact({ sha, branch: 'feature/x', widths: [390, 1280], routes: ['home'] }) });
    let r = await publish(w, 'feature/x', partial);
    assert.equal(r.code, 0, r.out);
    assert.match(r.summary, /Not published: .*not a complete standard capture \(widths 390,1280 are not the standard.*missing: discover/);
    assert.equal(resultsOid(w), previous, 'previous results intact');
    // A structurally valid main folder whose report lacks a keyboard check is not carried forward.
    const entries = entriesOf(w).map((e) => {
      if (e.path !== `${FMAIN}/report.json`) return e;
      const rep = JSON.parse(show(w, e.path));
      rep.keyboard[0].checks.pop();
      return { ...e, oid: '', data: JSON.stringify(rep) };
    });
    g(w.origin, 'tag', 'valid-results', 'visual-results');
    craftResults(w, entries.map((e: { mode: string; oid: string; path: string; data?: string }) => (e.oid ? { mode: e.mode, oid: e.oid, path: e.path } : { mode: e.mode, path: e.path, data: e.data })));
    r = await publish(w, 'feature/x', good('feature/x'));
    assert.equal(r.code, 0, r.out);
    assert.match(r.summary, new RegExp(`Dropped \`${FMAIN}\`: no longer a complete standard capture`));
    assert.equal(tree(w).some((p) => p.startsWith(`${FMAIN}/`)), false);
    assert.ok(tree(w).some((p) => p.startsWith(`${FX}/`)));
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('ineligible runs (unauthorized contributor, reserved branch) are not published', async () => {
  const w = makeWorld();
  try {
    let r = await publish(w, 'feature/x', (sha, id) => ({ ...good('feature/x')(sha, id), run: runFor(sha, 'feature/x', id, { actor: { login: 'drive-by' } }) }));
    assert.equal(r.code, 0, r.out);
    assert.match(r.summary, /Not published: .*not an authorized contributor/);
    r = await publish(w, 'feature/x', (sha, id) => ({ ...good('feature/x')(sha, id), run: runFor(sha, 'feature/x', id, { triggering_actor: { login: 'drive-by' } }) }));
    assert.match(r.summary, /run triggered by an account that is not an authorized contributor/);
    commitFile(w, 'gh-pages', 'main', 'index.html', 'x');
    r = await publish(w, 'gh-pages', good('gh-pages'));
    assert.match(r.summary, /not an eligible development branch/);
    assert.equal(resultsOid(w), null);
    assert.equal(r.seen.some((s) => s.path.includes('/artifacts')), false);
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('refuses malicious artifacts and untrusted runs, leaving previous results intact', async () => {
  const w = makeWorld();
  try {
    assert.equal((await publish(w, 'main', good('main'), { runId: 70 })).code, 0);
    const previous = resultsOid(w);
    const fx = good('feature/x');
    const sha = w.sha['feature/x'];
    const cases: [string, (sha: string, id: number) => Mock, RegExp][] = [
      ['symlink in artifact', (s, i) => ({ ...fx(s, i), zip: makeZip([{ name: '390/home.jpg', data: Buffer.from('/etc/passwd'), mode: 0o120777 }, { name: 'report.json', data: sampleReport({ sha }) }]) }), /symlink/],
      ['path traversal', (s, i) => ({ ...fx(s, i), zip: makeZip([{ name: '../../.github/workflows/x.yml', data: Buffer.from('on: push') }]) }), /unsafe path/],
      ['executable payload', (s, i) => ({ ...fx(s, i), zip: makeZip([...artifactEntries({ sha }).filter((e) => e.name !== 'states/menu-390.jpg'), { name: 'states/menu-390.jpg', data: Buffer.from('#!/bin/sh\necho pwned\n'.padEnd(300)) }]) }), /not a JPEG/],
      ['malformed zip', (s, i) => ({ ...fx(s, i), zip: Buffer.from('garbage'.repeat(10)) }), /end-of-central-directory|truncated/],
      ['hidden data between entries', (s, i) => ({ ...fx(s, i), zip: makeZip(artifactEntries({ sha }), { gapAfterFirst: Buffer.from('smuggled') }) }), /unaccounted data/],
      ['incomplete report', (s, i) => ({ ...fx(s, i), zip: makeZip(artifactEntries({ sha }).map((e) => (e.name === 'report.json' ? { ...e, data: sampleReport({ sha }, (j) => delete j.keyboard) } : e))) }), /keyboard/],
      ['report for another commit', (s, i) => ({ ...fx(s, i), zip: goodArtifact({ sha: 'c'.repeat(40) }) }), /commit does not match/],
      ['unreferenced screenshot', (s, i) => ({ ...fx(s, i), zip: makeZip([...artifactEntries({ sha }), { name: 'states/extra.jpg', data: fakeJpeg(390) }]) }), /not referenced/],
      ['pull_request run', (s, i) => ({ ...fx(s, i), run: runFor(s, 'feature/x', i, { event: 'pull_request' }) }), /not push/],
      ['fork run', (s, i) => ({ ...fx(s, i), run: runFor(s, 'feature/x', i, { head_repository: { full_name: 'attacker/r' } }) }), /fork/],
      ['other workflow', (s, i) => ({ ...fx(s, i), run: runFor(s, 'feature/x', i, { path: '.github/workflows/evil.yml' }) }), /workflow path/],
      ['artifact from another commit', (s, i) => ({ ...fx(s, i), artifacts: { artifacts: [{ id: 5, name: `visual-${s}`, size_in_bytes: 10, expired: false, workflow_run: { id: i, head_sha: 'c'.repeat(40) } }] } }), /another commit/],
      ['no artifact', (s, i) => ({ ...fx(s, i), artifacts: { artifacts: [] } }), /found 0/],
      ['wrong-width screenshot', (s, i) => ({ ...fx(s, i), zip: makeZip(artifactEntries({ sha }).map((e) => (e.name === '390/home.jpg' ? { ...e, data: fakeJpeg(1440) } : e))) }), /does not match folder/],
    ];
    for (const [label, mock, re] of cases) {
      const r = await publish(w, 'feature/x', mock);
      assert.equal(r.code, 1, `${label}: ${r.out}`);
      assert.match(r.out, re, label);
      assert.equal(r.out.includes(TOKEN), false, `${label}: token never printed`);
      assert.equal(resultsOid(w), previous, `${label}: previous results intact`);
    }
    const t = await publish(w, 'feature/x', fx, { trustedSha: 'd'.repeat(40) });
    assert.equal(t.code, 1);
    assert.match(t.out, /trusted checkout is not the workflow commit/);
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('existing results are untrusted: unexpected, non-regular or invalid content fails closed', async () => {
  const w = makeWorld();
  try {
    assert.equal((await publish(w, 'main', good('main'), { runId: 70 })).code, 0);
    g(w.origin, 'tag', 'valid-results', 'visual-results');
    const valid = entriesOf(w);
    const jpgOid = valid.find((e) => e.path.endsWith('.jpg'))!.oid;
    const metaPath = `${FMAIN}/meta.json`;
    const meta = JSON.parse(show(w, metaPath));
    const cases: [string, typeof valid, RegExp][] = [
      ['symlink', [...valid, { mode: '120000', oid: '', path: `${FMAIN}/states/link-390.jpg` }], /non-regular entry \(mode 120000\)/],
      ['executable file', valid.map((e) => (e.path.endsWith('home.jpg') ? { ...e, mode: '100755' } : e)), /non-regular entry \(mode 100755\)/],
      ['submodule (gitlink)', [...valid, { mode: '160000', oid: 'e'.repeat(40), path: `${FMAIN}/states/sub-390.jpg` }], /non-regular entry \(mode 160000\)/],
      ['.gitattributes', [...valid, { mode: '100644', oid: '', path: '.gitattributes' }], /unexpected path: "\.gitattributes"/],
      ['.gitmodules in a folder', [...valid, { mode: '100644', oid: '', path: `${FMAIN}/.gitmodules` }], /unexpected path/],
      ['stray folder (legacy layout)', [...valid, { mode: '100644', oid: jpgOid, path: 'visual-screenshot-harness/390/home.jpg' }], /unexpected path/],
      ['folder without meta.json', valid.filter((e) => e.path !== metaPath), /incomplete/],
      ['meta for another branch', valid.map((e) => (e.path === metaPath ? { ...e, oid: '', data: JSON.stringify({ ...meta, branch: 'feature/x' }) } : e)), /does not map to its folder/],
      ['tampered screenshot', valid.map((e) => (e.path.endsWith('/390/home.jpg') ? { ...e, oid: '', data: '<html>phish</html>'.padEnd(300) } : e)), /failed validation: not a JPEG/],
      ['tampered report', valid.map((e) => (e.path.endsWith('/report.json') ? { ...e, oid: '', data: '{"branch":"main"}' } : e)), /failed validation: report\.json/],
      ['orphan screenshot', [...valid, { mode: '100644', oid: jpgOid, path: `${FMAIN}/states/orphan-390.jpg` }], /not referenced/],
    ];
    for (const [label, entries, re] of cases) {
      const crafted = craftResults(
        w,
        entries.map((e: { mode: string; oid: string; path: string; data?: string }) => (e.oid ? { mode: e.mode, oid: e.oid, path: e.path } : { mode: e.mode, path: e.path, data: e.data ?? '/etc/passwd' })),
      );
      const r = await publish(w, 'feature/x', good('feature/x'));
      assert.equal(r.code, 1, `${label}: ${r.out}`);
      assert.match(r.out, re, label);
      assert.equal(resultsOid(w), crafted, `${label}: results branch left untouched`);
    }
    // A results branch that cannot be fetched is an error, not an empty branch.
    writeFileSync(join(w.origin, 'refs', 'heads', 'visual-results'), `${'1'.repeat(40)}\n`);
    const r = await publish(w, 'feature/x', good('feature/x'));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /cannot fetch visual-results/);
    assert.equal(resultsOid(w), '1'.repeat(40));
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});
