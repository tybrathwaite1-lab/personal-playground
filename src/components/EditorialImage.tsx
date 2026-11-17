import { useState } from 'react';
import { imageFor, type EditorialImageMeta } from '../data/images';

/**
 * Editorial photograph with a fixed aspect ratio (no layout shift), lazy loading,
 * responsive WebP sources, honest captions (illustrative vs. actual venue) and a
 * typographic fallback when an image is missing or fails to load.
 */
export function EditorialImage({
  subject,
  fallbackTags = [],
  ratio = '3/2',
  className = '',
  caption = true,
  priority = false,
}: {
  subject: string;
  fallbackTags?: string[];
  ratio?: '3/2' | '4/5' | '16/9' | '1/1' | '21/9';
  className?: string;
  caption?: boolean;
  priority?: boolean;
}) {
  const meta = imageFor(subject, fallbackTags);
  const [failed, setFailed] = useState(false);
  const base = `${import.meta.env.BASE_URL}images/editorial/`;

  if (!meta || failed) return <Fallback ratio={ratio} className={className} label={subject} />;

  return (
    <figure className={className}>
      <div className="relative overflow-hidden border border-line bg-ink2" style={{ aspectRatio: ratio.replace('/', ' / ') }}>
        <img
          src={`${base}${meta.id}-1200.webp`}
          srcSet={`${base}${meta.id}-600.webp 600w, ${base}${meta.id}-1200.webp 1200w`}
          sizes="(min-width: 1024px) 40vw, 100vw"
          alt={meta.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover [filter:saturate(0.82)_contrast(1.04)]"
          style={{ objectPosition: meta.focus ?? 'center' }}
        />
        {!caption && (
          <span className="pointer-events-none absolute bottom-0 right-0 max-w-full truncate bg-ink/75 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-paper/80">
            {meta.kind === 'venue' && meta.place ? `${meta.place} · ` : ''}
            {meta.credit} · {meta.license}
          </span>
        )}
      </div>
      {caption && <Credit meta={meta} />}
    </figure>
  );
}

export function Credit({ meta }: { meta: EditorialImageMeta }) {
  return (
    <figcaption className="mt-1.5 flex flex-wrap gap-x-2 font-mono text-[10px] uppercase tracking-wider text-muted">
      <span>{meta.kind === 'venue' && meta.place ? `Photo: ${meta.place}` : 'Illustrative photo'}</span>
      <span aria-hidden>·</span>
      <a href={meta.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-paper">
        {meta.credit} / {meta.license} / Wikimedia Commons
      </a>
    </figcaption>
  );
}

function Fallback({ ratio, className, label }: { ratio: string; className: string; label: string }) {
  return (
    <div
      className={`stripe relative flex items-end overflow-hidden border border-line bg-ink2 p-3 ${className}`}
      style={{ aspectRatio: ratio.replace('/', ' / ') }}
      role="presentation"
    >
      <span className="font-jp text-xs tracking-[0.4em] text-muted/70" lang="ja" aria-hidden>
        遊び場
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
