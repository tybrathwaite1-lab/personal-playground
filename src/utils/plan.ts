/**
 * Plan a Day — strings 2–3 experiences (plus a meal break) into a loose itinerary.
 * Pure functions, no React, so they can be tested directly.
 */
import type { BudgetFilter, Company, CompanyFilter, Experience, Mood, MoodFilter, Place, TimeOfDay } from '../types';
import { BUDGET_CAPS } from './discovery';

export type DayStart = 'morning' | 'afternoon' | 'evening';
export type DayLength = 'short' | 'half' | 'full';
export type Area = 'anywhere' | 'stpete' | 'tampa';

export interface PlanOptions {
  start: DayStart;
  length: DayLength;
  area: Area;
  mood: MoodFilter;
  company: CompanyFilter;
  budget: BudgetFilter;
  /** True when the forecast makes outdoor-only stops a poor bet. */
  indoorDay: boolean;
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  start: 'afternoon',
  length: 'half',
  area: 'anywhere',
  mood: 'surprise',
  company: 'anyone',
  budget: 'any',
  indoorDay: false,
};

export const START_MINUTES: Record<DayStart, number> = { morning: 9 * 60 + 30, afternoon: 13 * 60, evening: 17 * 60 + 30 };
export const STOPS: Record<DayLength, number> = { short: 2, half: 2, full: 3 };
const MAX_STOP_MINUTES: Record<DayLength, number> = { short: 90, half: 150, full: 180 };

const PINELLAS = ['st. petersburg', 'clearwater', 'seminole', 'tierra verde', 'pinellas park', 'largo', 'dunedin', 'gulfport'];

export function placeInArea(p: Place, area: Area): boolean {
  if (area === 'anywhere') return true;
  const city = p.city.toLowerCase();
  return area === 'tampa' ? city === 'tampa' : PINELLAS.includes(city);
}

export interface PlanStop {
  kind: 'experience' | 'break';
  experience?: Experience;
  place?: Place;
  /** Minutes from midnight. */
  startsAt: number;
  minutes: number;
  label?: string;
}

export interface DayPlan {
  stops: PlanStop[];
  cost: { min: number; max: number };
  endsAt: number;
}

function typicalMinutes(e: Experience, cap: number): number {
  const mid = Math.round((e.duration.min + e.duration.max) / 2 / 15) * 15;
  return Math.max(e.duration.min, Math.min(mid, cap));
}

/** Experiences that work as one stop in a day out. */
export function eligibleStops(all: Experience[], places: Place[], o: PlanOptions): Experience[] {
  const cap = MAX_STOP_MINUTES[o.length];
  return all.filter((e) => {
    if (e.duration.min > cap) return false; // whole-day experiences aren't a "stop"
    if (e.environments.length === 1 && e.environments[0] === 'online') return false;
    if (o.company !== 'anyone' && !e.company.includes(o.company as Company)) return false;
    if (o.budget !== 'any' && e.cost.min > BUDGET_CAPS[o.budget]) return false;
    if (o.indoorDay && e.environments.every((env) => env === 'outdoors')) return false;
    if (o.area !== 'anywhere' && e.placeIds?.length) {
      const inArea = e.placeIds.some((id) => {
        const p = places.find((x) => x.id === id);
        return p ? placeInArea(p, o.area) : false;
      });
      if (!inArea) return false;
    }
    return true;
  });
}

function pickPlace(e: Experience, places: Place[], area: Area, rand: () => number): Place | undefined {
  const options = (e.placeIds ?? [])
    .map((id) => places.find((p) => p.id === id))
    .filter(
      (p): p is Place =>
        Boolean(p) && p!.status !== 'placeholder' && !/citywide/i.test(p!.neighborhood) && placeInArea(p!, area),
    );
  return options[Math.floor(rand() * options.length)];
}

/**
 * Build a plan. Stops favor going out (home-only ideas are allowed only as the
 * final evening wind-down), vary their mood, and never repeat.
 * `keep` lets a single stop be re-rolled while the others stay put.
 */
export function buildPlan(
  all: Experience[],
  places: Place[],
  o: PlanOptions,
  rand: () => number = Math.random,
  keep: (Experience | null)[] = [],
): DayPlan | null {
  const pool = eligibleStops(all, places, o);
  const count = STOPS[o.length];
  const chosen: Experience[] = [];
  const isLast = (i: number) => i === count - 1;
  const homeOnly = (e: Experience) => e.environments.every((env) => env === 'home' || env === 'online');

  const cap = MAX_STOP_MINUTES[o.length];
  let t = START_MINUTES[o.start];
  const advance = (e: Experience) => {
    t += typicalMinutes(e, cap);
    t += mealFor(t).minutes;
  };

  for (let i = 0; i < count; i++) {
    const kept = keep[i];
    // Keep a stop the user liked — unless the new timing pushes it outside its hours.
    if (kept && !chosen.some((c) => c.id === kept.id) && (!kept.when || kept.when.includes(slotFor(t)))) {
      chosen.push(kept);
      advance(kept);
      continue;
    }
    const slot = slotFor(t);
    const prevMoods = new Set<Mood>(chosen[chosen.length - 1]?.moods ?? []);
    let candidates = pool.filter((e) => {
      if (chosen.some((c) => c.id === e.id) || keep.some((k) => k?.id === e.id)) return false;
      if (homeOnly(e) && !(isLast(i) && o.start !== 'morning')) return false;
      if (e.when && !e.when.includes(slot)) return false;
      return true;
    });
    // The chosen mood leads the day when it can; if nothing fits, it becomes a preference, not a wall.
    if (i === 0 && o.mood !== 'surprise') {
      const moodFit = candidates.filter((e) => e.moods.includes(o.mood as Mood));
      if (moodFit.length) candidates = moodFit;
    }
    // Prefer a change of pace from the previous stop.
    const varied = candidates.filter((e) => !e.moods.every((m) => prevMoods.has(m)));
    if (varied.length) candidates = varied;
    // Prefer stops anchored to a real place in the chosen area.
    if (o.area !== 'anywhere') {
      const anchored = candidates.filter((e) => e.placeIds?.some((id) => places.some((p) => p.id === id && placeInArea(p, o.area))));
      if (anchored.length) candidates = anchored;
    }
    if (!candidates.length) return chosen.length >= 2 ? assemble(chosen, places, o, rand) : null;
    const pick = candidates[Math.floor(rand() * candidates.length)];
    chosen.push(pick);
    advance(pick);
  }
  return assemble(chosen, places, o, rand);
}

function assemble(chosen: Experience[], places: Place[], o: PlanOptions, rand: () => number): DayPlan {
  const cap = MAX_STOP_MINUTES[o.length];
  let t = START_MINUTES[o.start];
  const stops: PlanStop[] = [];
  chosen.forEach((e, i) => {
    const minutes = typicalMinutes(e, cap);
    stops.push({ kind: 'experience', experience: e, place: pickPlace(e, places, o.area, rand), startsAt: t, minutes });
    t += minutes;
    if (i < chosen.length - 1) {
      // A meal or coffee break between stops; a little travel time is folded in.
      const meal = mealFor(t);
      stops.push({ kind: 'break', startsAt: t, minutes: meal.minutes, label: meal.label });
      t += meal.minutes;
    }
  });
  const cost = chosen.reduce((acc, e) => ({ min: acc.min + e.cost.min, max: acc.max + e.cost.max }), { min: 0, max: 0 });
  return { stops, cost, endsAt: t };
}

function slotFor(t: number): TimeOfDay {
  if (t < 12 * 60) return 'morning';
  if (t < 17 * 60) return 'afternoon';
  return 'evening';
}

function mealFor(t: number): { label: string; minutes: number } {
  if (t >= 11 * 60 && t < 14 * 60 + 30) return { label: 'Lunch somewhere nearby', minutes: 60 };
  if (t >= 17 * 60 && t < 21 * 60) return { label: 'Dinner somewhere good', minutes: 75 };
  return { label: 'Coffee, tea or a snack — and the drive over', minutes: 30 };
}

export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${mm}${suffix}`;
}

export function planSummary(plan: DayPlan): string {
  return plan.stops
    .map((s) => `${formatClock(s.startsAt)} ${s.kind === 'break' ? s.label : s.experience!.name}${s.place ? ` @ ${s.place.name}` : ''}`)
    .join(' → ');
}
