import type { ReactNode } from 'react';
import { FallbackCover, FallbackIdeas } from './looks/Fallback';
import { QuietCover, QuietIdeas } from './looks/QuietRoom';
import { StudioCover, StudioIdeas } from './looks/Studio';
import { UNDERGROUND_TONES, UndergroundCover, UndergroundIdeas } from './looks/Underground';
import { customOf, lookById, type LookId } from './journey';
import type { Journey } from './MakeItYours';
import type { Arrangement } from './sample';

/** The cover in a given look (null: no aesthetic preference, so the fallback style). */
export function Cover({ look, palette = '', ...rest }: { look: LookId | null; palette?: string; a: Arrangement; mode: 'preview' | 'mini' | 'arrival'; star?: ReactNode }) {
  if (look === 'studio') return <StudioCover {...rest} />;
  if (look === 'quiet-room') return <QuietCover {...rest} />;
  if (look === 'underground') return <UndergroundCover {...rest} palette={palette} />;
  return <FallbackCover {...rest} />;
}

/** The arrival's ideas, presented the way each look presents things. */
export function Ideas({ look, palette = '', a }: { look: LookId | null; palette?: string; a: Arrangement }) {
  if (look === 'studio') return <StudioIdeas a={a} />;
  if (look === 'quiet-room') return <QuietIdeas a={a} />;
  if (look === 'underground') return <UndergroundIdeas a={a} palette={palette} />;
  return <FallbackIdeas a={a} />;
}

/** A small preview of a colour set: three of its colours (the Underground's are its paper stocks). */
function Swatch({ look, palette }: { look: LookId; palette: string }) {
  if (look === 'underground') {
    const t = UNDERGROUND_TONES[palette];
    return (
      <span aria-hidden className="miy-swatch">
        <span className={`surface-${t.page}`} />
        <span className={`surface-${t.cover}`} />
        <span className={`surface-${t.cards[0]}`} />
      </span>
    );
  }
  return (
    <span aria-hidden className="miy-swatch miy-swatch-vars" data-miy-look={look} data-miy-palette={palette}>
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * Optional colour and type for a look: a few curated, contrast-tested sets (not a theme engine).
 * Closed by default; changes apply at once and only to this preview.
 */
export function Customise({ journey, look }: { journey: Journey; look: LookId }) {
  const l = lookById(look);
  const now = customOf(journey.choices, look);
  return (
    <details className="miy-customise" data-miy-customise="">
      <summary className="miy-summary">Adjust colour and type</summary>
      <p className="miy-small">Optional. It changes this preview only.</p>
      <div className="miy-customise-groups">
        <fieldset className="miy-fieldset">
          <legend className="miy-legend">Colour</legend>
          {l.palettes.map((p) => (
            <label key={p.id} className="miy-option">
              <input
                type="radio"
                name={`miy-palette-${look}`}
                value={p.id}
                checked={now.palette === p.id}
                onChange={() => journey.dispatch({ type: 'customise', look, palette: p.id })}
              />
              <Swatch look={look} palette={p.id} />
              {p.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="miy-fieldset">
          <legend className="miy-legend">Type</legend>
          {l.types.map((t) => (
            <label key={t.id} className="miy-option">
              <input
                type="radio"
                name={`miy-type-${look}`}
                value={t.id}
                checked={now.type === t.id}
                onChange={() => journey.dispatch({ type: 'customise', look, typeface: t.id })}
              />
              <span className={`miy-type-sample miy-type-${t.id}`} aria-hidden>
                Aa
              </span>
              {t.name}
            </label>
          ))}
        </fieldset>
      </div>
    </details>
  );
}
