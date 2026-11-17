/**
 * Editorial image registry. Every image here is free-licensed (Unsplash License,
 * Creative Commons or public domain) and is downloaded + converted to WebP during
 * the build by scripts/images/fetch.ts — the app serves its own copies, so they
 * work offline and nothing loads from the source sites at runtime.
 *
 * kind: 'venue'        → a real photo of that exact place (used only when correctly identified)
 *       'illustrative' → a mood photo; the app labels it as illustrative
 *
 * See IMAGE_CREDITS.md for the full attribution list.
 */
export interface EditorialImageMeta {
  id: string;
  kind: 'venue' | 'illustrative';
  /** Where the build downloads it from. */
  download: string;
  /** Human page for the photo (attribution link). */
  sourceUrl: string;
  credit: string;
  license: 'Unsplash License' | 'CC BY 2.0' | 'CC BY-SA 2.0' | 'CC BY-SA 3.0' | 'CC BY-SA 4.0' | 'CC BY 4.0' | 'Public domain' | 'CC0';
  alt: string;
  /** Subjects this image is used for: experience ids, place ids, edition ids, vibe ids… */
  subjects: string[];
  /** Interest/category tags used as a fallback match. */
  tags: string[];
  focus?: string;
}

/** Licenses verified on each photo's Unsplash page on 2026-11-17 (free Unsplash License, not Unsplash+). */
export const IMAGES: EditorialImageMeta[] = [
  {
    id: 'img-record-store',
    kind: 'illustrative',
    download: 'https://unsplash.com/photos/mI80ylVcd20/download?force=true',
    sourceUrl: 'https://unsplash.com/photos/a-record-store-filled-with-lots-of-records-mI80ylVcd20',
    credit: 'Dick Hoogerdijk',
    license: 'Unsplash License',
    alt: 'Crates and shelves of vinyl records in a record store in Rotterdam',
    subjects: ['exp-analog-evening', 'exp-culture-crawl', 'exp-music-rabbit-hole', 'exp-sample-hunt', 'exp-laundry-music', 'exp-analog-sunday', 'nujabes-champloo', 'madlib-shades-of-blue', 'vibe-analog-mode', 'pl-planet-retro', 'pl-daddy-kool', 'pl-bananas'],
    tags: ['record', 'vinyl', 'album', 'sampling', 'music'],
  },
  {
    id: 'img-tokyo-night',
    kind: 'illustrative',
    download: 'https://unsplash.com/photos/3WyDK5E8ACA/download?force=true',
    sourceUrl: 'https://unsplash.com/photos/a-narrow-city-street-at-night-with-people-walking-on-the-sidewalk-3WyDK5E8ACA',
    credit: 'mos design',
    license: 'Unsplash License',
    alt: 'A narrow street in Akihabara, Tokyo, at night under neon signs',
    subjects: ['thief-1981', 'ghost-in-the-shell-1995', 'exp-neo-noir-night', 'exp-japanese-design', 'burial-untrue', 'kavinsky-nightcall'],
    tags: ['night', 'neo-noir', 'cyberpunk', 'film', 'japanese', 'anime'],
  },
  {
    id: 'img-arcade',
    kind: 'illustrative',
    download: 'https://unsplash.com/photos/_aSOc5RT-8U/download?force=true',
    sourceUrl: 'https://unsplash.com/photos/turned-on-arcade-machines-with-stools-_aSOc5RT-8U',
    credit: 'Matt & Chris Pua',
    license: 'Unsplash License',
    alt: 'A row of lit arcade cabinets with stools in a dark room',
    subjects: ['exp-retro-arcade', 'exp-fgc-reunion', 'exp-split-screen-night', 'exp-dreamcast-evening', 'project-justice', 'pl-chucks-arcade', 'pl-lowry-parcade', 'vibe-nerd-mode', 'vibe-nostalgia-trip'],
    tags: ['arcade', 'gaming', 'fighting game', 'retro', 'dreamcast', 'tournament'],
  },
  {
    id: 'img-raspberry-pi',
    kind: 'illustrative',
    download: 'https://unsplash.com/photos/jvHymbpto1E/download?force=true',
    sourceUrl: 'https://unsplash.com/photos/a-close-up-of-a-raspberry-board-on-a-table-jvHymbpto1E',
    credit: 'Jainath Ponnala',
    license: 'Unsplash License',
    alt: 'Close-up of a black Raspberry Pi mini computer on a table',
    subjects: ['exp-pi-lab', 'exp-smart-home', 'exp-3d-printing', 'exp-workshop', 'exp-console-restoration', 'exp-beat-lab', 'dreamcast-today', 'dilla-mpc', 'vibe-the-workshop', 'pl-tampa-hackerspace'],
    tags: ['raspberry', 'technology', 'diy', 'smart home', '3d print', 'hardware', 'restoration', 'lab'],
  },
  {
    id: 'img-graffiti-lane',
    kind: 'illustrative',
    download: 'https://unsplash.com/photos/2q2eSpt2cf8/download?force=true',
    sourceUrl: 'https://unsplash.com/photos/a-narrow-alleyway-with-graffiti-on-the-walls-2q2eSpt2cf8',
    credit: 'Dominic Kurniawan Suryaputra',
    license: 'Unsplash License',
    alt: 'A narrow lane with every wall covered in graffiti and street art (Hosier Lane, Melbourne)',
    subjects: ['exp-blackbook', 'exp-handstyles', 'exp-street-photo', 'exp-underground-culture-day', 'jet-set-radio', 'subway-art', 'dondi-white', 'wild-style-1983', 'warehouse-walls', 'vibe-creative-itch', 'pl-warehouse-arts', 'pl-shine'],
    tags: ['graffiti', 'street art', 'mural', 'lettering', 'street photography'],
  },
  {
    id: 'img-comics',
    kind: 'illustrative',
    download: 'https://unsplash.com/photos/lBwsXs4T8jo/download?force=true',
    sourceUrl: 'https://unsplash.com/photos/stack-of-comic-books-next-to-a-mug-of-coffee-lBwsXs4T8jo',
    credit: 'Rahul Mishra',
    license: 'Unsplash License',
    alt: 'A stack of comic books beside a mug of coffee',
    subjects: ['frazetta', 'moebius', 'image-comics-1992', 'exp-one-arc', 'exp-frazetta-hour', 'exp-collectors-afternoon', 'exp-home-cafe', 'pl-emerald-city', 'pl-wilsons'],
    tags: ['comic', 'manga', 'graphic novel', 'illustration', 'reading'],
  },
  {
    id: 'img-board-game',
    kind: 'illustrative',
    download: 'https://unsplash.com/photos/IaWFSeYMLek/download?force=true',
    sourceUrl: 'https://unsplash.com/photos/a-group-of-people-playing-a-board-game-IaWFSeYMLek',
    credit: 'Derek Lee',
    license: 'Unsplash License',
    alt: 'A group of people around a table playing a board game',
    subjects: ['exp-tabletop-night', 'exp-grown-up-pregame', 'exp-trading-card-night', 'vibe-social-chill', 'pl-hammerfall'],
    tags: ['tabletop', 'game night', 'small gatherings', 'friends', 'trading card'],
  },
  {
    id: 'img-stpete-beach',
    kind: 'illustrative',
    download: 'https://unsplash.com/photos/IxirSFonSgA/download?force=true',
    sourceUrl: 'https://unsplash.com/photos/IxirSFonSgA',
    credit: 'Annette Batista Day',
    license: 'Unsplash License',
    alt: 'A mermaid-shaped map marker sculpture on a beach in St. Petersburg, Florida',
    subjects: ['exp-waterfront-sunset', 'exp-dog-adventure', 'exp-walk-catch-up', 'vibe-get-me-out', 'vibe-lazy-sunday', 'weedon-sunrise'],
    tags: ['walking', 'waterfront', 'beach', 'st. petersburg', 'outdoors'],
  },
];

/** Best image for a subject: exact subject match first, then the first tag overlap. */
export function imageFor(subject: string, tags: string[] = []): EditorialImageMeta | null {
  const exact = IMAGES.find((i) => i.subjects.includes(subject));
  if (exact) return exact;
  const lower = tags.map((t) => t.toLowerCase());
  return IMAGES.find((i) => i.tags.some((t) => lower.some((l) => l.includes(t.toLowerCase())))) ?? null;
}
