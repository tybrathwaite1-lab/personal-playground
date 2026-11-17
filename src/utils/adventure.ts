/**
 * Mini-adventure generator: two or three geographically compatible, real local
 * stops (places, listed events, recurring communities) plus an optional food stop.
 * Pure functions — testable without React.
 */
import type { Community, Company, Energy, Familiarity, PersonalData, Place, PlaceCategory, Transport } from '../types';
import type { PulseEvent } from '../types/pulse';
import { occurrences, ruleTime } from './community';
import { HOME, cityFor, milesBetween, type LatLon } from './geo';
import { applyFamiliarity } from './novelty';
import { effectiveEnd, isExpired, nyDate } from './pulse';

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
  coords: LatLon | null;
  cityName?: string;
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
  milesFromHome?: number;
}

function cityCoords(name?: string): LatLon | null {
  const c = cityFor(name ?? '');
  return c ? { lat: c.lat, lon: c.lon } : null;
}

function slotOf(iso: string): Slot {
  const h = Number(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })) % 24;
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function priceRange(e: PulseEvent): [number, number] | null {
  if (e.free) return [0, 0];
  const m = e.priceNote?.match(/\$\s?(\d+)(?:\.\d+)?(?:\s?[-–]\s?\$?(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
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
    coords: cityCoords(p.city),
    cityName: cityFor(p.city)?.name,
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
    coords: cityCoords(e.city),
    cityName: e.city,
    cost: priceRange(e),
    url: e.url,
    directions: { name: e.venue ?? e.title, address: e.address, city: e.city ?? 'St. Petersburg' },
    event: e,
    hoursNote: e.ongoing ? 'Exhibition — check the venue’s hours' : 'Time from the venue’s calendar',
  };
}

export function communityStop(c: Community, date: string): Stop {
  return {
    key: `community:${c.id}`,
    kind: 'community',
    title: c.name,
    subtitle: `${c.kind} · ${c.city}`,
    minutes: 120,
    time: ruleTime(c, date),
    coords: cityCoords(c.city),
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
    const s = communityStop(c, o.date);
    if (withinRadius(s) && (cap === Infinity || s.cost)) out.push(s);
  }
  return out;
}

function hop(a: Stop, b: Stop): number | null {
  if (!a.coords || !b.coords) return null;
  return milesBetween(a.coords, b.coords);
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
  const travelMins = (miles: number | null) => (miles === null ? 20 : Math.round((miles / ({ walk: 3, bike: 10, transit: 12, car: 25 } as const)[o.transport]) * 60) + 10);

  let secondary: Stop | undefined;
  if (budgetMinutes - primary.minutes >= 60) {
    const fits = pool.filter((s) => {
      if (s.key === primary!.key || group(s) === group(primary!)) return false;
      const h = hop(primary!, s);
      if (h !== null && h > HOP_MILES[o.transport]) return false;
      return primary!.minutes + s.minutes + travelMins(h) <= budgetMinutes + 30;
    });
    // Prefer the same city — the most reliable "near each other" signal we have.
    const sameCity = fits.filter((s) => s.cityName && s.cityName === primary!.cityName);
    const choice = sameCity.length ? sameCity : fits;
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
  const h = secondary ? hop(primary, secondary) : null;
  const travel = !secondary
    ? 'One stop — plenty of room to wander'
    : h === null
      ? 'Distance between stops unknown — check the map'
      : h < 1
        ? `Both in ${primary.cityName ?? 'the same area'} — an easy ${o.transport === 'walk' ? 'walk' : 'hop'}`
        : `About ${Math.round(h)} mi between stops by ${o.transport}`;
  const milesFromHome = primary.coords ? Math.round(milesBetween(HOME, primary.coords)) : undefined;
  return { primary, secondary, food, cost: { ...cost, unknown }, travel, milesFromHome };
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
    return c ? communityStop(c, o.date) : undefined;
  }
  return undefined;
}
