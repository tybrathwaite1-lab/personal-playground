import { useMemo, useState } from 'react';
import { ArrowRight, Dices, Shuffle } from 'lucide-react';
import { CuratedEditions } from '../components/Curated';
import { ExperienceTile } from '../components/ExperienceCard';
import { NAV } from '../components/Layout';
import { WeatherStrip } from '../components/WeatherStrip';
import { href, navigate } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';
import { formatCost, formatDuration } from '../utils/discovery';
import { dailySeed, formatDate, seededShuffle } from '../utils/helpers';

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

const BLURBS: Record<string, string> = {
  discover: 'Six optional dials, one good idea.',
  plan: 'Two or three stops, one good day.',
  interests: 'Everything you’re into, in one index.',
  local: 'St. Pete & Tampa Bay, verified.',
  digital: 'The good corners of the internet.',
  rediscover: 'Old loves, revisited.',
  collection: 'Everything you’ve kept.',
  notes: 'A notebook, never homework.',
};

export default function Home() {
  const { experiences, data } = useStore();
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const today = new Date();
  const seed = dailySeed();
  const featured = useMemo(() => seededShuffle(experiences, seed)[0], [experiences, seed]);
  const rotation = useMemo(
    () => seededShuffle(experiences.filter((e) => e.id !== featured?.id), seed + shuffleSeed * 7919).slice(0, 6),
    [experiences, featured, seed, shuffleSeed],
  );
  const recent = data.saved.slice(0, 4);

  const surprise = () => navigate('discover', { surprise: String(Date.now()) });

  return (
    <div className="space-y-16">
      {/* ── Cover ───────────────────────────────────────────────── */}
      <section className="relative animate-rise" aria-labelledby="cover-title">
        <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
          <span className="label">Vol. 01 · Issue {seed % 1000}</span>
          <span className="label">{today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="relative min-w-0">
          <span
            aria-hidden
            className="absolute -top-2 right-0 hidden font-jp text-[11px] tracking-[0.6em] text-muted [writing-mode:vertical-rl] sm:block"
            lang="ja"
          >
            遊び場・好奇心・自由
          </span>
          <h1 id="cover-title" className="display pr-6 text-[clamp(3rem,15vw,9rem)]">
            Personal
            <br />
            <span className="whitespace-nowrap">
              Playground<span className="text-rust">.</span>
            </span>
          </h1>
          <p className="mt-5 font-mono text-xs uppercase tracking-label text-muted">
            No goals. No quotas. Just curiosity.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-end lg:gap-8">
          <div className="min-w-0 border-l-2 border-rust pl-4">
            <p className="label mb-1">Today’s question</p>
            <p className="display text-4xl sm:text-6xl">What sounds good today?</p>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <a href={href('discover')} className="btn-primary w-full text-sm">
              Open the Discovery Engine <ArrowRight size={16} aria-hidden />
            </a>
            <button type="button" className="btn w-full" onClick={surprise}>
              <Dices size={16} aria-hidden /> Surprise me
            </button>
          </div>
        </div>
        <div className="mt-4">
          <WeatherStrip />
        </div>
      </section>

      {/* ── Featured ────────────────────────────────────────────── */}
      {featured && (
        <section aria-labelledby="featured-title">
          <a
            href={href('discover', { exp: featured.id })}
            className="group grid grid-cols-1 border border-line bg-hunter/30 transition-colors hover:bg-hunter/50 md:grid-cols-[auto_1fr]"
          >
            <div className="flex items-center justify-center border-b border-line p-6 md:border-b-0 md:border-r">
              <span className="font-display text-7xl text-rust md:text-8xl">01</span>
            </div>
            <div className="p-6">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="label text-paper/80">Featured experience · 特集</span>
                {featured.kicker && (
                  <span className="font-jp text-xs text-paper/60" lang="ja">
                    {featured.kicker}
                  </span>
                )}
              </div>
              <h2 id="featured-title" className="display text-4xl sm:text-5xl group-hover:text-rust">
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

      {/* ── Sections ────────────────────────────────────────────── */}
      <section aria-labelledby="contents-title">
        <div className="mb-4 flex items-end justify-between border-b border-line pb-2">
          <h2 id="contents-title" className="display text-3xl">
            Contents
          </h2>
          <span className="font-jp text-xs text-muted" lang="ja">
            目次
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
          {NAV.slice(1).map((n) => {
            const Icon = n.icon;
            return (
              <li key={n.route} className="bg-ink">
                <a href={href(n.route)} className="group flex h-full flex-col p-4 transition-colors hover:bg-ink2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-rust">{n.num}</span>
                    <Icon size={16} aria-hidden className="text-muted group-hover:text-paper" />
                  </div>
                  <span className="display mt-6 text-2xl">{n.label}</span>
                  <span className="mt-1 text-xs text-muted">{BLURBS[n.route]}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Rotation ────────────────────────────────────────────── */}
      <section aria-labelledby="rotation-title">
        <div className="mb-4 flex items-end justify-between border-b border-line pb-2">
          <div>
            <p className="label">In rotation · 今日の選択</p>
            <h2 id="rotation-title" className="display text-3xl">
              A few ideas
            </h2>
          </div>
          <button type="button" className="btn" onClick={() => setShuffleSeed((s) => s + 1)}>
            <Shuffle size={14} aria-hidden /> Shuffle
          </button>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rotation.map((e) => (
            <li key={e.id} className="animate-rise">
              <ExperienceTile exp={e} onOpen={() => navigate('discover', { exp: e.id })} />
            </li>
          ))}
        </ul>
      </section>

      {/* ── Editions ────────────────────────────────────────────── */}
      <section aria-labelledby="editions-title">
        <div className="mb-4 flex items-end justify-between border-b border-line pb-2">
          <div>
            <p className="label">Curated editions · 特別号</p>
            <h2 id="editions-title" className="display text-3xl">
              Whole days, pre-assembled
            </h2>
          </div>
        </div>
        <CuratedEditions />
      </section>

      {/* ── Recently saved ──────────────────────────────────────── */}
      <section aria-labelledby="recent-title">
        <div className="mb-4 flex items-end justify-between border-b border-line pb-2">
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
                  <span>
                    <span className="label mr-3">{KIND_LABEL[s.kind]}</span>
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
