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

/**
 * Artwork with an editorial treatment, a fixed aspect ratio (no layout shift), an explicit
 * credit, and a typographic fallback when the artwork is missing or fails to load.
 * Supply either `art` (inline SVG) or `src` (image URL); `alt` describes it.
 */
export function Artwork({
  art,
  src,
  alt,
  title,
  treatment = 'plain',
  ratio = '4/3',
  credit,
  className = '',
}: {
  art?: ReactNode;
  src?: string;
  alt: string;
  title?: string;
  treatment?: ArtTreatment;
  ratio?: '4/3' | '3/4' | '1/1' | '16/9' | '3/2';
  credit?: ArtCredit;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const missing = failed || (!art && !src);
  const aspect = { aspectRatio: ratio.replace('/', ' / ') };
  const frame = `art-frame ${treatment === 'duotone' ? 'art-duotone' : ''} ${treatment === 'halftone' ? 'art-halftone' : ''}`;

  const body = missing ? (
    <div role="img" aria-label={`${alt} (artwork not available)`} className="art-frame art-missing flex flex-col items-start justify-end gap-1 border border-rule p-4" style={aspect}>
      <span className="ui-label">Artwork to come</span>
      {title && <span className="font-display text-heading uppercase text-fg">{title}</span>}
    </div>
  ) : (
    <div className={frame} style={aspect}>
      {art ? (
        <span role="img" aria-label={alt} className="contents">
          {art}
        </span>
      ) : (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </div>
  );

  return (
    // A cutout is printed on cream paper, so its caption resolves against the cream surface.
    <figure className={`${treatment === 'cutout' && !missing ? 'surface-cream art-cutout' : ''} ${className}`}>
      {body}
      {credit && !missing && (
        <figcaption className="mt-1.5 font-mono text-[0.75rem] uppercase tracking-wider text-fg-muted">
          {KIND_LABEL[credit.kind]} · {credit.by}
        </figcaption>
      )}
    </figure>
  );
}
