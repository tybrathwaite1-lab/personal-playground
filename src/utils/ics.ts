/**
 * Small, dependency-free iCalendar (RFC 5545) reader — enough for public event
 * calendars (The Events Calendar / WordPress, Meetup and similar exports).
 */

export interface IcsEvent {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  categories: string[];
  status?: string;
  start: { iso: string; allDay: boolean } | null;
  end: { iso: string; allDay: boolean } | null;
  hasRule: boolean;
  /** RFC 5545 GEO ("lat;lon") as published by the calendar, if present and well-formed. */
  geo?: { lat: number; lon: number };
}

/** "27.77;-82.64" → { lat, lon }; anything else → undefined. */
export function parseGeo(v?: string): { lat: number; lon: number } | undefined {
  const m = v?.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[;,]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return undefined;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0) ? { lat, lon } : undefined;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** UTC offset in minutes of `timeZone` at the given instant (e.g. -300 for EST). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Convert a wall-clock time in `timeZone` to an ISO string with offset. */
export function zonedToIso(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): string {
  let guess = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMinutes(new Date(guess), timeZone);
    guess = Date.UTC(y, mo - 1, d, h, mi, s) - off * 60000;
  }
  const off = tzOffsetMinutes(new Date(guess), timeZone);
  const sign = off <= 0 ? '-' : '+';
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}`;
  return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function parseDate(value: string, params: Record<string, string>, fallbackTz: string): { iso: string; allDay: boolean } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h || params.VALUE === 'DATE') return { iso: zonedToIso(+y, +mo, +d, 0, 0, 0, fallbackTz), allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))).toISOString(), allDay: false };
  return { iso: zonedToIso(+y, +mo, +d, +h, +mi, +(s ?? 0), params.TZID || fallbackTz), allDay: false };
}

export function parseIcs(text: string, fallbackTz = 'America/New_York'): IcsEvent[] {
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('Not an iCalendar feed');
  const out: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: Record<string, string> }[]> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) {
        const one = (k: string) => cur![k]?.[0];
        const s = one('DTSTART');
        const e = one('DTEND');
        out.push({
          uid: one('UID')?.value,
          summary: unescape(one('SUMMARY')?.value ?? '').trim(),
          description: one('DESCRIPTION') ? unescape(one('DESCRIPTION')!.value) : undefined,
          location: one('LOCATION') ? unescape(one('LOCATION')!.value) : undefined,
          url: one('URL')?.value,
          categories: (cur.CATEGORIES ?? []).flatMap((c) => unescape(c.value).split(',')).map((c) => c.trim()).filter(Boolean),
          status: one('STATUS')?.value?.toUpperCase(),
          start: s ? parseDate(s.value, s.params, fallbackTz) : null,
          end: e ? parseDate(e.value, e.params, fallbackTz) : null,
          hasRule: Boolean(cur.RRULE),
          geo: parseGeo(one('GEO')?.value),
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(';');
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const [k, v] = p.split('=');
      if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, '');
    }
    const key = name.toUpperCase();
    (cur[key] ??= []).push({ value: line.slice(idx + 1), params });
  }
  return out;
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
