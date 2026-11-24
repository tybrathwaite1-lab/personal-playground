import type { ReactNode } from 'react';
import type { Experience } from '../../../types';
import { formatCost, formatDuration } from '../../../utils/discovery';
import { ENERGY_LABEL } from '../../../utils/labels';
import { placeHref } from '../journey';
import { matchText, type Arrangement } from '../sample';

/**
 * The Quiet Room: warm, spacious, intimate, editorially restrained. One centred column set in
 * Newsreader (the app's one self-hosted serif), generous margins, fine rules, italic
 * notes instead of badges. Nothing is decorative except the rules.
 */
export function QuietCover({ a, mode, star }: { a: Arrangement; mode: 'preview' | 'mini' | 'arrival'; star?: ReactNode }) {
  const live = mode === 'arrival';
  const Title = live ? 'h1' : 'p';
  const StarTitle = live ? 'h2' : 'p';
  const f = a.featured;
  return (
    <div className={`quiet-cover quiet-cover-${mode}`} data-miy-cover="quiet-room">
      <p className="quiet-overline">A quiet place for time off</p>
      <Title className="quiet-title" {...(live ? { id: 'miy-title', tabIndex: -1, 'data-miy-heading': '' } : {})}>
        Personal Playground
      </Title>
      <span aria-hidden className="quiet-ornament" />
      <div className="quiet-star" data-miy-featured={f.exp.id}>
        <p className="quiet-note">{f.matches.length ? matchText(f) : 'On the cover'}</p>
        <StarTitle className="quiet-star-title">{f.exp.name}</StarTitle>
        {mode !== 'mini' && <p className="quiet-star-text">{f.exp.description}</p>}
        {star}
      </div>
      <div className="quiet-also">
        {live ? <h2 className="quiet-also-title">Also on the cover</h2> : <p className="quiet-also-title">Also on the cover</p>}
        <ul>
          {a.onCover.map((x) => (
            <li key={x.exp.id}>
              {live ? <a href={placeHref({ step: 'arrival', sample: x.exp.id })}>{x.exp.name}</a> : <span>{x.exp.name}</span>}
              {x.matches.length > 0 && <em className="quiet-match">{matchText(x).toLowerCase()}</em>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A reading list: rows separated by fine rules, with every fourth idea set as a pull quote. */
export function QuietIdeas({ a }: { a: Arrangement }) {
  return (
    <ul className="quiet-ideas">
      {a.ideas.map((x, i) => (
        <li key={x.exp.id} className={`quiet-idea${i % 4 === 2 ? ' quiet-idea-quote' : ''}`} data-miy-idea={x.exp.id}>
          <a href={placeHref({ step: 'arrival', sample: x.exp.id })} className="quiet-idea-link">
            <span className="quiet-idea-name">{x.exp.name}</span>
            <span className="quiet-idea-text">{x.exp.description}</span>
            {x.matches.length > 0 && <em className="quiet-match">{matchText(x).toLowerCase()}</em>}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** A sample idea as a short essay: the description as an italic lede, the facts under a fine rule. */
export function QuietSample({ exp }: { exp: Experience }) {
  return (
    <div className="quiet-sample" data-miy-layout="quiet-room">
      <p className="quiet-overline">Sample idea from the curated catalogue</p>
      <h1 id="miy-sample-name" className="quiet-sample-title" tabIndex={-1} data-miy-heading="">
        {exp.name}
      </h1>
      {exp.kicker && (
        <p className="miy-kicker-jp quiet-centre" lang="ja">
          {exp.kicker}
        </p>
      )}
      <span aria-hidden className="quiet-ornament" />
      <p className="quiet-sample-lede">{exp.description}</p>
      <h2 className="quiet-sample-h2">What you’d do</h2>
      <ul className="quiet-sample-list">
        {exp.activities.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <dl className="quiet-facts">
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
  );
}
