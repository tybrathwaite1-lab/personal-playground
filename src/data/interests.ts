import type { Interest, InterestCategory } from '../types';

export const INTEREST_CATEGORIES: {
  id: InterestCategory;
  number: string;
  title: string;
  jp: string;
  blurb: string;
}[] = [
  { id: 'established', number: '01', title: 'Established', jp: '定番', blurb: 'The reliable favorites. Things that already feel like you.' },
  { id: 'curiosity', number: '02', title: 'Curiosity Catalog', jp: '好奇心', blurb: 'Things worth a first try, or a second look.' },
  { id: 'rediscovery', number: '03', title: 'Rediscovery', jp: '再発見', blurb: 'Interests from earlier chapters that might still have something to say.' },
  { id: 'conditional', number: '04', title: 'Conditional Enjoyment', jp: '条件付き', blurb: 'Great in the right setting, with the right people, at the right pace.' },
  { id: 'autopilot', number: '05', title: 'Habit & Autopilot', jp: '自動操縦', blurb: 'A quiet reference, not a scorecard. Things that happen by default rather than by choice.' },
];

let n = 0;
const make = (category: InterestCategory, group: string | undefined, names: string[]): Interest[] =>
  names.map((name) => ({
    id: `int-${category}-${++n}`,
    name,
    category,
    group,
  }));

/**
 * Seed interests. Edits made in the app are stored on-device only.
 *
 * Privacy note: the "Habit & Autopilot" category intentionally ships empty.
 * It is hidden by default and anything you add to it stays in your browser's
 * LocalStorage and your own JSON backups — never in this public repository.
 */
export const SEED_INTERESTS: Interest[] = [
  ...make('established', 'Art and culture', [
    'Drawing',
    'Graffiti',
    'Anime',
    'Comic books',
    'Graphic novels',
    'Manga',
    'Sneakers',
    'Streetwear culture',
  ]),
  ...make('established', 'Music and entertainment', [
    'Gaming',
    'Discovering new music',
    'Revisiting favorite albums',
    'Interesting YouTube content',
    'Curated Instagram exploration',
  ]),
  ...make('established', 'Building and technology', [
    'DIY home repairs',
    'Small building projects',
    'Troubleshooting technology',
    'Home technology improvements',
  ]),
  ...make('established', 'Mental and physical restoration', [
    'Walking',
    'Lifting',
    'Stretching',
    'Relaxation',
    'Sound baths',
    'Alan Watts',
    'Taoism',
    'Lighthearted philosophy',
  ]),
  ...make('established', 'Everyday pleasures', [
    'Playing with my dogs',
    'Texting friends',
    'Laundry',
    'Small gatherings',
    'Meaningful shared experiences',
  ]),
  ...make('curiosity', undefined, [
    'Street photography',
    'Graffiti lettering and sketchbooks',
    'Japanese art and design',
    'Small live music performances',
    'Independent comic book shops',
    'Record store exploring',
    'Intentional album listening sessions',
    'Vinyl collecting',
    'Retro gaming restoration',
    'Raspberry Pi projects',
    '3D printing',
    'Smart home projects',
    'Archery',
    'Retro arcade exploration',
    'Tabletop games',
    'Geocaching',
    'Urban exploration of public and permitted spaces',
    'Float therapy',
    'Sauna and recovery sessions',
    'Tea culture',
    'Plant keeping',
    'Creating a dedicated relaxation space',
    'Hosting small game nights',
  ]),
  ...make('rediscovery', undefined, [
    'Skateboarding',
    'Basketball',
    'Exploring obscure and interesting websites',
    'History',
    'In-person gaming tournaments',
    'Fighting game community events',
    'Trading cards',
  ]),
  ...make('conditional', undefined, [
    'Drinking good beer',
    'Nightlife',
    'Dancing',
    'Competitive gaming',
    'Larger social gatherings',
  ]),
  // 'autopilot' ships empty on purpose — see note above.
];
