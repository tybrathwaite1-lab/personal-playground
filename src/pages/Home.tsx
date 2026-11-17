import { useMemo, useState } from 'react';
import { ArrowRight, Dices } from 'lucide-react';
import { EditorialImage } from '../components/EditorialImage';
import { VibePicker } from '../components/VibePicker';
import { WeatherStrip } from '../components/WeatherStrip';
import { DropTeaser } from '../components/DropTeaser';
import { COMMUNITIES } from '../data/communities';
import { href, navigate } from '../hooks/useRoute';
import { usePulse } from '../hooks/usePulse';
import { useStore } from '../hooks/useStore';
import { useWeather } from '../hooks/useWeather';
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

const PATHS = [
  { n: '01', title: 'Go somewhere', jp: '出かける', blurb: 'What’s on nearby, places to wander, people to meet.', to: href('pulse') },
  { n: '02', title: 'Do something', jp: 'やってみる', blurb: 'Hobbies, projects and outings — pick a vibe or plan one.', to: href('discover') },
  { n: '03', title: 'Discover something', jp: '見つける', blurb: 'Music, film, games, art and corners of the internet.', to: href('drop') },
];

export default function Home() {
  const { experiences, data, places } = useStore();
  const pulse = usePulse();
  const { weather } = useWeather();
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

  return (
    <div className="space-y-14 md:space-y-16">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <section className="relative animate-rise" aria-labelledby="cover-title">
        <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
          <span className="label">Vol. 02 · Issue {seed % 1000}</span>
          <span className="label">{today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
        <span
          aria-hidden
          className="absolute right-0 top-10 hidden font-jp text-[11px] tracking-[0.6em] text-muted [writing-mode:vertical-rl] md:block"
          lang="ja"
        >
          遊び場・好奇心・自由
        </span>
        <h1 id="cover-title" className="display pr-6 text-[clamp(2.6rem,12.5vw,9rem)] md:text-[clamp(5rem,13vw,9rem)]">
          Personal
          <br />
          <span className="whitespace-nowrap">
            Playground<span className="text-rust">.</span>
          </span>
        </h1>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_1fr] md:items-end md:gap-8">
          <div className="min-w-0 border-l-2 border-rust pl-4">
            <p className="label mb-1">Today’s question</p>
            <p className="display text-3xl sm:text-5xl">What sounds good today?</p>
          </div>
          <div className="flex min-w-0 gap-2">
            <a href={href('pulse')} className="btn-primary flex-1 text-sm">
              What’s on nearby <ArrowRight size={16} aria-hidden />
            </a>
            <button type="button" className="btn" onClick={() => navigate('discover', { surprise: String(Date.now()) })}>
              <Dices size={16} aria-hidden /> Surprise
            </button>
          </div>
        </div>
      </section>

      {/* ── Three paths ──────────────────────────────────────────── */}
      <nav aria-label="Discovery paths">
        <ul className="grid grid-cols-1 border-y border-line md:grid-cols-3">
          {PATHS.map((p) => (
            <li key={p.n} className="border-line md:[&:not(:last-child)]:border-r [&:not(:last-child)]:border-b md:[&:not(:last-child)]:border-b-0">
              <a href={p.to} className="group flex items-baseline gap-4 px-1 py-4 transition-colors hover:bg-white/[0.02] md:block md:px-5 md:py-6">
                <span className="font-mono text-xs text-rust">{p.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="display block text-3xl group-hover:text-rust md:mt-4 md:text-4xl">{p.title}</span>
                  <span className="mt-1 block text-sm text-muted">{p.blurb}</span>
                </span>
                <span className="font-jp text-[10px] tracking-[0.2em] text-muted md:mt-3 md:block" lang="ja">
                  {p.jp}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Today's local possibilities ──────────────────────────── */}
      <section aria-labelledby="local-title">
        <div className="mb-3 flex items-end justify-between border-b border-line pb-2">
          <div>
            <p className="label">The Local Pulse · {local.label}</p>
            <h2 id="local-title" className="display text-3xl">
              Around St. Pete
            </h2>
          </div>
          <a href={href('pulse')} className="label hover:text-paper">
            All listings →
          </a>
        </div>
        <div className="mb-3">
          <WeatherStrip />
        </div>
        <ul className="grid grid-cols-1 border-l border-t border-line md:grid-cols-2 lg:grid-cols-4">
          {local.list.map((e) => (
            <li key={e.id} className="border-b border-r border-line bg-ink p-4">
              <p className="label text-rust">{formatWhen(e)}</p>
              <a href={href('pulse', { view: 'upcoming' })} className="display mt-1 block text-xl hover:text-rust">
                {e.title}
              </a>
              <p className="mt-1 text-xs text-muted">{[e.venue, e.city].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
          {local.community && (
            <li className="border-b border-r border-line bg-ink p-4">
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
            <li className="border-b border-r border-line bg-ink p-4">
              <p className="label">Somewhere new to you</p>
              <a href={href('local', { place: local.place.id })} className="display mt-1 block text-xl hover:text-rust">
                {local.place.name}
              </a>
              <p className="mt-1 text-xs text-muted">
                {local.place.neighborhood} · {local.place.categories[0]}
              </p>
            </li>
          )}
          {!pulse.data && !local.community && !local.place && <li className="bg-ink p-4 text-sm text-muted">Listings are loading…</li>}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
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

      {/* ── Pick a Vibe ──────────────────────────────────────────── */}
      <section aria-labelledby="vibe-title">
        <div className="mb-1 flex items-end justify-between pb-2">
          <div>
            <p className="label">Quick discovery · 気分で選ぶ</p>
            <h2 id="vibe-title" className="display text-4xl md:text-5xl">
              Pick a vibe<span className="text-rust">.</span>
            </h2>
          </div>
        </div>
        <VibePicker />
      </section>

      {/* ── The Weekly Drop ──────────────────────────────────────── */}
      <DropTeaser />

      {/* ── Featured ─────────────────────────────────────────────── */}
      {featured && (
        <section aria-labelledby="featured-title">
          <a
            href={href('discover', { exp: featured.id })}
            className="group grid grid-cols-1 border border-line bg-hunter/30 transition-colors hover:bg-hunter/50 md:grid-cols-[2fr_3fr]"
          >
            <EditorialImage subject={featured.id} fallbackTags={featured.interests} ratio="3/2" caption={false} className="md:border-r md:border-line" />
            <div className="p-6">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="label text-paper/80">Featured experience · 特集</span>
                {featured.kicker && (
                  <span className="font-jp text-xs text-paper/60" lang="ja">
                    {featured.kicker}
                  </span>
                )}
              </div>
              <h2 id="featured-title" className="display text-4xl group-hover:text-rust sm:text-5xl">
                {featured.name}
              </h2>
              <p className="mt-2 max-w-2xl text-paper/85">{featured.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="tag">{formatCost(featured.cost)}</span>
                <span className="tag">{formatDuration(featured.duration)}</span>
                <span className="tag">{featured.energy} energy</span>
              </div>
            </div>
          </a>
        </section>
      )}

      {/* ── Recently saved ───────────────────────────────────────── */}
      <section aria-labelledby="recent-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
          <h2 id="recent-title" className="display text-3xl">
            Recently saved
          </h2>
          <a href={href('collection')} className="label hover:text-paper">
            Collection →
          </a>
        </div>
        {recent.length === 0 ? (
          <p className="text-muted">Nothing saved yet. Tap the bookmark on anything that catches your eye.</p>
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
    </div>
  );
}
