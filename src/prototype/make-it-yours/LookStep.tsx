import { LOOKS, lookById, placeHref } from './journey';
import type { Journey } from './MakeItYours';
import { Cover, Customise } from './parts';
import { arrange } from './sample';

/** Step 1: browse the looks one at a time, open a sample idea, choose one, or skip. */
export function LookStep({ journey }: { journey: Journey }) {
  const { place, dispatch, go } = journey;
  const i = LOOKS.findIndex((l) => l.id === place.view);
  const look = lookById(place.view);
  const prev = LOOKS[(i - 1 + LOOKS.length) % LOOKS.length];
  const next = LOOKS[(i + 1) % LOOKS.length];
  const a = arrange([]);
  return (
    <section className="miy-look" aria-labelledby="miy-look-name">
      <div className="miy-look-head">
        <p className="miy-count">
          Look {i + 1} of {LOOKS.length}
        </p>
        <h1 id="miy-look-name" className="miy-h1" tabIndex={-1} data-miy-heading="">
          {look.name}
        </h1>
        <p className="miy-lede">{look.line}</p>
      </div>

      <div className="miy-look-body">
        <figure className="miy-stage" aria-label={`Sample cover in the ${look.name} look`}>
          {look.built ? (
            <Cover look={look.id} a={a} mode="preview" />
          ) : (
            <div className="miy-unbuilt" data-miy-unbuilt="">
              <p className="miy-unbuilt-name">{look.name}</p>
              <p>This look isn’t built in this prototype yet. It arrives in the next build.</p>
              <p className="miy-small">Use Next or Previous to keep browsing, or skip for now.</p>
            </div>
          )}
        </figure>

        <div className="miy-look-controls">
          <nav aria-label="Looks" className="miy-pager">
            <button type="button" className="miy-button" onClick={() => go({ step: 'look', view: prev.id }, true)}>
              Previous look<span className="sr-only">: {prev.name}</span>
            </button>
            <button type="button" className="miy-button" onClick={() => go({ step: 'look', view: next.id }, true)}>
              Next look<span className="sr-only">: {next.name}</span>
            </button>
          </nav>
          {look.built && (
            <div className="miy-actions">
              <button type="button" className="miy-button miy-button-primary" onClick={() => {
                  dispatch({ type: 'choose-look', look: look.id });
                  go({ step: 'interests' });
                }}>
                Choose {look.name}
              </button>
              <a className="miy-button" href={placeHref({ step: 'look', view: look.id, sample: a.featured.exp.id })} data-miy-open-sample="">
                Open a sample idea
              </a>
            </div>
          )}
          {look.built && <Customise journey={journey} look={look.id} />}
          <div className="miy-skip-row">
            <button
              type="button"
              className="miy-text-button"
              aria-describedby="miy-skip-hint"
              onClick={() => {
                dispatch({ type: 'no-preference' });
                go({ step: 'arrival' });
              }}
            >
              Skip for now
            </button>
            <p id="miy-skip-hint" className="miy-small">
              You’ll go straight to the Playground with no look chosen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
