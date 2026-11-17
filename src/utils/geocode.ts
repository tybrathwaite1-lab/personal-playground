/**
 * Turns place addresses into map coordinates using OpenStreetMap's free Nominatim
 * service, one request per second (their usage policy), cached on this device.
 * Only public business addresses are ever sent — never anything personal.
 */
import type { Place } from '../types';

export interface GeoResult {
  lat: number;
  lon: number;
  query: string;
  /** True when we only had a street/area/name, not a full address. */
  approximate: boolean;
}

const CACHE_KEY = 'personal-playground:geo';

type Cache = Record<string, GeoResult | null>;

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache;
  } catch {
    return {};
  }
}

function writeCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

const byName = (p: Place) => `${p.name.replace(/\s*\(.*?\)/g, '')}, ${p.city}, Florida`;

/**
 * The search for a place, or null if it can't sensibly be put on a map.
 * Full street addresses are searched as-is; partial ones search by name first
 * and fall back to the partial address.
 */
export function geocodeQuery(p: Place): { query: string; fallback?: string; approximate: boolean } | null {
  if (p.status === 'placeholder') return null;
  if (p.address) {
    const full = /^(\d+|one)\s/i.test(p.address.trim());
    const address = p.address
      .replace(/\s+(ste|suite|unit|#)\.?\s*[\w-]+/i, '')
      .replace(/Dr\. MLK Jr\. St/i, 'Dr. Martin Luther King Jr. St');
    return full
      ? { query: address, fallback: byName(p), approximate: false }
      : { query: byName(p), fallback: address, approximate: true };
  }
  if (/citywide|tampa bay/i.test(p.neighborhood)) return null;
  return { query: byName(p), approximate: true };
}

/** Coordinates already known for a place (from cache). `undefined` = not looked up yet. */
export function cachedCoords(p: Place): GeoResult | null | undefined {
  const q = geocodeQuery(p);
  if (!q) return null;
  const c = readCache()[q.query];
  return c === undefined ? undefined : c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Look up any places not yet cached. Calls `onProgress` after each one.
 * Stops early if `signal` aborts.
 */
export async function geocodePlaces(
  places: Place[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const cache = readCache();
  const todo = places
    .map((p) => ({ p, q: geocodeQuery(p) }))
    .filter((x): x is { p: Place; q: NonNullable<ReturnType<typeof geocodeQuery>> } => Boolean(x.q) && cache[x.q!.query] === undefined);
  const seen = new Set<string>();
  const unique = todo.filter((x) => (seen.has(x.q.query) ? false : (seen.add(x.q.query), true)));

  for (let i = 0; i < unique.length; i++) {
    if (signal.aborted) return;
    const { q } = unique[i];
    try {
      const params = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'us', q: q.query });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        let [hit] = (await res.json()) as { lat: string; lon: string }[];
        let approximate = q.approximate;
        if (!hit && q.fallback) {
          await sleep(1100);
          const alt = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'us', q: q.fallback });
          const r2 = await fetch(`https://nominatim.openstreetmap.org/search?${alt}`, { signal, headers: { Accept: 'application/json' } });
          if (r2.ok) [hit] = (await r2.json()) as { lat: string; lon: string }[];
          approximate = true;
        }
        cache[q.query] = hit ? { lat: Number(hit.lat), lon: Number(hit.lon), query: q.query, approximate } : null;
        writeCache(cache);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    onProgress(i + 1, unique.length);
    if (i < unique.length - 1) await sleep(1100);
  }
}

export function forgetGeocodes() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
