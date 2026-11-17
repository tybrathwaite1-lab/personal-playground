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
  cost: { min: number; max: number; unknown: boolean };
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
  };
}

export function communityStop(c: Community, date: string, places: Place[] = []): Stop {
  // A community held at a known place can use that place's verified coordinates.
  const venue = c.coords ?? places.find((p) => p.id === c.placeId)?.coords;
  return {
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
 * Pick a primary (events and communities first — they're the "what's on" of the day),
 * then a compatible secondary in a different category within an easy hop.
 */
export function buildAdventure(inp: Inputs, o: AdventureOptions, rand: () => number = Math.random, now = Date.now()): Adventure | null {
  const pool = candidates(inp, o, now);
  let primary: Stop | undefined;
  if (o.anchor) {
    primary = pool.find((s) => s.key === o.anchor) ?? anchorStop(inp, o);
  }
  if (!primary) {
    const timed = pool.filter((s) => s.kind !== 'place');
    const pickFrom = timed.length && rand() < 0.65 ? timed : pool;
    if (!pickFrom.length) return null;
    primary = pickFrom[Math.floor(rand() * pickFrom.length)];
  }

  const budgetMinutes = o.hours * 60;

  let secondary: Stop | undefined;
  if (budgetMinutes - primary.minutes >= 60) {
    const fits = pool.filter((s) => {
      if (s.key === primary!.key || group(s) === group(primary!)) return false;
      const p = proximity(primary!, s);
      if (!withinHop(p, o.transport)) return false;
      return primary!.minutes + s.minutes + travelMinutes(p, o.transport) <= budgetMinutes + 30;
    });
    // Prefer what we know is close: pinned venues within the hop, then the same neighborhood,
    // then the same city (distance unverified), then nearby cities.
    const rank = (s: Stop) => ({ venue: 0, neighborhood: 1, 'same-city': 2, cities: 3, unknown: 4, single: 5 })[proximity(primary!, s).kind];
    const best = Math.min(...fits.map(rank));
    const choice = fits.filter((s) => rank(s) === best);
    secondary = choice.length ? choice[Math.floor(rand() * choice.length)] : undefined;
  }

  const total = primary.minutes + (secondary?.minutes ?? 0);
  const wantsFood = budgetMinutes >= 240 || o.slot === 'evening' || (o.slot === 'morning' && total >= 150);
  const foodLabel =
    o.slot === 'evening' ? 'Dinner nearby' : o.slot === 'morning' ? 'Lunch nearby' : o.company === 'partner' ? 'A café or late lunch nearby' : 'Food nearby';
  const food = wantsFood ? { label: foodLabel, near: secondary ?? primary } : undefined;

  const stops = [primary, secondary].filter(Boolean) as Stop[];
  const unknown = stops.some((s) => !s.cost);
  const cost = stops.reduce((a, s) => ({ min: a.min + (s.cost?.[0] ?? 0), max: a.max + (s.cost?.[1] ?? 0) }), { min: 0, max: 0 });
  const prox: Proximity = secondary ? proximity(primary, secondary) : { kind: 'single' };
  const travel = describeTravel(prox, o.transport);
  const milesFromHome = primary.coords ? Math.round(milesBetween(HOME, primary.coords)) : undefined;
  return { primary, secondary, food, cost: { ...cost, unknown }, travel, proximity: prox, milesFromHome, homeBasis: primary.precision };
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
