import type { ReactNode } from 'react';
import type { Experience } from '../../../types';
import { placeHref } from '../journey';
import type { Arrangement, Idea } from '../sample';

/**
 * The Studio: curious, playful, colourful. Flat shapes in the palette's four colours overlap a
 * loose grid; type is IBM Plex Sans set in lower case (or Plex Mono with the Typewriter pairing).
 * Every shape is decoration (aria-hidden); all text sits on the page colour or on a shape with its
 * tested on-colour.
 */

const matchText = (x: Idea) => (x.matches.length ? `Matches ${x.matches.map((m) => m.label).join(', ')}` : '');

/** The cover. `preview` and `mini` are samples (no headings, no controls); `arrival` is the real thing. */
export function StudioCover({ a, mode, star }: { a: Arrangement; mode: 'preview' | 'mini' | 'arrival'; star?: ReactNode }) {
  const live = mode === 'arrival';
  const Title = live ? 'h1' : 'p';
  const StarTitle = live ? 'h2' : 'p';
  const f = a.featured;
  return (
    <div className={`studio-cover studio-cover-${mode}`} data-miy-cover="studio">
      <span aria-hidden className="studio-shape studio-sun" />
      <span aria-hidden className="studio-shape studio-moon" />
      <span aria-hidden className="studio-shape studio-bar" />
      <span aria-hidden className="studio-shape studio-dots" />
      <div className="studio-grid">
      <div className="studio-masthead">
        <Title className="studio-title" {...(live ? { id: 'miy-title', tabIndex: -1, 'data-miy-heading': '' } : {})}>
          <span className="block">personal</span> <span className="block">playground</span>
        </Title>
        <p className="studio-dek">Ideas for time off, gathered in one place.</p>
      </div>
      <div className="studio-star" data-miy-featured={f.exp.id}>
        <span aria-hidden className="studio-star-shape" />
        <div className="studio-star-card">
          <p className="studio-kicker">{f.matches.length ? matchText(f) : 'On the cover'}</p>
          <StarTitle className="studio-star-title">{f.exp.name}</StarTitle>
          {mode !== 'mini' && <p className="studio-star-text">{f.exp.description}</p>}
          {star}
        </div>
      </div>
      <div className="studio-lines">
        {live ? <h2 className="studio-lines-title">Also on the cover</h2> : <p className="studio-lines-title">Also on the cover</p>}
        <ul>
          {a.onCover.map((x, i) => (
            <li key={x.exp.id} className={`studio-line studio-line-${i}`}>
              <span aria-hidden className="studio-mark" />
              <span className="studio-line-text">
                {live ? (
                  <a href={placeHref({ step: 'arrival', sample: x.exp.id })} className="studio-line-link">
                    {x.exp.name}
                  </a>
                ) : (
                  <span className="studio-line-name">{x.exp.name}</span>
                )}
                {x.matches.length > 0 && <span className="studio-match">{matchText(x)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      </div>
    </div>
  );
}

/** Ideas in cards of differing sizes and colours: a grid that breaks, on purpose. */
export function StudioIdeas({ a }: { a: Arrangement }) {
  return (
    <ul className="studio-ideas">
      {a.ideas.map((x, i) => (
        <li key={x.exp.id} className={`studio-idea studio-idea-${i % 5}`} data-miy-idea={x.exp.id}>
          <a href={placeHref({ step: 'arrival', sample: x.exp.id })} className="studio-idea-link">
            <span className="studio-idea-name">{x.exp.name}</span>
            <span className="studio-idea-text">{x.exp.description}</span>
            {x.matches.length > 0 && <span className="studio-match">{matchText(x)}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Decorative shape art for an idea (no photo in this build): three shapes placed from its id. */
export function StudioArt({ exp }: { exp: Experience }) {
  const n = [...exp.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);
  return (
    <div aria-hidden className="studio-art" style={{ ['--r' as string]: `${(n % 7) * 9 - 27}deg`, ['--x' as string]: `${10 + (n % 5) * 12}%` }}>
      <span className="studio-art-a" />
      <span className="studio-art-b" />
      <span className="studio-art-c" />
    </div>
  );
}
