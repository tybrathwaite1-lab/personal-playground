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

// ─── Admission price (PP-002) ───────────────────────────────────────
/**
 * Only report what the listing itself says about the cost of attending.
 *
 *  - A dollar amount counts when an admission word sits nearest to it in its sentence
 *    ("tickets $15", "$10 entry", "Entry Fee: $5"). Amounts nearest a non-admission word
 *    ("$5 parking", "$8 drinks", "20% off", "suggested donation") are ignored.
 *  - A lone amount with no cue at all is accepted only if it is the listing's only amount.
 *  - "Free" counts only as free admission: "free parking", "free gift wrap", "gluten-free",
 *    "free with admission" and "free for members" don't make an event free.
 *  - Mixed or unclear signals → no price (unknown), never a guess.
 */
export interface PriceInfo {
  priceNote?: string;
  free?: boolean;
  /** Smallest and largest admission amounts stated, in USD. */
  priceMin?: number;
  priceMax?: number;
}

const ADMISSION_CUE =
  /\b(admission|admissions|tickets?|entry|entrance|cover|door|doors|registration|register|cost|costs|fee|fees|price|prices|pricing|tuition|per (?:person|player|couple|class|session|team)|general|adults?|members?|non-?members?|students?|seniors?|seats?|rsvp|advance|pre-?sale|day[- ]of|pass(?:es)?|dues|buy-?in|class|workshop|tour|session|participation)\b/gi;
const OTHER_CUE =
  /\b(parking|park|valet|drinks?|beers?|wines?|cocktails?|bar|food|snacks?|menu|merch(?:andise)?|donations?|donate|off|discount|discounts|save|savings|tips?|raffle|gift ?cards?|gifts?|prizes?|pot|payout|bonus|value|worth|deposit|for sale|sale|sold|shop|store|retail|raise|raised|goal|sponsor(?:ship)?s?|vendors?|booth|awards?|commission(?:ed)?|scholarships?|grants?|deals?|specials?|combo|package|unlimited play)\b/gi;
const AMOUNT =
  /\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)(?:\s?(?:-|–|—|to)\s?\$?\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?))?(?!\s?%)/g;
const FREE = /(?<![\w-])(free(?: of charge)?|no charge|no cost|no cover(?: charge)?|complimentary)(?![\w-])/gi;
const FREE_OTHER_AFTER =
  /^\s*(?:and\s+)?(?:parking|valet|gift ?wrap(?:ping)?|wrap|drinks?|beers?|wine|food|snacks?|refreshments|popcorn|coffee|wi-?fi|shuttle|trolley|tote|totes|gifts?|giveaways?|samples?|swag|posters?|t-?shirts?|consultations?|downloads?|appetizers?|tastings?|cancell?ations?|refunds?|returns?|shipping|exchanges?|rescheduling|photo ?booths?|photos?|face ?painting|childcare|coat ?check|activities|crafts?)\b/i;
/** "not free", "isn't free": never a free signal. */
const NEGATED_BEFORE = /\b(?:not|isn['’]t|aren['’]t|never|no longer)\s+(?:\w+\s+)?$/i;
const FREE_INCLUDED_AFTER = /^\s*(?:with|w\/)\s+(?:[\w'’.-]+\s+){0,2}?(?:admission|ticket|entry|purchase|membership)/i;
const QUALIFIERS =
  'members?|kids|children|child|students?|seniors?|veterans?|military|residents?|teachers?|first responders|ages?|under \\d+|youth|toddlers?|babies|infants|guests? of|those|qualifying|eligible|(?:local |community )?heroes';
const FREE_QUALIFIED_AFTER = new RegExp(`^[^.;!?]{0,30}?\\b(?:for|to)\\s+(?:all\\s+)?(?:[\\w'’.-]+\\s+){0,3}?(?:${QUALIFIERS})\\b`, 'i');
/** Membership pitches ("Not yet a member? Enjoy free admission…") describe member perks, not this event. */
const MEMBER_CONTEXT = /\bmember(?:s|ship)?\b/i;
/** "free admission, special access, discounts…" is a list of membership perks. */
const FREE_PERK_AFTER = /^\s*admission\s*,\s*(?:special|exclusive|early|priority|member|discount)/i;
/** Restricted audiences: one such mention makes a headline "Free Admission" partial. */
const RESTRICTED = /\b(?:qualifying|eligible|(?:local |community )?heroes)\b/i;
const EVERYONE = /\b(?:for (?:everyone|all)|open to (?:all|everyone|the public))\b/i;
const FREE_QUALIFIED_BEFORE = new RegExp(`\\b(?:${QUALIFIERS})\\s+(?:get in |enter |are |is |go |get )?$`, 'i');

/** A charge added on top of a ticket ("service fee $8", "$3 processing fee"). */
const FEE_WORDS = '(?:(?:mandatory|required)\\s+)?(?:(?:service|processing|booking|handling|facility|convenience|ticketing|admin(?:istrative)?)\\s+(?:fees?|charges?)|surcharge)';
/** Fee wording directly before the amount ("service fee $8", "Surcharge: $2") or after it ("$8 service fee"). */
const FEE_BEFORE = new RegExp(`\\b${FEE_WORDS}\\s*(?:of|is|:)?\\s*$`, 'i');
const FEE_AFTER = new RegExp(`^\\s*(?:\\w+\\s+)?${FEE_WORDS}\\b`, 'i');
/** Fees mentioned without an amount ("$20 + fees", "plus fees", "fees apply"). */
const UNSTATED_FEES = /\+\s*(?:[\w&]+\s+){0,3}?fees?\b|\bplus\s+(?:[\w&]+\s+){0,3}?fees?\b|\bfees?\s+(?:apply|extra|not included)\b|\bnot including\s+(?:\w+\s+)?fees?\b/i;
const RSVP = /\b(?:rsvp|registration (?:is )?required|reservations? (?:is |are )?required|pre-?registration|register (?:in advance|online|ahead))\b/i;

const money = (s: string) => Number(s.replace(/,/g, ''));
const fmt = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

interface Cue {
  kind: 'admission' | 'other';
  dist: number;
}

/** The nearest admission/other cue to [start, end) within the same sentence. Words before the amount count a bit more. */
function nearestCue(sentence: string, start: number, end: number): Cue | null {
  let best: Cue | null = null;
  for (const [re, kind] of [[ADMISSION_CUE, 'admission'], [OTHER_CUE, 'other']] as const) {
    re.lastIndex = 0;
    for (let m = re.exec(sentence); m; m = re.exec(sentence)) {
      const mEnd = m.index + m[0].length;
      if (m.index < end && mEnd > start) continue; // overlaps the amount itself
      const dist = mEnd <= start ? start - mEnd : (m.index - end) * 1.5;
      if (dist > 45) continue;
      if (!best || dist < best.dist) best = { kind, dist };
    }
  }
  return best;
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n+|\s+\|\s+/).filter((x) => x.trim());
}

/** The sentences that mention money or "free" — what priceFrom() looked at (for review reports). */
export function priceEvidence(text: string): string[] {
  return sentencesOf(text).filter((x) => /\$\s?\d|(?<![\w-])free(?![\w-])|no (charge|cost|cover)|complimentary/i.test(x));
}

export function priceFrom(text: string): PriceInfo {
  const paid: { min: number; max: number }[] = [];
  const fees: number[] = [];
  const uncued: { min: number; max: number }[] = [];
  let freeGeneral = false;
  let freeQualified = false;
  let freeRestricted = false;
  let otherInSameSentence = false;

  let previous = '';
  for (const sentence of sentencesOf(text)) {
    AMOUNT.lastIndex = 0;
    for (let m = AMOUNT.exec(sentence); m; m = AMOUNT.exec(sentence)) {
      const min = money(m[1]);
      const max = m[2] ? money(m[2]) : min;
      if (!(min >= 0) || max < min) continue;
      // An amount next to "service fee", "surcharge"… is an add-on, not another ticket tier.
      const before = sentence.slice(Math.max(0, m.index - 40), m.index);
      const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (!m[2] && (FEE_BEFORE.test(before) || FEE_AFTER.test(after))) {
        // "(service fee $8 included)", "price includes a $3 fee": already part of the ticket price.
        if (/^[^.;$]{0,25}?\b(?:included|incl\.?|inclusive)\b/i.test(after) || /\b(?:includes?|including|incl\.?|inclusive of)\s+(?:an?\s+)?[\w\s]{0,30}$/i.test(before)) continue;
        fees.push(min);
        continue;
      }
      const cue = nearestCue(sentence, m.index, m.index + m[0].length);
      if (!cue) {
        uncued.push({ min, max });
        OTHER_CUE.lastIndex = 0;
        if (OTHER_CUE.test(sentence)) otherInSameSentence = true;
      } else if (cue.kind === 'admission') {
        paid.push({ min, max });
      }
    }
    FREE.lastIndex = 0;
    for (let m = FREE.exec(sentence); m; m = FREE.exec(sentence)) {
      const after = sentence.slice(m.index + m[0].length, m.index + m[0].length + 40);
      const before = sentence.slice(Math.max(0, m.index - 40), m.index);
      if (FREE_OTHER_AFTER.test(after) || FREE_INCLUDED_AFTER.test(after) || NEGATED_BEFORE.test(before)) continue;
      // "Complimentary" only counts for admission itself ("complimentary admission"), not food or drinks.
      if (/^complimentary$/i.test(m[0]) && !/^\s*(?:museum |general )?(?:admission|entry|tickets?)\b/i.test(after)) continue;
      if (RESTRICTED.test(`${before} ${after}`)) freeRestricted = true;
      // "Not yet a member? Enjoy free admission…" — the member mention can sit in the sentence before.
      const memberPerk = (MEMBER_CONTEXT.test(sentence) || /member(?:ship)?\?\s*$/i.test(previous)) && !EVERYONE.test(sentence);
      if (memberPerk || FREE_PERK_AFTER.test(after) || FREE_QUALIFIED_AFTER.test(after) || FREE_QUALIFIED_BEFORE.test(before)) freeQualified = true;
      else freeGeneral = true;
    }
    previous = sentence;
  }

  // "Free Admission" in a headline, but the body limits it to qualifying visitors.
  if (freeRestricted) {
    freeGeneral = false;
    freeQualified = true;
  }

  // A single uncued amount is the listing's price; several (or one beside a non-admission word) are unclear.
  if (!paid.length && !freeGeneral && uncued.length === 1 && !otherInSameSentence) paid.push(uncued[0]);

  if (freeGeneral && paid.length) return { priceNote: 'Free and paid options (see listing)' };
  if (freeGeneral) {
    const rsvp = RSVP.test(text) ? ' · RSVP' : '';
    return { priceNote: `Free${rsvp} (per listing)`, free: true, priceMin: 0, priceMax: 0 };
  }
  if (!paid.length) return freeQualified ? { priceNote: 'Free for some visitors (see listing)' } : {};

  // Several amounts (adult/student, advance/door) are shown as a range.
  let priceMin = Math.min(...paid.map((p) => p.min));
  let priceMax: number | undefined = Math.max(...paid.map((p) => p.max));
  let range = priceMin === priceMax ? fmt(priceMin) : `${fmt(priceMin)}–${fmt(priceMax)}`;
  const some = freeQualified ? ' · free for some' : '';
  const fee = fees.reduce((a, b) => a + b, 0);
  if (fees.length && paid.length === 1 && priceMin === priceMax) {
    // One ticket price plus stated mandatory fees: the total is known.
    priceMin = priceMax = priceMin + fee;
    return { priceNote: `${fmt(priceMin)} incl. ${fmt(fee)} fees${some} (per listing)`, priceMin, priceMax };
  }
  if (fees.length || UNSTATED_FEES.test(text)) {
    // Fees on top of several tiers, or fees with no amount: the total isn't reliably known.
    // Keep the lowest ticket price for reference but no maximum, so budget filters treat it as unknown.
    range += fees.length ? ` + ${fmt(fee)} fees` : ' + fees';
    priceMax = undefined;
    return { priceNote: `${range}${some} (see listing for total)`, priceMin };
  }
  return { priceNote: `${range}${some} (per listing)`, priceMin, priceMax };
}

/**
 * Admission range for budget filters. Uses the structured fields, and falls back to
 * reading the note for listings generated before priceMin/priceMax existed.
 */
export function eventPriceRange(e: Pick<PulseEvent, 'free' | 'priceNote' | 'priceMin' | 'priceMax'>): [number, number] | null {
  if (e.free) return [0, 0];
  if (typeof e.priceMin === 'number' && typeof e.priceMax === 'number') return [e.priceMin, e.priceMax];
  // A minimum without a maximum means the total (fees) isn't known: unknown, not a guess.
  if (typeof e.priceMin === 'number') return null;
  const amounts = [...(e.priceNote ?? '').matchAll(/\$\s?(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  return amounts.length ? [Math.min(...amounts), Math.max(...amounts)] : null;
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
    ...priceFrom(`${e.summary}.\n${desc}`),
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
