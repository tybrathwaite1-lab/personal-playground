/**
 * R2: the production smoke check's requests are bounded and read in full. Served by a local
 * HTTP server on 127.0.0.1 only (no external network); short timeouts keep the tests fast.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { fetchFull } from '../scripts/smoke/prod.ts';

/** Starts a server whose handler gets the request count; returns its URL and a closer. */
async function serve(handler: (res: ServerResponse, n: number) => void): Promise<{ url: string; close: () => Promise<void> }> {
  let n = 0;
  const server: Server = createServer((_req, res) => handler(res, ++n));
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/file`;
  return {
    url,
    close: () =>
      new Promise((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      }),
  };
}

const quick = { attempts: 2, timeoutMs: 300, retryDelayMs: 10 };

test('a complete response is read in full', async () => {
  const body = 'x'.repeat(1_000_000);
  const s = await serve((res) => res.end(body));
  try {
    assert.deepEqual(await fetchFull(s.url, quick), { ok: true, status: 200, text: body });
  } finally {
    await s.close();
  }
});

test('a failed answer is retried, and the retry counts', async () => {
  const s = await serve((res, n) => (n === 1 ? res.writeHead(503).end('busy') : res.end('ok')));
  try {
    assert.deepEqual(await fetchFull(s.url, quick), { ok: true, status: 200, text: 'ok' });
  } finally {
    await s.close();
  }
});

test('a non-2xx answer on the last attempt is returned for the caller to report', async () => {
  const s = await serve((res) => res.writeHead(404).end('missing'));
  try {
    assert.deepEqual(await fetchFull(s.url, quick), { ok: false, status: 404, text: 'missing' });
  } finally {
    await s.close();
  }
});

test('a body that stalls after its headers fails within the deadline instead of passing as "loads"', async () => {
  // Headers and a first chunk, then nothing: before R2 the check passed on headers alone.
  const s = await serve((res) => {
    res.writeHead(200, { 'content-length': '1000000' });
    res.write('x'.repeat(1000));
  });
  const started = Date.now();
  try {
    await assert.rejects(fetchFull(s.url, quick), /did not finish within 0\.3s \(2 attempts\)/);
    assert.ok(Date.now() - started < 3000, `bounded (${Date.now() - started} ms)`);
  } finally {
    await s.close();
  }
});

test('a server that never answers fails within the deadline', async () => {
  const s = await serve(() => undefined);
  const started = Date.now();
  try {
    await assert.rejects(fetchFull(s.url, quick), /did not finish within/);
    assert.ok(Date.now() - started < 3000, `bounded (${Date.now() - started} ms)`);
  } finally {
    await s.close();
  }
});

test('the smoke script reads every response through fetchFull and exits explicitly with the result', () => {
  const src = readFileSync('scripts/smoke/prod.ts', 'utf8');
  assert.equal((src.match(/await fetch\(/g) ?? []).length, 1, 'one fetch call, inside fetchFull');
  assert.ok(!/\.json\(\)|await \w+\.text\(\)/.test(src.replace(/const text = await res\.text\(\);/, '')), 'no unbounded body reads outside fetchFull');
  assert.match(src, /signal: AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(src, /process\.exit\(failures\.length \? 1 : 0\);/);
});
