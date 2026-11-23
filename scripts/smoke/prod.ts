/**
 * Production smoke check: fetches the live GitHub Pages site and verifies it is
 * actually serving a working build. Read-only, public URLs only, no credentials.
 *
 *   npx tsx scripts/smoke/prod.ts <base-url> [--expect-commit <sha>] [--max-age-hours 36]
 *
 * Exits non-zero on failure. Used after every deploy (deploy.yml) and as an
 * informational step on branch checks (check.yml).
 *
 * Bounded (R2): every request, body included, must finish within REQUEST_MS (with up to two
 * retries), and the process exits explicitly once the results are reported. Two earlier
 * production runs printed "passed" and then stayed alive for ~10 minutes, most likely held by
 * connections whose bodies were never read; every body is now read, and anything still open
 * at exit is logged.
 */
import type { PulseEvent, PulseFile } from '../../src/types/pulse';

const failures: string[] = [];
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
};

let base = '';

/** Upper bound for one request, body included. */
export const REQUEST_MS = 30_000;

export interface Fetched {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * GETs `url` and reads the whole body within `timeoutMs`, retrying failures and non-2xx
 * answers (Pages can take a moment to propagate). A body that stalls counts as a failed
 * attempt, so "loads" means the file actually arrived.
 */
export async function fetchFull(url: string, { attempts = 3, timeoutMs = REQUEST_MS, retryDelayMs = 5000 } = {}): Promise<Fetched> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'personal-playground-smoke' }, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text(); // read fully (under the same deadline) so no connection is left half-read
      if (res.ok || i >= attempts) return { ok: res.ok, status: res.status, text };
    } catch (e) {
      if (i >= attempts) {
        const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
        throw new Error(timedOut ? `${url} did not finish within ${timeoutMs / 1000}s (${attempts} attempts)` : `${url}: ${e instanceof Error ? e.message : e}`);
      }
    }
    await new Promise((r) => setTimeout(r, retryDelayMs * i));
  }
}

const get = (path: string, attempts = 3) => fetchFull(new URL(path, base).toString(), { attempts });

/** Parses JSON, recording a failure (and returning null) when it isn't. */
function json<T>(what: string, r: Fetched): T | null {
  try {
    return JSON.parse(r.text) as T;
  } catch {
    fail(`${what} is not valid JSON`);
    return null;
  }
}

/** Pure checks on pulse.json, exported for tests. */
export function checkPulse(p: PulseFile, now = Date.now(), maxAge = 36): string[] {
  const errs: string[] = [];
  if (!Array.isArray(p.events) || !Array.isArray(p.sources)) return ['pulse.json has no events/sources arrays'];
  const age = (now - Date.parse(p.generatedAt)) / 3_600_000;
  if (!(age >= -1 && age <= maxAge)) errs.push(`pulse.json is ${Number.isFinite(age) ? age.toFixed(1) + 'h' : 'of unknown'} old (max ${maxAge}h)`);
  if (!p.sources.some((s) => s.ok)) errs.push('no Pulse source succeeded');
  const ids = new Set<string>();
  for (const e of p.events as (PulseEvent & { priceMin?: number; priceMax?: number })[]) {
    if (ids.has(e.id)) errs.push(`duplicate event id ${e.id}`);
    ids.add(e.id);
    if (Number.isNaN(Date.parse(e.start))) errs.push(`bad start on ${e.id}`);
    if (e.free && ((e.priceMin ?? 0) > 0 || (e.priceMax ?? 0) > 0)) errs.push(`${e.id} is free but has an amount`);
    if (e.priceMax !== undefined && (e.priceMin === undefined || e.priceMin > e.priceMax)) errs.push(`${e.id} has an inconsistent price range`);
  }
  return errs;
}

async function main() {
  const args = process.argv.slice(2);
  base = (args.find((a) => !a.startsWith('--')) ?? '').replace(/\/?$/, '/');
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const expectCommit = flag('--expect-commit');
  const maxAgeHours = Number(flag('--max-age-hours') ?? 36);
  if (!/^https:\/\//.test(base)) {
    console.error('Usage: prod.ts <https base url> [--expect-commit sha] [--max-age-hours 36]');
    process.exit(2);
  }
  console.log(`Smoke check: ${base}`);
  const home = await get('');
  if (!home.ok) return fail(`home page HTTP ${home.status}`);
  const html = home.text;
  if (html.includes('id="root"')) ok('home page serves the app shell');
  else fail('home page has no app root');
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  if (!scripts.length) fail('no script bundle referenced');
  for (const s of scripts) {
    const r = await get(s);
    if (r.ok) ok(`bundle ${s.split('/').pop()} loads`);
    else fail(`bundle ${s} HTTP ${r.status}`);
  }

  for (const path of ['sw.js', 'manifest.webmanifest']) {
    const r = await get(path);
    if (r.ok) ok(`${path} loads`);
    else fail(`${path} HTTP ${r.status}`);
  }

  const ver = await get('version.json', 1);
  const v = ver.ok ? json<{ commit?: string; builtAt?: string }>('version.json', ver) : null;
  if (v) {
    console.log(`  · deployed commit ${v.commit?.slice(0, 7)} built ${v.builtAt}`);
    if (expectCommit) {
      if (v.commit === expectCommit) ok('deployed commit matches');
      else fail(`deployed ${v.commit} ≠ expected ${expectCommit}`);
    }
  } else if (ver.ok) return; // not valid JSON (already reported)
  else if (expectCommit) fail('version.json missing, cannot confirm the deployed commit');
  else console.log('  · no version.json (deployed before build stamping existed)');

  const pr = await get('data/pulse.json');
  if (!pr.ok) return fail(`pulse.json HTTP ${pr.status}`);
  const pulse = json<PulseFile>('pulse.json', pr);
  if (!pulse) return;
  const errs = checkPulse(pulse, Date.now(), maxAgeHours);
  errs.forEach(fail);
  const withRange = pulse.events.filter((e) => typeof (e as { priceMin?: number }).priceMin === 'number').length;
  const multi = pulse.events.filter((e) => e.sourceIds.length > 1).length;
  console.log(
    `  · Pulse: ${pulse.events.length} events, ${pulse.sources.filter((s) => s.ok).length}/${pulse.sources.length} sources ok, generated ${pulse.generatedAt}; ${withRange} with structured prices; ${multi} merged from 2+ sources`,
  );
  if (!errs.length) ok('pulse.json is fresh and consistent');
}

const isMain = process.argv[1]?.endsWith('prod.ts');
if (isMain) {
  main()
    .catch((e) => fail(`unexpected error: ${e instanceof Error ? e.message : e}`))
    .finally(() => {
      // Anything still open here would keep Node alive after the result is known; log it, then exit.
      const open = process.getActiveResourcesInfo().filter((r) => r !== 'TTYWrap');
      if (open.length) console.log(`  · still open at exit (closed by exiting): ${open.join(', ')}`);
      if (failures.length) console.log(`\n${failures.length} smoke check(s) failed.`);
      else console.log('\nProduction smoke check passed.');
      process.exit(failures.length ? 1 : 0);
    });
}
