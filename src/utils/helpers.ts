import type { Place } from '../types';

export function uid(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function mapsLink(place: Pick<Place, 'name' | 'address' | 'city'>): string {
  const q = place.address ? `${place.name}, ${place.address}` : `${place.name}, ${place.city}, FL`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function directionsLink(place: Pick<Place, 'name' | 'address' | 'city'>): string {
  const dest = place.address ? `${place.name}, ${place.address}` : `${place.name}, ${place.city}, FL`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function isSafeUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function includesText(haystack: (string | undefined)[], needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return haystack.some((h) => h?.toLowerCase().includes(n));
}

/** Deterministic "today" rotation so the home cover changes daily, not on every render. */
export function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 1000 + Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed % 2147483647 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function randomItem<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}
