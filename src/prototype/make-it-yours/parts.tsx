import type { ReactNode } from 'react';
import { FallbackCover, FallbackIdeas } from './covers/Fallback';
import { StudioCover, StudioIdeas } from './covers/Studio';
import { customOf, lookById, type LookId } from './journey';
import type { Journey } from './MakeItYours';
import type { Arrangement } from './sample';

/** The cover in a given look (null: no aesthetic preference, so the fallback style). */
export function Cover({ look, ...rest }: { look: LookId | null; a: Arrangement; mode: 'preview' | 'mini' | 'arrival'; star?: ReactNode }) {
  return look === 'studio' ? <StudioCover {...rest} /> : <FallbackCover {...rest} />;
}

export function Ideas({ look, a }: { look: LookId | null; a: Arrangement }) {
  return look === 'studio' ? <StudioIdeas a={a} /> : <FallbackIdeas a={a} />;
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
              <span aria-hidden className="miy-swatch" data-miy-look={look} data-miy-palette={p.id}>
                <span />
                <span />
                <span />
              </span>
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
