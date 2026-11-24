import type { ReactNode } from 'react';
import { Grain } from '../../../components/graphic/primitives';
import { Surface } from '../../../components/graphic/Surface';
import { placeHref } from '../journey';
import type { Arrangement, Idea } from '../sample';

/**
 * The prototype's fallback style, shown whenever no look is chosen (nothing picked yet, or
 * Skip). It is today's app style, built from the existing tested surfaces, and it is presented
 * as a default, never as a look chosen for the person.
 */

const matchText = (x: Idea) => (x.matches.length ? `Matches ${x.matches.map((m) => m.label).join(', ')}` : '');

export function FallbackCover({ a, mode, star }: { a: Arrangement; mode: 'preview' | 'mini' | 'arrival'; star?: ReactNode }) {
  const live = mode === 'arrival';
  const Title = live ? 'h1' : 'p';
  const StarTitle = live ? 'h2' : 'p';
  return (
    <Surface tone="editorial" className={`fallback-cover fallback-cover-${mode} overflow-hidden`} data-miy-cover="fallback">
      <Grain intensity="subtle" />
      <div className="relative z-10 grid gap-6 p-5 md:grid-cols-[1.2fr_1fr] md:p-8">
        <div>
          <p className="ui-label">Default style</p>
          <Title className="fallback-title display mt-2" {...(live ? { id: 'miy-title', tabIndex: -1, 'data-miy-heading': '' } : {})}>
            Personal Playground
          </Title>
          <p className="mt-3 max-w-prose text-fg-muted">Ideas for time off, gathered in one place.</p>
        </div>
        <div className="border border-control p-4" data-miy-featured={a.featured.exp.id}>
          <p className="ui-label text-accent">{a.featured.matches.length ? matchText(a.featured) : 'On the cover'}</p>
          <StarTitle className="display mt-2 text-3xl">{a.featured.exp.name}</StarTitle>
          {mode !== 'mini' && <p className="mt-2 text-fg-muted">{a.featured.exp.description}</p>}
          {star}
        </div>
        <div className="md:col-span-2">
          {live ? <h2 className="ui-label">Also on the cover</h2> : <p className="ui-label">Also on the cover</p>}
          <ul className="mt-2 grid gap-2 md:grid-cols-3">
            {a.onCover.map((x) => (
              <li key={x.exp.id} className="border-t border-control pt-2">
                {live ? (
                  <a href={placeHref({ step: 'arrival', sample: x.exp.id })} className="font-display text-xl uppercase underline-offset-4 hover:underline">
                    {x.exp.name}
                  </a>
                ) : (
                  <span className="font-display text-xl uppercase">{x.exp.name}</span>
                )}
                {x.matches.length > 0 && <span className="mt-1 block text-sm text-fg-muted">{matchText(x)}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Surface>
  );
}

export function FallbackIdeas({ a }: { a: Arrangement }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {a.ideas.map((x) => (
        <li key={x.exp.id} data-miy-idea={x.exp.id}>
          <Surface tone="raised" className="h-full border border-control">
            <a href={placeHref({ step: 'arrival', sample: x.exp.id })} className="block h-full p-4">
              <span className="font-display block text-2xl uppercase">{x.exp.name}</span>
              <span className="mt-2 block text-sm text-fg-muted">{x.exp.description}</span>
              {x.matches.length > 0 && <span className="ui-label mt-3 block text-accent">{matchText(x)}</span>}
            </a>
          </Surface>
        </li>
      ))}
    </ul>
  );
}
