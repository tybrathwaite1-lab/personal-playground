import { useEffect, useReducer, useRef, useState } from 'react';
import { InPageLink } from '../../components/InPageLink';
import { Arrival } from './Arrival';
import { InterestsStep } from './InterestsStep';
import { INITIAL, customOf, parsePlace, placeHref, reduce, type Action, type Choices, type LookId, type Place } from './journey';
import { LookStep } from './LookStep';
import { UNDERGROUND_TONES } from './looks/Underground';
import './fonts.css';
import { SampleDiscovery } from './SampleDiscovery';
import './tokens.css';
import './prototype.css';

/** Everything a step needs: where you are, what you chose, and how to move. */
export interface Journey {
  place: Place;
  choices: Choices;
  dispatch: (a: Action) => void;
  /** Moves to a place; a new history entry unless `replace`. */
  go: (to: Partial<Place> & { step: Place['step'] }, replace?: boolean) => void;
  /** Entered at a later step with nothing chosen in this page's lifetime (a link, or a reload). */
  fresh: boolean;
  /** Closes an open sample idea: back through history when it was opened here, else in place. */
  closeSample: () => void;
  /** The look on screen (null: no aesthetic preference, so the fallback style) and its colour and type. */
  shown: LookId | null;
  custom: { palette: string; type: string } | null;
}

/**
 * Creative Slice 02 — Make It Yours (prototype). A hidden, isolated preview of first-time
 * onboarding: browse looks, optionally pick interests and adjust colour and type, then land in
 * a populated Playground. It reads the curated catalogue and writes nothing anywhere.
 */
export default function MakeItYours({ params }: { params: URLSearchParams }) {
  const place = parsePlace(params);
  const [choices, dispatch] = useReducer(reduce, INITIAL);
  // Remembered once: whether this page was opened somewhere other than the first step.
  const [enteredLater] = useState(() => place.step !== 'look');
  const fresh = enteredLater && !choices.touched && place.step !== 'look';

  const go: Journey['go'] = (to, replace = false) => {
    const h = placeHref(to);
    if (replace) location.replace(h);
    else location.hash = h;
  };

  // The place before this one, in this page's lifetime (null after a direct link or a reload).
  const here = placeHref(place);
  const trail = useRef<{ now: string; before: string | null }>({ now: here, before: null });
  useEffect(() => {
    if (trail.current.now !== here) trail.current = { now: here, before: trail.current.now };
  }, [here]);
  const closeSample = () => {
    const cover = placeHref({ ...place, sample: null });
    if (trail.current.before === cover) history.back();
    else go({ ...place, sample: null }, true);
  };

  // The look being shown: the one in view on the look step, otherwise the chosen one. With no
  // aesthetic preference the prototype shows its fallback style (not a choice made for you).
  const shown: LookId | null = place.step === 'look' ? place.view : choices.look;
  const custom = shown ? customOf(choices, shown) : null;

  // Remembers the link that opened a sample idea, so closing it returns focus there.
  const opener = useRef<{ href: string; index: number } | null>(null);
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!link) return;
      const href = link.getAttribute('href')!;
      opener.current = { href, index: Array.from(document.querySelectorAll('a[href]')).filter((x) => x.getAttribute('href') === href).indexOf(link) };
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);

  // Each step change moves focus to its heading (or, closing a sample idea, back to the link
  // that opened it) and announces the new heading: no reliance on motion.
  const where = `${place.step}|${place.view}|${place.sample ?? ''}`;
  const before = useRef<string | null>(null);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    const was = before.current;
    before.current = where;
    window.scrollTo(0, 0);
    if (was === null) return; // first render: leave focus where the browser put it
    const heading = document.querySelector<HTMLElement>('[data-miy-heading]');
    let target = heading;
    const closedSample = was.split('|')[2] && !where.split('|')[2];
    if (closedSample && opener.current) {
      const o = opener.current;
      const links = Array.from(document.querySelectorAll<HTMLElement>('a[href]')).filter((x) => x.getAttribute('href') === o.href);
      target = links[o.index] ?? links[0] ?? heading;
    }
    target?.focus();
    setAnnounce(heading?.textContent ?? '');
  }, [where]);

  const journey: Journey = { place, choices, dispatch, go, fresh, closeSample, shown, custom };
  const sample = place.sample;

  return (
    <div data-miy="" data-miy-look={shown ?? 'default'} data-miy-palette={custom?.palette} data-miy-type={custom?.type} data-miy-step={place.step} className={`miy-root${shown === 'underground' ? ` surface-${UNDERGROUND_TONES[custom!.palette]?.page ?? 'editorial'}` : ''}`}>
      <InPageLink to="main" className="miy-skip">
        Skip to content
      </InPageLink>
      <header className="miy-header">
        <span className="miy-wordmark">Personal Playground</span>
        <span className="miy-badge" data-miy-badge="">
          Prototype preview: nothing here is saved
        </span>
        <a className="miy-exit" href="#/">
          Exit preview
        </a>
      </header>
      <main id="main" tabIndex={-1} className="miy-main">
        {fresh && (
          <p className="miy-note" data-miy-fresh="">
            Starting fresh. This preview keeps choices only while the page is open, so nothing carried over from a link or a reload.
          </p>
        )}
        {sample ? (
          <SampleDiscovery journey={journey} id={sample} />
        ) : place.step === 'look' ? (
          <LookStep journey={journey} />
        ) : place.step === 'interests' ? (
          <InterestsStep journey={journey} />
        ) : (
          <Arrival journey={journey} />
        )}
      </main>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
