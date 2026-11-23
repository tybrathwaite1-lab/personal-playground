import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Annotation, Artwork, Grain, NEWSSTAND, FIELD_GUIDE, PaperEdge, Stamp, Surface, Tape, type SurfaceTone } from '../components/graphic';
import { AtmospherePicker } from '../components/AtmospherePicker';
import { InPageLink } from '../components/InPageLink';
import { ATMOSPHERE_SURFACES, ATMOSPHERES } from '../utils/atmosphere';
import { HarborSun, Peaks, RecordNight } from './SampleArt';

/**
 * Hidden review route (#/styleguide): the Sprint 02 visual language in one place, as individual
 * components and as realistic editorial compositions. Not linked from the app; all copy is
 * sample copy. Everything here uses semantic, surface-aware tokens.
 */
export default function StyleGuide() {
  return (
    <div className="surface-ink min-h-dvh">
      <InPageLink to="sg-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-fg focus:px-3 focus:py-2 focus:text-surface">
        Skip to style guide
      </InPageLink>
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
          <p className="ui-label">Personal Playground · Sprint 02 preview</p>
          <a href="#/" className="ui-link text-sm">
            Back to the app
          </a>
        </div>
      </header>

      <main id="sg-main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-24 pt-10 md:px-8">
        <h1 className="font-display text-display uppercase">Style guide</h1>
        <p className="mt-4 max-w-measure text-body-editorial text-fg-muted">
          The Newsstand visual language: surfaces, type, graphic primitives and controls, first one by one, then together. Hidden from navigation; all copy is sample copy.
        </p>
        <ul className="mt-6 grid gap-x-8 gap-y-2 text-small text-fg-muted sm:grid-cols-2">
          {[
            'Consistency in experience. Freedom in expression.',
            'Creative freedom on the page. Predictability in the controls.',
            'Bold editorial compositions, expressive color, original artwork.',
            'St. Petersburg is our home, not our entire subject matter.',
            'No goals. No quotas. Just curiosity.',
          ].map((p) => (
            <li key={p} className="border-l-2 border-accent pl-3">
              {p}
            </li>
          ))}
        </ul>

        <Compositions />
        <Surfaces />
        <Atmospheres />
        <Typography />
        <Primitives />
        <Controls />
        <Nesting />
        <Resilience />
        <Motion />
      </main>
    </div>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-20 border-t border-rule pt-8">
      <h2 id={id} className="font-display text-heading uppercase">
        {title}
      </h2>
      {intro && <p className="mt-2 max-w-measure text-small text-fg-muted">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

// ─── 1. Editorial compositions ─────────────────────────────────────────────
function Compositions() {
  return (
    <Section id="sg-compositions" title="Compositions" intro="Realistic spreads that combine every primitive, so the language can be judged as a whole. Sample copy; not an edition.">
      <div className="space-y-16">
        <CoverComposition />
        <FeatureComposition />
        <ListingsComposition />
        <ElsewhereComposition />
      </div>
    </Section>
  );
}

function CoverComposition() {
  return (
    <Surface tone="editorial" as="article" aria-labelledby="sg-cover-title" className="overflow-hidden px-5 pb-16 pt-6 md:px-10 md:pb-16">
      <Grain />
      <div className="relative z-10 grid gap-8 md:grid-cols-[1.15fr_1fr] md:items-end">
        <div className="cover-container min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="ui-label">Sample edition · Vol. 03</p>
            <Stamp angle={-8}>Free this week</Stamp>
          </div>
          <h3 id="sg-cover-title" className="cover-headline mt-6 font-display uppercase">
            Small wonders
          </h3>
          <p className="mt-4 max-w-measure text-body-editorial text-fg-muted">A week of things worth leaving the house for, and a few worth staying in for.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <InPageLink to="sg-feature-title" className="ui-button-primary">
              Open the edition
            </InPageLink>
            <button type="button" className="ui-button">
              Save for later
            </button>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-sm md:mx-0">
          <Tape tone="mustard" angle={-6} className="-top-3 left-6" />
          <Tape tone="pink" angle={5} className="-top-2 right-8" />
          <Artwork art={<HarborSun />} alt="Sample illustration: a sun over a harbor with a small boat" treatment="cutout" credit={{ kind: 'illustration', by: 'Sample artwork' }} />
          <Annotation arrow="left" angle={-6} className="absolute -bottom-11 right-0">
            start here
          </Annotation>
        </div>
      </div>
    </Surface>
  );
}

function FeatureComposition() {
  return (
    <div className="pt-4">
      <Surface tone="cream" as="article" aria-labelledby="sg-feature-title" className="px-5 py-10 md:px-10 md:py-14">
        <PaperEdge side="top" seed={11} />
        <PaperEdge side="bottom" seed={23} style="deckle" depth={10} />
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-14">
          <div>
            <p className="ui-label">Feature · Sample copy</p>
            <h3 id="sg-feature-title" className="mt-3 font-display text-display-lg uppercase">
              The night market of small machines
            </h3>
            <p className="mt-6 text-body-editorial">
              Somewhere between a swap meet and a science fair, a parking lot fills with music boxes, pinball parts and radios that someone, somewhere, still knows how to fix.
            </p>
            <p className="mt-4 text-body-editorial">You don&rsquo;t need a reason to go. Bring a question, leave with a screwdriver you didn&rsquo;t know you wanted.</p>
            <blockquote className="mt-8 border-l-4 border-accent pl-4">
              <p className="font-display text-heading uppercase text-accent">&ldquo;Everything here used to be someone&rsquo;s favorite thing.&rdquo;</p>
              <footer className="mt-2 text-small text-fg-muted">A stallholder, sample quote</footer>
            </blockquote>
          </div>
          <div className="relative">
            <Artwork art={<RecordNight />} alt="Sample illustration: a record under a starry sky" ratio="3/4" credit={{ kind: 'ai-assisted', by: 'Sample credit format' }} />
            <Annotation arrow="down" angle={4} className="absolute -top-14 right-2 hidden md:inline-flex">
              bring cash
            </Annotation>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-rule pt-4 text-small">
              <div>
                <dt className="ui-label">When</dt>
                <dd className="mt-1">Fridays after dark</dd>
              </div>
              <div>
                <dt className="ui-label">Cost</dt>
                <dd className="mt-1">Free to wander · bring cash</dd>
              </div>
            </dl>
          </div>
        </div>
      </Surface>
    </div>
  );
}

const LISTINGS: { tone: SurfaceTone; kicker: string; title: string; meta: string; stamp?: string; art?: 'peaks' | 'missing' }[] = [
  { tone: 'mustard', kicker: 'Make', title: 'Bookbinding for impatient people', meta: 'Two hours · Under $25', stamp: 'Beginner' },
  { tone: 'pink', kicker: 'Listen', title: 'Records nobody asked for', meta: 'Any evening · Free', art: 'peaks' },
  { tone: 'cobalt', kicker: 'Wander', title: 'A walk that ends at the water', meta: 'Half day · Outdoors', stamp: 'Sunset' },
  { tone: 'forest', kicker: 'Play', title: 'Tabletop night, no rules lawyers', meta: 'Friends · Indoors', art: 'missing' },
];

function ListingsComposition() {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  return (
    <div aria-labelledby="sg-listings-title" role="group">
      <h3 id="sg-listings-title" className="font-display text-heading uppercase">
        This week, loosely
      </h3>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LISTINGS.map((l) => (
          <Surface key={l.title} tone={l.tone} as="li" className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="ui-label">{l.kicker}</p>
              {l.stamp && <Stamp angle={6}>{l.stamp}</Stamp>}
            </div>
            {l.art === 'peaks' && <Artwork art={<Peaks />} alt="Sample illustration: mountains under a pale moon" treatment="halftone" credit={{ kind: 'illustration', by: 'Sample artwork' }} className="mt-3" />}
            {l.art === 'missing' && <Artwork alt="Tabletop night illustration" title="Tabletop" className="mt-3" />}
            <h4 className="mt-3 font-display text-[1.75rem] uppercase leading-none">{l.title}</h4>
            <p className="mt-2 text-small text-fg-muted">{l.meta}</p>
            <div className="mt-auto pt-4">
              <button type="button" className="ui-chip" aria-pressed={Boolean(saved[l.title])} onClick={() => setSaved((s) => ({ ...s, [l.title]: !s[l.title] }))}>
                {saved[l.title] ? 'Saved' : 'Save'}
              </button>
            </div>
          </Surface>
        ))}
      </ul>
    </div>
  );
}

function ElsewhereComposition() {
  return (
    <div className="pt-4">
      <Surface tone="olive" as="article" aria-labelledby="sg-elsewhere-title" className="px-5 py-10 md:px-10">
        <PaperEdge side="top" seed={41} depth={12} />
        <div className="grid gap-6 md:grid-cols-[1fr_2fr_1fr] md:items-center">
          <Artwork art={<Peaks />} alt="Sample illustration: mountains under a pale moon" treatment="duotone" ratio="1/1" credit={{ kind: 'illustration', by: 'Sample artwork' }} />
          <div>
            <p className="ui-label">Elsewhere · Sample copy</p>
            <h3 id="sg-elsewhere-title" className="mt-3 font-display text-display uppercase">
              A late-night radio hour from somewhere else
            </h3>
            <p className="mt-4 max-w-measure text-body-editorial">Home is a starting point, not a boundary. Tune in from the porch.</p>
          </div>
          <Surface tone="forest" className="p-5">
            <p className="ui-label">Try it</p>
            <p className="mt-2 text-body">One hour, one station you&rsquo;ve never heard, no skipping.</p>
            <InPageLink to="sg-elsewhere-title" className="ui-link mt-3 inline-block text-small">
              Why one hour?
            </InPageLink>
          </Surface>
        </div>
      </Surface>
    </div>
  );
}

// ─── 2. Surfaces ───────────────────────────────────────────────────────────
function SurfaceTile({ tone }: { tone: SurfaceTone }) {
  return (
    <Surface tone={tone} className="flex flex-col gap-2 border border-rule p-4">
      <p className="ui-label">{tone}</p>
      <p className="font-display text-[1.75rem] uppercase leading-none">Headline</p>
      <p className="text-small">Body text on this surface.</p>
      <p className="text-small text-fg-muted">Muted secondary text.</p>
      <p className="font-mono text-label uppercase text-accent">Accent label</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="ui-button">
          Button
        </button>
        <button type="button" className="ui-chip" aria-pressed="true">
          On
        </button>
      </div>
    </Surface>
  );
}

function Surfaces() {
  return (
    <Section id="sg-surfaces" title="Surfaces" intro="Each surface sets tested pairs: text, muted and accent ≥ 4.5:1; focus ring and control boundaries ≥ 3:1. Field Guide surfaces are the existing app; Newsstand surfaces use the approved palette.">
      <h3 className="ui-label">Field Guide</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {FIELD_GUIDE.map((t) => (
          <SurfaceTile key={t} tone={t} />
        ))}
      </div>
      <h3 className="ui-label mt-8">Newsstand</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {NEWSSTAND.map((t) => (
          <SurfaceTile key={t} tone={t} />
        ))}
      </div>
    </Section>
  );
}

// ─── 2b. Atmosphere (Creative Slice 01) ────────────────────────────────────
function Atmospheres() {
  return (
    <Section
      id="sg-atmosphere"
      title="Atmosphere"
      intro="The homepage cover and the Window band in each atmosphere: tested surfaces only. The selector is live (it changes the whole app); its chips are checked on every cover surface."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {ATMOSPHERES.map((a) => (
          <div key={a.id} className="min-w-0">
            <Surface tone={ATMOSPHERE_SURFACES[a.id].cover} className="cover-container px-4 pb-5 pt-4">
              <p className="ui-label">
                {a.label} · {a.hours}
              </p>
              <p className="mt-3 font-display text-heading uppercase leading-none">
                Personal Playground<span className="text-accent">.</span>
              </p>
              <p className="mt-3 border-t border-rule pt-2">
                <span className="ui-label text-accent">Today near you</span>
                <span className="cover-line-title mt-1 block">Sample cover line</span>
              </p>
              <AtmospherePicker className="mt-4" />
            </Surface>
            <Surface tone={ATMOSPHERE_SURFACES[a.id].band} className="px-4 py-2">
              <p className="ui-label">The Local Pulse · band</p>
            </Surface>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── 3. Typography ─────────────────────────────────────────────────────────
function Typography() {
  const rows: [string, string, ReactNode][] = [
    ['text-cover', 'Cover treatments only · up to 160px', <span className="font-display text-cover uppercase">Curious</span>],
    ['text-display-lg', '≈ 49–56px mobile · 112px desktop', <span className="font-display text-display-lg uppercase">Go outside</span>],
    ['text-display', '≈ 40–42px mobile · 72px desktop', <span className="font-display text-display uppercase">Stay curious</span>],
    ['text-heading', 'Ordinary headings', <span className="font-display text-heading uppercase">This week, loosely</span>],
    ['text-body-editorial', '17–18px · editorial body', <span className="text-body-editorial">A walk that ends at the water, and a record nobody asked for.</span>],
    ['text-body', '16px · ordinary body', <span className="text-body">Set as many or as few dials as you like.</span>],
    ['text-label', '12–13px · labels', <span className="font-mono text-label uppercase">Ed. 07 · Saturday</span>],
  ];
  return (
    <Section id="sg-type" title="Typography" intro="Anton for display, IBM Plex Sans for reading, Plex Mono for labels. Caveat Bold is the single handwritten accent: decoration only, never labels, controls or body copy.">
      <Surface tone="editorial" className="divide-y divide-rule px-4 md:px-8">
        {rows.map(([token, note, sample]) => (
          <div key={token} className="grid gap-2 py-5 md:grid-cols-[14rem_1fr] md:items-baseline">
            <div>
              <p className="font-mono text-small text-accent">{token}</p>
              <p className="text-small text-fg-muted">{note}</p>
            </div>
            <div className="min-w-0 [overflow-wrap:anywhere]">{sample}</div>
          </div>
        ))}
        <div className="grid gap-2 py-5 md:grid-cols-[14rem_1fr] md:items-baseline">
          <div>
            <p className="font-mono text-small text-accent">Annotation</p>
            <p className="text-small text-fg-muted">Caveat Bold · decorative, aria-hidden</p>
          </div>
          <div>
            <Annotation arrow="right">worth the detour</Annotation>
          </div>
        </div>
      </Surface>
    </Section>
  );
}

// ─── 4. Primitives ─────────────────────────────────────────────────────────
function Demo({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-mono text-small uppercase tracking-wider">{title}</h3>
        <p className="text-small text-fg-muted">{note}</p>
      </div>
      {children}
    </div>
  );
}

/** A deliberately broken image, then a working replacement: the fallback must give way. */
const BROKEN_SRC = 'data:image/png;base64,broken';
// Inline sample art in the approved palette (mustard, cream, forest).
const REPLACEMENT_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'><rect width='4' height='3' fill='rgb(244,198,50)'/><circle cx='2.6' cy='1.2' r='0.7' fill='rgb(241,227,198)'/><path d='M0 3 L1.4 1.6 L2.4 2.5 L4 1.8 V3 Z' fill='rgb(32,78,63)'/></svg>";
const REPLACEMENT_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(REPLACEMENT_SVG)}`;
function RecoveringArtwork() {
  const [src, setSrc] = useState(BROKEN_SRC);
  return (
    <div data-demo="artwork-recovery">
      <Artwork src={src} alt="Sample replacement artwork: hills under a pale sun" title="Image failed" ratio="16/9" credit={{ kind: 'illustration', by: 'Sample artwork' }} />
      <button type="button" className="ui-button mt-3" onClick={() => setSrc(REPLACEMENT_SRC)} disabled={src === REPLACEMENT_SRC}>
        Load a replacement
      </button>
    </div>
  );
}

function Primitives() {
  return (
    <Section id="sg-primitives" title="Graphic primitives" intro="Decorative layers render through one aria-hidden, pointer-events-none wrapper, so they never carry essential text or block a control.">
      <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
        <Demo title="Paper edges" note="Torn and deckled, painted in the surface's own color.">
          <div className="pt-4">
            <Surface tone="mustard" className="px-4 py-8">
              <PaperEdge side="top" seed={5} />
              <p className="font-display text-heading uppercase">Torn top</p>
            </Surface>
            <Surface tone="cobalt" className="mt-4 px-4 py-8">
              <PaperEdge side="top" seed={9} style="deckle" depth={10} />
              <PaperEdge side="bottom" seed={13} depth={12} />
              <p className="font-display text-heading uppercase">Deckle and torn bottom</p>
            </Surface>
          </div>
        </Demo>
        <Demo title="Tape" note="Cream, mustard, pink and paper; rotation clamped to ±8°.">
          <Surface tone="raised" className="relative mt-4 border border-rule px-4 pb-6 pt-10">
            <Tape tone="cream" angle={-5} className="-top-3 left-4" />
            <Tape tone="mustard" angle={6} width={84} className="-top-2 right-6" />
            <Tape tone="pink" angle={-3} width={72} className="-bottom-3 left-1/3" />
            <p className="text-small">A note taped down at the corners.</p>
          </Surface>
        </Demo>
        <Demo title="Stamps" note="Accent text on any surface; press-in motion off under reduced motion.">
          <div className="grid grid-cols-3 gap-2">
            {(['cream', 'editorial', 'pink'] as SurfaceTone[]).map((t, i) => (
              <Surface key={t} tone={t} className="flex min-h-[7rem] items-center justify-center p-2">
                <Stamp shape={i === 1 ? 'circle' : 'rect'} angle={i === 1 ? 8 : -7}>
                  {i === 1 ? 'No. 07 sample' : i === 0 ? 'Free' : 'Tonight'}
                </Stamp>
              </Surface>
            ))}
          </div>
        </Demo>
        <Demo title="Grain" note="Restrained overlay; left without, right with.">
          <div className="grid grid-cols-2 gap-2">
            <Surface tone="orange" className="h-28" />
            <Surface tone="orange" className="h-28">
              <Grain intensity="medium" />
            </Surface>
          </div>
        </Demo>
        <Demo title="Annotations" note="Handwritten, decorative only (aria-hidden), in the surface accent.">
          <Surface tone="cream" className="flex flex-col items-start gap-4 p-4">
            <Annotation arrow="right">look here</Annotation>
            <Annotation arrow="left" angle={3}>
              not essential
            </Annotation>
          </Surface>
        </Demo>
        <Demo title="Missing artwork" note="A quiet typographic fallback with a stable size; a failed image recovers when replaced.">
          <Surface tone="pink" className="space-y-4 p-4">
            <Artwork alt="Sample illustration that has not been delivered" title="Coming soon" />
            <RecoveringArtwork />
          </Surface>
        </Demo>
      </div>
      <h3 className="ui-label mt-12">Illustration treatments</h3>
      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(['plain', 'duotone', 'halftone', 'cutout'] as const).map((t) => (
          <Surface key={t} tone={t === 'duotone' ? 'cream' : t === 'halftone' ? 'mustard' : 'editorial'} className="p-3">
            <p className="ui-label mb-2">{t}</p>
            <Artwork art={<Peaks />} alt="Sample illustration: mountains under a pale moon" treatment={t} ratio="1/1" credit={{ kind: 'illustration', by: 'Sample artwork' }} />
          </Surface>
        ))}
      </div>
    </Section>
  );
}

// ─── 5. Controls and focus ─────────────────────────────────────────────────
function Controls() {
  const [pressed, setPressed] = useState('Any');
  return (
    <Section id="sg-controls" title="Controls and focus" intro="Predictable controls on every surface: the same shapes, a ≥ 3:1 boundary and the surface's focus ring. Tab through them; the last row shows the focus ring statically.">
      <div className="grid gap-4 md:grid-cols-2">
        {(['ink', 'cream', 'cobalt', 'mustard'] as SurfaceTone[]).map((t) => (
          <Surface key={t} tone={t} as="form" className="space-y-4 p-4" onSubmit={(e: FormEvent) => e.preventDefault()}>
            <p className="ui-label">{t}</p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="ui-button-primary">
                Go
              </button>
              <button type="button" className="ui-button">
                Maybe later
              </button>
              <button type="button" className="ui-button" disabled>
                Disabled
              </button>
            </div>
            <fieldset>
              <legend className="ui-label mb-2">Budget</legend>
              <div className="flex flex-wrap gap-2" role="group">
                {['Any', 'Free', 'Under $25'].map((o) => (
                  <button key={o} type="button" className="ui-chip" aria-pressed={pressed === o} onClick={() => setPressed(o)}>
                    {o}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`sg-input-${t}`} className="ui-label">
                Name this vibe
              </label>
              <input id={`sg-input-${t}`} className="ui-input mt-1" placeholder="e.g. Slow Sunday" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="ui-button focus-preview">Focus ring</span>
              <span className="ui-chip focus-preview">Chip</span>
              <InPageLink to="sg-controls" className="ui-link text-small">
                A text link
              </InPageLink>
            </div>
          </Surface>
        ))}
      </div>
    </Section>
  );
}

// ─── 6. Nested surfaces ────────────────────────────────────────────────────
function Nesting() {
  return (
    <Section id="sg-nesting" title="Nested surfaces" intro="Every token re-resolves inside each surface, so text, accents, controls and focus stay accessible at any depth.">
      <Surface tone="editorial" className="p-4 md:p-6">
        <p className="ui-label">Editorial ink</p>
        <p className="mt-1 text-small">Outer surface.</p>
        <Surface tone="cream" className="mt-4 p-4">
          <p className="ui-label">Cream</p>
          <p className="mt-1 text-small">Inside editorial.</p>
          <Surface tone="cobalt" className="mt-4 p-4">
            <p className="ui-label">Cobalt</p>
            <p className="mt-1 text-small text-accent">Accent inside cream inside editorial.</p>
            <Surface tone="mustard" className="mt-4 flex flex-wrap items-center gap-3 p-4">
              <p className="ui-label">Mustard</p>
              <button type="button" className="ui-button">
                Deepest control
              </button>
              <Stamp angle={-5}>Four deep</Stamp>
            </Surface>
          </Surface>
        </Surface>
      </Surface>
    </Section>
  );
}

// ─── 7. Resilience: long headlines and narrow columns ─────────────────────
function Resilience() {
  return (
    <Section id="sg-resilience" title="Long headlines" intro="Headlines wrap and break instead of overflowing; narrow columns stay readable.">
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Surface tone="pink" className="min-w-0 p-4 md:p-6">
          <h3 className="font-display text-display uppercase [hyphens:auto] [overflow-wrap:anywhere]" lang="en">
            An unreasonably long headline about the very best extraordinarily-complicated-to-pronounce neighborhood festivals
          </h3>
        </Surface>
        <Surface tone="forest" className="min-w-0 p-4">
          <h3 className="font-display text-heading uppercase [overflow-wrap:anywhere]">Pneumonoultramicroscopicsilicovolcanoconiosis</h3>
          <p className="mt-2 text-small text-fg-muted">An unbreakable word in a narrow column.</p>
        </Surface>
      </div>
    </Section>
  );
}

// ─── 8. Motion ─────────────────────────────────────────────────────────────
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

function Motion() {
  const reduced = useReducedMotion();
  const [key, setKey] = useState(0);
  return (
    <Section id="sg-motion" title="Motion" intro="Motion is a flourish, never information. With reduced motion requested, stamps and entrances appear without animating.">
      <Surface tone="cream" className="flex flex-wrap items-center gap-6 p-4">
        <p className="text-small" role="status">
          Reduced motion is <strong>{reduced ? 'on' : 'off'}</strong> in this browser.
        </p>
        <span key={key}>
          <Stamp angle={-6}>Stamped</Stamp>
        </span>
        <button type="button" className="ui-button" onClick={() => setKey((k) => k + 1)}>
          Replay
        </button>
      </Surface>
    </Section>
  );
}
