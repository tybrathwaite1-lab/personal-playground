import { useMemo, useState } from 'react';
import { ArrowRight, Dices } from 'lucide-react';
import { AtmospherePicker } from '../components/AtmospherePicker';
import { DropTeaser } from '../components/DropTeaser';
import { EditorialImage } from '../components/EditorialImage';
import { Grain, PaperEdge, Stamp, Surface, Tape } from '../components/graphic';
import { SaveButton } from '../components/ui';
import { VibePicker } from '../components/VibePicker';
import { WeatherStrip } from '../components/WeatherStrip';
import { COMMUNITIES } from '../data/communities';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { useDrop } from '../hooks/useDrop';
import { href, navigate } from '../hooks/useRoute';
import { usePulse } from '../hooks/usePulse';
import { useStore } from '../hooks/useStore';
import { useWeather } from '../hooks/useWeather';
import { ATMOSPHERE_SURFACES } from '../utils/atmosphere';
import { formatYmd, nextOccurrence, ruleTime } from '../utils/community';
import { formatCost, formatDuration } from '../utils/discovery';
import { dailySeed, formatDate, seededShuffle } from '../utils/helpers';
import { formatWhen, inRange, isExpired, nyDate, viewRange } from '../utils/pulse';
import { isIndoorDay, isOutdoorOnly } from '../utils/weather';

const KIND_LABEL: Record<string, string> = {
  experience: 'Experience',
  place: 'Place',
  website: 'Website',
  interest: 'Interest',
  discovery: 'Discovery',
  plan: 'Plan',
  event: 'Event',
  community: 'Community',
  drop: 'Weekly Drop',
};

/** Go Wander: the exploration paths, each an existing section. */
const PATHS = [
  { title: 'Do something', jp: 'やってみる', blurb: 'Hobbies, projects and outings, filtered to your mood and budget.', to: href('discover') },
  { title: 'Plan an outing', jp: '計画', blurb: 'A half day or a full one, stitched together with real timings.', to: href('plan') },
  { title: 'Wander online', jp: '電子', blurb: 'Strange, lovely corners of the internet worth an evening.', to: href('digital') },
  { title: 'Somewhere nearby', jp: '地元', blurb: 'Places around St. Pete you haven’t been yet.', to: href('local') },
];

/**
 * The Editorial Cover (Creative Slice 01). Five connected areas: the Cover, The Window (Local
 * Pulse), The Issue (Weekly Drop), Your Space (saved things and notes) and Go Wander. Everything
 * shown is real app content; the atmosphere only changes which tested surfaces paint the cover
 * and the Window's band.
 */
export default function Home() {
  const { experiences, data, places } = useStore();
  const pulse = usePulse();
  const { latest } = useDrop();
  const { weather } = useWeather();
  const { atmosphere } = useAtmosphere();
  const tones = ATMOSPHERE_SURFACES[atmosphere];
  const [now] = useState(() => Date.now());
  const today = new Date(now);
  const seed = dailySeed();
  const indoor = data.settings.weatherAware && isIndoorDay(weather);

  const featured = useMemo(() => {
    const pool = indoor ? experiences.filter((e) => !isOutdoorOnly(e)) : experiences;
    return seededShuffle(pool, seed)[0];
  }, [experiences, seed, indoor]);

  // Today's local possibilities: real listings first, then recurring communities, then places.
  const local = useMemo(() => {
    const events = pulse.data?.events.filter((e) => !isExpired(e, now) && !e.cancelled && (e.miles ?? 0) <= data.settings.radiusMiles) ?? [];
    const todayList = events.filter((e) => inRange(e, viewRange('today', now)) && !e.ongoing && (!indoor || e.indoor !== false));
    const weekend = events.filter((e) => inRange(e, viewRange('weekend', now)) && !e.ongoing);
    const list = (todayList.length >= 2 ? todayList : [...todayList, ...weekend.filter((e) => !todayList.includes(e))]).slice(0, 3);
    const nyToday = nyDate(now);
    const community = COMMUNITIES.map((c) => ({ c, next: nextOccurrence(c, nyToday, 21) }))
      .filter((x) => x.next)
      .sort((a, b) => a.next!.localeCompare(b.next!))[0];
    const place = seededShuffle(
      places.filter((p) => p.status !== 'placeholder' && !data.feedback[`place:${p.id}`]?.been && !data.feedback[`place:${p.id}`]?.notInterested),
      seed,
    )[0];
    return { list, community, place, label: todayList.length >= 2 ? 'Today' : 'Today & this weekend' };
  }, [pulse.data, now, data, places, seed, indoor]);

  const recent = data.saved.slice(0, 4);
  const lead = local.list[0];
  const dropLead = latest ? (latest.items.find((i) => i.id === latest.featured) ?? latest.items[0]) : null;

  return (
    <div className="space-y-14 md:space-y-20">
      {/* ── Cover ─────────────────────────────────────────────────── */}
      <Surface
        as="section"
        tone={tones.cover}
        aria-labelledby="cover-title"
        data-home-area="cover"
        className="atmos-surface cover-container -mx-4 -mt-6 px-4 pb-10 pt-4 md:-mx-6 md:-mt-10 md:px-8 md:pb-14 md:pt-6"
      >
        <Grain />
        <span aria-hidden className="atmos-glow pointer-events-none absolute inset-0 z-0" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
            <span className="ui-label">Vol. 02 · Issue {seed % 1000}</span>
            <span className="ui-label">{today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>

          {/* The nameplate: stacked on phones, one line on wider screens (sized to its column). */}
          <h1 id="cover-title" className="display cover-headline nameplate mt-4 text-fg md:mt-5">
            Personal <br className="md:hidden" />
            Playground<span className="text-accent">.</span>
          </h1>

          <div className="mt-6 grid grid-cols-1 gap-8 md:mt-8 md:grid-cols-[1.1fr_1fr] md:gap-10 lg:grid-cols-[1.25fr_1fr]">
            <div className="min-w-0">
              <p className="font-display text-heading uppercase leading-tight text-fg md:text-[clamp(2rem,1.4rem+1.6vw,3rem)]">What sounds good today?</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={href('pulse')} className="ui-button-primary">
                  What’s on nearby <ArrowRight size={16} aria-hidden />
                </a>
                <button type="button" className="ui-button" onClick={() => navigate('discover', { surprise: String(Date.now()) })}>
                  <Dices size={16} aria-hidden /> Surprise me
                </button>
              </div>

              {/* Cover lines: real teasers, each a way in. */}
              <ul aria-label="On the cover" className="mt-8 divide-y divide-rule border-y border-rule">
                {lead && (
                  <li>
                    <a href={href('pulse', { view: 'upcoming' })} className="cover-line group">
                      <span className="ui-label text-accent">{local.label} near you</span>
                      <span className="cover-line-title">{lead.title}</span>
                      <span className="text-small text-fg-muted">{[formatWhen(lead), lead.venue].filter(Boolean).join(' · ')}</span>
                    </a>
                  </li>
                )}
                {latest && dropLead && (
                  <li>
                    <a href={href('drop')} className="cover-line group">
                      <span className="ui-label text-accent">The Weekly Drop · No.{String(latest.issue).padStart(2, '0')}</span>
                      <span className="cover-line-title">{dropLead.title}</span>
                      <span className="text-small text-fg-muted">{latest.title}</span>
                    </a>
                  </li>
                )}
                <li>
                  <a href={href('collection')} className="cover-line group">
                    <span className="ui-label text-accent">Your space</span>
                    <span className="cover-line-title">{data.saved.length ? `${data.saved.length} saved, waiting for you` : 'Start your collection'}</span>
                    <span className="text-small text-fg-muted">
                      {data.fieldNotes.length ? `${data.fieldNotes.length} field note${data.fieldNotes.length === 1 ? '' : 's'}` : 'Save anything that catches your eye'}
                    </span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Cover star: today's featured experience, saveable from the cover. */}
            {featured && (
              <article aria-labelledby="featured-title" className="relative min-w-0 md:pt-2" data-home-area="cover-star">
                <div className="relative">
                  <Tape tone="mustard" angle={-5} className="-top-3 left-6" />
                  <EditorialImage subject={featured.id} fallbackTags={featured.interests} ratio="4/5" caption={false} priority className="cover-star-image" />
                </div>
                <div className="mt-6">
                  {/* On the cover surface, not over the photo, so its contrast is always the tested pair. */}
                  <Stamp angle={-4} className="mb-3">
                    Today’s pick
                  </Stamp>
                  <h2 id="featured-title" className="font-display text-heading uppercase leading-tight">
                    <a href={href('discover', { exp: featured.id })} className="text-fg decoration-accent decoration-2 underline-offset-4 hover:underline">
                      {featured.name}
                    </a>
                  </h2>
                  <p className="mt-2 text-body-editorial text-fg">{featured.description}</p>
                  <p className="mt-2 text-small text-fg-muted">
                    {formatCost(featured.cost)} · {formatDuration(featured.duration)} · {featured.energy} energy
                  </p>
                  <div className="mt-3">
                    <SaveButton kind="experience" refId={featured.id} title={featured.name} subtitle={featured.description} onSurface />
                  </div>
                </div>
              </article>
            )}
          </div>

          <AtmospherePicker className="mt-10 border-t border-rule pt-4" />
        </div>
        <PaperEdge side="bottom" seed={11} />
      </Surface>

      {/* ── The Window: the Local Pulse ───────────────────────────── */}
      <section aria-labelledby="local-title" data-home-area="window">
        <Surface tone={tones.band} className="atmos-surface mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <p className="ui-label">The Local Pulse · {local.label}</p>
            <h2 id="local-title" className="font-display text-heading uppercase leading-none text-fg">
              Around St. Pete
            </h2>
          </div>
          <a href={href('pulse')} className="ui-link font-mono text-[0.75rem] uppercase tracking-wider">
            All listings
          </a>
        </Surface>
        <div className="mb-4">
          <WeatherStrip />
        </div>
        <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-[1.4fr_1fr]">
          {lead && (
            <li className="border-t-2 border-rust py-4 md:row-span-4">
              <p className="label text-rust">{formatWhen(lead)}</p>
              <a href={href('pulse', { view: 'upcoming' })} className="display mt-2 block text-[clamp(2rem,1.5rem+2vw,3.25rem)] hover:text-rust">
                {lead.title}
              </a>
              <p className="mt-2 text-sm text-muted">{[lead.venue, lead.city].filter(Boolean).join(' · ')}</p>
              <div className="mt-3">
                <SaveButton kind="event" refId={lead.id} title={lead.title} subtitle={`${formatWhen(lead)}${lead.venue ? ` · ${lead.venue}` : ''}`} url={lead.url} />
              </div>
            </li>
          )}
          {local.list.slice(1).map((e) => (
            <li key={e.id} className="border-t border-line py-3">
              <p className="label text-rust">{formatWhen(e)}</p>
              <a href={href('pulse', { view: 'upcoming' })} className="display mt-1 block text-xl hover:text-rust">
                {e.title}
              </a>
              <p className="mt-1 text-xs text-muted">{[e.venue, e.city].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
          {local.community && (
            <li className="border-t border-line py-3">
              <p className="label text-rust">
                {formatYmd(local.community.next!)}
                {ruleTime(local.community.c, local.community.next!) && ` · ${ruleTime(local.community.c, local.community.next!)}`}
              </p>
              <a href={href('pulse', { view: 'anytime' })} className="display mt-1 block text-xl hover:text-rust">
                {local.community.c.name}
              </a>
              <p className="mt-1 text-xs text-muted">Recurring · {local.community.c.city}</p>
            </li>
          )}
          {local.place && (
            <li className="border-t border-line py-3">
              <p className="label">Somewhere new to you</p>
              <a href={href('local', { place: local.place.id })} className="display mt-1 block text-xl hover:text-rust">
                {local.place.name}
              </a>
              <p className="mt-1 text-xs text-muted">
                {local.place.neighborhood} · {local.place.categories[0]}
              </p>
            </li>
          )}
          {!pulse.data && !local.community && !local.place && <li className="py-4 text-sm text-muted">Listings are loading…</li>}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={href('plan')} className="btn">
            Plan a mini-adventure
          </a>
          <a href={href('pulse', { quick: 'date' })} className="btn">
            Date day
          </a>
          <a href={href('pulse', { quick: 'friends' })} className="btn">
            With friends
          </a>
        </div>
      </section>

      {/* ── The Issue: the Weekly Drop ────────────────────────────── */}
      <div data-home-area="issue">
        <DropTeaser />
      </div>

      {/* ── Your Space ───────────────────────────────────────────── */}
      <section aria-labelledby="recent-title" data-home-area="your-space" className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_2fr] md:gap-10">
        <div>
          <p className="label">Your space · 収集</p>
          <h2 id="recent-title" className="display mt-1 text-4xl md:text-5xl">
            Recently saved
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            <li>
              <a href={href('collection')} className="btn">
                Collection
              </a>
            </li>
            <li>
              <a href={href('notes')} className="btn">
                Field Notes{data.fieldNotes.length ? ` (${data.fieldNotes.length})` : ''}
              </a>
            </li>
            <li>
              <a href={href('rediscover')} className="btn">
                Rediscover
              </a>
            </li>
          </ul>
        </div>
        {recent.length === 0 ? (
          <p className="self-center text-muted md:text-lg">Nothing saved yet. Tap the bookmark on anything that catches your eye, and it waits for you here.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {recent.map((s) => (
              <li key={s.id}>
                <a href={href('collection')} className="flex items-baseline justify-between gap-3 py-3 hover:text-rust">
                  <span className="min-w-0">
                    <span className="label mr-3">{KIND_LABEL[s.kind] ?? s.kind}</span>
                    {s.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted">{formatDate(s.savedAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Go Wander ────────────────────────────────────────────── */}
      <section aria-labelledby="wander-title" data-home-area="go-wander">
        <div className="mb-4 border-b border-line pb-2">
          <p className="label">Go wander · 出かける</p>
          <h2 id="wander-title" className="display mt-1 text-4xl md:text-5xl">
            Pick a direction
          </h2>
        </div>
        <nav aria-label="Discovery paths">
          <ul className="grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {PATHS.map((p) => (
              <li key={p.title} className="border-b border-line sm:[&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r">
                <a href={p.to} className="group flex h-full flex-col gap-2 px-1 py-5 transition-colors hover:bg-white/[0.02] sm:px-4">
                  <span className="font-jp text-[11px] tracking-[0.2em] text-muted" lang="ja">
                    {p.jp}
                  </span>
                  <span className="display text-3xl group-hover:text-rust">{p.title}</span>
                  <span className="text-sm text-muted">{p.blurb}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-12">
          <p className="label">Quick discovery · 気分で選ぶ</p>
          <h3 id="vibe-title" className="display mt-1 text-3xl md:text-4xl">
            Or pick a vibe
          </h3>
          <div className="mt-3">
            <VibePicker />
          </div>
        </div>
      </section>
    </div>
  );
}
