/**
 * Creative Slice 02 prototype: the representative content every look shows.
 *
 * A fixed, read-only selection from the curated catalogue (src/data/experiences.ts): real,
 * evergreen ideas, not live listings. No Pulse events, Drop items, weather, dates or times, so
 * nothing in the prototype can read as live. The same ten ideas appear in every look, so the
 * looks differ only in how they present the same thing.
 */
import { SEED_EXPERIENCES } from '../../data/experiences';
import type { Experience } from '../../types';

export const SAMPLE_IDS = [
  'exp-music-rabbit-hole',
  'exp-five-minute-sketch',
  'exp-local-history',
  'exp-tabletop-night',
  'exp-home-cafe',
  'exp-street-photo',
  'exp-plant-workshop',
  'exp-new-game',
  'exp-waterfront-sunset',
  'exp-art-afternoon',
] as const;

export const SAMPLE: Experience[] = SAMPLE_IDS.map((id) => {
  const e = SEED_EXPERIENCES.find((x) => x.id === id);
  if (!e) throw new Error(`Prototype sample: ${id} is not in the catalogue`);
  return e;
});

export interface PrototypeInterest {
  id: string;
  label: string;
  /** Catalogue interest tags this broad interest covers. */
  tags: string[];
}

/**
 * Broad, neutral interests for someone new (not the owner's personal interest list). Each maps
 * to tags the catalogue already uses. Some match nothing in the ten-idea sample on purpose:
 * that is what happens to real people, and the prototype has to say so honestly.
 */
export const INTERESTS: PrototypeInterest[] = [
  { id: 'music', label: 'Music', tags: ['Discovering new music', 'Revisiting favorite albums', 'Vinyl collecting', 'Small live music performances'] },
  { id: 'drawing', label: 'Drawing and art', tags: ['Drawing', 'Japanese art and design', 'Graffiti'] },
  { id: 'games', label: 'Games', tags: ['Gaming', 'Tabletop games', 'Hosting small game nights'] },
  { id: 'walks', label: 'Walks', tags: ['Walking'] },
  { id: 'slow', label: 'Slowing down', tags: ['Relaxation', 'Tea culture'] },
  { id: 'history', label: 'History', tags: ['History'] },
  { id: 'photography', label: 'Photography', tags: ['Street photography'] },
  { id: 'plants', label: 'Plants', tags: ['Plant keeping'] },
  { id: 'friends', label: 'Time with friends', tags: ['Small gatherings', 'Meaningful shared experiences', 'Texting friends'] },
  { id: 'making', label: 'Making things', tags: ['Small building projects', 'DIY home repairs', '3D printing'] },
  { id: 'film', label: 'Film', tags: ['Film'] },
  { id: 'sport', label: 'Sport', tags: ['Basketball', 'Archery', 'Lifting', 'Skateboarding'] },
];

export const interestById = (id: string) => INTERESTS.find((i) => i.id === id);

/** The picked interests (in list order) that an idea matches. */
export function matchesOf(exp: Experience, picked: string[]): PrototypeInterest[] {
  return INTERESTS.filter((i) => picked.includes(i.id) && i.tags.some((t) => exp.interests.includes(t)));
}

/** How many sample ideas an interest matches (shown beside each choice, so the sample's size is never hidden). */
export const sampleCount = (interestId: string) => SAMPLE.filter((e) => matchesOf(e, [interestId]).length > 0).length;

export interface Idea {
  exp: Experience;
  matches: PrototypeInterest[];
}

export interface Arrangement {
  /** The idea that leads the cover. */
  featured: Idea;
  /** The next three on the cover. */
  onCover: Idea[];
  /** Every sample idea: matches first (most matches first), then the rest in sample order. */
  ideas: Idea[];
  matched: number;
  /** Picked interests with nothing in the sample. */
  unmatched: PrototypeInterest[];
  picked: PrototypeInterest[];
}

/**
 * Orders the fixed sample by the picked interests. It never invents anything: with no picks or
 * no matches the order is the sample's own, and the copy says it is a mix.
 */
export function arrange(picked: string[]): Arrangement {
  const ideas = SAMPLE.map((exp, i) => ({ exp, matches: matchesOf(exp, picked), i }))
    .sort((a, b) => b.matches.length - a.matches.length || a.i - b.i)
    .map(({ exp, matches }) => ({ exp, matches }));
  const pickedList = INTERESTS.filter((i) => picked.includes(i.id));
  return {
    featured: ideas[0],
    onCover: ideas.slice(1, 4),
    ideas,
    matched: ideas.filter((x) => x.matches.length).length,
    unmatched: pickedList.filter((i) => sampleCount(i.id) === 0),
    picked: pickedList,
  };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The honest, written-out feedback for a set of picks (also announced to screen readers). */
export function feedback(a: Arrangement): string {
  const total = SAMPLE.length;
  if (!a.picked.length) return `No interests picked. The cover shows a mix from the ${total} sample ideas.`;
  const none = a.unmatched.length ? ` Nothing in this sample matches ${list(a.unmatched.map((i) => i.label))} yet.` : '';
  if (!a.matched) return `Nothing in this sample matches ${list(a.picked.map((i) => i.label))} yet. The cover keeps a mix instead.`;
  return `${a.matched} of ${total} sample ideas match. ${a.featured.exp.name} now leads the cover.${none}`;
}
