import { useState, type ReactNode } from 'react';

export type ArtTreatment = 'plain' | 'duotone' | 'halftone' | 'cutout';
/** Provenance is always explicit: AI-assisted artwork is credited and never presented as a photo. */
export interface ArtCredit {
  kind: 'illustration' | 'ai-assisted' | 'photo';
  by: string;
}
const KIND_LABEL: Record<ArtCredit['kind'], string> = {
  illustration: 'Illustration',
  'ai-assisted': 'AI-assisted illustration',
  photo: 'Photo',
};

interface Common {
  /** Describes the artwork (or, when missing, what it would show). */
  alt: string;
  /** Shown in the missing-artwork state. */
  title?: string;
  treatment?: ArtTreatment;
  ratio?: '4/3' | '3/4' | '1/1' | '16/9' | '3/2';
  className?: string;
}
/** Displayed artwork must be credited: either inline SVG (`art`) or an image URL (`src`). */
type Displayed = Common & ({ art: ReactNode; src?: never } | { src: string; art?: never }) & { credit: ArtCredit };
/** No artwork yet: the typographic fallback. */
type Pending = Common & { art?: undefined; src?: undefined; credit?: undefined };
export type ArtworkProps = Displayed | Pending;

/** True when this artwork may be displayed: something to show, and a non-empty credit. */
export function canDisplay(p: { art?: ReactNode; src?: string; credit?: ArtCredit }) {
  return Boolean((p.art || p.src) && p.credit && p.credit.by.trim() && KIND_LABEL[p.credit.kind]);
}

/**
 * Artwork with an editorial treatment, a fixed aspect ratio (no layout shift), a required credit,
 * and a typographic fallback when the artwork is missing, uncredited, or fails to load. A failed
 * image recovers when `src` changes to one that loads.
 */
export function Artwork(props: ArtworkProps) {
  const { art, src, alt, title, treatment = 'plain', ratio = '4/3', credit, className = '' } = props;
  // The failure belongs to one URL, so a replacement `src` is tried afresh.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src) && failedSrc === src;
  const uncredited = Boolean(art || src) && !canDisplay(props);
  if (uncredited && import.meta.env?.DEV) console.error(`Artwork "${alt}" has no credit, so it is not displayed.`);
  const missing = failed || uncredited || (!art && !src);
  const aspect = { aspectRatio: ratio.replace('/', ' / ') };
  const frame = `art-frame ${treatment === 'duotone' ? 'art-duotone' : ''} ${treatment === 'halftone' ? 'art-halftone' : ''}`;

  const body = missing ? (
    <div role="img" aria-label={`${alt} (artwork not available)`} data-artwork="missing" className="art-frame art-missing flex flex-col items-start justify-end gap-1 border border-rule p-4" style={aspect}>
      <span className="ui-label">Artwork to come</span>
      {title && <span className="font-display text-heading uppercase text-fg">{title}</span>}
    </div>
  ) : (
    <div className={frame} style={aspect} data-artwork="shown">
      {art ? (
        <span role="img" aria-label={alt} className="contents">
          {art}
        </span>
      ) : (
        <img key={src} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailedSrc(src ?? null)} />
      )}
    </div>
  );

  return (
    // A cutout is printed on cream paper, so its caption resolves against the cream surface.
    <figure className={`${treatment === 'cutout' && !missing ? 'surface-cream art-cutout' : ''} ${className}`}>
      {body}
      {!missing && credit && (
        <figcaption className="mt-1.5 font-mono text-[0.75rem] uppercase tracking-wider text-fg-muted">
          {KIND_LABEL[credit.kind]} · {credit.by}
        </figcaption>
      )}
    </figure>
  );
}
