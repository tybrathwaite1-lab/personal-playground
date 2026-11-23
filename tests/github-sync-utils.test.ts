/**
 * M2-4: GitHub sync utilities (src/utils/github.ts) against mocked responses. Synthetic
 * credentials only; `fetch` is replaced for each call, so no request leaves the process.
 * (verifyRepo's privacy checks are covered in sync-safeguards.test.ts.)
 * R3: malformed replies (unreadable JSON, missing sha, unexpected structure) are typed errors.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseRepo, readRemote, sameConfig, saveConfig, SyncError, writeRemote, type SyncConfig } from '../src/utils/github.ts';
import { syncOnce } from '../src/utils/syncRun.ts';
import { EMPTY_META } from '../src/utils/sync.ts';
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

test('readRemote: a malformed reply is a typed error, never a raw exception (R3)', async () => {
  const good = wrapped(JSON.stringify(FILE));
  const cases: [string, () => Response][] = [
    ['HTML from a proxy', () => new Response('<html>proxy error</html>', { status: 200 })],
    ['empty body', () => new Response('', { status: 200 })],
    ['JSON null', () => json(null)],
    ['JSON array', () => json([{ sha: 's', content: good }])],
    ['JSON string', () => json('ok')],
    ['no sha', () => json({ content: good })],
    ['empty sha', () => json({ sha: '', content: good })],
    ['non-string sha', () => json({ sha: 42, content: good })],
  ];
  for (const [name, respond] of cases) {
    const { result } = await withFetch(respond, () => readRemote(CFG));
    assert.equal(result.ok, false, name);
    syncErr(result, 'network', /reply about the data file that couldn’t be read/);
  }
  // Content of the wrong type is unreadable content, as an empty one already was.
  const { result } = await withFetch(() => json({ sha: 's', content: 42 }), () => readRemote(CFG));
  syncErr(result, 'format', /too large or unreadable/);
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

test('writeRemote: a 2xx without a readable confirmation is a typed "not confirmed" error (R3)', async () => {
  const cases: [string, () => Response][] = [
    ['not JSON', () => new Response('not json', { status: 200 })],
    ['empty body', () => new Response('', { status: 201 })],
    ['JSON null', () => json(null)],
    ['JSON array', () => json([])],
    ['no content', () => json({})],
    ['content null', () => json({ content: null })],
    ['no sha', () => json({ content: {} })],
    ['empty sha', () => json({ content: { sha: '' } })],
    ['non-string sha', () => json({ content: { sha: 7 } })],
  ];
  for (const [name, respond] of cases) {
    const { result } = await withFetch(respond, () => writeRemote(CFG, FILE, 'sha'));
    assert.equal(result.ok, false, name);
    syncErr(result, 'network', /isn’t confirmed/);
  }
});

test('an unconfirmed write stops the round without applying anything, and is not retried as a conflict', async () => {
  let applied = 0;
  let writes = 0;
  const run = withFetch(
    () => {
      writes++;
      return new Response('<html>gateway</html>', { status: 200 });
    },
    () =>
      syncOnce(CFG, {
        verify: async () => undefined,
        read: async () => ({ file: null, sha: null }),
        write: (c, f, sha) => writeRemote(c, f, sha),
        getLocal: () => ({ entries: { 'fieldNotes:fn-1': { id: 'fn-1' } }, meta: { ...EMPTY_META, stamps: { 'fieldNotes:fn-1': 1 } }, version: 1 }),
        apply: () => (applied++, true),
        stillCurrent: () => true,
      }),
  );
  const { result } = await run;
  syncErr(result, 'network', /isn’t confirmed/);
  assert.equal(writes, 1, 'one write attempt; not looped as a conflict');
  assert.equal(applied, 0, 'local data is not replaced by an unconfirmed round');
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

test('parseRepo accepts the supported GitHub forms exactly (R4)', () => {
  for (const [input, want] of [
    ['octo/repo', { owner: 'octo', repo: 'repo' }],
    ['  octo/repo.name  ', { owner: 'octo', repo: 'repo.name' }],
    ['octo/repo/', { owner: 'octo', repo: 'repo' }],
    ['octo/repo.git', { owner: 'octo', repo: 'repo' }],
    ['Octo-Cat-2/My_Repo-1.x', { owner: 'Octo-Cat-2', repo: 'My_Repo-1.x' }],
    ['https://github.com/octo/repo', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo/', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo.git', { owner: 'octo', repo: 'repo' }],
    ['http://github.com/octo/repo', { owner: 'octo', repo: 'repo' }],
    ['https://www.github.com/octo/repo', { owner: 'octo', repo: 'repo' }],
    ['HTTPS://GitHub.com/octo/repo', { owner: 'octo', repo: 'repo' }],
    ['github.com/octo/repo', { owner: 'octo', repo: 'repo' }],
    ['git@github.com:octo/repo.git', { owner: 'octo', repo: 'repo' }],
    ['git@github.com:octo/repo', { owner: 'octo', repo: 'repo' }],
    ['a/b', { owner: 'a', repo: 'b' }],
    // Older GitHub accounts may end in or repeat a hyphen; they are still real accounts.
    ['octo-/repo', { owner: 'octo-', repo: 'repo' }],
    ['oc--to/repo', { owner: 'oc--to', repo: 'repo' }],
    [`${'a'.repeat(39)}/${'r'.repeat(100)}`, { owner: 'a'.repeat(39), repo: 'r'.repeat(100) }],
  ] as const)
    assert.deepEqual(parseRepo(input), want, input);
});

test('parseRepo rejects other hosts, extra path segments and ambiguous input instead of guessing (R4)', () => {
  const rejected = [
    // incomplete
    '', '   ', 'octo', 'octo/', '/repo', 'https://github.com/', 'https://github.com/octo', 'git@github.com:octo',
    // other hosts and look-alikes (before R4 these read as their last two path parts)
    'https://gitlab.example/octo/repo', 'gitlab.com/octo/repo', 'https://github.com.evil.example/octo/repo',
    'https://evil.example/github.com/octo/repo', 'https://notgithub.com/octo/repo', 'git@gitlab.com:octo/repo',
    'ftp://github.com/octo/repo', 'https://api.github.com/repos/octo/repo',
    // extra path, query, fragment, credentials, port
    'https://github.com/octo/repo/tree/main', 'https://github.com/octo/repo/issues', 'octo/repo/extra', 'octo/repo/extra/x?y',
    'https://github.com/octo/repo?tab=readme', 'https://github.com/octo/repo#readme', 'https://user:pw@github.com/octo/repo',
    'https://github.com:443/octo/repo', 'octo//repo',
    // ambiguous or invalid names (before R4, "oc to/repo" read as to/repo)
    'oc to/repo', 'octo/re po', 'octo /repo', 'octo/repo two', '-octo/repo', 'oc.to/repo', 'oc_to/repo',
    `${'a'.repeat(40)}/repo`, `octo/${'r'.repeat(101)}`, 'octo/.', 'octo/..', 'octo/.git', 'octo/re$po', 'octo/repo\nother/repo',
  ];
  for (const bad of rejected) assert.equal(parseRepo(bad), null, JSON.stringify(bad));
});

test('sameConfig compares every field', () => {
  assert.equal(sameConfig(CFG, { ...CFG }), true);
  assert.equal(sameConfig(CFG, { ...CFG, token: 'other' }), false);
  assert.equal(sameConfig(CFG, { ...CFG, path: 'x.json' }), false);
  assert.equal(sameConfig(CFG, null), false);
  assert.equal(sameConfig(null, null), false);
});
