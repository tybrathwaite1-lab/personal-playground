/**
 * Local Pulse logic shared by the ingest script (Node) and the app (browser):
 * normalizing feed items, tagging, de-duplicating, expiry and day buckets.
 */
import type { PulseEvent } from '../types/pulse';
import { HOME, cityFor, milesBetween } from './geo';
import { stripHtml, tzOffsetMinutes, type IcsEvent } from './ics';

export const TZ = 'America/New_York';

// ─── Tagging ────────────────────────────────────────────────────────
/** keyword → interest tags. Kept close to the interest directory's wording. */
const TAG_RULES: [RegExp, string[], string][] = [
  [/art ?walk|gallery|exhibit|opening reception|artist talk|curator|painting|sculpture|printmak/i, ['Art galleries'], 'Art & exhibitions'],
  [/mural|graffiti|street art|spray/i, ['Graffiti', 'Street art and murals'], 'Murals & street art'],
  [/photo(graphy)?\b|camera|darkroom|film photo/i, ['Street photography'], 'Photography'],
  [/live music|concert|band|jazz|hip.?hop|dj set|vinyl|record (fair|swap|store)|listening (party|session)/i, ['Small live music performances', 'Discovering new music'], 'Music'],
  [/comic|manga|anime|cosplay/i, ['Comic books', 'Manga', 'Anime'], 'Comics & anime'],
  [/tournament|fighting game|tekken|street fighter|smash|esports|arcade|retro gam|video game/i, ['Gaming', 'Fighting game community events', 'Retro arcade exploration'], 'Gaming'],
  [/pok[eé]mon|magic: the gathering|\bmtg\b|trading card|tcg/i, ['Trading cards'], 'Trading cards'],
  [/board game|tabletop|d&d|dungeons|game night/i, ['Tabletop games'], 'Tabletop'],
  [/maker|hackerspace|3d print|electronics|arduino|raspberry|soldering|robot/i, ['3D printing', 'Raspberry Pi projects', 'Small building projects'], 'Makers & tech'],
  [/workshop|class|hands-on|demo(nstration)?|glassblow|pottery|ceramic|clay|wheel throwing/i, ['Small building projects', 'Drawing'], 'Workshops'],
  [/skate|skateboard/i, ['Skateboarding'], 'Skate'],
  [/basketball|pickup game/i, ['Basketball'], 'Sports'],
  [/history|historic|heritage|archive|lecture|book club|walking tour|cigar city/i, ['History'], 'History & talks'],
  [/film|screening|cinema|movie/i, ['Interesting YouTube content'], 'Film'],
  [/market|flea|bazaar|vintage|makers market/i, ['Streetwear culture'], 'Markets'],
  [/tea\b|tea ceremony|matcha/i, ['Tea culture'], 'Tea'],
  [/sound bath|meditat|yoga|breathwork|mindful/i, ['Sound baths', 'Relaxation'], 'Reset'],
  [/festival|\bfair\b|celebration/i, ['Meaningful shared experiences'], 'Festivals'],
  [/japan|japanese|asian/i, ['Japanese art and design'], 'Japanese culture'],
  [/garden|nature walk|preserve|\bplants\b|botanical|birding|kayak|paddle/i, ['Walking', 'Plant keeping'], 'Outdoors'],
  [/sneaker|streetwear|fashion/i, ['Sneakers', 'Streetwear culture'], 'Streetwear'],
];

/** Things the brief asks us not to surface: kids-only, galas, private/member events, drink-centric nights. */
const EXCLUDE =
  /\b(gala|luncheon|fundraiser dinner|teen night|for teens|toddler|kids? camp|summer camp|homeschool|preschool|story ?time|members[- ]only|private event|wine tasting|bar crawl|pub crawl|bottomless|call (to|for) (artists|entries|submissions)|applications? (open|due)|auditions?|volunteer|things to do .* this weekend|deadline)\b/i;

export function tagEvent(text: string): { tags: string[]; categories: string[] } {
  const tags = new Set<string>();
  const categories = new Set<string>();
  for (const [re, t, c] of TAG_RULES) {
    if (re.test(text)) {
      t.forEach((x) => tags.add(x));
      categories.add(c);
    }
  }
  return { tags: [...tags], categories: [...categories] };
}

export function isExcluded(text: string): boolean {
  return EXCLUDE.test(text);
}

const PRICE = /(free(?: admission| entry| event| and open to the public)?|\$\s?\d+(?:\.\d{2})?(?:\s?[-–]\s?\$?\d+(?:\.\d{2})?)?)/i;

/** Only report a price the listing states in its own text. */
export function priceFrom(text: string): { priceNote?: string; free?: boolean } {
  const m = text.match(PRICE);
  if (!m) return {};
  const note = m[1].replace(/\s+/g, ' ');
  return /^free/i.test(note) ? { priceNote: 'Free (per listing)', free: true } : { priceNote: `${note} (per listing)` };
}

const OUTDOOR = /outdoor|park\b|preserve|beach|waterfront|pier|trail|garden|walk\b|art ?walk|market|festival/i;
const INDOOR = /museum|gallery|studio|theat(er|re)|hall|library|center|centre|arcade|tavern|store|shop/i;

export function normalizeIcs(e: IcsEvent, sourceId: string, nowIso: string): PulseEvent | null {
  if (!e.summary || !e.start) return null;
  const desc = e.description ? stripHtml(e.description) : '';
  const text = `${e.summary} ${desc} ${e.categories.join(' ')}`;
  if (isExcluded(`${e.summary} ${e.categories.join(' ')}`)) return null;
  // Canonical New York wall-clock form, so the same instant from a UTC feed and a TZID
  // feed compares, sorts and de-duplicates identically.
  const start = toNyIso(e.start.iso);
  const end = e.end ? toNyIso(e.end.iso) : undefined;
  const spanDays = end ? (Date.parse(end) - Date.parse(start)) / 86_400_000 : 0;
  const city = cityFor(e.location ?? '') ?? cityFor(desc);
  const cancelled = e.status === 'CANCELLED' || /^\s*(cancel+ed|postponed)\b/i.test(e.summary);
  const [venue, ...addr] = (e.location ?? '').split(',').map((s) => s.trim());
  const { tags, categories } = tagEvent(text);
  const loc = `${e.location ?? ''} ${e.summary}`;
  return {
    id: `${sourceId}:${e.uid ?? fallbackId(e.summary, start, e.start.allDay)}`,
    title: e.summary.replace(/^\s*(cancel+ed|postponed)\s*[:\-–]\s*/i, ''),
    description: desc ? truncate(desc, 320) : undefined,
    start,
    end,
    allDay: e.start.allDay,
    ongoing: spanDays > 2,
    venue: venue || undefined,
    address: addr.filter((a) => !/united states/i.test(a)).join(', ') || undefined,
    city: city?.name,
    miles: city ? Math.round(milesBetween(HOME, city) * 10) / 10 : undefined,
    url: e.url,
    ...priceFrom(text),
    tags,
    categories: categories.length ? categories : ['Cultural events'],
    indoor: INDOOR.test(loc) ? true : OUTDOOR.test(loc) ? false : undefined,
    cancelled,
    sourceIds: [sourceId],
    verifiedAt: nowIso,
  };
}

/** Re-express any ISO instant as New York wall-clock time with its offset, e.g. 2026-11-20T19:00:00-05:00. */
export function toNyIso(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const off = tzOffsetMinutes(new Date(ms), TZ);
  const local = new Date(ms + off * 60000).toISOString().slice(0, 19);
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local}${off <= 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Id for a feed item without a UID. Timed items include the start time so two sessions
 * on the same day (1 PM and 3 PM) don't share an id. All-day items keep the date only.
 */
function fallbackId(summary: string, nyStart: string, allDay: boolean): string {
  const date = nyStart.slice(0, 10);
  return allDay ? `${slug(summary)}-${date}` : `${slug(summary)}-${date}t${nyStart.slice(11, 13)}${nyStart.slice(14, 16)}`;
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')}…`;
}

// ─── De-duplication & expiry ────────────────────────────────────────
/** Title key: case, punctuation and "&" vs "and" don't matter. */
function titleKey(title: string): string {
  return slug(title.replace(/&/g, ' and '));
}

/** Venue key from the venue name, else the street address. undefined = the listing doesn't say. */
export function venueKey(e: Pick<PulseEvent, 'venue' | 'address'>): string | undefined {
  const v = slug((e.venue ?? '').replace(/&/g, ' and ').replace(/^the\s+/i, ''));
  if (v) return v;
  const a = slug(e.address ?? '');
  return a || undefined;
}

/**
 * Two listings describe the same event only if they have the same title, start at the
 * same instant (to the minute), and are at the same venue — or one of them doesn't name
 * a venue and the cities don't conflict. Different sessions (times) and different venues
 * stay separate.
 */
export function sameEvent(a: PulseEvent, b: PulseEvent): boolean {
  if (titleKey(a.title) !== titleKey(b.title)) return false;
  if (Math.floor(Date.parse(a.start) / 60000) !== Math.floor(Date.parse(b.start) / 60000)) return false;
  const va = venueKey(a);
  const vb = venueKey(b);
  if (va && vb) {
    if (va === vb) return true;
    // Sources name the same place differently ("MFA" vs "Museum of Fine Arts"): same street address wins.
    const sa = streetKey(a.address);
    return Boolean(sa) && sa === streetKey(b.address);
  }
  return !a.city || !b.city || a.city === b.city;
}

/** First address segment that starts with a street number, normalized ("255 Beach Dr NE" → "255-beach-dr-ne"). */
function streetKey(address?: string): string | undefined {
  const street = (address ?? '').split(',').map((x) => x.trim()).find((x) => /^\d+\s/.test(x));
  if (!street) return undefined;
  return slug(street.replace(/\b(drive)\b/i, 'dr').replace(/\b(avenue)\b/i, 'ave').replace(/\b(street)\b/i, 'st').replace(/\b(boulevard)\b/i, 'blvd'));
}

/** Bucket key for candidate duplicates: title + start minute (venue is checked pairwise). */
export function dedupeKey(e: PulseEvent): string {
  return `${titleKey(e.title)}|${Math.floor(Date.parse(e.start) / 60000)}`;
}

function merge(group: PulseEvent[]): PulseEvent {
  if (group.length === 1) return group[0];
  // Deterministic regardless of feed order: richest description, then smallest id.
  const sorted = [...group].sort(
    (x, y) => (y.description?.length ?? 0) - (x.description?.length ?? 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  );
  const richer = sorted[0];
  const firstWith = <K extends keyof PulseEvent>(k: K) => sorted.find((e) => e[k] !== undefined)?.[k];
  // Price fields travel together so "free" never pairs with another listing's note.
  const priced = sorted.find((e) => e.priceNote !== undefined || e.free !== undefined);
  return {
    ...richer,
    // Stable across refreshes: the smallest id in the group, not whichever feed came first.
    id: group.map((e) => e.id).sort()[0],
    end: firstWith('end'),
    venue: firstWith('venue'),
    address: firstWith('address'),
    city: firstWith('city'),
    miles: firstWith('miles'),
    url: firstWith('url'),
    indoor: firstWith('indoor'),
    priceNote: priced?.priceNote,
    free: priced?.free,
    sourceIds: [...new Set(group.flatMap((e) => e.sourceIds))].sort(),
    tags: [...new Set(group.flatMap((e) => e.tags))],
    categories: [...new Set(group.flatMap((e) => e.categories))],
    // If any source says this exact event is cancelled, show it as cancelled.
    cancelled: group.some((e) => e.cancelled),
    verifiedAt: group.map((e) => e.verifiedAt).sort().pop() ?? richer.verifiedAt,
  };
}

/**
 * Merge genuine duplicates (same event listed by several sources, or twice by one source)
 * while keeping distinct sessions and venues apart. Output is independent of input order.
 */
export function dedupe(events: PulseEvent[]): PulseEvent[] {
  // Listings that name a venue are placed first, then those that don't; ties by id.
  // This makes the result independent of feed order.
  const ordered = [...events].sort(
    (a, b) => Number(!venueKey(a)) - Number(!venueKey(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const buckets = new Map<string, PulseEvent[][]>();
  for (const e of ordered) {
    const k = dedupeKey(e);
    const groups = buckets.get(k) ?? [];
    const fits = groups.filter((g) => g.every((x) => sameEvent(x, e)));
    // A listing without a venue that could belong to two different venues is ambiguous: keep it apart.
    if (fits.length === 1) fits[0].push(e);
    else groups.push([e]);
    buckets.set(k, groups);
  }
  return [...buckets.values()].flat().map(merge).sort(byStart);
}

/** Chronological order by actual instant (string order is wrong across UTC offsets). */
export function byStart(a: PulseEvent, b: PulseEvent): number {
  return Date.parse(a.start) - Date.parse(b.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** End time used for expiry: stated end, else end of day for all-day, else start + 3h. */
export function effectiveEnd(e: PulseEvent): number {
  if (e.end) return Date.parse(e.end);
  const s = Date.parse(e.start);
  return e.allDay ? s + 86_400_000 : s + 3 * 3_600_000;
}

export function isExpired(e: PulseEvent, now = Date.now()): boolean {
  return effectiveEnd(e) < now;
}

// ─── Day buckets in America/New_York ────────────────────────────────
/** Calendar date (YYYY-MM-DD) in New York for an instant. */
export function nyDate(ms: number): string {
  const off = tzOffsetMinutes(new Date(ms), TZ);
  return new Date(ms + off * 60000).toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type PulseView = 'today' | 'tomorrow' | 'weekend' | 'week' | 'upcoming';

/** Inclusive date range [from, to] (YYYY-MM-DD, New York) for a view. */
export function viewRange(view: PulseView, now = Date.now()): [string, string] {
  const today = nyDate(now);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  switch (view) {
    case 'today':
      return [today, today];
    case 'tomorrow':
      return [addDays(today, 1), addDays(today, 1)];
    case 'weekend': {
      // Friday–Sunday; if it's already the weekend, the rest of it.
      if (dow === 0) return [today, today];
      if (dow === 6) return [today, addDays(today, 1)];
      const fri = addDays(today, (5 - dow + 7) % 7);
      return [fri, addDays(fri, 2)];
    }
    case 'week':
      return [today, addDays(today, 6)];
    case 'upcoming':
      return [today, addDays(today, 120)];
  }
}

/** Does the event happen (or is it running) on any day in the range? */
export function inRange(e: PulseEvent, [from, to]: [string, string]): boolean {
  const s = nyDate(Date.parse(e.start));
  const en = nyDate(effectiveEnd(e) - 1);
  return s <= to && en >= from;
}

export function formatWhen(e: PulseEvent): string {
  const s = new Date(e.start);
  const day = s.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
  if (e.ongoing && e.end) {
    const endDay = new Date(e.end).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
    return `Through ${endDay}`;
  }
  if (e.allDay) return `${day} · all day`;
  const t = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  return `${day} · ${t(s)}${e.end && !e.ongoing ? `–${t(new Date(e.end))}` : ''}`;
}
