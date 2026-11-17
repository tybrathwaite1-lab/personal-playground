import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CalendarPlus, MapPin, Navigation, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { FeedbackBar } from '../components/FeedbackBar';
import { ChipGroup, Empty, SaveButton, SectionHeader } from '../components/ui';
import { WeatherStrip } from '../components/WeatherStrip';
import { COMMUNITIES } from '../data/communities';
import { href } from '../hooks/useRoute';
import { usePulse } from '../hooks/usePulse';
import { useStore } from '../hooks/useStore';
import { useWeather } from '../hooks/useWeather';
import type { Community, Familiarity, Place } from '../types';
import type { PulseEvent } from '../types/pulse';
import { formatYmd, occurrences, ruleTime } from '../utils/community';
import { HOME, cityFor, milesBetween } from '../utils/geo';
import { directionsLink, formatDate, hostname, isSafeUrl } from '../utils/helpers';
import { applyFamiliarity } from '../utils/novelty';
import { eventPriceRange, formatWhen, inRange, isExpired, nyDate, viewRange, type PulseView } from '../utils/pulse';
import { isIndoorDay } from '../utils/weather';

type View = PulseView | 'anytime';
type Quick = 'date' | 'friends' | 'solo' | 'nearby' | 'new' | 'relaxed' | 'community' | 'cheap' | 'surprise';

const VIEWS: { value: View; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'anytime', label: 'Explore anytime' },
];

export const QUICK: { value: Quick; label: string }[] = [
  { value: 'date', label: 'Something for date day' },
  { value: 'friends', label: 'Fun with friends' },
  { value: 'solo', label: 'A solo adventure' },
  { value: 'nearby', label: 'What’s happening nearby?' },
  { value: 'new', label: 'Something we’ve never tried' },
  { value: 'relaxed', label: 'A relaxed afternoon' },
  { value: 'community', label: 'Discover a local community' },
  { value: 'cheap', label: 'Free or inexpensive' },
  { value: 'surprise', label: 'Surprise me' },
];

/** Category leanings used for company/energy suggestions. These are editorial heuristics, labelled as such. */
const SUITS: Record<'date' | 'friends' | 'solo' | 'relaxed', RegExp> = {
  date: /Art|Music|Workshops|Film|Japanese|Outdoors|Festivals|Photography/,
  friends: /Gaming|Tabletop|Trading|Festivals|Music|Markets|Workshops/,
  solo: /History|Art|Makers|Photography|Film|Comics|Gaming/,
  relaxed: /Art|History|Outdoors|Reset|Tea|Film|Photography/,
};
const WILDCARD = /Workshops|Makers|Japanese|Film|Festivals/;

interface Filters {
  radius: number;
  budget: 'any' | 'free' | 'cheap';
  place: 'any' | 'indoor' | 'outdoor';
  category: string;
  familiarity: Familiarity;
  time: 'any' | 'morning' | 'afternoon' | 'evening';
}

function hourNY(iso: string): number {
  return Number(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })) % 24;
}

function placeMiles(p: Place): number | undefined {
  const c = cityFor(p.city);
  return c ? Math.round(milesBetween(HOME, c) * 10) / 10 : undefined;
}

export default function Pulse({ params }: { params: URLSearchParams }) {
  const store = useStore();
  const { data } = store;
  const pulse = usePulse();
  const { weather } = useWeather();
  const [view, setView] = useState<View>((params.get('view') as View) || 'weekend');
  const [quick, setQuick] = useState<Quick | null>((params.get('quick') as Quick) || null);
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState<Filters>({
    radius: data.settings.radiusMiles,
    budget: 'any',
    place: 'any',
    category: 'all',
    familiarity: 'mix',
    time: 'any',
  });
  const [surpriseSeed, setSurpriseSeed] = useState(0);
  const indoorDay = data.settings.weatherAware && isIndoorDay(weather);

  const applyQuick = (q: Quick) => {
    setQuick(q === quick ? null : q);
    if (q === 'nearby') {
      setView('today');
      setF((x) => ({ ...x, radius: Math.min(x.radius, 6) }));
    } else if (q === 'cheap') setF((x) => ({ ...x, budget: 'cheap' }));
    else if (q === 'new') setF((x) => ({ ...x, familiarity: 'new' }));
    else if (q === 'relaxed') setF((x) => ({ ...x, time: 'afternoon' }));
    else if (q === 'community') setView('anytime');
    else if (q === 'surprise') setSurpriseSeed((s) => s + 1);
  };

  // ── Events in view ────────────────────────────────────────────────
  const [now] = useState(() => Date.now());
  const events = useMemo(() => {
    if (!pulse.data || view === 'anytime') return [];
    const range = viewRange(view, now);
    let list = pulse.data.events.filter((e) => !isExpired(e, now) && inRange(e, range));
    list = list.filter((e) => e.miles === undefined || e.miles <= f.radius);
    if (f.budget === 'free') list = list.filter((e) => e.free);
    if (f.budget === 'cheap') list = list.filter((e) => (eventPriceRange(e)?.[1] ?? Infinity) <= 25);
    if (f.place === 'indoor') list = list.filter((e) => e.indoor !== false);
    if (f.place === 'outdoor') list = list.filter((e) => e.indoor === false);
    if (indoorDay) list = list.filter((e) => e.indoor !== false);
    if (f.category !== 'all') list = list.filter((e) => e.categories.includes(f.category));
    if (f.time !== 'any' && !['upcoming'].includes(view))
      list = list.filter((e) => {
        if (e.ongoing || e.allDay) return true;
        const h = hourNY(e.start);
        return f.time === 'morning' ? h < 12 : f.time === 'afternoon' ? h >= 12 && h < 17 : h >= 17;
      });
    if (quick && quick in SUITS) list = list.filter((e) => SUITS[quick as keyof typeof SUITS].test(e.categories.join(' ')));
    if (quick === 'new') list = list.filter((e) => WILDCARD.test(e.categories.join(' ')) || e.categories.includes('Cultural events'));
    list = applyFamiliarity(list, f.familiarity, data, (e) => `event:${e.id}`);
    return list;
  }, [pulse.data, view, f, quick, indoorDay, data, now]);

  const timed = events.filter((e) => !e.ongoing);
  const ongoing = events.filter((e) => e.ongoing);

  // ── Communities in view ───────────────────────────────────────────
  const communities = useMemo(() => {
    const today = nyDate(now);
    const range: [string, string] = view === 'anytime' ? [today, today] : viewRange(view, now);
    let list = COMMUNITIES.map((c) => ({ c, dates: occurrences(c, range[0], range[1]) }));
    if (view !== 'anytime') list = list.filter((x) => x.dates.length);
    list = list.filter(({ c }) => {
      const city = cityFor(c.city);
      return !city || milesBetween(HOME, city) <= f.radius || view === 'anytime';
    });
    if (quick === 'date') list = list.filter(({ c }) => c.company.includes('partner'));
    if (quick === 'solo') list = list.filter(({ c }) => c.company.includes('solo'));
    if (quick === 'friends') list = list.filter(({ c }) => c.company.includes('friends'));
    return applyFamiliarity(list, f.familiarity, data, ({ c }) => `community:${c.id}`);
  }, [view, f, quick, data, now]);

  // ── Places for "Explore anytime" and as a fallback ────────────────
  const places = useMemo(() => {
    let list = store.places.filter((p) => p.status !== 'placeholder');
    list = list.filter((p) => (placeMiles(p) ?? 0) <= f.radius);
    if (f.budget === 'free') list = list.filter((p) => p.budget === 'free');
    if (f.budget === 'cheap') list = list.filter((p) => p.budget === 'free' || p.budget === 'low');
    if (quick === 'new') list = list.filter((p) => p.categories.includes('Wildcard activities') || p.categories.includes('Workshops and classes'));
    list = applyFamiliarity(list, f.familiarity, data, (p) => `place:${p.id}`, (p) => p.id);
    return list;
  }, [store.places, f, quick, data]);

  const surprise = useMemo(() => {
    if (quick !== 'surprise') return null;
    const pool: ({ kind: 'event'; e: PulseEvent } | { kind: 'place'; p: Place })[] = [
      ...timed.map((e) => ({ kind: 'event' as const, e })),
      ...places.map((p) => ({ kind: 'place' as const, p })),
    ];
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick, surpriseSeed, pulse.data, view]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    pulse.data?.events.forEach((e) => e.categories.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [pulse.data]);

  const okSources = pulse.data?.sources.filter((s) => s.ok).length ?? 0;
  const nothing = view !== 'anytime' && timed.length === 0 && ongoing.length === 0 && communities.length === 0;

  return (
    <div>
      <SectionHeader
        number="03A"
        title="The Local Pulse"
        jp="地元の今"
        blurb="What’s actually happening around St. Pete and Tampa Bay — pulled daily from venues’ own public calendars. Nothing here is made up; when a detail isn’t published, it says so."
      />

      {/* Status */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {pulse.data ? (
          <span className="label">
            Updated {formatDate(pulse.data.generatedAt)}{' '}
            {new Date(pulse.data.generatedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}{' '}
            · {okSources}/{pulse.data.sources.length} sources
          </span>
        ) : (
          <span className="label">{pulse.loading ? 'Loading listings…' : 'No listings loaded'}</span>
        )}
        <button type="button" className="btn-ghost text-xs" onClick={pulse.refresh} disabled={pulse.loading}>
          <RefreshCw size={14} aria-hidden className={pulse.loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <a href="#pulse-sources" className="label underline-offset-4 hover:text-paper hover:underline">
          Sources
        </a>
      </div>
      {(pulse.stale || pulse.fromCache || (pulse.error && !pulse.data)) && (
        <p className="mb-4 flex items-start gap-2 border-l-2 border-rust pl-3 text-sm text-rust" role="status">
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
          {pulse.error && !pulse.data
            ? `${pulse.error} Permanent places and communities are below.`
            : pulse.fromCache
              ? `Showing the copy saved on this device${pulse.error ? ` (${pulse.error})` : ''}. Times may have changed.`
              : 'These listings are more than a day old — the daily refresh may have missed a run. Double-check times on the venue’s site.'}
        </p>
      )}

      <div className="mb-3">
        <WeatherStrip toggle />
      </div>

      {/* One-tap */}
      <section aria-label="Quick picks" className="mb-5">
        <p className="label mb-2">One tap · 一押し</p>
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {QUICK.map((q) => (
            <button key={q.value} type="button" className="chip shrink-0" aria-pressed={quick === q.value} onClick={() => applyQuick(q.value)}>
              {q.label}
            </button>
          ))}
        </div>
      </section>

      {/* Views */}
      <div className="scrollbar-none -mx-4 mb-4 flex overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0" role="tablist" aria-label="When">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={view === v.value}
            onClick={() => setView(v.value)}
            className={`shrink-0 border-b-2 px-3 py-3 font-mono text-[11px] uppercase tracking-wider ${
              view === v.value ? 'border-rust text-paper' : 'border-transparent text-muted hover:text-paper'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <button type="button" className="btn mb-4" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
        <SlidersHorizontal size={14} aria-hidden /> Filters · within {f.radius} mi
      </button>
      {showFilters && (
        <section aria-label="Filters" className="card mb-6 grid grid-cols-1 gap-5 p-4 md:grid-cols-2">
          <ChipGroup
            label="Distance from St. Pete (approx.)"
            options={[5, 10, 20, 40].map((n) => ({ value: String(n), label: `${n} mi` }))}
            value={String(f.radius)}
            onChange={(v) => setF((x) => ({ ...x, radius: Number(v) }))}
          />
          <ChipGroup
            label="Budget"
            options={[
              { value: 'any', label: 'Any' },
              { value: 'free', label: 'Free (listed)' },
              { value: 'cheap', label: 'Up to ~$25' },
            ]}
            value={f.budget}
            onChange={(v) => setF((x) => ({ ...x, budget: v as Filters['budget'] }))}
          />
          <ChipGroup
            label="Time of day"
            options={[
              { value: 'any', label: 'Any' },
              { value: 'morning', label: 'Morning' },
              { value: 'afternoon', label: 'Afternoon' },
              { value: 'evening', label: 'Evening' },
            ]}
            value={f.time}
            onChange={(v) => setF((x) => ({ ...x, time: v as Filters['time'] }))}
          />
          <ChipGroup
            label="Indoor / outdoor"
            options={[
              { value: 'any', label: 'Either' },
              { value: 'indoor', label: 'Indoor' },
              { value: 'outdoor', label: 'Outdoor' },
            ]}
            value={f.place}
            onChange={(v) => setF((x) => ({ ...x, place: v as Filters['place'] }))}
          />
          <ChipGroup
            label="Familiar or new"
            options={[
              { value: 'mix', label: 'A mix' },
              { value: 'new', label: 'Only new to me' },
              { value: 'favorites', label: 'Favorites' },
            ]}
            value={f.familiarity}
            onChange={(v) => setF((x) => ({ ...x, familiarity: v as Familiarity }))}
          />
          <ChipGroup
            label="Interest"
            options={[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))]}
            value={f.category}
            onChange={(v) => setF((x) => ({ ...x, category: v }))}
          />
          <p className="text-xs text-muted md:col-span-2">
            Distances are city-to-city estimates. Budget filters only use prices the listing states — events with unlisted prices are left out of
            “Free” and “Up to ~$25”.
          </p>
        </section>
      )}

      {/* Surprise */}
      {surprise && (
        <div className="mb-6 border border-rust p-4">
          <p className="label mb-1 text-rust">Surprise pick</p>
          {surprise.kind === 'event' ? <EventCard e={surprise.e} /> : <PlaceMini p={surprise.p} />}
          <button type="button" className="btn mt-3" onClick={() => setSurpriseSeed((s) => s + 1)}>
            Another
          </button>
        </div>
      )}

      {/* Results */}
      {view !== 'anytime' && (
        <div className="space-y-8">
          {timed.length > 0 && (
            <section aria-label="Events">
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {timed.slice(0, 60).map((e) => (
                  <li key={e.id} className="card p-4">
                    <EventCard e={e} />
                  </li>
                ))}
              </ul>
              {timed.length > 60 && <p className="label mt-3">Showing the first 60 — narrow the filters to see more.</p>}
            </section>
          )}
          {communities.length > 0 && (
            <section aria-label="Recurring">
              <p className="label mb-2">Recurring in this window</p>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {communities.map(({ c, dates }) => (
                  <li key={c.id} className="card p-4">
                    <CommunityCard c={c} dates={dates} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {ongoing.length > 0 && (
            <section aria-label="Running now">
              <p className="label mb-2">On view · exhibitions & runs</p>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {ongoing.map((e) => (
                  <li key={e.id} className="card p-4">
                    <EventCard e={e} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {nothing && (
            <Empty>
              <p className="display text-3xl text-paper">Nothing listed that fits.</p>
              <p className="mt-2">
                Try a wider distance or another day — or browse <button type="button" className="underline" onClick={() => setView('anytime')}>places you can go anytime</button>.
              </p>
            </Empty>
          )}
        </div>
      )}

      {(view === 'anytime' || nothing) && (
        <div className="mt-6 space-y-8">
          <section aria-label="Communities">
            <p className="label mb-2">Communities · 仲間</p>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {COMMUNITIES.filter((c) => communities.some((x) => x.c.id === c.id) || view === 'anytime').map((c) => (
                <li key={c.id} className="card p-4">
                  <CommunityCard c={c} />
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Places">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="label">Places · go anytime</p>
              <a href={href('local')} className="label hover:text-paper">
                Full directory →
              </a>
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {places.slice(0, 12).map((p) => (
                <li key={p.id} className="card p-4">
                  <PlaceMini p={p} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* Source inventory */}
      <section id="pulse-sources" className="mt-14 border-t border-line pt-6" aria-labelledby="sources-title">
        <h2 id="sources-title" className="display text-3xl">
          Where this comes from
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Each source is a public calendar the venue or organization publishes for subscribing. Listings refresh every morning; if a feed fails,
          yesterday’s still-upcoming events from it are kept and marked.
        </p>
        <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
          {(pulse.data?.sources ?? []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <a href={s.homepage} target="_blank" rel="noreferrer" className="hover:text-rust">
                {s.name}
              </a>
              <span className={`font-mono text-[11px] ${s.ok ? 'text-muted' : 'text-rust'}`}>
                {s.ok ? `${s.count} upcoming` : `unavailable${s.stale ? ` · showing ${s.count} from last good read` : ''}`}
                {s.lastSuccess && ` · last read ${formatDate(s.lastSuccess)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────
export function EventCard({ e }: { e: PulseEvent }) {
  const key = `event:${e.id}`;
  const directions = e.address || e.venue ? { name: e.venue ?? e.title, address: e.address, city: e.city ?? 'St. Petersburg' } : null;
  return (
    <article aria-label={e.title} className={e.cancelled ? 'opacity-60' : ''}>
      <div className="flex items-start justify-between gap-2">
        <p className="label text-rust">{formatWhen(e)}</p>
        <SaveButton
          kind="event"
          refId={e.id}
          title={e.title}
          subtitle={`${formatWhen(e)}${e.venue ? ` · ${e.venue}` : ''}`}
          url={e.url}
          compact
        />
      </div>
      <h3 className={`display mt-1 text-2xl ${e.cancelled ? 'line-through' : ''}`}>{e.title}</h3>
      {e.cancelled && <p className="tag mt-1 border-rust text-rust">Cancelled per source</p>}
      <p className="mt-1 text-sm text-muted">
        {[e.venue, e.city].filter(Boolean).join(' · ') || 'Location not listed'}
        {e.miles !== undefined && (
          <span title={e.geo ? 'Straight line from central St. Pete to the venue' : 'Straight line from central St. Pete to the city center — venue not pinned'}>
            {` · ~${e.miles < 1 ? '<1' : Math.round(e.miles)} mi${e.geo ? '' : ' (city)'}`}
          </span>
        )}
      </p>
      {e.description && <p className="mt-2 line-clamp-3 text-sm text-paper/85">{e.description}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="tag">{e.priceNote ?? 'Price not listed'}</span>
        {e.categories.slice(0, 3).map((c) => (
          <span key={c} className="tag">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {isSafeUrl(e.url) && (
          <a href={e.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
            <ArrowUpRight size={14} aria-hidden /> Event page
          </a>
        )}
        {directions && (
          <a href={directionsLink(directions)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
            <Navigation size={13} aria-hidden /> Directions
          </a>
        )}
        {!e.cancelled && (
          <a href={href('plan', { anchor: key })} className="flex items-center gap-1.5 hover:text-rust">
            <CalendarPlus size={14} aria-hidden /> Plan around this
          </a>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <FeedbackBar itemKey={key} label={e.title} />
        <span className="font-mono text-[10px] text-muted">
          via {e.sourceIds.join(', ')} · checked {formatDate(e.verifiedAt)}
        </span>
      </div>
    </article>
  );
}

export function CommunityCard({ c, dates }: { c: Community; dates?: string[] }) {
  const key = `community:${c.id}`;
  const next = dates?.[0];
  return (
    <article aria-label={c.name}>
      <div className="flex items-start justify-between gap-2">
        <p className="label">
          {c.kind} · {c.city}
        </p>
        <SaveButton kind="community" refId={c.id} title={c.name} subtitle={c.schedule} url={c.website} compact />
      </div>
      <h3 className="display mt-1 text-2xl">{c.name}</h3>
      <p className="mt-1 text-sm text-rust">
        {next ? `${formatYmd(next)}${ruleTime(c, next) ? ` · ${ruleTime(c, next)}` : ''}` : c.schedule}
      </p>
      <p className="mt-2 line-clamp-3 text-sm text-paper/85">{c.description}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {c.costNote && <span className="tag">{c.costNote}</span>}
        {c.status === 'check' && <span className="tag text-rust">Confirm details first</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <a href={c.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
          <ArrowUpRight size={14} aria-hidden /> {hostname(c.website)}
        </a>
        {c.placeId && (
          <a href={href('local', { place: c.placeId })} className="flex items-center gap-1.5 hover:text-rust">
            <MapPin size={14} aria-hidden /> Venue
          </a>
        )}
        <a href={href('plan', { anchor: key })} className="flex items-center gap-1.5 hover:text-rust">
          <CalendarPlus size={14} aria-hidden /> Plan around this
        </a>
      </div>
      <div className="mt-3">
        <FeedbackBar itemKey={key} label={c.name} />
      </div>
    </article>
  );
}

export function PlaceMini({ p }: { p: Place }) {
  const key = `place:${p.id}`;
  return (
    <article aria-label={p.name}>
      <p className="label">{p.categories[0]}</p>
      <h3 className="display mt-1 text-2xl">
        <a href={href('local', { place: p.id })} className="hover:text-rust">
          {p.name}
        </a>
      </h3>
      <p className="mt-1 text-sm text-muted">
        {p.neighborhood} · {p.city}
        {p.costNote && ` · ${p.costNote}`}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-paper/85">{p.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <a href={directionsLink(p)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
          <Navigation size={13} aria-hidden /> Directions
        </a>
        <a href={href('plan', { anchor: key })} className="flex items-center gap-1.5 hover:text-rust">
          <CalendarPlus size={14} aria-hidden /> Plan around this
        </a>
      </div>
      <div className="mt-3">
        <FeedbackBar itemKey={key} label={p.name} />
      </div>
    </article>
  );
}
