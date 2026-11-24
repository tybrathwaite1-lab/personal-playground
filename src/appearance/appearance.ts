/**
 * Appearance: which atmosphere a visitor has chosen, and how they've adjusted each one
 * (Creative Slice 03, Phase 3.2: the foundation only; no controls ship yet).
 *
 *  - A per-device preference, like the time-of-day atmosphere: kept in localStorage under its
 *    own key, never in personal data, backups, Sync or the legacy settings mirror.
 *  - `look: null` is the explicit default: today's Playground, unchanged.
 *  - Each atmosphere keeps its own colour and type, so switching away and back loses nothing.
 *  - Two copies: the *saved* appearance, and a *draft* that exists only while previewing.
 *    What's on screen is the draft if there is one, else the saved appearance. Commit saves the
 *    draft; cancel drops it. Nothing in a draft is ever stored.
 *
 * Everything here is pure except loadAppearance/saveAppearance, which never throw.
 */
import { LOOKS, isLookId, lookById, type LookId } from './looks';

export const APPEARANCE_KEY = 'personal-playground:appearance';

export interface LookCustom {
  palette: string;
  type: string;
}

export interface Appearance {
  /** The chosen atmosphere; null = no preference (the default Playground). */
  look: LookId | null;
  /** Colour and type per atmosphere, only for those that have been adjusted. */
  custom: Partial<Record<LookId, LookCustom>>;
}

/** The default: no atmosphere chosen, nothing adjusted. */
export const DEFAULT_APPEARANCE: Appearance = Object.freeze({ look: null, custom: Object.freeze({}) }) as Appearance;

/** What is actually applied: null for the default Playground. */
export type Resolved = { look: LookId; palette: string; type: string } | null;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A look's colour and type: its saved adjustment, or the curated defaults. */
export function customFor(a: Appearance, look: LookId): LookCustom {
  const l = lookById(look);
  return a.custom[look] ?? { palette: l.palettes[0].id, type: l.types[0].id };
}

export function resolve(a: Appearance): Resolved {
  return a.look ? { look: a.look, ...customFor(a, a.look) } : null;
}

/**
 * Reads a stored value of any shape into a valid Appearance. Never throws. Anything unknown is
 * dropped: an unknown atmosphere becomes the default; an unknown colour or type falls back to
 * that atmosphere's default (the other half of the pair is kept when valid).
 */
export function parseAppearance(raw: unknown): Appearance {
  if (!isObj(raw) || raw.v !== 1) return DEFAULT_APPEARANCE;
  const custom: Appearance['custom'] = {};
  if (isObj(raw.custom)) {
    for (const l of LOOKS) {
      const c = raw.custom[l.id];
      if (!isObj(c)) continue;
      const palette = l.palettes.some((p) => p.id === c.palette) ? (c.palette as string) : l.palettes[0].id;
      const type = l.types.some((t) => t.id === c.type) ? (c.type as string) : l.types[0].id;
      if (palette !== l.palettes[0].id || type !== l.types[0].id) custom[l.id] = { palette, type };
    }
  }
  return { look: isLookId(raw.look) ? raw.look : null, custom };
}

/** The stored form: versioned, with defaults left out. */
export function serializeAppearance(a: Appearance): string {
  return JSON.stringify({ v: 1, look: a.look, custom: a.custom });
}

export function loadAppearance(): Appearance {
  try {
    const s = localStorage.getItem(APPEARANCE_KEY);
    return s === null ? DEFAULT_APPEARANCE : parseAppearance(JSON.parse(s));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Stores the appearance; false if storage is unavailable (the choice then lasts for this session). */
export function saveAppearance(a: Appearance): boolean {
  try {
    localStorage.setItem(APPEARANCE_KEY, serializeAppearance(a));
    return true;
  } catch {
    return false;
  }
}

export const sameAppearance = (a: Appearance, b: Appearance) => serializeAppearance(a) === serializeAppearance(b);

// ─── Preview, commit, cancel ─────────────────────────────────────────
export interface AppearanceState {
  saved: Appearance;
  /** The preview in progress, or null when not previewing. */
  draft: Appearance | null;
  /** Counts commits, so whoever stores the saved appearance knows when to (not on external changes). */
  commits: number;
}

export const initialAppearanceState = (saved: Appearance): AppearanceState => ({ saved, draft: null, commits: 0 });

export type AppearanceAction =
  /** Preview an atmosphere (null = the default Playground). */
  | { type: 'preview-look'; look: LookId | null }
  /** Preview a colour and/or type for one atmosphere; it need not be the one being shown. */
  | { type: 'preview-custom'; look: LookId; palette?: string; typeface?: string }
  /** Keep the preview. The provider stores the new saved appearance. */
  | { type: 'commit' }
  /** Drop the preview; the saved appearance shows again. */
  | { type: 'cancel' }
  /** The saved appearance changed elsewhere (another tab). A preview in progress is kept. */
  | { type: 'external'; saved: Appearance };

export function reduceAppearance(s: AppearanceState, a: AppearanceAction): AppearanceState {
  const base = s.draft ?? s.saved;
  switch (a.type) {
    case 'preview-look':
      if (a.look !== null && !isLookId(a.look)) return s;
      return { ...s, draft: { ...base, look: a.look } };
    case 'preview-custom': {
      if (!isLookId(a.look)) return s;
      const l = lookById(a.look);
      const now = customFor(base, a.look);
      const palette = a.palette !== undefined && l.palettes.some((p) => p.id === a.palette) ? a.palette : now.palette;
      const type = a.typeface !== undefined && l.types.some((t) => t.id === a.typeface) ? a.typeface : now.type;
      // Back at the defaults: forget the adjustment rather than store the defaults.
      const isDefault = palette === l.palettes[0].id && type === l.types[0].id;
      const custom = { ...base.custom };
      if (isDefault) delete custom[a.look];
      else custom[a.look] = { palette, type };
      return { ...s, draft: { ...base, custom } };
    }
    case 'commit':
      return s.draft ? { saved: s.draft, draft: null, commits: s.commits + 1 } : s;
    case 'cancel':
      return s.draft ? { ...s, draft: null } : s;
    case 'external':
      return { ...s, saved: a.saved };
  }
}

/** What's on screen: the preview if there is one, else the saved appearance. */
export const shownAppearance = (s: AppearanceState): Appearance => s.draft ?? s.saved;
/** Whether committing would change anything. */
export const isDirty = (s: AppearanceState) => s.draft !== null && !sameAppearance(s.draft, s.saved);
