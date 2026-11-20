/**
 * M2-4: GitHub sync utilities (src/utils/github.ts) against mocked responses. Synthetic
 * credentials only; `fetch` is replaced for each call, so no request leaves the process.
 * (verifyRepo's privacy checks are covered in sync-safeguards.test.ts.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseRepo, readRemote, sameConfig, saveConfig, SyncError, writeRemote, type SyncConfig } from '../src/utils/github.ts';
import type { RemoteFile } from '../src/utils/sync.ts';
import { MemoryStorage, withStorage } from './helpers/memory-storage.ts';

const TOKEN = 'github_pat_SYNTHETIC_TEST_TOKEN_0000';
const CFG: SyncConfig = { owner: 'octo-test', repo: 'playground-data', path: 'playground-data.json', token: TOKEN };
const FILE: RemoteFile = {
  app: 'personal-playground',
  format: 1,
  updatedAt: '2026-11-19T12:00:00.000Z',
  entries: { 'fieldNotes:fn-1': { id: 'fn-1', title: 'Café ☕ — São Paulo, 東京, emoji 🎉, RTL שלום', notes: 'line1\nline2 "quoted" \\ backslash' } },
  meta: { stamps: { 'fieldNotes:fn-1': 1 }, tombs: {} },
} as unknown as RemoteFile;

type Seen = { url: string; init: RequestInit };
/** Runs `fn` with fetch answering from `respond`; returns what fn returned/threw plus the requests. */
async function withFetch<T>(respond: (req: Seen) => Response | Promise<Response>, fn: () => Promise<T>) {
  const real = globalThis.fetch;
  const seen: Seen[] = [];
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
    const req = { url: String(url), init };
    seen.push(req);
    return respond(req);
  }) as typeof fetch;
  try {
    return { result: await fn().then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e })), seen };
  } finally {
    globalThis.fetch = real;
  }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
/** GitHub wraps base64 content at 60 characters. */
const wrapped = (s: string) => b64(s).replace(/(.{60})/g, '$1\n');
const syncErr = (r: { ok: boolean; e?: unknown }, kind: SyncError['kind'], msg?: RegExp) => {
  assert.equal(r.ok, false, 'must fail');
  assert.ok(r.e instanceof SyncError, `expected a SyncError, got ${String(r.e)}`);
  assert.equal(r.e.kind, kind);
  if (msg) assert.match(r.e.message, msg);
};

// ─── readRemote ──────────────────────────────────────────────────────

test('readRemote: decodes GitHub base64 (wrapped, Unicode) and returns the file and its sha', async () => {
  const { result, seen } = await withFetch(() => json({ sha: 'abc123', content: wrapped(JSON.stringify(FILE)) }), () => readRemote(CFG));
  assert.ok(result.ok);
  assert.deepEqual(result.v, { file: FILE, sha: 'abc123' });
  // One GET to the contents API, token only in the Authorization header, never cached.
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://api.github.com/repos/octo-test/playground-data/contents/playground-data.json');
  assert.equal(seen[0].init.method ?? 'GET', 'GET');
  assert.equal(seen[0].init.cache, 'no-store');
  const h = seen[0].init.headers as Record<string, string>;
  assert.equal(h.Authorization, `Bearer ${TOKEN}`);
  assert.equal(h.Accept, 'application/vnd.github+json');
  assert.equal(h['X-GitHub-Api-Version'], '2022-11-28');
  assert.ok(!seen[0].url.includes(TOKEN));
});

test('readRemote: a missing file (404) is "no remote yet", not an error', async () => {
  const { result } = await withFetch(() => json({ message: 'Not Found' }, 404), () => readRemote(CFG));
  assert.ok(result.ok);
  assert.deepEqual(result.v, { file: null, sha: null });
});

test('readRemote: authorization, permission and server failures become typed SyncErrors', async () => {
  const cases: [number, SyncError['kind'], RegExp][] = [
    [401, 'auth', /rejected the token/],
    [403, 'auth', /permission to read the data file/],
    [409, 'conflict', /changed on GitHub/],
    [422, 'conflict', /changed on GitHub/],
    [500, 'network', /GitHub returned an error \(500\)/],
    [503, 'network', /\(503\)/],
  ];
  for (const [status, kind, msg] of cases) {
    const { result } = await withFetch(() => json({ message: 'x' }, status), () => readRemote(CFG));
    syncErr(result, kind, msg);
  }
});

test('readRemote: network failures become a "network" SyncError', async () => {
  const { result } = await withFetch(() => {
    throw new TypeError('Failed to fetch');
  }, () => readRemote(CFG));
  syncErr(result, 'network', /Couldn’t reach GitHub/);
});

test('readRemote: unreadable or foreign file content is a "format" error', async () => {
  const cases: [string, unknown, RegExp][] = [
    ['no content (file over 1 MB)', { sha: 's', content: '', encoding: 'none' }, /too large or unreadable/],
    ['content missing', { sha: 's' }, /too large or unreadable/],
    ['invalid base64', { sha: 's', content: '!!!not base64!!!' }, /isn’t valid JSON/],
    ['base64 of non-JSON', { sha: 's', content: b64('hello') }, /isn’t valid JSON/],
    ['JSON, not a sync file', { sha: 's', content: b64(JSON.stringify({ app: 'something-else' })) }, /isn’t a Personal Playground sync file/],
    ['wrong format version', { sha: 's', content: b64(JSON.stringify({ ...FILE, format: 2 })) }, /isn’t a Personal Playground sync file/],
    ['sync file without meta', { sha: 's', content: b64(JSON.stringify({ ...FILE, meta: undefined })) }, /isn’t a Personal Playground sync file/],
  ];
  for (const [name, body, msg] of cases) {
    const { result } = await withFetch(() => json(body), () => readRemote(CFG));
    assert.equal(result.ok, false, name);
    syncErr(result, 'format', msg);
  }
});

test('characterization (defect): a malformed 200 response escapes as a raw error, not a SyncError', async () => {
  // readRemote parses the response body outside its try/catch. Sync still stops (nothing is
  // written), but the user sees the raw parser message instead of a typed, explained error.
  const html = await withFetch(() => new Response('<html>proxy error</html>', { status: 200 }), () => readRemote(CFG));
  assert.equal(html.result.ok, false);
  assert.ok(html.result.ok === false && html.result.e instanceof SyntaxError && !(html.result.e instanceof SyncError));
  const nul = await withFetch(() => json(null), () => readRemote(CFG));
  assert.ok(nul.result.ok === false && nul.result.e instanceof TypeError);
});

// ─── writeRemote ─────────────────────────────────────────────────────

test('writeRemote: PUTs base64 JSON that round-trips Unicode, with the expected sha; returns the new sha', async () => {
  const { result, seen } = await withFetch(() => json({ content: { sha: 'new-sha' } }, 200), () => writeRemote(CFG, FILE, 'old-sha'));
  assert.ok(result.ok);
  assert.equal(result.v, 'new-sha');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://api.github.com/repos/octo-test/playground-data/contents/playground-data.json');
  assert.equal(seen[0].init.method, 'PUT');
  const h = seen[0].init.headers as Record<string, string>;
  assert.equal(h.Authorization, `Bearer ${TOKEN}`);
  assert.equal(h['Content-Type'], 'application/json');
  const body = JSON.parse(String(seen[0].init.body));
  assert.equal(body.sha, 'old-sha', 'the sha the write is based on (GitHub rejects it if stale)');
  assert.match(body.message, /^Sync \d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')), FILE);
  assert.ok(!String(seen[0].init.body).includes(TOKEN), 'the token is never in the body');
});

test('writeRemote: creating the file sends no sha', async () => {
  const { result, seen } = await withFetch(() => json({ content: { sha: 'first' } }, 201), () => writeRemote(CFG, FILE, null));
  assert.ok(result.ok && result.v === 'first');
  assert.equal('sha' in JSON.parse(String(seen[0].init.body)), false);
});

test('writeRemote: stale sha and concurrent writes are conflicts (so sync merges again)', async () => {
  for (const status of [409, 422]) {
    const { result } = await withFetch(() => json({ message: 'sha does not match' }, status), () => writeRemote(CFG, FILE, 'stale'));
    syncErr(result, 'conflict');
  }
});

test('writeRemote: authorization, missing repo, server and network failures are typed', async () => {
  const cases: [number, SyncError['kind'], RegExp][] = [
    [401, 'auth', /rejected the token/],
    [403, 'auth', /permission to write the data file/],
    [404, 'notfound', /Repository not found/],
    [500, 'network', /\(500\)/],
  ];
  for (const [status, kind, msg] of cases) {
    const { result } = await withFetch(() => json({ message: 'x' }, status), () => writeRemote(CFG, FILE, 'sha'));
    syncErr(result, kind, msg);
  }
  const offline = await withFetch(() => Promise.reject(new TypeError('Failed to fetch')), () => writeRemote(CFG, FILE, 'sha'));
  syncErr(offline.result, 'network');
});

test('characterization (defect): a successful write with an unreadable response reports failure', async () => {
  // The file was written, but parsing the confirmation throws a raw SyntaxError, so this round
  // reports an error; the next sync reconciles. A missing sha in the reply returns ''.
  const bad = await withFetch(() => new Response('not json', { status: 200 }), () => writeRemote(CFG, FILE, 'sha'));
  assert.ok(bad.result.ok === false && bad.result.e instanceof SyntaxError);
  const noSha = await withFetch(() => json({}), () => writeRemote(CFG, FILE, 'sha'));
  assert.ok(noSha.result.ok && noSha.result.v === '');
});

// ─── Configuration ───────────────────────────────────────────────────

const KEY = 'personal-playground:sync-config';

test('loadConfig: valid config loads; the path defaults; missing or malformed config is null', async () => {
  await withStorage(new MemoryStorage(), (s) => {
    assert.equal(loadConfig(), null, 'nothing stored');
    s!.setItem(KEY, JSON.stringify({ owner: 'o', repo: 'r', token: TOKEN }));
    assert.deepEqual(loadConfig(), { owner: 'o', repo: 'r', token: TOKEN, path: 'playground-data.json' });
    s!.setItem(KEY, JSON.stringify(CFG));
    assert.deepEqual(loadConfig(), CFG);
    for (const bad of ['{not json', 'null', '[]', '"string"', '42', JSON.stringify({ owner: 'o', repo: 'r' }), JSON.stringify({ owner: '', repo: 'r', token: TOKEN }), JSON.stringify({ repo: 'r', token: TOKEN })]) {
      s!.setItem(KEY, bad);
      assert.equal(loadConfig(), null, bad);
    }
  });
});

test('characterization: loadConfig checks presence, not types', async () => {
  // Truthy non-string fields pass. Every value later goes into an encoded URL or a header, so
  // this produces a failing request rather than a security problem; noted, not changed.
  await withStorage(new MemoryStorage(), (s) => {
    s!.setItem(KEY, JSON.stringify({ owner: 1, repo: true, token: ['x'] }));
    assert.deepEqual(loadConfig(), { owner: 1, repo: true, token: ['x'], path: 'playground-data.json' });
  });
});

test('loadConfig / saveConfig when storage is unavailable or failing: no throw, nothing persisted', async () => {
  await withStorage('unavailable', () => {
    assert.equal(loadConfig(), null);
    assert.doesNotThrow(() => saveConfig(CFG));
    assert.doesNotThrow(() => saveConfig(null));
  });
  const s = new MemoryStorage();
  await withStorage(s, () => {
    s.failWrites = true;
    saveConfig(CFG);
    assert.equal(s.data.has(KEY), false, 'a failed save is silent: sync stays connected for this session only');
    s.failWrites = false;
    saveConfig(CFG);
    assert.deepEqual(JSON.parse(s.data.get(KEY)!), CFG);
    saveConfig(null);
    assert.equal(s.data.has(KEY), false, 'disconnect removes the token');
    s.failReads = true;
    assert.equal(loadConfig(), null);
  });
});

test('parseRepo and sameConfig', () => {
  for (const [input, want] of [
    ['octo/repo', { owner: 'octo', repo: 'repo' }],
    ['  octo/repo.name  ', { owner: 'octo', repo: 'repo.name' }],
    ['https://github.com/octo/repo', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo/', { owner: 'octo', repo: 'repo' }],
    ['git@github.com:octo/repo.git', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo.git', { owner: 'octo', repo: 'repo' }],
  ] as const)
    assert.deepEqual(parseRepo(input), want, input);
  for (const bad of ['', 'octo', 'octo/', '/repo', 'octo/re po', 'octo/repo/extra/x?y'])
    assert.equal(parseRepo(bad), null, bad);
  // Characterization (minor): the pattern isn't anchored at the start, so leading text is
  // ignored — "oc to/repo" reads as to/repo and a non-GitHub URL reads as its last two parts.
  // verifyRepo still has to confirm a private repo the token can write before anything syncs.
  assert.deepEqual(parseRepo('oc to/repo'), { owner: 'to', repo: 'repo' });
  assert.deepEqual(parseRepo('https://gitlab.example/octo/repo'), { owner: 'octo', repo: 'repo' });
  assert.equal(sameConfig(CFG, { ...CFG }), true);
  assert.equal(sameConfig(CFG, { ...CFG, token: 'other' }), false);
  assert.equal(sameConfig(CFG, { ...CFG, path: 'x.json' }), false);
  assert.equal(sameConfig(CFG, null), false);
  assert.equal(sameConfig(null, null), false);
});
