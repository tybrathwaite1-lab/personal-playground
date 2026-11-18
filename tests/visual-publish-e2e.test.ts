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
import { goodArtifact, makeZip, fakeJpeg, sampleReport } from './helpers/zipBuilder.ts';

const PUBLISH = fileURLToPath(new URL('../scripts/visual/publish/publish.mjs', import.meta.url));
const TOKEN = 'ghs_TESTTOKEN_must_never_be_printed';
const g = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

interface World {
  dir: string;
  origin: string;
  trusted: string;
  sha: Record<string, string>;
}

/** origin (bare) with main, feature/x (app change only) and feature/h (harness change). */
function makeWorld(): World {
  const dir = mkdtempSync(join(tmpdir(), 'pp-publish-e2e-'));
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  g(dir, 'init', '--quiet', '--bare', '-b', 'main', origin);
  g(dir, 'init', '--quiet', '-b', 'main', work);
  g(work, 'config', 'user.email', 't@example.org');
  g(work, 'config', 'user.name', 'Test');
  const write = (p: string, s: string) => {
    mkdirSync(dirname(join(work, p)), { recursive: true });
    writeFileSync(join(work, p), s);
  };
  write('.github/workflows/visual.yml', 'name: Visual check\n');
  write('scripts/visual/run.ts', '// harness\n');
  write('scripts/visual/selftest.ts', '// selftest\n');
  write('tests/fixtures/visual/pulse.json', '{}\n');
  write('src/app.txt', 'v1\n');
  g(work, 'add', '-A');
  g(work, 'commit', '--quiet', '-m', 'main');
  g(work, 'push', '--quiet', origin, 'main');
  const sha: Record<string, string> = { main: g(work, 'rev-parse', 'HEAD') };
  g(work, 'checkout', '--quiet', '-b', 'feature/x');
  write('src/app.txt', 'v2\n');
  g(work, 'commit', '--quiet', '-am', 'app change');
  g(work, 'push', '--quiet', origin, 'feature/x');
  sha['feature/x'] = g(work, 'rev-parse', 'HEAD');
  g(work, 'checkout', '--quiet', '-b', 'feature/h', 'main');
  write('scripts/visual/run.ts', '// harness changed on a branch\n');
  g(work, 'commit', '--quiet', '-am', 'harness change');
  g(work, 'push', '--quiet', origin, 'feature/h');
  sha['feature/h'] = g(work, 'rev-parse', 'HEAD');
  const trusted = join(dir, 'trusted');
  g(dir, 'clone', '--quiet', '--depth=1', '--branch', 'main', `file://${origin}`, trusted);
  return { dir, origin, trusted, sha };
}

interface Mock {
  run: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  zip: Buffer;
}

async function publish(w: World, branch: string, mock: (sha: string) => Mock) {
  const sha = w.sha[branch];
  const m = mock(sha);
  const seen: { path: string; auth: boolean }[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const path = (req.url ?? '').split('?')[0];
    seen.push({ path, auth: Boolean(req.headers.authorization) });
    const json = (o: unknown) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
    if (path === '/repos/o/r/actions/runs/77') return json(m.run);
    if (path === '/repos/o/r/actions/runs/77/artifacts') return json(m.artifacts);
    if (path === '/repos/o/r/actions/artifacts/5/zip') return res.writeHead(302, { Location: `http://127.0.0.1:${(server.address() as { port: number }).port}/blob/a.zip?sig=x` }).end();
    if (path === '/blob/a.zip') return res.writeHead(200, { 'Content-Type': 'application/zip' }).end(m.zip);
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  const port = (server.address() as { port: number }).port;
  const summaryFile = join(w.dir, `summary-${Date.now()}.md`);
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
          RUN_ID: '77',
          HEAD_SHA: sha,
          HEAD_BRANCH: branch,
          DEFAULT_BRANCH: 'main',
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

const runFor = (sha: string, branch: string, patch: Record<string, unknown> = {}) => ({
  id: 77,
  name: 'Visual check',
  path: '.github/workflows/visual.yml',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  head_sha: sha,
  head_branch: branch,
  repository: { full_name: 'o/r' },
  head_repository: { full_name: 'o/r' },
  ...patch,
});
const artifactsFor = (sha: string) => ({ artifacts: [{ id: 5, name: `visual-${sha}`, size_in_bytes: 1000, expired: false, workflow_run: { id: 77, head_sha: sha } }] });
const good = (branch: string) => (sha: string): Mock => ({ run: runFor(sha, branch), artifacts: artifactsFor(sha), zip: goodArtifact() });
const tree = (w: World) => g(w.origin, 'ls-tree', '-r', '--name-only', 'visual-results').split('\n').sort();
const hasResults = (w: World) => {
  try {
    g(w.origin, 'rev-parse', '--verify', '--quiet', 'refs/heads/visual-results');
    return true;
  } catch {
    return false;
  }
};

test('publishes a valid artifact: validated files, regenerated report, parentless commit, no credentials to storage', async () => {
  const w = makeWorld();
  try {
    const r = await publish(w, 'feature/x', good('feature/x'));
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(tree(w), [
      'README.md',
      'feature-x/390/home-fold.jpg',
      'feature-x/390/home.jpg',
      'feature-x/REPORT.md',
      'feature-x/report.json',
      'feature-x/states/menu-390.jpg',
    ]);
    const report = g(w.origin, 'show', 'visual-results:feature-x/REPORT.md');
    assert.match(report, /Published by the reviewed `visual-publish` workflow/);
    assert.equal(/phish|onerror|evil\.example/.test(report), false, 'branch-authored REPORT.md never published');
    assert.equal(g(w.origin, 'rev-list', '--parents', '-n1', 'visual-results').split(' ').length, 1, 'single parentless commit');
    assert.ok(r.seen.filter((s) => s.path.startsWith('/repos/')).every((s) => s.auth), 'API calls authenticated');
    const blob = r.seen.filter((s) => s.path.startsWith('/blob/'));
    assert.equal(blob.length, 1, 'artifact fetched from storage exactly once');
    assert.equal(blob[0].auth, false, 'no credentials sent to artifact storage');
    assert.equal(r.out.includes(TOKEN) || r.summary.includes(TOKEN), false, 'token never printed');
    assert.match(r.summary, /Published `feature-x`/);
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('keeps other folders, and prunes folders of deleted branches (default branch always kept)', async () => {
  const w = makeWorld();
  try {
    assert.equal((await publish(w, 'feature/x', good('feature/x'))).code, 0);
    assert.equal((await publish(w, 'main', good('main'))).code, 0);
    assert.ok(tree(w).some((p) => p.startsWith('feature-x/')) && tree(w).some((p) => p.startsWith('main/')));
    g(w.origin, 'branch', '-D', 'feature/x');
    assert.equal((await publish(w, 'main', good('main'))).code, 0);
    assert.equal(tree(w).some((p) => p.startsWith('feature-x/')), false, 'deleted branch pruned');
    assert.ok(tree(w).some((p) => p.startsWith('main/')));
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('does not publish when the branch changed the screenshot harness', async () => {
  const w = makeWorld();
  try {
    const r = await publish(w, 'feature/h', good('feature/h'));
    assert.equal(r.code, 0, r.out);
    assert.match(r.summary, /Not published: `feature-h`.*scripts\/visual\/run\.ts/);
    assert.equal(hasResults(w), false);
    assert.equal(r.seen.some((s) => s.path.includes('/artifacts')), false, 'artifact never even fetched');
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('refuses malicious artifacts and untrusted runs without writing anything', async () => {
  const w = makeWorld();
  try {
    const cases: [string, (sha: string) => Mock, RegExp][] = [
      ['symlink in artifact', (sha) => ({ ...good('feature/x')(sha), zip: makeZip([{ name: '390/home.jpg', data: Buffer.from('/etc/passwd'), mode: 0o120777 }, { name: 'report.json', data: sampleReport() }]) }), /symlink/],
      ['path traversal', (sha) => ({ ...good('feature/x')(sha), zip: makeZip([{ name: '../../.github/workflows/x.yml', data: Buffer.from('on: push') }]) }), /unsafe path/],
      ['executable payload', (sha) => ({ ...good('feature/x')(sha), zip: makeZip([{ name: 'states/a.jpg', data: Buffer.from('#!/bin/sh\necho pwned\n'.padEnd(300)) }, { name: 'report.json', data: sampleReport() }]) }), /not a JPEG/],
      ['malformed zip', (sha) => ({ ...good('feature/x')(sha), zip: Buffer.from('garbage'.repeat(10)) }), /end-of-central-directory|truncated/],
      ['pull_request run', (sha) => ({ ...good('feature/x')(sha), run: runFor(sha, 'feature/x', { event: 'pull_request' }) }), /not push/],
      ['fork run', (sha) => ({ ...good('feature/x')(sha), run: runFor(sha, 'feature/x', { head_repository: { full_name: 'attacker/r' } }) }), /fork/],
      ['other workflow', (sha) => ({ ...good('feature/x')(sha), run: runFor(sha, 'feature/x', { path: '.github/workflows/evil.yml' }) }), /workflow path/],
      ['artifact from another commit', (sha) => ({ ...good('feature/x')(sha), artifacts: { artifacts: [{ id: 5, name: `visual-${sha}`, size_in_bytes: 10, expired: false, workflow_run: { id: 77, head_sha: 'c'.repeat(40) } }] } }), /another commit/],
      ['no artifact', (sha) => ({ ...good('feature/x')(sha), artifacts: { artifacts: [] } }), /found 0/],
      ['wrong-width screenshot', (sha) => ({ ...good('feature/x')(sha), zip: makeZip([{ name: '390/home.jpg', data: fakeJpeg(1440) }, { name: 'report.json', data: sampleReport() }]) }), /does not match folder/],
    ];
    for (const [label, mock, re] of cases) {
      const r = await publish(w, 'feature/x', mock);
      assert.equal(r.code, 1, `${label}: ${r.out}`);
      assert.match(r.out, re, label);
      assert.equal(r.out.includes(TOKEN), false, `${label}: token never printed`);
      assert.equal(hasResults(w), false, `${label}: nothing written`);
    }
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});
