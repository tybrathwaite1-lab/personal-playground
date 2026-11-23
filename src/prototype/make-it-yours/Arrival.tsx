import { customOf, lookById, placeHref } from './journey';
import type { Journey } from './MakeItYours';
import { Cover, Customise, Ideas } from './parts';
import { arrange } from './sample';

/**
 * The soft landing: the Playground itself, already populated. One gentle invitation (save the
 * idea on the cover); customisation is there, quietly, at the end. No checklist, no progress.
 */
export function Arrival({ journey }: { journey: Journey }) {
  const { choices, dispatch } = journey;
  const a = arrange(choices.interests);
  const look = choices.look;
  const f = a.featured.exp;
  const saved = choices.saved.includes(f.id);
  const custom = look ? customOf(choices, look) : null;
  const l = look ? lookById(look) : null;

  const star = (
    <div className="miy-star-actions">
      <p className="miy-invite">Like the sound of it? Save one to start your collection.</p>
      <div className="miy-actions">
        <button type="button" className="miy-button miy-button-primary" aria-pressed={saved} onClick={() => dispatch({ type: 'toggle-save', id: f.id })} data-miy-save="">
          {saved ? 'Saved' : 'Save'}
          <span className="sr-only"> {f.name} (preview)</span>
        </button>
        <a className="miy-button" href={placeHref({ step: 'arrival', sample: f.id })}>
          Open this idea
        </a>
      </div>
      <p className="miy-small" data-miy-save-note="">
        {saved ? 'Saved in this preview only. It isn’t added to your real Collection.' : 'Preview save: nothing is added to your real Collection.'}
      </p>
    </div>
  );

  const subline = !a.picked.length
    ? 'A mix of ten sample ideas from the curated catalogue. Nothing here is live or personalised.'
    : a.matched
      ? `Ideas that match your interests come first, with what they match. All ten are samples from the curated catalogue.${
          a.unmatched.length ? ` Nothing in this sample matches ${a.unmatched.map((i) => i.label).join(', ')} yet.` : ''
        }`
      : `Nothing in this sample matches ${a.picked.map((i) => i.label).join(', ')} yet, so here is a mix of ten sample ideas.`;

  return (
    <div className="miy-arrival" data-miy-arrival="">
      <Cover look={look} a={a} mode="arrival" star={star} />

      <section className="miy-section" aria-labelledby="miy-ideas-title">
        <h2 id="miy-ideas-title" className="miy-h2">
          Ideas to start with
        </h2>
        <p className="miy-lede miy-subline" data-miy-subline="">
          {subline}
        </p>
        <Ideas look={look} a={a} />
      </section>

      <section className="miy-section miy-yours" aria-labelledby="miy-yours-title">
        <h2 id="miy-yours-title" className="miy-h2">
          Make it yours
        </h2>
        <p className="miy-small" data-miy-summary="">
          {l
            ? `Look: ${l.name} (${l.palettes.find((p) => p.id === custom!.palette)?.name}, ${l.types.find((t) => t.id === custom!.type)?.name}).`
            : 'No look chosen. You’re seeing the prototype’s default style, not a look chosen for you.'}{' '}
          {a.picked.length ? `Interests: ${a.picked.map((i) => i.label).join(', ')}.` : 'No interests picked.'} You can change any of this whenever you like.
        </p>
        <div className="miy-actions">
          <a className="miy-button" href={placeHref({ step: 'look', view: look ?? 'studio' })}>
            {look ? 'Change look' : 'Choose a look'}
          </a>
          <a className="miy-button" href={placeHref({ step: 'interests' })}>
            Change interests
          </a>
        </div>
        {look && <Customise journey={journey} look={look} />}
      </section>
    </div>
  );
}
