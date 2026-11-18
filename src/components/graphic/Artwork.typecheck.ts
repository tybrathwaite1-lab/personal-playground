/**
 * Compile-time guarantees for <Artwork> (checked by `tsc -b`, never imported or bundled).
 * If `credit` ever becomes optional for displayed artwork, the @ts-expect-error lines stop
 * erroring and the build fails.
 */
import { createElement as h } from 'react';
import { Artwork } from './Artwork';

const credit = { kind: 'illustration', by: 'Studio' } as const;

export const artworkTypeChecks = [
  h(Artwork, { art: 'svg', alt: 'credited', credit }),
  h(Artwork, { src: 'a.jpg', alt: 'credited', credit }),
  h(Artwork, { alt: 'pending', title: 'Coming soon' }),
  // @ts-expect-error displayed inline artwork must be credited
  h(Artwork, { art: 'svg', alt: 'uncredited' }),
  // @ts-expect-error displayed image artwork must be credited
  h(Artwork, { src: 'a.jpg', alt: 'uncredited' }),
  // @ts-expect-error art and src are mutually exclusive
  h(Artwork, { art: 'svg', src: 'a.jpg', alt: 'both', credit }),
];
