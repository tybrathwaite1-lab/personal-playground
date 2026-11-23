import type { ReactNode } from 'react';
import { Grain, PaperEdge, Stamp, Tape } from '../../../components/graphic/primitives';
import { Surface, tilt, type SurfaceTone } from '../../../components/graphic/Surface';
import type { Experience } from '../../../types';
import { formatCost, formatDuration } from '../../../utils/discovery';
import { ENERGY_LABEL } from '../../../utils/labels';
import { placeHref } from '../journey';
import { matchText, type Arrangement } from '../sample';

/**
 * The Underground: the Playground's own bold editorial language. Anton set big and condensed,
 * the tested Newsstand surfaces as paper stock, tape, stamps, grain and torn edges, cards set at
 * small angles like a pasted-up zine. Each colour set is a choice of tested surfaces, so every
 * text and control pair is already proven (tests/design-tokens.test.ts).
 */
export const UNDERGROUND_TONES: Record<string, { page: SurfaceTone; cover: SurfaceTone; star: SurfaceTone; cards: SurfaceTone[] }> = {
  newsstand: { page: 'editorial', cover: 'orange', star: 'cream', cards: ['mustard', 'cream', 'pink', 'orange', 'cobalt'] },
  daylight: { page: 'cream', cover: 'cobalt', star: 'mustard', cards: ['orange', 'editorial', 'pink', 'mustard', 'forest'] },
  forest: { page: 'forest', cover: 'mustard', star: 'cream', cards: ['pink', 'cream', 'mustard', 'orange', 'olive'] },
};
const tonesFor = (palette: string) => UNDERGROUND_TONES[palette] ?? UNDERGROUND_TONES.newsstand;
const ANGLES = [-2.5, 1.5, -1, 2, -1.75];

export function UndergroundCover({ a, mode, star, palette }: { a: Arrangement; mode: 'preview' | 'mini' | 'arrival'; star?: ReactNode; palette: string }) {
  const t = tonesFor(palette);
  const live = mode === 'arrival';
  const Title = live ? 'h1' : 'p';
  const StarTitle = live ? 'h2' : 'p';
  const f = a.featured;
  return (
    <Surface tone={t.cover} className={`ug-cover ug-cover-${mode}`} data-miy-cover="underground">
      <Grain intensity="medium" />
      <div className="ug-grid">
        <div className="ug-masthead">
          <p className="ug-label">The time-off issue</p>
          <Title className="ug-title" {...(live ? { id: 'miy-title', tabIndex: -1, 'data-miy-heading': '' } : {})}>
            <span className="block">Personal</span> <span className="block">Playground</span>
          </Title>
        </div>
        <Surface tone={t.star} className="ug-star" style={{ transform: `rotate(${tilt(-2)}deg)` }} data-miy-featured={f.exp.id}>
          <Tape tone="paper" angle={-5} width={96} className="-top-3 left-6" />
          <Stamp className="ug-stamp">{f.matches.length ? matchText(f) : 'On the cover'}</Stamp>
          <StarTitle className="ug-star-title">{f.exp.name}</StarTitle>
          {mode !== 'mini' && <p className="ug-star-text">{f.exp.description}</p>}
          {star}
        </Surface>
        <div className="ug-also">
          {live ? <h2 className="ug-label">Also on the cover</h2> : <p className="ug-label">Also on the cover</p>}
          <ul>
            {a.onCover.map((x) => (
              <li key={x.exp.id}>
                {live ? <a href={placeHref({ step: 'arrival', sample: x.exp.id })}>{x.exp.name}</a> : <span>{x.exp.name}</span>}
                {x.matches.length > 0 && <span className="ug-match">{matchText(x)}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <PaperEdge side="bottom" seed={23} depth={16} />
    </Surface>
  );
}

/** A pasted-up wall: cards on different stock and angles, some taped, the first set as a poster. */
export function UndergroundIdeas({ a, palette }: { a: Arrangement; palette: string }) {
  const t = tonesFor(palette);
  return (
    <ul className="ug-ideas">
      {a.ideas.map((x, i) => {
        const [first, ...rest] = x.exp.name.split(' ');
        return (
          <li key={x.exp.id} className={`ug-idea ug-idea-${i % 5}`} data-miy-idea={x.exp.id}>
            <Surface tone={t.cards[i % t.cards.length]} className="ug-card" style={{ transform: `rotate(${tilt(ANGLES[i % ANGLES.length])}deg)` }}>
              {i % 3 === 1 && <Tape tone={i % 2 ? 'mustard' : 'cream'} angle={i % 2 ? 4 : -4} width={80} className="-top-3 right-8" />}
              <a href={placeHref({ step: 'arrival', sample: x.exp.id })} className="ug-card-link">
                {i % 5 === 0 ? (
                  <span className="ug-card-name ug-card-poster">
                    <span className="block">{first}</span> {rest.join(' ')}
                  </span>
                ) : (
                  <span className="ug-card-name">{x.exp.name}</span>
                )}
                <span className="ug-card-text">{x.exp.description}</span>
                {x.matches.length > 0 && <span className="ug-card-match">{matchText(x)}</span>}
              </a>
            </Surface>
          </li>
        );
      })}
    </ul>
  );
}

/** A sample idea as a spread: a poster panel, then the details on taped notes. */
export function UndergroundSample({ exp, palette }: { exp: Experience; palette: string }) {
  const t = tonesFor(palette);
  return (
    <div className="ug-sample" data-miy-layout="underground">
      <Surface tone={t.cover} className="ug-sample-poster">
        <Grain intensity="medium" />
        <p className="ug-label">Sample idea from the curated catalogue</p>
        <h1 id="miy-sample-name" className="ug-sample-title" tabIndex={-1} data-miy-heading="">
          {exp.name}
        </h1>
        {exp.kicker && (
          <p className="ug-sample-jp" lang="ja">
            {exp.kicker}
          </p>
        )}
        <PaperEdge side="bottom" seed={31} depth={14} />
      </Surface>
      <div className="ug-sample-body">
        <Surface tone={t.star} className="ug-note" style={{ transform: `rotate(${tilt(-1.5)}deg)` }}>
          <Tape tone="paper" angle={4} width={88} className="-top-3 left-8" />
          <p className="ug-sample-lede">{exp.description}</p>
        </Surface>
        <div>
          <h2 className="ug-sample-h2">What you’d do</h2>
          <ul className="ug-sample-list">
            {exp.activities.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <dl className="ug-facts">
            <div>
              <dt>Time</dt>
              <dd>{formatDuration(exp.duration)}</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>{formatCost(exp.cost)}</dd>
            </div>
            <div>
              <dt>Energy</dt>
              <dd>{ENERGY_LABEL[exp.energy]}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
