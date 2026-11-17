import type {
  BudgetFilter,
  DiscoveryFilters,
  Experience,
  Range,
  TimeFilter,
  VibePreset,
} from '../types';

export const DEFAULT_FILTERS: DiscoveryFilters = {
  mood: 'surprise',
  company: 'anyone',
  time: 'any',
  budget: 'any',
  energy: 'any',
  environment: 'anywhere',
};

/** Neutral value for each filter = "no constraint". */
export const NEUTRAL: DiscoveryFilters = DEFAULT_FILTERS;

export const TIME_RANGES: Record<Exclude<TimeFilter, 'any'>, Range> = {
  under30: { min: 0, max: 30 },
  hour: { min: 30, max: 90 },
  oneToThree: { min: 60, max: 180 },
  halfDay: { min: 180, max: 330 },
  fullDay: { min: 330, max: 900 },
};

export const BUDGET_CAPS: Record<Exclude<BudgetFilter, 'any'>, number> = {
  free: 0,
  u25: 25,
  u50: 50,
  u100: 100,
  u200: 200,
};

type Key = keyof DiscoveryFilters;
export const FILTER_KEYS: Key[] = ['mood', 'company', 'time', 'budget', 'energy', 'environment'];

/** Does a single filter accept this experience? */
export function matchesOne(exp: Experience, key: Key, f: DiscoveryFilters): boolean {
  switch (key) {
    case 'mood':
      return f.mood === 'surprise' || exp.moods.includes(f.mood);
    case 'company':
      return f.company === 'anyone' || exp.company.includes(f.company);
    case 'time': {
      if (f.time === 'any') return true;
      const r = TIME_RANGES[f.time];
      return exp.duration.min <= r.max && exp.duration.max >= r.min;
    }
    case 'budget':
      // Matches if the experience *can* be done within the budget.
      return f.budget === 'any' || exp.cost.min <= BUDGET_CAPS[f.budget];
    case 'energy':
      return f.energy === 'any' || exp.energy === f.energy;
    case 'environment':
      return f.environment === 'anywhere' || exp.environments.includes(f.environment);
  }
}

export function matches(exp: Experience, f: DiscoveryFilters): boolean {
  return FILTER_KEYS.every((k) => matchesOne(exp, k, f));
}

export function filterExperiences(all: Experience[], f: DiscoveryFilters): Experience[] {
  return all.filter((e) => matches(e, f));
}

export function activeFilterKeys(f: DiscoveryFilters): Key[] {
  return FILTER_KEYS.filter((k) => f[k] !== NEUTRAL[k]);
}

export interface Relaxation {
  key: Key;
  count: number;
}

/**
 * When nothing matches, report how many results each single relaxed filter would give.
 * Sorted so the most useful suggestion comes first. Filters are never silently dropped.
 */
export function suggestRelaxations(all: Experience[], f: DiscoveryFilters): Relaxation[] {
  return activeFilterKeys(f)
    .map((key) => ({ key, count: filterExperiences(all, { ...f, [key]: NEUTRAL[key] }).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Fallback when no single filter helps: the pair of filters whose removal opens the most options. */
export function suggestPairRelaxation(
  all: Experience[],
  f: DiscoveryFilters,
): { keys: [Key, Key]; count: number } | null {
  const keys = activeFilterKeys(f);
  let best: { keys: [Key, Key]; count: number } | null = null;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const count = filterExperiences(all, { ...f, [keys[i]]: NEUTRAL[keys[i]], [keys[j]]: NEUTRAL[keys[j]] }).length;
      if (count > 0 && (!best || count > best.count)) best = { keys: [keys[i], keys[j]], count };
    }
  }
  return best;
}

export function filtersSignature(f: DiscoveryFilters): string {
  return FILTER_KEYS.map((k) => f[k]).join('|');
}

/**
 * Pick a random experience, avoiding anything in `seen` until every match has been shown.
 * Returns the pick and the updated seen-list for this filter combination.
 * `rand` is injectable for testing.
 */
export function pickExperience(
  candidates: Experience[],
  seen: string[],
  lastId: string | null,
  rand: () => number = Math.random,
): { pick: Experience | null; seen: string[]; cycled: boolean } {
  if (candidates.length === 0) return { pick: null, seen, cycled: false };
  const ids = new Set(candidates.map((c) => c.id));
  let validSeen = seen.filter((id) => ids.has(id));
  let pool = candidates.filter((c) => !validSeen.includes(c.id));
  let cycled = false;
  if (pool.length === 0) {
    // Everything has been shown — start a new cycle, but never repeat the last card immediately.
    cycled = true;
    validSeen = [];
    pool = candidates.length > 1 ? candidates.filter((c) => c.id !== lastId) : candidates;
  }
  const pick = pool[Math.floor(rand() * pool.length)] ?? pool[0];
  return { pick, seen: [...validSeen, pick.id], cycled };
}

// ─── Display helpers ────────────────────────────────────────────────
export function formatCost(r: Range): string {
  if (r.max === 0) return 'Free';
  if (r.min === 0) return `Free – $${r.max}`;
  if (r.min === r.max) return `~$${r.min}`;
  return `$${r.min} – $${r.max}`;
}

function fmtMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return Number.isInteger(h) ? `${h} hr` : `${h.toFixed(1).replace(/\.0$/, '')} hr`;
}

export function formatDuration(r: Range): string {
  if (r.min >= 360) return 'Full day';
  if (r.min === r.max) return fmtMinutes(r.min);
  if (r.max < 60) return `${r.min}–${r.max} min`;
  return `${fmtMinutes(r.min)} – ${fmtMinutes(r.max)}`;
}

// ─── Pick a Vibe ────────────────────────────────────────────────────

/** Experiences matching a vibe preset. Interests narrow when they can; they never empty the pool. */
export function vibePool(all: Experience[], v: VibePreset): Experience[] {
  const f: DiscoveryFilters = { ...DEFAULT_FILTERS, ...v.filters };
  let pool = filterExperiences(all, f);
  if (v.environments?.length) pool = pool.filter((e) => e.environments.some((x) => v.environments!.includes(x)));
  if (v.moods?.length) pool = pool.filter((e) => e.moods.some((m) => v.moods!.includes(m)));
  if (v.maxCost !== undefined) pool = pool.filter((e) => e.cost.min <= v.maxCost!);
  if (v.maxTotal !== undefined) pool = pool.filter((e) => e.cost.max <= v.maxTotal!);
  if (v.minutes) pool = pool.filter((e) => e.duration.min <= v.minutes![1] && e.duration.max >= v.minutes![0]);
  if (v.interests?.length) {
    const needles = v.interests.map((i) => i.toLowerCase());
    const tagged = pool.filter((e) => e.interests.some((t) => needles.some((n) => t.toLowerCase().includes(n))));
    if (tagged.length) pool = tagged;
  }
  return pool;
}

/** Turn a preset into Discovery Engine URL params (for "open in the engine"). */
export function vibeToParams(v: VibePreset): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v.filters)) if (val) out[k] = String(val);
  if (!out.environment && v.environments?.length === 1) out.environment = v.environments[0];
  if (!out.mood && v.moods?.length === 1) out.mood = v.moods[0];
  if (!out.budget && v.maxTotal !== undefined) out.budget = v.maxTotal <= 0 ? 'free' : v.maxTotal <= 25 ? 'u25' : v.maxTotal <= 50 ? 'u50' : 'u100';
  if (!out.time && v.minutes) out.time = v.minutes[1] <= 30 ? 'under30' : v.minutes[1] <= 90 ? 'hour' : 'oneToThree';
  return out;
}
