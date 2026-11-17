import { useMemo, useRef, useState } from 'react';
import { Shuffle, SlidersHorizontal, Trash2 } from 'lucide-react';
import { VIBES } from '../data/vibes';
import { href } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';
import { useWeather } from '../hooks/useWeather';
import type { Experience, VibePreset } from '../types';
import { pickExperience, vibePool, vibeToParams } from '../utils/discovery';
import { loadSeen, saveSeen } from '../utils/storage';
import { isIndoorDay, isOutdoorOnly } from '../utils/weather';
import { ExperienceCard } from './ExperienceCard';
import { EditorialImage } from './EditorialImage';

/** PICK A VIBE — a magazine index of one-tap presets, each generating a pick from the Discovery Engine. */
export function VibePicker() {
  const { experiences, data, deletePreset, feedbackFor } = useStore();
  const { weather } = useWeather();
  const [active, setActive] = useState<VibePreset | null>(null);
  const [pick, setPick] = useState<Experience | null>(null);
  const [count, setCount] = useState(0);
  const seenRef = useRef<Record<string, string[]>>(loadSeen());
  const resultRef = useRef<HTMLDivElement>(null);
  const presets = useMemo(() => [...VIBES, ...data.customPresets], [data.customPresets]);

  const roll = (v: VibePreset) => {
    const indoor = data.settings.weatherAware && isIndoorDay(weather);
    let pool = vibePool(experiences, v).filter((e) => !feedbackFor(`exp:${e.id}`)?.notInterested);
    if (indoor) {
      const dry = pool.filter((e) => !isOutdoorOnly(e));
      if (dry.length) pool = dry;
    }
    const key = `vibe:${v.id}`;
    const r = pickExperience(pool, seenRef.current[key] ?? [], pick?.id ?? null);
    seenRef.current = { ...seenRef.current, [key]: r.seen };
    saveSeen(seenRef.current);
    setActive(v);
    setPick(r.pick);
    setCount((c) => c + 1);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  return (
    <div>
      <ol className="grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((v, i) => (
          <li key={v.id} className="border-b border-line sm:odd:border-r lg:border-r lg:[&:nth-child(3n)]:border-r-0">
            <div className="group relative flex h-full items-stretch">
              <button
                type="button"
                onClick={() => roll(v)}
                aria-pressed={active?.id === v.id}
                className="flex min-h-[72px] flex-1 items-baseline gap-4 px-1 py-4 text-left transition-colors hover:bg-white/[0.02] aria-pressed:bg-hunter/30 sm:px-4"
              >
                <span className="w-7 shrink-0 font-mono text-xs text-rust">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="display text-2xl group-hover:text-rust">{v.name}</span>
                    {v.jp && (
                      <span className="font-jp text-[10px] tracking-[0.2em] text-muted" lang="ja">
                        {v.jp}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{v.description}</span>
                </span>
              </button>
              {v.custom && (
                <button
                  type="button"
                  className="btn-ghost self-center"
                  aria-label={`Delete vibe ${v.name}`}
                  onClick={() => confirm(`Delete the “${v.name}” vibe?`) && deletePreset(v.id)}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div ref={resultRef} className="scroll-mt-20">
        {active && pick && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
            <EditorialImage subject={pick.id} fallbackTags={pick.interests} className="hidden lg:block" ratio="4/5" />
            <ExperienceCard
              key={`${pick.id}-${count}`}
              exp={pick}
              image={false}
              index={active.name}
              footer={
                <>
                  <button type="button" className="btn" onClick={() => roll(active)}>
                    <Shuffle size={16} aria-hidden /> Another {active.name}
                  </button>
                  <a className="btn" href={href('discover', vibeToParams(active))}>
                    <SlidersHorizontal size={14} aria-hidden /> Fine-tune
                  </a>
                </>
              }
            />
          </div>
        )}
        {active && !pick && <p className="mt-6 text-muted">Nothing fits “{active.name}” right now — try another vibe.</p>}
      </div>
    </div>
  );
}
