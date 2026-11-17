import { ArrowUpRight, Clock, DollarSign, MapPin, Users, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useStore } from '../hooks/useStore';
import { href } from '../hooks/useRoute';
import type { Experience } from '../types';
import { formatCost, formatDuration } from '../utils/discovery';
import { COMPANY_LABEL, ENERGY_LABEL } from '../utils/labels';
import { directionsLink, isSafeUrl } from '../utils/helpers';
import { SaveButton } from './ui';

function Meta({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="border-line p-3 [&:not(:last-child)]:border-r">
      <dt className="label mb-1 flex items-center gap-1.5">
        <Icon size={12} aria-hidden /> {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/** The full editorial result card used by the Discovery Engine and detail views. */
export function ExperienceCard({ exp, index, footer }: { exp: Experience; index?: string; footer?: ReactNode }) {
  const { places } = useStore();
  const linkedPlaces = (exp.placeIds ?? [])
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <article className="card relative animate-rise overflow-hidden" aria-labelledby={`${exp.id}-title`}>
      <div className="flex items-center justify-between border-b border-line bg-hunter/40 px-4 py-2">
        <span className="label text-paper/80">
          {index ? `Pick ${index}` : 'Experience'}
          {exp.custom && <span className="ml-2 text-rust">· Yours</span>}
        </span>
        {exp.kicker && (
          <span className="font-jp text-xs tracking-[0.25em] text-paper/70" lang="ja">
            {exp.kicker}
          </span>
        )}
      </div>

      <div className="p-5 sm:p-7">
        <h2 id={`${exp.id}-title`} className="display text-4xl sm:text-5xl">
          {exp.name}
        </h2>
        <p className="mt-3 max-w-prose text-[17px] leading-relaxed text-paper/90">{exp.description}</p>

        {exp.activities.length > 0 && (
          <ol className="mt-5 space-y-2">
            {exp.activities.map((a, i) => (
              <li key={i} className="flex gap-3 text-paper/90">
                <span className="mt-0.5 font-mono text-xs text-rust">{String(i + 1).padStart(2, '0')}</span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <dl className="grid grid-cols-2 border-y border-line sm:grid-cols-4">
        <Meta icon={DollarSign} label="Cost" value={formatCost(exp.cost)} />
        <Meta icon={Clock} label="Time" value={formatDuration(exp.duration)} />
        <Meta icon={Zap} label="Energy" value={ENERGY_LABEL[exp.energy].replace(' energy', '')} />
        <Meta icon={Users} label="With" value={exp.company.map((c) => COMPANY_LABEL[c]).join(' · ')} />
      </dl>

      <div className="space-y-4 p-5 sm:px-7">
        <div className="flex flex-wrap gap-1.5" aria-label="Interests">
          {exp.interests.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>

        {(linkedPlaces.length > 0 || (exp.links?.length ?? 0) > 0) && (
          <div className="space-y-2">
            <p className="label">Where & links</p>
            <ul className="flex flex-col gap-1.5">
              {linkedPlaces.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <a href={href('local', { place: p.id })} className="flex items-center gap-2 underline-offset-4 hover:underline">
                    <MapPin size={14} className="text-rust" aria-hidden />
                    {p.name}
                    <span className="text-muted">· {p.neighborhood}</span>
                  </a>
                  {p.status !== 'placeholder' && (
                    <a
                      className="font-mono text-[11px] uppercase tracking-wider text-muted hover:text-paper"
                      href={directionsLink(p)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Directions
                    </a>
                  )}
                </li>
              ))}
              {exp.links
                ?.filter((l) => isSafeUrl(l.url))
                .map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm underline-offset-4 hover:underline"
                    >
                      <ArrowUpRight size={14} className="text-rust" aria-hidden />
                      {l.label}
                    </a>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <SaveButton kind="experience" refId={exp.id} title={exp.name} subtitle={exp.description} />
          {footer}
        </div>
      </div>
    </article>
  );
}

/** A small tile for lists and rails. */
export function ExperienceTile({ exp, onOpen }: { exp: Experience; onOpen: () => void }) {
  return (
    <div className="card group flex h-full flex-col">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col p-4 text-left">
        <div className="mb-3 flex items-center justify-between">
          <span className="label">{formatDuration(exp.duration)}</span>
          {exp.kicker && (
            <span className="font-jp text-[10px] tracking-[0.2em] text-muted" lang="ja">
              {exp.kicker}
            </span>
          )}
        </div>
        <h3 className="display text-2xl transition-colors group-hover:text-rust">{exp.name}</h3>
        <p className="mt-2 line-clamp-3 text-sm text-muted">{exp.description}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          <span className="tag">{formatCost(exp.cost)}</span>
          <span className="tag">{exp.energy}</span>
        </div>
      </button>
    </div>
  );
}
