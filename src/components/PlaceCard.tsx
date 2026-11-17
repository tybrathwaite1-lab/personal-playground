import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, MapPin, Navigation, Trash2 } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import type { Place } from '../types';
import { directionsLink, formatDate, hostname, isSafeUrl, mapsLink } from '../utils/helpers';
import { FavoriteButton, SaveButton } from './ui';
import { EditorialImage } from './EditorialImage';
import { imageFor } from '../data/images';

const STATUS: Record<Place['status'], { label: string; cls: string }> = {
  verified: { label: 'Verified', cls: 'border-hunter bg-hunter text-paper' },
  check: { label: 'Confirm before visiting', cls: 'border-rust/70 text-rust' },
  placeholder: { label: 'Placeholder — add yours', cls: 'border-dashed border-line text-muted' },
};

export function PlaceCard({ place, highlight, visual }: { place: Place; highlight?: boolean; visual?: boolean }) {
  const { data, setPlaceNote, deletePlace } = useStore();
  const [open, setOpen] = useState(Boolean(highlight));
  const [note, setNote] = useState(data.placeNotes[place.id] ?? '');
  const ref = useRef<HTMLElement>(null);
  const status = STATUS[place.status];

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  return (
    <article
      ref={ref}
      className={`card flex h-full flex-col ${highlight ? 'outline outline-2 outline-offset-2 outline-rust' : ''}`}
      aria-labelledby={`${place.id}-name`}
    >
      {visual && imageFor(place.id) && <EditorialImage subject={place.id} ratio="16/9" className="px-4 pt-4" />}
      <div className="flex items-start gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <p className="label mb-1 truncate">{place.categories.join(' · ')}</p>
          <h3 id={`${place.id}-name`} className="display text-2xl">
            {place.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {place.neighborhood}
            {place.city !== place.neighborhood && ` · ${place.city}`}
          </p>
        </div>
        <div className="-mr-2 -mt-1 flex">
          <FavoriteButton id={place.id} name={place.name} />
          <SaveButton
            kind="place"
            refId={place.id}
            title={place.name}
            subtitle={`${place.neighborhood} · ${place.categories[0]}`}
            url={place.website}
            compact
          />
        </div>
      </div>

      <div className="px-4">
        <p className="text-sm text-paper/85">{place.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`tag ${status.cls}`}>{status.label}</span>
          {place.costNote && <span className="tag">{place.costNote}</span>}
          {place.custom && <span className="tag text-rust">Yours</span>}
        </div>
      </div>

      <div className="mt-auto">
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-sm">
          {place.status !== 'placeholder' && (
            <>
              <a href={directionsLink(place)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
                <Navigation size={14} aria-hidden /> Directions
              </a>
              <a href={mapsLink(place)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
                <MapPin size={14} aria-hidden /> Map
              </a>
            </>
          )}
          {isSafeUrl(place.website) && (
            <a href={place.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
              <ArrowUpRight size={14} aria-hidden /> {hostname(place.website)}
            </a>
          )}
          <button
            type="button"
            className="ml-auto flex min-h-[36px] items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted hover:text-paper"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            Details <ChevronDown size={14} aria-hidden className={open ? 'rotate-180' : ''} />
          </button>
        </div>

        {open && (
          <div className="space-y-3 border-t border-line bg-ink px-4 py-3 text-sm">
            {place.address && (
              <p>
                <span className="label mr-2">Address</span>
                {place.address}
              </p>
            )}
            {place.interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {place.interests.map((i) => (
                  <span key={i} className="tag">
                    {i}
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted">
              {place.verifiedOn ? `Last verified ${formatDate(place.verifiedOn)}` : 'Not yet verified'}
              {place.sourceNote && ` — ${place.sourceNote}`}. Hours and prices change; check before going.
            </p>
            <label className="block">
              <span className="label mb-1 block">Personal notes</span>
              <textarea
                className="input min-h-[70px] text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== (data.placeNotes[place.id] ?? '') && setPlaceNote(place.id, note)}
                placeholder="What to order, who to bring, when to go…"
              />
            </label>
            {place.custom && (
              <button
                type="button"
                className="btn"
                onClick={() => confirm(`Delete “${place.name}”?`) && deletePlace(place.id)}
              >
                <Trash2 size={14} aria-hidden /> Delete place
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
