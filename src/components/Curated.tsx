import { ArrowRight } from 'lucide-react';
import { CURATED } from '../data/curated';
import { href } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';

const ACCENT = {
  rust: 'bg-rust text-ink',
  hunter: 'bg-hunter text-paper',
  paper: 'bg-paper text-ink',
} as const;

/** Magazine-style "editions" — combined experiences. */
export function CuratedEditions() {
  const { experiences } = useStore();
  return (
    <ul className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {CURATED.map((c) => {
        const exps = c.experienceIds
          .map((id) => experiences.find((e) => e.id === id))
          .filter((e): e is NonNullable<typeof e> => Boolean(e));
        return (
          <li key={c.id} className="flex flex-col bg-ink2">
            <div className={`relative overflow-hidden px-4 pb-4 pt-3 ${ACCENT[c.accent]}`}>
              <div className="flex items-start justify-between">
                <span className="font-mono text-[11px] uppercase tracking-label">Ed. {c.number}</span>
                <span className="font-jp text-[11px] tracking-[0.3em]" lang="ja">
                  {c.jp}
                </span>
              </div>
              <h3 className="display mt-6 text-[clamp(1.7rem,2.3vw,2.1rem)]">{c.title}</h3>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wider">{c.tagline}</p>
              {/* Pure decoration (WCAG 1.4.3 exempts it; the number is stated in "Ed."): drawn as
                  generated content so it is never read or evaluated as text. */}
              <span
                aria-hidden
                data-numeral={c.number}
                className="pointer-events-none absolute -bottom-6 -right-2 font-display text-[7rem] leading-none opacity-[0.12] after:content-[attr(data-numeral)]"
              />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="text-sm text-paper/85">{c.description}</p>
              <ol className="mt-3 space-y-1 border-l border-line pl-3">
                {c.sequence.map((s, i) => (
                  <li key={s} className="text-xs text-muted">
                    <span className="mr-2 font-mono text-rust">{String.fromCharCode(65 + i)}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <ul className="mt-auto space-y-1 pt-4">
                {exps.map((e) => (
                  <li key={e.id}>
                    <a
                      href={href('discover', { exp: e.id })}
                      className="group flex items-center justify-between gap-2 border-t border-line py-2 text-sm hover:text-rust"
                    >
                      {e.name}
                      <ArrowRight size={14} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
