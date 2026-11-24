/**
 * The three visual atmospheres of Personal Playground (Creative Slice 03). One publication,
 * three ways of setting it: the editorial identity and content stay the same in each.
 *
 * Each atmosphere offers a few curated colour sets and type pairings (never free-form), and the
 * first of each is its default. This registry is the single production source of truth for
 * those ids; stored preferences are validated against it.
 */
export type LookId = 'studio' | 'quiet-room' | 'underground';

export interface LookDefinition {
  id: LookId;
  name: string;
  palettes: readonly { id: string; name: string }[];
  types: readonly { id: string; name: string }[];
}

export const LOOKS: readonly LookDefinition[] = [
  {
    id: 'studio',
    name: 'Studio',
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
  {
    id: 'quiet-room',
    name: 'The Quiet Room',
    palettes: [
      { id: 'linen', name: 'Linen' },
      { id: 'sage', name: 'Sage' },
      { id: 'lamplight', name: 'Lamplight' },
    ],
    types: [
      { id: 'book', name: 'Book serif' },
      { id: 'serif-sans', name: 'Serif and sans' },
    ],
  },
  {
    id: 'underground',
    name: 'The Underground',
    palettes: [
      { id: 'newsstand', name: 'Newsstand' },
      { id: 'daylight', name: 'Daylight' },
      { id: 'forest', name: 'Forest' },
    ],
    types: [
      { id: 'poster', name: 'Poster condensed' },
      { id: 'zine', name: 'Zine mono' },
    ],
  },
];

export const isLookId = (v: unknown): v is LookId => LOOKS.some((l) => l.id === v);
export const lookById = (id: LookId): LookDefinition => LOOKS.find((l) => l.id === id)!;
