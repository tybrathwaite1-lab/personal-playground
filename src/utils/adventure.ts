/**
 * Mini-adventure generator: two or three geographically compatible, real local
 * stops (places, listed events, recurring communities) plus an optional food stop.
 * Pure functions — testable without React.
 */
import type { Community, Company, Energy, Familiarity, PersonalData, Place, PlaceCategory, Transport } from '../types';
import type { PulseEvent } from '../types/pulse';
import { occurrences, ruleTime } from './community';
import { HOME, cityFor, milesBetween, type LatLon, type Precision } from './geo';
import { applyFamiliarity } from './novelty';
import { effectiveEnd, eventPriceRange, isExpired, nyDate } from './pulse';

export type Atmosphere = 'any' | 'chill' | 'creative' | 'playful' | 'cultured' | 'outdoorsy';
export type Slot = 'morning' | 'afternoon' | 'evening';
export type BudgetPP = 'free' | 'u25' | 'u50' | 'u100' | 'any';
export type WeatherPref = 'auto' | 'indoor' | 'outdoor' | 'any';

export interface AdventureOptions {
  /** YYYY-MM-DD in New York. */
  date: string;
  slot: Slot;
  hours: 2 | 4 | 6;
  company: Company;
  budget: BudgetPP;
  energy: Energy | 'any';
  radius: number;
  transport: Transport;
  atmosphere: Atmosphere;
  weather: WeatherPref;
  familiarity: Familiarity;
  /** Forecast says wet/stormy (used when weather = auto). */
  indoorDay: boolean;
  /** "place:<id>" | "event:<id>" | "community:<id>" */
  anchor?: string;
}

interface Profile {
  minutes: number;
  energy: Energy;
  vibes: Atmosphere[];
  indoor?: boolean;
  /** Typical opening pattern; unknown hours are always flagged in the output. */
  daytimeOnly?: boolean;
  eveningOnly?: boolean;
  date: boolean;
  friends: boolean;
}

const P = (minutes: number, energy: Energy, vibes: Atmosphere[], o: Partial<Profile> = {}): Profile => ({
  minutes,
  energy,
  vibes,
  date: true,
  friends: true,
  ...o,
});

/** Editorial defaults per place category. */
export const CATEGORY_PROFILE: Record<PlaceCategory, Profile> = {
  'Record stores': P(60, 'low', ['chill', 'cultured', 'creative'], { indoor: true, daytimeOnly: true }),
  'Comic book shops': P(45, 'low', ['playful', 'cultured'], { indoor: true, daytimeOnly: true }),
  'Trading card shops': P(60, 'low', ['playful'], { indoor: true, daytimeOnly: true, date: false }),
  'Retro gaming stores': P(45, 'low', ['playful'], { indoor: true, daytimeOnly: true }),
  Arcades: P(90, 'medium', ['playful'], { indoor: true }),
  'Fighting game tournaments': P(180, 'medium', ['playful'], { indoor: true, date: false }),
  'Tabletop gaming communities': P(150, 'low', ['playful'], { indoor: true }),
  'Skate shops and skateparks': P(90, 'high', ['playful', 'outdoorsy'], { daytimeOnly: true, date: false }),
  'Basketball courts': P(60, 'high', ['playful', 'outdoorsy'], { indoor: false, daytimeOnly: true, date: false }),
  'Street art and murals': P(75, 'medium', ['creative', 'outdoorsy', 'cultured'], { indoor: false, daytimeOnly: true }),
  'Art galleries': P(75, 'low', ['cultured', 'creative', 'chill'], { indoor: true, daytimeOnly: true }),
  'Museums and local history': P(120, 'low', ['cultured', 'chill'], { indoor: true, daytimeOnly: true }),
  'Independent live music venues': P(150, 'medium', ['cultured', 'playful'], { eveningOnly: true }),
  Makerspaces: P(120, 'medium', ['creative'], { indoor: true, date: false }),
  'Electronics and DIY resources': P(60, 'low', ['creative'], { indoor: true, daytimeOnly: true, date: false }),
  'Archery facilities': P(90, 'medium', ['playful', 'outdoorsy'], { indoor: false, daytimeOnly: true }),
  'Tea houses and cafés': P(60, 'low', ['chill'], { indoor: true }),
  'Float therapy': P(90, 'low', ['chill'], { indoor: true, friends: false }),
  'Sauna and recovery studios': P(90, 'low', ['chill'], { indoor: true, friends: false }),
  'Scenic walks': P(90, 'medium', ['chill', 'outdoorsy'], { indoor: false, daytimeOnly: true }),
  'Waterfront destinations': P(90, 'low', ['chill', 'outdoorsy'], { indoor: false }),
  'Plant shops': P(45, 'low', ['chill'], { daytimeOnly: true }),
  'Interesting public spaces': P(60, 'low', ['chill', 'cultured'], {}),
  'Cultural events': P(120, 'medium', ['cultured'], {}),
  'Workshops and classes': P(120, 'medium', ['creative'], { indoor: true, daytimeOnly: true }),
  'Wildcard activities': P(90, 'medium', ['playful'], { indoor: true }),
};

const HOP_MILES: Record<Transport, number> = { walk: 1.5, bike: 4, transit: 6, car: 12 };
const BUDGET_CAP: Record<BudgetPP, number> = { free: 0, u25: 25, u50: 50, u100: 100, any: Infinity };
const PLACE_COST: Record<Place['budget'], [number, number] | null> = {
  free: [0, 0],
  low: [0, 25],
  mid: [25, 60],
  high: [60, 150],
  unknown: null,
};

export interface Stop {
  key: string;
  kind: 'place' | 'event' | 'community';
  title: string;
  subtitle: string;
  minutes: number;
  /** Published time for events/communities; otherwise null (hours not verified). */
  time: string | null;
  /**
   * When it can be attended, in minutes after midnight (New York) of the PLAN date, so an
   * event ending at 1 AM the next day ends at 1500, not 60. Places have none (flexible).
   *  - fixed: must arrive by the start (events, meetups without a published end)
   *  - drop-in: can join any time from `earliest` to `latest`; the visit is cut short at `end`
   */
  window?: { kind: 'fixed' | 'drop-in'; earliest: number; latest: number; end: number };
  /** Venue coordinates when verified, else the city center (see precision). */
  coords: LatLon | null;
  /** 'venue' = verified venue coordinates; 'city' = city center only; 'unknown' = no location. */
  precision: Precision;
  cityName?: string;
  /** Neighborhood name for permanent places (a weak "probably close" signal, never a distance). */
  neighborhood?: string;
  cost: [number, number] | null;
  url?: string;
  directions: { name: string; address?: string; city: string };
  place?: Place;
  event?: PulseEvent;
  community?: Community;
  hoursNote: string;
}

export interface Adventure {
  primary: Stop;
  secondary?: Stop;
  food?: { label: string; near: Stop };
  /** Known admission for the stops, per person. Food is never included. */
  cost: { min: number; max: number; unknown: boolean; excludesFood: boolean };
  /**
   * Minutes. `start`/`end` are on the plan date's clock (≥ 1440 = after midnight).
   * Covers time at the stops, rough travel BETWEEN them and any wait — see `scope`.
   */
  time: { stops: number; travel: number; wait: number; total: number; budget: number; start?: number; end?: number };
  /** Real conflicts with what was asked for (shown prominently). */
  warnings: string[];
  /** Neutral, plan-level information: details the listings don't give. */
  info: string[];
  /** What the estimates leave out, in data and in words. */
  scope: { travelToFirstStop: false; returnTrip: false; transportCost: false; foodTime: false; foodCost: false; note: string };
  travel: string;
  /** How the travel line was worked out: never a route, at best a straight line between venues. */
  proximity: Proximity;
  milesFromHome?: number;
  /** 'venue' when measured from the stop's verified venue, 'city' when from its city center. */
  homeBasis?: Precision;
}

/**
 * How close two stops are, as far as we honestly know. All distances are straight lines
 * (no routing), so travel times derived from them are rough estimates.
 */
export type Proximity =
  | { kind: 'venue'; miles: number } // both venues pinned
  | { kind: 'neighborhood'; name: string; city: string } // same named neighborhood, distance not verified
  | { kind: 'same-city'; city: string } // same city, distance not verified
  | { kind: 'cities'; miles: number; from: string; to: string } // different cities, center-to-center
  | { kind: 'unknown' }
  | { kind: 'single' };

function cityCoords(name?: string): LatLon | null {
  const c = cityFor(name ?? '');
  return c ? { lat: c.lat, lon: c.lon } : null;
}

/** Verified venue coordinates when present, else the city center, else nothing. */
function locate(venue: LatLon | undefined, city?: string): { coords: LatLon | null; precision: Precision } {
  if (venue) return { coords: { lat: venue.lat, lon: venue.lon }, precision: 'venue' };
  const c = cityCoords(city);
  return c ? { coords: c, precision: 'city' } : { coords: null, precision: 'unknown' };
}

function nyMinutes(iso: string): number {
  const [h, m] = new Date(iso)
    .toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
    .split(':')
    .map(Number);
  return (h % 24) * 60 + m;
}
const hm = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
/** Part-of-day windows in minutes after midnight. */
const SLOT_WINDOW: Record<Slot, [number, number]> = { morning: [6 * 60, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 24 * 60] };

/** Time to get going and reach a first stop on a same-day plan (the trip there isn't estimated). */
export const LEAD_MINUTES = 30;
/** Places (opening hours unknown) are never scheduled past midnight. */
const DAY_END = 24 * 60;
/** Shortest visit worth joining a drop-in window for. */
const MIN_DROP_IN = 45;

const dayIndex = (ymd: string) => Math.round(Date.parse(`${ymd}T12:00:00Z`) / 86_400_000);

/** The planning clock: where the chosen part of the day starts and ends, and "now" if it's today. */
export interface Clock {
  today: boolean;
  /** Minutes after midnight of now (today only). */
  now?: number;
  slotStart: number;
  slotEnd: number;
  /** Earliest a plan can start: the slot start, or now + lead if later. */
  floor: number;
  /** The chosen part of today is already over (or too close to its end to start anything). */
  over: boolean;
}

export function planClock(o: AdventureOptions, now: number): Clock {
  const [slotStart, slotEnd] = SLOT_WINDOW[o.slot];
  const today = nyDate(now) === o.date;
  const nowMin = today ? nyMinutes(new Date(now).toISOString()) : undefined;
  const floor = nowMin === undefined ? slotStart : Math.max(slotStart, nowMin + LEAD_MINUTES);
  return { today, now: nowMin, slotStart, slotEnd, floor, over: floor >= slotEnd };
}

/** "8:30 PM", or "12:30 AM (next day)" past midnight on the plan's clock. */
export function clockLabel(m: number): string {
  const day = Math.floor(m / 1440);
  const t = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const mm = t % 60;
  const s = `${((h + 11) % 12) + 1}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
  return day > 0 ? `${s} (next day)` : day < 0 ? `${s} (day before)` : s;
}

/** Timed listings belong to the day they START; all-day and multi-day ones to every day they span. */
function onDate(e: PulseEvent, date: string): boolean {
  if (!e.ongoing && !e.allDay) return nyDate(Date.parse(e.start)) === date;
  return nyDate(Date.parse(e.start)) <= date && nyDate(effectiveEnd(e) - 1) >= date;
}

function slotOf(iso: string): Slot {
  const h = Number(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })) % 24;
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function priceRange(e: PulseEvent): [number, number] | null {
  return eventPriceRange(e);
}

// ─── Candidate building ─────────────────────────────────────────────
export function placeStop(p: Place): Stop {
  const prof = CATEGORY_PROFILE[p.categories[0]];
  return {
    key: `place:${p.id}`,
    kind: 'place',
    title: p.name,
    subtitle: `${p.neighborhood} · ${p.city}`,
    minutes: prof.minutes,
    time: null,
    ...locate(p.coords, p.city),
    cityName: cityFor(p.city)?.name,
    neighborhood: p.neighborhood || undefined,
    cost: PLACE_COST[p.budget],
    url: p.website,
    directions: { name: p.name, address: p.address, city: p.city },
    place: p,
    hoursNote: 'Hours not verified here — check before you go',
  };
}

/** `planDate` sets the clock the window is measured on (defaults to the event's own start date). */
export function eventStop(e: PulseEvent, planDate = nyDate(Date.parse(e.start))): Stop {
  const mins = Math.round(e.end && !e.ongoing ? Math.min(240, Math.max(45, (Date.parse(e.end) - Date.parse(e.start)) / 60000)) : 120);
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const timed = !e.ongoing && !e.allDay;
  const startDay = nyDate(Date.parse(e.start));
  const overnight = timed && e.end !== undefined && nyDate(Date.parse(e.end) - 1) > startDay;
  const time = overnight ? `${fmt(e.start)}–${fmt(e.end!)} (ends next day)` : fmt(e.start);
  const at = (dayIndex(startDay) - dayIndex(planDate)) * 1440 + nyMinutes(e.start);
  return {
    key: `event:${e.id}`,
    kind: 'event',
    title: e.title,
    subtitle: [e.venue, e.city].filter(Boolean).join(' · '),
    minutes: mins,
    time: timed ? time : 'During opening hours',
    ...locate(e.geo, e.city),
    cityName: e.city,
    cost: priceRange(e),
    url: e.url,
    directions: { name: e.venue ?? e.title, address: e.address, city: e.city ?? 'St. Petersburg' },
    event: e,
    hoursNote: e.ongoing ? 'Exhibition — check the venue’s hours' : 'Time from the venue’s calendar',
    ...(timed ? { window: { kind: 'fixed' as const, earliest: at, latest: at, end: at + mins } } : {}),
  };
}

/** A community's published window on that date, if its schedule gives a start time. */
function communityWindow(c: Community, date: string, minutes: number): Stop['window'] {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  const r = c.rules?.find((x) => x.weekday === wd);
  if (!r?.start) return undefined;
  const start = hm(r.start);
  if (!r.end) return { kind: 'fixed', earliest: start, latest: start, end: start + minutes };
  let end = hm(r.end);
  if (end <= start) end += 1440; // e.g. 8 PM – 1 AM
  // Drop-in: join any time that still leaves a worthwhile visit.
  return { kind: 'drop-in', earliest: start, latest: Math.max(start, end - MIN_DROP_IN), end };
}

export function communityStop(c: Community, date: string, places: Place[] = []): Stop {
  // A community held at a known place can use that place's verified coordinates.
  const venue = c.coords ?? places.find((p) => p.id === c.placeId)?.coords;
  return {
    window: communityWindow(c, date, 120),
    key: `community:${c.id}`,
    kind: 'community',
    title: c.name,
    subtitle: `${c.kind} · ${c.city}`,
    minutes: 120,
    time: ruleTime(c, date),
    ...locate(venue, c.city),
    cityName: cityFor(c.city)?.name,
    cost: c.costNote && /free|no admission/i.test(c.costNote) ? [0, 0] : null,
    url: c.website,
    directions: { name: c.venue ?? c.name, address: c.address, city: c.city },
    community: c,
    hoursNote: c.status === 'verified' ? 'Published schedule' : 'Schedule not fully confirmed — check first',
  };
}

export interface Inputs {
  places: Place[];
  events: PulseEvent[];
  communities: Community[];
  data: PersonalData;
}

function vibesOfEvent(e: PulseEvent): Atmosphere[] {
  const c = e.categories.join(' ');
  const v: Atmosphere[] = [];
  if (/Art|History|Film|Japanese|Photography/.test(c)) v.push('cultured');
  if (/Workshops|Makers|Murals|Photography/.test(c)) v.push('creative');
  if (/Gaming|Tabletop|Trading|Festivals|Markets|Music/.test(c)) v.push('playful');
  if (/Outdoors/.test(c) || e.indoor === false) v.push('outdoorsy');
  if (/Reset|Tea|Art|History/.test(c)) v.push('chill');
  return v.length ? v : ['cultured'];
}

/** Can a stop with this attendance window be started during the slot? */
function inWindow(w: NonNullable<Stop['window']>, slot: Slot): boolean {
  const [from, to] = SLOT_WINDOW[slot];
  return w.latest >= from && w.earliest < to;
}

/** All stops available on the chosen date/slot that pass the hard filters. */
export function candidates(inp: Inputs, o: AdventureOptions, now = Date.now()): Stop[] {
  const out: Stop[] = [];
  const clock = planClock(o, now);
  // Nothing can start in a part of today that's already over.
  if (clock.over) return out;
  // Same-day: a fixed start must still be reachable; a drop-in window must still be joinable.
  const reachable = (s: Stop) => !clock.today || !s.window || s.window.latest >= clock.floor;
  const wantIndoor = o.weather === 'indoor' || (o.weather === 'auto' && o.indoorDay);
  const wantOutdoor = o.weather === 'outdoor';
  const cap = BUDGET_CAP[o.budget];
  const withinRadius = (s: Stop) => !s.coords || milesBetween(HOME, s.coords) <= o.radius;
  const vibeOk = (v: Atmosphere[]) => o.atmosphere === 'any' || v.includes(o.atmosphere);
  // "Free" means known to cost nothing; other caps mean it can be done within that amount.
  const costOk = (c: [number, number] | null) => cap === Infinity || (c !== null && (cap === 0 ? c[1] === 0 : c[0] <= cap));

  for (const p of applyFamiliarity(inp.places.filter((x) => x.status !== 'placeholder'), o.familiarity, inp.data, (x) => `place:${x.id}`, (x) => x.id)) {
    const prof = CATEGORY_PROFILE[p.categories[0]];
    if (o.slot === 'evening' && prof.daytimeOnly) continue;
    if (o.slot !== 'evening' && prof.eveningOnly) continue;
    if (o.company === 'partner' && !prof.date) continue;
    if (o.company === 'friends' && !prof.friends) continue;
    if (o.energy !== 'any' && prof.energy !== o.energy) continue;
    if (wantIndoor && prof.indoor === false) continue;
    if (wantOutdoor && prof.indoor === true) continue;
    if (!vibeOk(prof.vibes)) continue;
    const s = placeStop(p);
    if (!costOk(s.cost) || !withinRadius(s)) continue;
    out.push(s);
  }

  const events = inp.events.filter((e) => {
    if (e.cancelled || isExpired(e, now)) return false;
    if (!onDate(e, o.date)) return false;
    if (!e.ongoing && !e.allDay && slotOf(e.start) !== o.slot) return false;
    if (e.ongoing && o.slot === 'evening') return false;
    if (wantIndoor && e.indoor === false) return false;
    if (wantOutdoor && e.indoor === true) return false;
    return vibeOk(vibesOfEvent(e));
  });
  for (const e of applyFamiliarity(events, o.familiarity, inp.data, (x) => `event:${x.id}`)) {
    const s = eventStop(e, o.date);
    if (costOk(s.cost) && withinRadius(s) && reachable(s)) out.push(s);
  }

  for (const c of inp.communities) {
    if (!occurrences(c, o.date, o.date).length) continue;
    if (!c.company.includes(o.company)) continue;
    const s = communityStop(c, o.date, inp.places);
    // A published time must fall in the chosen part of the day (e.g. a 5–9 PM meetup isn't a morning plan).
    if (s.window && !inWindow(s.window, o.slot)) continue;
    if (withinRadius(s) && (cap === Infinity || s.cost) && reachable(s)) out.push(s);
  }
  return out;
}

/** What we can honestly say about the distance between two stops. */
export function proximity(a: Stop, b: Stop): Proximity {
  if (a.precision === 'venue' && b.precision === 'venue' && a.coords && b.coords) return { kind: 'venue', miles: milesBetween(a.coords, b.coords) };
  if (!a.coords || !b.coords || !a.cityName || !b.cityName) return { kind: 'unknown' };
  if (a.cityName === b.cityName) {
    if (a.neighborhood && a.neighborhood === b.neighborhood) return { kind: 'neighborhood', name: a.neighborhood, city: a.cityName };
    return { kind: 'same-city', city: a.cityName };
  }
  return { kind: 'cities', miles: milesBetween(cityCoords(a.cityName)!, cityCoords(b.cityName)!), from: a.cityName, to: b.cityName };
}

const SPEED_MPH: Record<Transport, number> = { walk: 3, bike: 10, transit: 12, car: 25 };
/** Time set aside between stops when the distance isn't verified (labelled as an allowance). */
const UNVERIFIED_ALLOWANCE: Record<Transport, number> = { walk: 40, bike: 25, transit: 45, car: 25 };

/** Rough minutes between stops: straight-line miles at a typical speed plus 10 min to park/transfer. */
export function travelMinutes(p: Proximity, transport: Transport): number {
  if (p.kind === 'single') return 0;
  if (p.kind === 'venue' || p.kind === 'cities') return Math.round((p.miles / SPEED_MPH[transport]) * 60) + 10;
  return UNVERIFIED_ALLOWANCE[transport];
}

/** Within an easy hop for this way of getting around? Unverified distances aren't ruled out, only labelled. */
function withinHop(p: Proximity, transport: Transport): boolean {
  return p.kind === 'venue' || p.kind === 'cities' ? p.miles <= HOP_MILES[transport] : true;
}

/** Plain-language travel line. Never claims an easy walk unless both venues are pinned and close. */
export function describeTravel(p: Proximity, transport: Transport): string {
  const mode = transport === 'walk' ? 'walk' : transport === 'bike' ? 'ride' : transport === 'transit' ? 'by transit' : 'drive';
  switch (p.kind) {
    case 'single':
      return 'One stop — plenty of room to wander';
    case 'venue': {
      const mins = travelMinutes(p, transport);
      const miles = p.miles < 0.1 ? 'Next door' : `~${p.miles < 1 ? p.miles.toFixed(1) : Math.round(p.miles)} mi apart`;
      return `${miles} (straight line) · roughly ${mins} min ${mode === 'by transit' ? 'by transit' : mode}, est.`;
    }
    case 'neighborhood':
      return `Both in ${p.name}, ${p.city} — exact distance not verified, check the map`;
    case 'same-city':
      return `Both in ${p.city} — distance between them not verified, check the map`;
    case 'cities':
      return `~${Math.max(1, Math.round(p.miles))} mi between ${p.from} and ${p.to} (city centers, straight line)`;
    default:
      return 'Distance between stops unknown — check the map';
  }
}

function group(s: Stop): string {
  if (s.place) return s.place.categories[0];
  if (s.event) return s.event.categories[0] ?? 'event';
  return 'community';
}

/** A concrete timetable for one or two stops, on the plan date's clock (minutes after midnight). */
export interface Schedule {
  start: number;
  end: number;
  travel: number;
  wait: number;
  /** Minutes actually spent at each stop (a drop-in joined late is shorter). */
  visits: number[];
  /** Arrival at each stop. */
  arrivals: number[];
}

function visitLength(s: Stop, arrival: number): number {
  return s.window?.kind === 'drop-in' ? Math.min(s.minutes, s.window.end - arrival) : s.minutes;
}

/**
 * Lay the stops out in time, or return null if that's impossible:
 *  - a fixed start must be reached by its start time; a drop-in window by its latest join time;
 *  - on a same-day plan nothing starts before now + LEAD_MINUTES;
 *  - flexible places (hours unknown) never start before the chosen part of the day or at/after
 *    its end, and must be done by midnight — so nothing is scheduled after a late event;
 *  - a flexible first stop is moved later, if needed, so nobody waits for a fixed second start.
 */
export function schedule(a: Stop, b: Stop | undefined, transport: Transport, clock: Clock): Schedule | null {
  const travel = b ? travelMinutes(proximity(a, b), transport) : 0;
  const earliestFor = (s: Stop) => (s.window ? Math.max(s.window.earliest, clock.today ? clock.floor : -Infinity) : clock.floor);
  // Places (hours unknown) start within the chosen part of the day and are done by midnight.
  const ok = (s: Stop, t: number) => (s.window ? t <= s.window.latest : t < clock.slotEnd && t + s.minutes <= DAY_END);

  let aStart = earliestFor(a);
  if (!a.window && b?.window) aStart = Math.max(aStart, b.window.earliest - travel - a.minutes);
  if (!ok(a, aStart)) return null;
  const aVisit = visitLength(a, aStart);
  if (!b) return { start: aStart, end: aStart + aVisit, travel: 0, wait: 0, visits: [aVisit], arrivals: [aStart] };

  const ready = aStart + aVisit + travel;
  const bStart = b.window ? Math.max(ready, b.window.earliest) : ready;
  if (!ok(b, bStart)) return null;
  const bVisit = visitLength(b, bStart);
  return { start: aStart, end: bStart + bVisit, travel, wait: bStart - ready, visits: [aVisit, bVisit], arrivals: [aStart, bStart] };
}

/** A whole-day clock (not today): used when only the order of two stops matters. */
const ANY_TIME: Clock = { today: false, slotStart: 0, slotEnd: 1440, floor: 0, over: false };

/** Can `b` follow `a`? Travel and any wait (minutes), or null if their times make it impossible. */
export function sequence(a: Stop, b: Stop, transport: Transport, clock: Clock = ANY_TIME): { travel: number; wait: number } | null {
  const sch = schedule(a, b, transport, clock);
  return sch && { travel: sch.travel, wait: sch.wait };
}

const fmtHours = (m: number) => (m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`);

/** Which of the user's filters this stop doesn't meet (only checked for anchors, which bypass filters). */
function anchorConflicts(s: Stop, o: AdventureOptions, now: number, clock: Clock): string[] {
  const out: string[] = [];
  const cap = BUDGET_CAP[o.budget];
  if (s.event) {
    const e = s.event;
    if (e.cancelled) out.push('it’s listed as cancelled');
    else if (isExpired(e, now)) out.push('it has already ended');
    if (!onDate(e, o.date)) out.push(`it isn’t on the date you chose (${nyDate(Date.parse(e.start))})`);
    else if (!e.ongoing && !e.allDay && slotOf(e.start) !== o.slot) out.push(`it starts in the ${slotOf(e.start)}, not the ${o.slot}`);
  }
  if (s.community) {
    if (!occurrences(s.community, o.date, o.date).length) out.push('it doesn’t meet on the date you chose');
    else if (s.window && !inWindow(s.window, o.slot)) out.push(`its published time isn’t in the ${o.slot}`);
  }
  // Same day: is it still possible to get there?
  if (clock.today && s.window && clock.now !== undefined && !(s.event && isExpired(s.event, now))) {
    if (s.window.latest < clock.floor) {
      if (s.window.kind === 'drop-in') out.push(`it’s too late to join today (last entry about ${clockLabel(s.window.latest)})`);
      else if (s.window.earliest <= clock.now) out.push(`it already started at ${clockLabel(s.window.earliest)}`);
      else out.push(`it starts at ${clockLabel(s.window.earliest)} — probably too soon to get there`);
    }
  }
  if (!s.window && clock.over) out.push(`the ${o.slot} is already over today`);
  if (s.place) {
    const prof = CATEGORY_PROFILE[s.place.categories[0]];
    if (o.slot === 'evening' && prof.daytimeOnly) out.push('it’s usually a daytime place');
    if (o.slot !== 'evening' && prof.eveningOnly) out.push('it’s usually an evening place');
  }
  if (cap !== Infinity) {
    if (!s.cost) out.push('its cost isn’t listed');
    else if (cap === 0 ? s.cost[1] > 0 : s.cost[0] > cap) out.push('it’s over your budget');
  }
  if (s.coords && milesBetween(HOME, s.coords) > o.radius) out.push(`it’s outside your ${o.radius}-mile radius`);
  return out;
}

/** What the estimates leave out, said plainly. */
function scopeNote(o: AdventureOptions, hasFood: boolean): Adventure['scope'] {
  const timeLeavesOut = ['getting to the first stop', 'getting home', ...(hasFood ? ['the food stop'] : [])];
  const fares = o.transport === 'car' ? ['parking', 'gas'] : o.transport === 'transit' ? ['fares'] : [];
  const costLeavesOut = [...fares, ...(hasFood ? ['food'] : [])];
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0]);
  const note =
    `Time counts the stops and getting between them — not ${list(timeLeavesOut)}.` +
    ` Cost is per-person admission only${costLeavesOut.length ? ` — no ${list(costLeavesOut)}` : ''}.`;
  return { travelToFirstStop: false, returnTrip: false, transportCost: false, foodTime: false, foodCost: false, note };
}

/**
 * Pick a primary (events and communities first — they're the "what's on" of the day),
 * then a compatible secondary in a different category within an easy hop. The pair must fit
 * the per-person budget together, fit the time available including travel, be possible on
 * the clock (fixed starts, drop-in windows, same-day "now"), and never overlap.
 */
export function buildAdventure(inp: Inputs, o: AdventureOptions, rand: () => number = Math.random, now = Date.now()): Adventure | null {
  const pool = candidates(inp, o, now);
  const clock = planClock(o, now);
  const budgetMinutes = o.hours * 60;
  const cap = BUDGET_CAP[o.budget];
  const warnings: string[] = [];
  const info: string[] = [];
  const doable = (s: Stop) => {
    const sch = schedule(s, undefined, o.transport, clock);
    return sch !== null && sch.end - sch.start <= budgetMinutes;
  };

  let primary: Stop | undefined;
  let anchorOffPlan = false;
  if (o.anchor) {
    primary = pool.find((s) => s.key === o.anchor);
    if (!primary) {
      primary = anchorStop(inp, o);
      if (!primary) warnings.push('The pick you planned around isn’t listed any more, so here’s another idea.');
      else {
        const why = anchorConflicts(primary, o, now, clock);
        if (why.length) warnings.push(`Planned around your pick even though ${why.join(', ')}.`);
        // Don't build a timetable around something that can't happen on this plan's clock.
        anchorOffPlan = why.length > 0;
      }
    }
    if (primary && primary.minutes > budgetMinutes) warnings.push(`Your pick runs about ${fmtHours(primary.minutes)} — longer than the ~${o.hours} hours you set.`);
  }
  if (!primary) {
    // Never pick something longer than the time available, or impossible on the clock.
    const fitsTime = pool.filter(doable);
    const timed = fitsTime.filter((s) => s.kind !== 'place');
    const pickFrom = timed.length && rand() < 0.65 ? timed : fitsTime;
    if (!pickFrom.length) return null;
    primary = pickFrom[Math.floor(rand() * pickFrom.length)];
  }

  // Pair costs: the cheapest way to do both must fit the budget ("free" = both known free).
  const pairCostOk = (a: Stop, b: Stop) =>
    cap === Infinity || (a.cost !== null && b.cost !== null && (cap === 0 ? a.cost[1] + b.cost[1] === 0 : a.cost[0] + b.cost[0] <= cap));

  let secondary: Stop | undefined;
  let plan = anchorOffPlan ? null : schedule(primary, undefined, o.transport, clock);
  if (!anchorOffPlan && budgetMinutes - primary.minutes >= 60) {
    const fits = pool
      .map((s) => ({ s, p: proximity(primary!, s), sch: schedule(primary!, s, o.transport, clock) }))
      .filter(({ s, p, sch }) => {
        if (s.key === primary!.key || group(s) === group(primary!)) return false;
        if (!withinHop(p, o.transport) || !pairCostOk(primary!, s)) return false;
        return sch !== null && sch.end - sch.start <= budgetMinutes;
      });
    // Prefer what we know is close: pinned venues within the hop, then the same neighborhood,
    // then the same city (distance unverified), then nearby cities.
    const rank = (k: Proximity['kind']) => ({ venue: 0, neighborhood: 1, 'same-city': 2, cities: 3, unknown: 4, single: 5 })[k];
    const best = Math.min(...fits.map((f) => rank(f.p.kind)));
    const choice = fits.filter((f) => rank(f.p.kind) === best);
    const pick = choice.length ? choice[Math.floor(rand() * choice.length)] : undefined;
    if (pick) {
      secondary = pick.s;
      plan = pick.sch;
    }
  }

  const stopsMinutes = plan ? plan.visits.reduce((a, b) => a + b, 0) : primary.minutes;
  const time = {
    stops: stopsMinutes,
    travel: plan?.travel ?? 0,
    wait: plan?.wait ?? 0,
    total: plan ? plan.end - plan.start : primary.minutes,
    budget: budgetMinutes,
    ...(plan ? { start: plan.start, end: plan.end } : {}),
  };

  const wantsFood = budgetMinutes >= 240 || o.slot === 'evening' || (o.slot === 'morning' && stopsMinutes >= 150);
  const foodLabel =
    o.slot === 'evening' ? 'Dinner nearby' : o.slot === 'morning' ? 'Lunch nearby' : o.company === 'partner' ? 'A café or late lunch nearby' : 'Food nearby';
  const food = wantsFood ? { label: foodLabel, near: secondary ?? primary } : undefined;

  const stops = [primary, secondary].filter(Boolean) as Stop[];
  const unknown = stops.some((s) => !s.cost);
  const cost = stops.reduce((a, s) => ({ min: a.min + (s.cost?.[0] ?? 0), max: a.max + (s.cost?.[1] ?? 0) }), { min: 0, max: 0 });
  if (cap !== Infinity && cap > 0 && cost.max > cap) warnings.push(`Could run up to $${cost.max} per person at the top of the listed prices — above your $${cap} budget.`);
  if (unknown && cap === Infinity) info.push(stops.length > 1 ? 'One of the stops doesn’t list a price.' : 'This stop doesn’t list a price.');

  // Details the listings don't give: one neutral, plan-level line (not a warning).
  const wantIndoor = o.weather === 'indoor' || (o.weather === 'auto' && o.indoorDay);
  const unknownDetail = new Set<string>();
  for (const st of stops) {
    if (st.place) {
      if ((wantIndoor || o.weather === 'outdoor') && CATEGORY_PROFILE[st.place.categories[0]].indoor === undefined) unknownDetail.add('whether it’s indoors or out');
      continue;
    }
    if (o.energy !== 'any') unknownDetail.add('how active it is');
    if (st.kind === 'event' && o.company !== 'solo') unknownDetail.add('who it suits best');
    if (st.kind === 'community' && o.atmosphere !== 'any') unknownDetail.add('its atmosphere');
    if ((wantIndoor || o.weather === 'outdoor') && (st.kind === 'community' || st.event?.indoor === undefined)) unknownDetail.add('whether it’s indoors or out');
  }
  if (unknownDetail.size) {
    const xs = [...unknownDetail];
    const said = xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0];
    info.push(`Not every listing says ${said}, so ${xs.length > 1 ? 'those preferences were' : 'that preference was'} only applied where it does.`);
  }

  const prox: Proximity = secondary ? proximity(primary, secondary) : { kind: 'single' };
  const travel = describeTravel(prox, o.transport);
  const milesFromHome = primary.coords ? Math.round(milesBetween(HOME, primary.coords)) : undefined;
  return {
    primary,
    secondary,
    food,
    cost: { ...cost, unknown, excludesFood: true },
    time,
    warnings,
    info,
    scope: scopeNote(o, Boolean(food)),
    travel,
    proximity: prox,
    milesFromHome,
    homeBasis: primary.precision,
  };
}

/** A stop for an anchor that fell outside the filters (the user asked for it explicitly). */
function anchorStop(inp: Inputs, o: AdventureOptions): Stop | undefined {
  const [kind, ...rest] = (o.anchor ?? '').split(':');
  const id = rest.join(':');
  if (kind === 'place') {
    const p = inp.places.find((x) => x.id === id);
    return p ? placeStop(p) : undefined;
  }
  if (kind === 'event') {
    const e = inp.events.find((x) => x.id === id);
    return e ? eventStop(e, o.date) : undefined;
  }
  if (kind === 'community') {
    const c = inp.communities.find((x) => x.id === id);
    return c ? communityStop(c, o.date, inp.places) : undefined;
  }
  return undefined;
}
