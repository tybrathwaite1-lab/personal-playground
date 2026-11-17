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
   * When it can be attended, in minutes after midnight New York time. Events: fixed start
   * (earliest = latest). Communities: their published window. Places: undefined (flexible).
   */
  window?: { earliest: number; latest: number };
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
  /** Minutes: time at the stops, rough travel between them, any wait for a fixed start, and the total. */
  time: { stops: number; travel: number; wait: number; total: number; budget: number };
  /** Plain-language disclosures: filters that couldn't be applied, anchor conflicts, budget edges. */
  notes: string[];
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

export function eventStop(e: PulseEvent): Stop {
  const mins = e.end && !e.ongoing ? Math.min(240, Math.max(45, (Date.parse(e.end) - Date.parse(e.start)) / 60000)) : 120;
  const time = new Date(e.start).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return {
    key: `event:${e.id}`,
    kind: 'event',
    title: e.title,
    subtitle: [e.venue, e.city].filter(Boolean).join(' · '),
    minutes: Math.round(mins),
    time: e.ongoing || e.allDay ? 'During opening hours' : time,
    ...locate(e.geo, e.city),
    cityName: e.city,
    cost: priceRange(e),
    url: e.url,
    directions: { name: e.venue ?? e.title, address: e.address, city: e.city ?? 'St. Petersburg' },
    event: e,
    hoursNote: e.ongoing ? 'Exhibition — check the venue’s hours' : 'Time from the venue’s calendar',
    ...(e.ongoing || e.allDay ? {} : { window: { earliest: nyMinutes(e.start), latest: nyMinutes(e.start) } }),
  };
}

/** A community's published window on that date, if its schedule gives a start time. */
function communityWindow(c: Community, date: string, minutes: number): Stop['window'] {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  const r = c.rules?.find((x) => x.weekday === wd);
  if (!r?.start) return undefined;
  const start = hm(r.start);
  return { earliest: start, latest: r.end ? Math.max(start, hm(r.end) - minutes) : start };
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
    const s = nyDate(Date.parse(e.start));
    const en = nyDate(effectiveEnd(e) - 1);
    if (!(s <= o.date && en >= o.date)) return false;
    if (!e.ongoing && !e.allDay && slotOf(e.start) !== o.slot) return false;
    if (e.ongoing && o.slot === 'evening') return false;
    if (wantIndoor && e.indoor === false) return false;
    if (wantOutdoor && e.indoor === true) return false;
    return vibeOk(vibesOfEvent(e));
  });
  for (const e of applyFamiliarity(events, o.familiarity, inp.data, (x) => `event:${x.id}`)) {
    const s = eventStop(e);
    if (costOk(s.cost) && withinRadius(s)) out.push(s);
  }

  for (const c of inp.communities) {
    if (!occurrences(c, o.date, o.date).length) continue;
    if (!c.company.includes(o.company)) continue;
    const s = communityStop(c, o.date, inp.places);
    // A published time must fall in the chosen part of the day (e.g. a 5–9 PM meetup isn't a morning plan).
    if (s.window && !inWindow(s.window, o.slot)) continue;
    if (withinRadius(s) && (cap === Infinity || s.cost)) out.push(s);
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

/**
 * Can `b` follow `a`? Returns the travel and any wait (minutes) between them, or null if the
 * fixed times make it impossible (e.g. two events whose times overlap).
 */
export function sequence(a: Stop, b: Stop, transport: Transport): { travel: number; wait: number } | null {
  const travel = travelMinutes(proximity(a, b), transport);
  if (!a.window || !b.window) return { travel, wait: 0 }; // a flexible stop can be moved to fit
  const aDone = a.window.earliest + a.minutes;
  const bStart = Math.max(b.window.earliest, aDone + travel);
  if (bStart > b.window.latest) return null;
  return { travel, wait: bStart - (aDone + travel) };
}

const fmtHours = (m: number) => (m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`);

/** Which of the user's filters this stop doesn't meet (only checked for anchors, which bypass filters). */
function anchorConflicts(s: Stop, o: AdventureOptions, now: number): string[] {
  const out: string[] = [];
  const cap = BUDGET_CAP[o.budget];
  if (s.event) {
    const e = s.event;
    if (e.cancelled) out.push('it’s listed as cancelled');
    else if (isExpired(e, now)) out.push('it has already ended');
    const from = nyDate(Date.parse(e.start));
    const to = nyDate(effectiveEnd(e) - 1);
    if (!(from <= o.date && to >= o.date)) out.push(`it isn’t on the date you chose (${from})`);
    else if (!e.ongoing && !e.allDay && slotOf(e.start) !== o.slot) out.push(`it starts in the ${slotOf(e.start)}, not the ${o.slot}`);
  }
  if (s.community) {
    if (!occurrences(s.community, o.date, o.date).length) out.push('it doesn’t meet on the date you chose');
    else if (s.window && !inWindow(s.window, o.slot)) out.push(`its published time isn’t in the ${o.slot}`);
  }
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

/**
 * Pick a primary (events and communities first — they're the "what's on" of the day),
 * then a compatible secondary in a different category within an easy hop. The pair must fit
 * the per-person budget together, fit the time available including travel, and never overlap.
 */
export function buildAdventure(inp: Inputs, o: AdventureOptions, rand: () => number = Math.random, now = Date.now()): Adventure | null {
  const pool = candidates(inp, o, now);
  const budgetMinutes = o.hours * 60;
  const cap = BUDGET_CAP[o.budget];
  const notes: string[] = [];

  let primary: Stop | undefined;
  if (o.anchor) {
    primary = pool.find((s) => s.key === o.anchor);
    if (!primary) {
      primary = anchorStop(inp, o);
      if (!primary) notes.push('The pick you planned around isn’t listed any more, so here’s another idea.');
      else {
        const why = anchorConflicts(primary, o, now);
        if (why.length) notes.push(`Planned around your pick even though ${why.join(', ')}.`);
      }
    }
    if (primary && primary.minutes > budgetMinutes) notes.push(`Your pick runs about ${fmtHours(primary.minutes)} — longer than the ~${o.hours} hours you set.`);
  }
  if (!primary) {
    // Never pick something longer than the time available.
    const fitsTime = pool.filter((s) => s.minutes <= budgetMinutes);
    const timed = fitsTime.filter((s) => s.kind !== 'place');
    const pickFrom = timed.length && rand() < 0.65 ? timed : fitsTime;
    if (!pickFrom.length) return null;
    primary = pickFrom[Math.floor(rand() * pickFrom.length)];
  }

  // Pair costs: the cheapest way to do both must fit the budget ("free" = both known free).
  const pairCostOk = (a: Stop, b: Stop) =>
    cap === Infinity || (a.cost !== null && b.cost !== null && (cap === 0 ? a.cost[1] + b.cost[1] === 0 : a.cost[0] + b.cost[0] <= cap));

  let secondary: Stop | undefined;
  let leg: { travel: number; wait: number } | null = null;
  if (budgetMinutes - primary.minutes >= 60) {
    const fits = pool
      .map((s) => ({ s, p: proximity(primary!, s) }))
      .filter(({ s, p }) => {
        if (s.key === primary!.key || group(s) === group(primary!)) return false;
        if (!withinHop(p, o.transport) || !pairCostOk(primary!, s)) return false;
        const l = sequence(primary!, s, o.transport);
        return l !== null && primary!.minutes + l.travel + l.wait + s.minutes <= budgetMinutes;
      });
    // Prefer what we know is close: pinned venues within the hop, then the same neighborhood,
    // then the same city (distance unverified), then nearby cities.
    const rank = (k: Proximity['kind']) => ({ venue: 0, neighborhood: 1, 'same-city': 2, cities: 3, unknown: 4, single: 5 })[k];
    const best = Math.min(...fits.map((f) => rank(f.p.kind)));
    const choice = fits.filter((f) => rank(f.p.kind) === best);
    secondary = choice.length ? choice[Math.floor(rand() * choice.length)].s : undefined;
    if (secondary) leg = sequence(primary, secondary, o.transport);
  }

  const stopsMinutes = primary.minutes + (secondary?.minutes ?? 0);
  const time = { stops: stopsMinutes, travel: leg?.travel ?? 0, wait: leg?.wait ?? 0, total: stopsMinutes + (leg?.travel ?? 0) + (leg?.wait ?? 0), budget: budgetMinutes };

  const wantsFood = budgetMinutes >= 240 || o.slot === 'evening' || (o.slot === 'morning' && stopsMinutes >= 150);
  const foodLabel =
    o.slot === 'evening' ? 'Dinner nearby' : o.slot === 'morning' ? 'Lunch nearby' : o.company === 'partner' ? 'A café or late lunch nearby' : 'Food nearby';
  const food = wantsFood ? { label: foodLabel, near: secondary ?? primary } : undefined;

  const stops = [primary, secondary].filter(Boolean) as Stop[];
  const unknown = stops.some((s) => !s.cost);
  const cost = stops.reduce((a, s) => ({ min: a.min + (s.cost?.[0] ?? 0), max: a.max + (s.cost?.[1] ?? 0) }), { min: 0, max: 0 });
  if (cap !== Infinity && cap > 0 && cost.max > cap) notes.push(`Could run up to $${cost.max} per person at the top of the listed prices — above your $${cap} budget.`);
  if (unknown) notes.push('At least one stop doesn’t list a cost.');

  // Filters that can't be checked for some stops are said out loud, not silently skipped.
  const unchecked = new Set<string>();
  const wantIndoor = o.weather === 'indoor' || (o.weather === 'auto' && o.indoorDay);
  for (const st of stops) {
    if (st.place) {
      if ((wantIndoor || o.weather === 'outdoor') && CATEGORY_PROFILE[st.place.categories[0]].indoor === undefined) unchecked.add('indoor/outdoor');
      continue;
    }
    if (o.energy !== 'any') unchecked.add('energy level');
    if (st.kind === 'event' && o.company !== 'solo') unchecked.add('who it suits');
    if (st.kind === 'community' && o.atmosphere !== 'any') unchecked.add('atmosphere');
    if ((wantIndoor || o.weather === 'outdoor') && (st.kind === 'community' || st.event?.indoor === undefined)) unchecked.add('indoor/outdoor');
  }
  if (unchecked.size) notes.push(`Listings don’t say their ${[...unchecked].join(', ')}, so ${unchecked.size > 1 ? 'those filters weren’t' : 'that filter wasn’t'} applied to them.`);

  const prox: Proximity = secondary ? proximity(primary, secondary) : { kind: 'single' };
  const travel = describeTravel(prox, o.transport);
  const milesFromHome = primary.coords ? Math.round(milesBetween(HOME, primary.coords)) : undefined;
  return {
    primary,
    secondary,
    food,
    cost: { ...cost, unknown, excludesFood: true },
    time,
    notes,
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
    return e ? eventStop(e) : undefined;
  }
  if (kind === 'community') {
    const c = inp.communities.find((x) => x.id === id);
    return c ? communityStop(c, o.date, inp.places) : undefined;
  }
  return undefined;
}
