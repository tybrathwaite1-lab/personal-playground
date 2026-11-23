import { useLayoutEffect, useRef } from 'react';
import { useAtmosphere } from '../hooks/useAtmosphere';
import type { Experience } from '../types';
import { Grain } from './graphic/primitives';
import { Surface } from './graphic/Surface';

/**
 * Typographic cover art for the homepage's cover star when no editorial photo is available (no
 * matching image, or it failed to load). It is made only from the experience's own words and
 * tested Newsstand surfaces: no image, so nothing to credit and nothing to mistake for a photo
 * of the thing, and it says so ("Type cover").
 */
export function CoverArt({ exp }: { exp: Experience }) {
  const { atmosphere } = useAtmosphere();
  // A warm contrast to the cover: orange against the cream morning cover, mustard otherwise.
  const tone = atmosphere === 'morning' ? 'orange' : 'mustard';
  const [first, ...rest] = exp.name.split(/\s+/);
  const lines = exp.interests.slice(0, 2);
  // The first word fills the width without breaking: Anton capitals are ≈ 0.46em wide.
  const wordSize = `min(9rem, ${Math.min(38, 96 / (Math.max(first.length, 1) * 0.46)).toFixed(1)}cqi)`;
  // …and if a different font is showing (Anton not loaded yet, or unavailable), shrink to fit.
  const word = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = word.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      el.style.fontSize = wordSize;
      const over = el.scrollWidth / box.clientWidth;
      if (over > 1) el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) / over) * 0.98}px`;
    };
    fit();
    const frame = requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    document.fonts?.ready.then(fit).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [wordSize, first]);
  return (
    <Surface
      tone={tone}
      role="img"
      aria-label={`Typographic cover for ${exp.name}`}
      data-cover-art=""
      className="cover-art art-frame flex flex-col justify-between overflow-hidden p-4"
      style={{ aspectRatio: '4 / 5' }}
    >
      <Grain intensity="medium" />
      <span aria-hidden className="cover-art-dots pointer-events-none absolute inset-0 z-0" />
      <span aria-hidden className="relative z-10 flex items-start justify-between gap-3">
        <span className="ui-label">Type cover</span>
        <span className="font-jp text-sm tracking-[0.5em] text-fg [writing-mode:vertical-rl]" lang="ja">
          {exp.kicker ?? '特集'}
        </span>
      </span>
      <span aria-hidden className="relative z-10 block">
        <span ref={word} className="cover-art-word inline-block whitespace-nowrap font-display uppercase text-fg" style={{ fontSize: wordSize }}>
          {first}
        </span>
        {rest.length > 0 && <span className="mt-1 block font-display text-heading uppercase leading-none text-fg">{rest.join(' ')}</span>}
        {lines.length > 0 && <span className="ui-label mt-3 block text-fg">{lines.join(' / ')}</span>}
      </span>
    </Surface>
  );
}
