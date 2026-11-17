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
  [/festival|fair\b|celebration|cultural/i, ['Meaningful shared experiences'], 'Festivals'],
  [/japan|japanese|asian/i, ['Japanese art and design'], 'Japanese culture'],
  [/garden|nature|preserve|plant|botanical|bird/i, ['Walking', 'Plant keeping'], 'Outdoors'],
  [/sneaker|streetwear|fashion/i, ['Sneakers', 'Streetwear culture'], 'Streetwear'],
];

/** Things the brief asks us not to surface: kids-only, galas, private/member events, drink-centric nights. */
const EXCLUDE = /\b(gala|luncheon|fundraiser dinner|teen night|for teens|toddler|kids? camp|summer camp|homeschool|preschool|story ?time|members[- ]only|private event|wine tasting|bar crawl|pub crawl|bottomless)\b/i;

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
  const start = e.start.iso;
  const end = e.end?.iso;
  const spanDays = end ? (Date.parse(end) - Date.parse(start)) / 86_400_000 : 0;
  const city = cityFor(e.location ?? '') ?? cityFor(desc);
  const cancelled = e.status === 'CANCELLED' || /^\s*(cancel+ed|postponed)\b/i.test(e.summary);
  const [venue, ...addr] = (e.location ?? '').split(',').map((s) => s.trim());
  const { tags, categories } = tagEvent(text);
  const loc = `${e.location ?? ''} ${e.summary}`;
  return {
    id: `${sourceId}:${e.uid ?? `${slug(e.summary)}-${start.slice(0, 10)}`}`,
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
export function dedupeKey(e: PulseEvent): string {
  return `${slug(e.title)}|${e.start.slice(0, 10)}|${e.city ?? ''}`;
}

/** Merge duplicates from different sources, keeping the richer record and all source ids. */
export function dedupe(events: PulseEvent[]): PulseEvent[] {
  const map = new Map<string, PulseEvent>();
  for (const e of events) {
    const k = dedupeKey(e);
    const prev = map.get(k);
    if (!prev) map.set(k, e);
    else {
      const richer = (e.description?.length ?? 0) > (prev.description?.length ?? 0) ? e : prev;
      map.set(k, {
        ...richer,
        sourceIds: [...new Set([...prev.sourceIds, ...e.sourceIds])],
        tags: [...new Set([...prev.tags, ...e.tags])],
        cancelled: prev.cancelled || e.cancelled,
        priceNote: richer.priceNote ?? prev.priceNote ?? e.priceNote,
      });
    }
  }
  return [...map.values()];
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
