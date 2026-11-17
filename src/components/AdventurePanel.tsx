import { useMemo, useState } from 'react';
import { ArrowUpRight, Bookmark, Clock, Dices, Navigation, Shuffle, Utensils } from 'lucide-react';
import { COMMUNITIES } from '../data/communities';
import { href } from '../hooks/useRoute';
import { usePulse } from '../hooks/usePulse';
import { useStore } from '../hooks/useStore';
import { useWeather } from '../hooks/useWeather';
import type { Company, Energy, Familiarity, Transport } from '../types';
import {
  buildAdventure,
  type Adventure,
  type AdventureOptions,
  type Atmosphere,
  type BudgetPP,
  type Slot,
  type Stop,
  type WeatherPref,
} from '../utils/adventure';
import { directionsLink, isSafeUrl, uid } from '../utils/helpers';
import { nyDate } from '../utils/pulse';
import { isIndoorDay } from '../utils/weather';
import { FeedbackBar } from './FeedbackBar';
import { ChipGroup, Empty } from './ui';

function nextDates(now: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const today = nyDate(now);
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const ymd = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
    out.push({ value: ymd, label });
  }
  return out;
}

const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`);

function defaultSlot(now: number): Slot {
  const h = Number(new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })) % 24;
  return h < 11 ? 'morning' : h < 16 ? 'afternoon' : 'evening';
}

function StopCard({ s, label, onSwap }: { s: Stop; label: string; onSwap?: () => void }) {
  return (
    <div className="border-b border-line px-4 py-5 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <p className="label text-rust">
          {label}
          {s.time && ` · ${s.time}`}
        </p>
        {onSwap && (
          <button type="button" className="btn-ghost -mr-2 -mt-2" aria-label={`Swap out ${s.title}`} onClick={onSwap}>
            <Shuffle size={16} aria-hidden />
          </button>
        )}
      </div>
      <h3 className="display mt-1 text-3xl">{s.title}</h3>
      <p className="mt-1 text-sm text-muted">{s.subtitle}</p>
      {s.place && <p className="mt-2 line-clamp-2 text-sm text-paper/85">{s.place.description}</p>}
      {s.event?.description && <p className="mt-2 line-clamp-2 text-sm text-paper/85">{s.event.description}</p>}
      {s.community && <p className="mt-2 line-clamp-2 text-sm text-paper/85">{s.community.description}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="tag">{s.cost ? (s.cost[1] === 0 ? 'Free' : `$${s.cost[0]}–$${s.cost[1]}`) : 'Cost not listed'}</span>
        <span className="tag">~{s.minutes} min</span>
        <span className="tag">
          <Clock size={10} aria-hidden className="mr-1" /> {s.hoursNote}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <a href={directionsLink(s.directions)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
          <Navigation size={13} aria-hidden /> Directions
        </a>
        {isSafeUrl(s.url) && (
          <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-rust">
            <ArrowUpRight size={14} aria-hidden /> {s.kind === 'event' ? 'Event page' : 'Website'}
          </a>
        )}
      </div>
      <div className="mt-3">
        <FeedbackBar itemKey={s.key} label={s.title} />
      </div>
    </div>
  );
}

/** "Plan around" an anchor, or generate a mini-adventure from scratch. */
export function AdventurePanel({ anchor }: { anchor?: string | null }) {
  const { places, data, toggleSave } = useStore();
  const pulse = usePulse();
  const { weather } = useWeather();
  const [now] = useState(() => Date.now());
  const dates = useMemo(() => nextDates(now), [now]);

  const [date, setDate] = useState(dates[0].value);
  const [slot, setSlot] = useState<Slot>(defaultSlot(now));
  const [hours, setHours] = useState<2 | 4 | 6>(4);
  const [company, setCompany] = useState<Company>('partner');
  const [budget, setBudget] = useState<BudgetPP>('any');
  const [energy, setEnergy] = useState<Energy | 'any'>('any');
  const [radius, setRadius] = useState(data.settings.radiusMiles);
  const [transport, setTransport] = useState<Transport>(data.settings.transport);
  const [atmosphere, setAtmosphere] = useState<Atmosphere>('any');
  const [weatherPref, setWeatherPref] = useState<WeatherPref>('auto');
  const [familiarity, setFamiliarity] = useState<Familiarity>('mix');
  const [result, setResult] = useState<Adventure | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentAnchor, setCurrentAnchor] = useState<string | undefined>(anchor ?? undefined);

  const options = (): AdventureOptions => ({
    date,
    slot,
    hours,
    company,
    budget,
    energy,
    radius,
    transport,
    atmosphere,
    weather: weatherPref,
    familiarity,
    indoorDay: data.settings.weatherAware && isIndoorDay(weather),
    anchor: currentAnchor,
  });

  const generate = (keepPrimary = false) => {
    const o = options();
    if (keepPrimary && result) o.anchor = result.primary.key;
    const a = buildAdventure({ places, events: pulse.data?.events ?? [], communities: COMMUNITIES, data }, o);
    setResult(a);
    setFailed(!a);
    setSaved(false);
  };

  const save = () => {
    if (!result) return;
    const names = [result.primary.title, result.secondary?.title].filter(Boolean).join(' + ');
    toggleSave({
      kind: 'plan',
      refId: uid('adv'),
      title: names,
      subtitle: `${dates.find((d) => d.value === date)?.label ?? date} ${slot} · ${result.travel}${result.food ? ` · ${result.food.label.toLowerCase()}` : ''}`,
    });
    setSaved(true);
  };

  const anchorTitle = anchor && !result ? anchor.split(':')[0] : null;

  return (
    <div>
      {currentAnchor && (
        <p className="mb-3 flex flex-wrap items-center gap-2 border-l-2 border-rust pl-3 text-sm">
          Planning around a {anchorTitle ?? currentAnchor.split(':')[0]} you picked.
          <button type="button" className="underline" onClick={() => setCurrentAnchor(undefined)}>
            Clear
          </button>
        </p>
      )}
      <section aria-label="Adventure options" className="card grid grid-cols-1 gap-5 p-4 sm:p-6 md:grid-cols-2">
        <ChipGroup label="When" number="01" options={dates} value={date} onChange={setDate} />
        <ChipGroup
          label="Part of the day"
          number="02"
          options={[
            { value: 'morning', label: 'Morning' },
            { value: 'afternoon', label: 'Afternoon' },
            { value: 'evening', label: 'Evening' },
          ]}
          value={slot}
          onChange={(v) => setSlot(v as Slot)}
        />
        <ChipGroup
          label="With"
          number="03"
          options={[
            { value: 'solo', label: 'Solo' },
            { value: 'partner', label: 'Partner' },
            { value: 'friends', label: 'Friends' },
          ]}
          value={company}
          onChange={(v) => setCompany(v as Company)}
        />
        <ChipGroup
          label="Time available"
          number="04"
          options={[
            { value: '2', label: '~2 hours' },
            { value: '4', label: '~4 hours' },
            { value: '6', label: '~6 hours' },
          ]}
          value={String(hours)}
          onChange={(v) => setHours(Number(v) as 2 | 4 | 6)}
        />
        <ChipGroup
          label="Budget per person"
          number="05"
          options={[
            { value: 'any', label: 'Any' },
            { value: 'free', label: 'Free' },
            { value: 'u25', label: 'Under $25' },
            { value: 'u50', label: 'Under $50' },
            { value: 'u100', label: 'Under $100' },
          ]}
          value={budget}
          onChange={(v) => setBudget(v as BudgetPP)}
        />
        <ChipGroup
          label="Atmosphere"
          number="06"
          options={[
            { value: 'any', label: 'Surprise me' },
            { value: 'chill', label: 'Chill' },
            { value: 'creative', label: 'Creative' },
            { value: 'playful', label: 'Playful' },
            { value: 'cultured', label: 'Cultured' },
            { value: 'outdoorsy', label: 'Outdoorsy' },
          ]}
          value={atmosphere}
          onChange={(v) => setAtmosphere(v as Atmosphere)}
        />
        <ChipGroup
          label="Energy"
          number="07"
          options={[
            { value: 'any', label: 'Any' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
          value={energy}
          onChange={(v) => setEnergy(v as Energy | 'any')}
        />
        <ChipGroup
          label="Getting around"
          number="08"
          options={[
            { value: 'car', label: 'Car' },
            { value: 'bike', label: 'Bike' },
            { value: 'transit', label: 'Transit' },
            { value: 'walk', label: 'On foot' },
          ]}
          value={transport}
          onChange={(v) => setTransport(v as Transport)}
        />
        <ChipGroup
          label="Travel radius"
          number="09"
          options={[5, 10, 20, 40].map((n) => ({ value: String(n), label: `${n} mi` }))}
          value={String(radius)}
          onChange={(v) => setRadius(Number(v))}
        />
        <ChipGroup
          label="Weather"
          number="10"
          options={[
            { value: 'auto', label: 'Use forecast' },
            { value: 'indoor', label: 'Indoors' },
            { value: 'outdoor', label: 'Outdoors' },
            { value: 'any', label: 'Either' },
          ]}
          value={weatherPref}
          onChange={(v) => setWeatherPref(v as WeatherPref)}
        />
        <ChipGroup
          label="Familiar or new"
          number="11"
          options={[
            { value: 'mix', label: 'A mix' },
            { value: 'new', label: 'Somewhere new' },
            { value: 'favorites', label: 'Old favorites' },
          ]}
          value={familiarity}
          onChange={(v) => setFamiliarity(v as Familiarity)}
        />
        <div className="border-t border-line pt-5 md:col-span-2">
          <button type="button" className="btn-primary w-full sm:w-auto sm:min-w-[240px]" onClick={() => generate()}>
            <Dices size={18} aria-hidden /> {result ? 'Another adventure' : 'Find us an adventure'}
          </button>
        </div>
      </section>

      <div className="pt-8">
        {failed && (
          <Empty>
            <p className="display text-3xl text-paper">Nothing fits all of that.</p>
            <p className="mt-2">Try a bigger radius, “Either” for weather, another time of day, or “A mix”.</p>
          </Empty>
        )}
        {result && (
          <article className="card animate-rise" aria-label="Your adventure">
            <header className="border-b border-line bg-hunter/40 px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="label text-paper/80">{result.travel}</span>
                <span className="label text-paper/80">
                  Est. ${result.cost.min}
                  {result.cost.max !== result.cost.min && `–$${result.cost.max}`} pp{result.cost.unknown && ' + unlisted costs'}
                  {result.food && ' · food not included'}
                </span>
              </div>
              <p className="label mt-1 text-paper/60">
                About {fmtMinutes(result.time.total)} of your ~{result.time.budget / 60} hr
                {result.time.travel > 0 && ` · incl. ~${result.time.travel} min between stops (rough)`}
                {result.time.wait > 0 && ` · ${result.time.wait} min wait for the start time`}
              </p>
            </header>
            {result.notes.length > 0 && (
              <ul className="border-b border-line px-4 py-3 text-sm text-muted">
                {result.notes.map((n) => (
                  <li key={n} className="border-l-2 border-rust pl-2 [&:not(:first-child)]:mt-1">
                    {n}
                  </li>
                ))}
              </ul>
            )}
            <StopCard s={result.primary} label="First" onSwap={() => generate()} />
            {result.food && (
              <div className="stripe flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-muted">
                  <Utensils size={14} aria-hidden /> {result.food.label}
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`food near ${result.food.near.directions.address ?? `${result.food.near.directions.name}, ${result.food.near.directions.city}`}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11px] uppercase tracking-wider text-muted hover:text-paper"
                >
                  See what’s close →
                </a>
              </div>
            )}
            {result.secondary ? (
              <StopCard s={result.secondary} label="Then, if you’re feeling it" onSwap={() => generate(true)} />
            ) : (
              <p className="px-4 py-4 text-sm text-muted">No second stop fits nearby in that time — and that’s fine. Leave room to wander.</p>
            )}
            <footer className="flex flex-wrap gap-2 border-t border-line p-4">
              <button type="button" className="btn" disabled={saved} onClick={save}>
                <Bookmark size={16} aria-hidden /> {saved ? 'Saved' : 'Save this adventure'}
              </button>
              <a href={href('pulse')} className="btn">
                What else is on
              </a>
            </footer>
          </article>
        )}
        {result && (
          <p className="mt-3 text-xs text-muted">
            Stops are real places and listings; hours for permanent places aren’t verified here, so check before heading out. Distances are straight lines, not routes, and travel times are rough estimates.
            {pulse.stale && ' Event listings are more than a day old.'}
          </p>
        )}
        {!pulse.data && (
          <p className="mt-3 text-xs text-muted">
            Event listings aren’t loaded right now — adventures use permanent places and recurring communities.
          </p>
        )}
      </div>
    </div>
  );
}
