/**
 * Creative Slice 02 prototype: the journey's state and its place in the URL.
 *
 * The URL holds only *where you are* (the step, the look in view, an open sample idea), so
 * links, Back/Forward and reload behave predictably. What you *chose* (a look, interests,
 * colour, type, preview saves) lives only in memory: it is gone after a reload or on exit,
 * and nothing is ever written to storage. A link can never carry a preference.
 */
import { SAMPLE_IDS } from './sample';

export type LookId = 'studio' | 'quiet-room' | 'underground';
export type Step = 'look' | 'interests' | 'arrival';

export interface Look {
  id: LookId;
  name: string;
  line: string;
  /** Built in this prototype build (B1 builds the Studio; B2 the other two). */
  built: boolean;
  palettes: { id: string; name: string }[];
  types: { id: string; name: string }[];
}

export const LOOKS: Look[] = [
  {
    id: 'studio',
    name: 'Studio',
    line: 'Curious, playful and colourful.',
    built: true,
    palettes: [
      { id: 'poster', name: 'Poster' },
      { id: 'sherbet', name: 'Sherbet' },
      { id: 'night', name: 'Night studio' },
    ],
    types: [
      { id: 'sans', name: 'Bold sans' },
      { id: 'mono', name: 'Typewriter' },
    ],
  },
  { id: 'quiet-room', name: 'The Quiet Room', line: 'Warm, spacious and unhurried.', built: false, palettes: [], types: [] },
  { id: 'underground', name: 'The Underground', line: 'Expressive, tactile and eclectic.', built: false, palettes: [], types: [] },
];

export const lookById = (id: LookId) => LOOKS.find((l) => l.id === id)!;
const isLook = (v: unknown): v is LookId => LOOKS.some((l) => l.id === v);
const STEPS: Step[] = ['look', 'interests', 'arrival'];

// ─── Location (URL) ───────────────────────────────────────────────────
export interface Place {
  step: Step;
  /** The look in view on the look step. */
  view: LookId;
  /** An open sample idea (look and arrival steps). */
  sample: string | null;
}

export const PATH = '#/preview/make-it-yours';

/** Reads a place from the route's query. Anything unrecognised falls back to the start. */
export function parsePlace(params: URLSearchParams): Place {
  const step = (STEPS as string[]).includes(params.get('step') ?? '') ? (params.get('step') as Step) : 'look';
  const view = isLook(params.get('look')) ? (params.get('look') as LookId) : LOOKS[0].id;
  const s = params.get('sample');
  const sample = step !== 'interests' && s && (SAMPLE_IDS as readonly string[]).includes(s) && (step === 'arrival' || lookById(view).built) ? s : null;
  return { step, view, sample };
}

export function placeHref(p: Partial<Place> & { step: Step }): string {
  const q = new URLSearchParams({ step: p.step });
  if (p.step === 'look') q.set('look', p.view ?? LOOKS[0].id);
  if (p.sample && p.step !== 'interests') q.set('sample', p.sample);
  return `${PATH}?${q.toString()}`;
}

// ─── Choices (memory only) ────────────────────────────────────────────
export interface Choices {
  /** The chosen look. null is an explicit "no aesthetic preference": nothing chosen, or skipped. */
  look: LookId | null;
  /** Colour and type per look (only for looks you've opened the controls on). */
  custom: Partial<Record<LookId, { palette: string; type: string }>>;
  interests: string[];
  /** Preview saves: never the real Collection. */
  saved: string[];
  /** Whether anything has been chosen in this page's lifetime (for the "started fresh" note). */
  touched: boolean;
}

export const INITIAL: Choices = { look: null, custom: {}, interests: [], saved: [], touched: false };

export type Action =
  | { type: 'choose-look'; look: LookId }
  | { type: 'no-preference' }
  | { type: 'toggle-interest'; id: string }
  | { type: 'clear-interests' }
  | { type: 'customise'; look: LookId; palette?: string; typeface?: string }
  | { type: 'toggle-save'; id: string };

export function reduce(s: Choices, a: Action): Choices {
  switch (a.type) {
    case 'choose-look':
      return { ...s, look: a.look, touched: true };
    case 'no-preference':
      return { ...s, look: null, touched: true };
    case 'toggle-interest':
      return { ...s, interests: s.interests.includes(a.id) ? s.interests.filter((x) => x !== a.id) : [...s.interests, a.id], touched: true };
    case 'clear-interests':
      return { ...s, interests: [], touched: true };
    case 'customise': {
      const now = customOf(s, a.look);
      return { ...s, custom: { ...s.custom, [a.look]: { palette: a.palette ?? now.palette, type: a.typeface ?? now.type } }, touched: true };
    }
    case 'toggle-save':
      return { ...s, saved: s.saved.includes(a.id) ? s.saved.filter((x) => x !== a.id) : [...s.saved, a.id], touched: true };
  }
}

/** A look's colour and type: the curated defaults until changed. */
export function customOf(s: Choices, look: LookId) {
  const l = lookById(look);
  return s.custom[look] ?? { palette: l.palettes[0]?.id ?? '', type: l.types[0]?.id ?? '' };
}
