import { formatCost, formatDuration } from '../../utils/discovery';
import { ENERGY_LABEL } from '../../utils/labels';
import { StudioArt } from './covers/Studio';
import type { Journey } from './MakeItYours';
import { SAMPLE } from './sample';

/** One sample idea, opened from a cover, shown in the current look. Back returns to the cover. */
export function SampleDiscovery({ journey, id }: { journey: Journey; id: string }) {
  const exp = SAMPLE.find((e) => e.id === id)!;
  const from = journey.place.step === 'arrival' ? 'the Playground' : 'the cover';
  return (
    <article className="miy-sample" aria-labelledby="miy-sample-name" data-miy-sample={exp.id}>
      <button type="button" className="miy-button miy-back" onClick={journey.closeSample}>
        Back to {from}
      </button>
      <div className="miy-sample-grid">
        <div>
          <p className="miy-count">Sample idea from the curated catalogue</p>
          <h1 id="miy-sample-name" className="miy-h1" tabIndex={-1} data-miy-heading="">
            {exp.name}
          </h1>
          {exp.kicker && (
            <p className="miy-kicker-jp" lang="ja">
              {exp.kicker}
            </p>
          )}
          <p className="miy-lede">{exp.description}</p>
          <h2 className="miy-h2">What you’d do</h2>
          <ul className="miy-list">
            {exp.activities.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <dl className="miy-facts">
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
          <p className="miy-small">An example of what a discovery looks like. In this preview it isn’t a live listing or a recommendation.</p>
        </div>
        <StudioArt exp={exp} />
      </div>
    </article>
  );
}
