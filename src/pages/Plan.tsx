import { useState } from 'react';
import { ArrowUpRight, Bookmark, Coffee, Dices, MapPin, Navigation, Shuffle } from 'lucide-react';
import { ChipGroup, Empty, SectionHeader } from '../components/ui';
import { WeatherStrip } from '../components/WeatherStrip';
import { href } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';
import { useWeather } from '../hooks/useWeather';
import type { Experience } from '../types';
import { formatCost } from '../utils/discovery';
import { directionsLink, uid } from '../utils/helpers';
import { BUDGET_OPTIONS, COMPANY_OPTIONS, MOOD_OPTIONS } from '../utils/labels';
import {
  DEFAULT_PLAN_OPTIONS,
  buildPlan,
  formatClock,
  planSummary,
  type Area,
  type DayLength,
  type DayPlan,
  type DayStart,
  type PlanOptions,
} from '../utils/plan';
import { isIndoorDay } from '../utils/weather';

const START_OPTIONS: { value: DayStart; label: string; jp: string }[] = [
  { value: 'morning', label: 'Morning', jp: '朝' },
  { value: 'afternoon', label: 'Afternoon', jp: '昼' },
  { value: 'evening', label: 'Evening', jp: '夜' },
];
const LENGTH_OPTIONS: { value: DayLength; label: string }[] = [
  { value: 'short', label: 'A few hours' },
  { value: 'half', label: 'Half day' },
  { value: 'full', label: 'Full day' },
];
const AREA_OPTIONS: { value: Area; label: string }[] = [
  { value: 'anywhere', label: 'Anywhere' },
  { value: 'stpete', label: 'St. Pete & Pinellas' },
  { value: 'tampa', label: 'Tampa' },
];

export default function Plan() {
  const { experiences, places, data, toggleSave } = useStore();
  const { weather } = useWeather();
  const [opts, setOpts] = useState<Omit<PlanOptions, 'indoorDay'>>(DEFAULT_PLAN_OPTIONS);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const indoorDay = data.settings.weatherAware && isIndoorDay(weather);
  const full: PlanOptions = { ...opts, indoorDay };

  const make = (keep: (Experience | null)[] = []) => {
    const p = buildPlan(experiences, places, full, Math.random, keep);
    setPlan(p);
    setFailed(!p);
    setSavedId(null);
  };

  const rerollStop = (index: number) => {
    if (!plan) return;
    const exps = plan.stops.filter((s) => s.kind === 'experience').map((s) => s.experience!);
    make(exps.map((e, i) => (i === index ? null : e)));
  };

  const save = () => {
    if (!plan) return;
    const names = plan.stops.filter((s) => s.kind === 'experience').map((s) => s.experience!.name);
    const id = uid('plan');
    toggleSave({ kind: 'plan', refId: id, title: names.join(' + '), subtitle: planSummary(plan) });
    setSavedId(id);
  };

  const set = <K extends keyof typeof opts>(k: K, v: (typeof opts)[K]) => setOpts((o) => ({ ...o, [k]: v }));
  let stopIndex = -1;

  return (
    <div>
      <SectionHeader
        number="01B"
        title="Plan a Day"
        jp="一日の計画"
        blurb="A loose shape for an outing — two or three things, a break in between, and home when it’s still good. Re-roll any stop you don’t like."
      />

      <div className="mb-3">
        <WeatherStrip toggle />
      </div>

      <section aria-label="Plan options" className="card grid grid-cols-1 gap-5 p-4 sm:p-6 md:grid-cols-2">
        <ChipGroup label="Start" number="01" options={START_OPTIONS} value={opts.start} onChange={(v) => set('start', v)} />
        <ChipGroup label="How long" number="02" options={LENGTH_OPTIONS} value={opts.length} onChange={(v) => set('length', v)} />
        <ChipGroup label="Area" number="03" options={AREA_OPTIONS} value={opts.area} onChange={(v) => set('area', v)} />
        <ChipGroup label="Mood" number="04" options={MOOD_OPTIONS} value={opts.mood} onChange={(v) => set('mood', v)} />
        <ChipGroup label="Company" number="05" options={COMPANY_OPTIONS} value={opts.company} onChange={(v) => set('company', v)} />
        <ChipGroup label="Budget per stop" number="06" options={BUDGET_OPTIONS} value={opts.budget} onChange={(v) => set('budget', v)} />
        <div className="border-t border-line pt-5 md:col-span-2">
          <button type="button" className="btn-primary w-full sm:w-auto sm:min-w-[240px]" onClick={() => make()}>
            <Dices size={18} aria-hidden /> {plan ? 'Plan another day' : 'Plan my day'}
          </button>
        </div>
      </section>

      <div className="pt-8">
        {failed && (
          <Empty>
            <p className="display text-3xl text-paper">Not enough fits that shape.</p>
            <p className="mt-2">Try “Anywhere”, a different mood, or a bigger budget.</p>
          </Empty>
        )}
        {!plan && !failed && (
          <Empty>
            <p className="display text-3xl text-paper">Where should the day go?</p>
            <p className="mt-2">Set a couple of dials — or none — and press the button.</p>
          </Empty>
        )}

        {plan && (
          <article className="card animate-rise" aria-label="Your day">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-hunter/40 px-4 py-2">
              <span className="label text-paper/80">
                Itinerary · {formatClock(plan.stops[0].startsAt)} – {formatClock(plan.endsAt)}
              </span>
              <span className="label text-paper/80">Est. {formatCost(plan.cost)} + food</span>
            </header>
            <ol>
              {plan.stops.map((s, i) => {
                if (s.kind === 'break') {
                  return (
                    <li key={`b${i}`} className="stripe flex items-center gap-4 border-b border-line px-4 py-3 text-sm text-muted">
                      <span className="w-16 shrink-0 font-mono text-xs">{formatClock(s.startsAt)}</span>
                      <Coffee size={14} aria-hidden /> {s.label}
                    </li>
                  );
                }
                stopIndex += 1;
                const idx = stopIndex;
                const e = s.experience!;
                return (
                  <li key={e.id} className="grid grid-cols-[4rem_1fr] gap-x-4 border-b border-line px-4 py-5 last:border-b-0">
                    <div>
                      <span className="block font-mono text-xs text-rust">{formatClock(s.startsAt)}</span>
                      <span className="mt-1 block font-mono text-[10px] text-muted">{s.minutes} min</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <a href={href('discover', { exp: e.id })} className="display text-3xl hover:text-rust">
                          {e.name}
                        </a>
                        <button type="button" className="btn-ghost -mr-2 -mt-1" aria-label={`Swap out ${e.name}`} onClick={() => rerollStop(idx)}>
                          <Shuffle size={16} aria-hidden />
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-paper/85">{e.description}</p>
                      {s.place ? (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <a href={href('local', { place: s.place.id })} className="flex items-center gap-1.5 hover:text-rust">
                            <MapPin size={14} className="text-rust" aria-hidden /> {s.place.name}
                            <span className="text-muted">· {s.place.neighborhood}</span>
                          </a>
                          <a href={directionsLink(s.place)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted hover:text-paper">
                            <Navigation size={13} aria-hidden /> Directions
                          </a>
                          {s.place.status === 'check' && <span className="tag text-rust">Confirm first</span>}
                        </div>
                      ) : (
                        e.links?.[0] && (
                          <a href={e.links[0].url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-sm hover:text-rust">
                            <ArrowUpRight size={14} aria-hidden /> {e.links[0].label}
                          </a>
                        )
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="tag">{formatCost(e.cost)}</span>
                        <span className="tag">{e.energy} energy</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <footer className="flex flex-wrap gap-2 border-t border-line p-4">
              <button
                type="button"
                className="btn"
                disabled={Boolean(savedId)}
                onClick={save}
              >
                <Bookmark size={16} aria-hidden /> {savedId ? 'Saved' : 'Save this day'}
              </button>
              <button type="button" className="btn" onClick={() => make()}>
                <Dices size={16} aria-hidden /> Start over
              </button>
            </footer>
          </article>
        )}
        {plan && indoorDay && (
          <p className="mt-3 text-xs text-muted">Weather-aware: outdoor-only stops were skipped because of today’s forecast.</p>
        )}
      </div>
    </div>
  );
}
