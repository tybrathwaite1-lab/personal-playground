import type { Community } from '../types';

/** Dates (YYYY-MM-DD) in [from, to] on which a community's published rules say it meets. */
export function occurrences(c: Community, from: string, to: string): string[] {
  if (!c.rules?.length) return [];
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    const wd = d.getUTCDay();
    const nth = Math.floor((d.getUTCDate() - 1) / 7) + 1;
    if (c.rules.some((r) => r.weekday === wd && (!r.nth || r.nth.includes(nth as 1)))) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function nextOccurrence(c: Community, from: string, days = 62): string | null {
  const d = new Date(`${from}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return occurrences(c, from, d.toISOString().slice(0, 10))[0] ?? null;
}

export function formatYmd(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}

export function ruleTime(c: Community, ymd: string): string | null {
  const wd = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  const r = c.rules?.find((x) => x.weekday === wd);
  if (!r?.start) return null;
  const f = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  return r.end ? `${f(r.start)}–${f(r.end)}` : f(r.start);
}
