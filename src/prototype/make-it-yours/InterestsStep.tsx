import { placeHref } from './journey';
import type { Journey } from './MakeItYours';
import { Cover } from './parts';
import { INTERESTS, SAMPLE, arrange, feedback, sampleCount } from './sample';

/** Step 2 (optional): pick a few interests and watch the cover respond. None are required. */
export function InterestsStep({ journey }: { journey: Journey }) {
  const { choices, dispatch, go } = journey;
  const a = arrange(choices.interests);
  return (
    <section className="miy-interests" aria-labelledby="miy-interests-title">
      <div className="miy-interests-main">
        <h1 id="miy-interests-title" className="miy-h1" tabIndex={-1} data-miy-heading="">
          Pick a few interests
        </h1>
        <p className="miy-lede">Optional, and none are required. They change which ideas lead, never how the Playground looks.</p>
        <fieldset className="miy-fieldset">
          <legend className="miy-legend">
            Interests <span className="miy-small">({choices.interests.length} picked)</span>
          </legend>
          <div className="miy-chips">
            {INTERESTS.map((i) => {
              const n = sampleCount(i.id);
              return (
                <label key={i.id} className="miy-chip" data-miy-interest={i.id}>
                  <input type="checkbox" className="miy-chip-input" checked={choices.interests.includes(i.id)} onChange={() => dispatch({ type: 'toggle-interest', id: i.id })} />
                  <span className="miy-chip-name">{i.label}</span>
                  <span className="miy-chip-count">{n ? `${n} sample idea${n === 1 ? '' : 's'}` : 'none in this sample'}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="miy-actions">
          <button type="button" className="miy-button miy-button-primary" onClick={() => go({ step: 'arrival' })}>
            Enter the Playground
          </button>
          <button
            type="button"
            className="miy-button"
            onClick={() => {
              dispatch({ type: 'clear-interests' });
              go({ step: 'arrival' });
            }}
          >
            Skip interests
          </button>
          <a className="miy-text-button" href={placeHref({ step: 'look', view: choices.look ?? 'studio' })}>
            Back to looks
          </a>
        </div>
      </div>
      <aside className="miy-interests-preview" aria-labelledby="miy-preview-title">
        <h2 id="miy-preview-title" className="miy-h2">
          Your cover so far
        </h2>
        <div className="miy-tally-row">
          {/* A glanceable summary of the sentence below (which is the one announced). */}
          <p className="miy-tally" aria-hidden key={`${a.matched}-${a.featured.exp.id}`}>
            <strong>{a.matched}</strong>
            <span>of {SAMPLE.length} match</span>
          </p>
          <div>
            <p className="miy-leads" data-miy-leads="">
              Leading the cover: <strong>{a.featured.exp.name}</strong>
            </p>
            <p className="miy-feedback" aria-live="polite" data-miy-feedback="">
              {feedback(a)}
            </p>
          </div>
        </div>
        <div className="miy-mini" aria-hidden>
          <Cover look={choices.look} palette={journey.custom?.palette} a={a} mode="mini" />
        </div>
      </aside>
    </section>
  );
}
