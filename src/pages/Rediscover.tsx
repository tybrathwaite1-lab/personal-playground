import { ArrowRight, MapPin } from 'lucide-react';
import { Empty, SaveButton, SectionHeader } from '../components/ui';
import { href } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';
import type { Interest } from '../types';
import { formatDuration } from '../utils/discovery';

/** Gentle re-entry prompts. Keyed by lowercase interest name; unknown interests just get links. */
const PROMPTS: Record<string, string> = {
  skateboarding: 'No tricks required. Push around an empty lot, or just go watch a session and remember the sound.',
  basketball: 'Shootaround, no score. Ten free throws to one song. Pick-up only if it feels good.',
  'exploring obscure and interesting websites': 'The old web is still out there. Spend twenty minutes somewhere hand-made.',
  history: 'Pick one oddly specific thing and follow the footnotes.',
  'in-person gaming tournaments': 'Go as a spectator first. Brackets are optional; the room is the point.',
  'fighting game community events': 'Bring a stick, play casuals, say hello. Runbacks over rankings.',
  'trading cards': 'One binder, one small budget, one target card. Or just open a pack for the smell.',
};

function Entry({ interest, index }: { interest: Interest; index: number }) {
  const { experiences, places } = useStore();
  const key = interest.name.toLowerCase();
  const exps = experiences.filter((e) => e.interests.some((t) => t.toLowerCase() === key)).slice(0, 4);
  const spots = places.filter((p) => p.interests.some((t) => t.toLowerCase() === key) && p.status !== 'placeholder').slice(0, 3);

  return (
    <li className="grid grid-cols-1 gap-4 border-t border-line py-8 md:grid-cols-[7rem_1fr_1fr]">
      <div className="flex items-start justify-between md:block">
        <span className="font-display text-6xl leading-none text-rust">{String(index + 1).padStart(2, '0')}</span>
        <div className="md:mt-3">
          <SaveButton kind="interest" refId={interest.id} title={interest.name} subtitle="Rediscovery" compact />
        </div>
      </div>
      <div>
        <h2 className="display text-4xl sm:text-5xl">{interest.name}</h2>
        <p className="mt-3 max-w-md text-paper/85">{PROMPTS[key] ?? interest.note ?? 'Worth another look. Start small and see if it still sparks something.'}</p>
      </div>
      <div className="space-y-4">
        {exps.length > 0 && (
          <div>
            <p className="label mb-2">Ways back in</p>
            <ul className="space-y-1">
              {exps.map((e) => (
                <li key={e.id}>
                  <a href={href('discover', { exp: e.id })} className="group flex items-center justify-between border-b border-line py-2 hover:text-rust">
                    <span>{e.name}</span>
                    <span className="flex items-center gap-2 font-mono text-[11px] text-muted">
                      {formatDuration(e.duration)} <ArrowRight size={14} aria-hidden />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {spots.length > 0 && (
          <div>
            <p className="label mb-2">Nearby</p>
            <ul className="space-y-1">
              {spots.map((p) => (
                <li key={p.id}>
                  <a href={href('local', { place: p.id })} className="flex items-center gap-2 text-sm hover:text-rust">
                    <MapPin size={14} className="text-rust" aria-hidden /> {p.name}
                    <span className="text-muted">· {p.neighborhood}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}

export default function Rediscover() {
  const { interests } = useStore();
  const rediscovery = interests.filter((i) => i.category === 'rediscovery');
  const conditional = interests.filter((i) => i.category === 'conditional');

  return (
    <div>
      <SectionHeader
        number="05"
        title="Rediscover"
        jp="再発見"
        blurb="Interests from earlier chapters. No pressure to pick anything back up — just open doors in case one still leads somewhere."
      />

      {rediscovery.length === 0 ? (
        <Empty>
          No rediscovery interests yet. Add some in <a className="underline" href={href('interests')}>My Interests</a>.
        </Empty>
      ) : (
        <ol>
          {rediscovery.map((i, idx) => (
            <Entry key={i.id} interest={i} index={idx} />
          ))}
        </ol>
      )}

      {conditional.length > 0 && (
        <section className="mt-12 border border-line p-5 sm:p-7" aria-labelledby="conditional-title">
          <p className="label mb-1">Footnote · 条件付き</p>
          <h2 id="conditional-title" className="display text-3xl">
            Good in the right setting
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Things that are great with the right people, the right energy and a natural stopping point. Worth choosing on purpose.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {conditional.map((i) => (
              <li key={i.id} className="tag text-[11px]">
                {i.name}
              </li>
            ))}
          </ul>
          <a href={href('discover', { exp: 'exp-event-nightcap-home' })} className="btn mt-5">
            Try “Event, Nightcap, Home” <ArrowRight size={14} aria-hidden />
          </a>
        </section>
      )}
    </div>
  );
}
