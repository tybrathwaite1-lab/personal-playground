import { ArrowRight } from 'lucide-react';
import { useDrop } from '../hooks/useDrop';
import { href } from '../hooks/useRoute';
import { COLUMN_META } from '../types/drop';
import { formatYmd } from '../utils/community';
import { EditorialImage } from './EditorialImage';

/** Homepage window onto the latest Weekly Drop. Renders nothing until an issue exists. */
export function DropTeaser() {
  const { latest } = useDrop();
  if (!latest) return null;
  const featured = latest.items.find((i) => i.id === latest.featured) ?? latest.items[0];
  const others = latest.items.filter((i) => i.id !== featured.id).slice(0, 4);
  return (
    <section aria-labelledby="drop-title">
      <div className="mb-4 flex items-end justify-between border-b border-line pb-2">
        <div>
          <p className="label">
            The Weekly Drop · No.{String(latest.issue).padStart(2, '0')} · {formatYmd(latest.publishDate)}
          </p>
          <h2 id="drop-title" className="display text-4xl md:text-5xl">
            {latest.title}
          </h2>
        </div>
        <a href={href('drop')} className="label hover:text-paper">
          Read the issue →
        </a>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
        <a href={href('drop')} className="group block">
          <EditorialImage subject={featured.image ?? featured.id} fallbackTags={featured.tags} ratio="4/5" caption={false} />
        </a>
        <div>
          <p className="text-[17px] leading-relaxed text-paper/90">{latest.intro}</p>
          <a href={href('drop')} className="group mt-5 block border-t border-line pt-4">
            <p className="label text-rust">{COLUMN_META[featured.column].name} · Lead</p>
            <p className="display mt-1 text-3xl group-hover:text-rust">{featured.title}</p>
            <p className="mt-1 text-sm text-muted">{featured.dek}</p>
          </a>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {others.map((i) => (
              <li key={i.id}>
                <a href={href('drop')} className="flex items-baseline justify-between gap-3 py-2.5 hover:text-rust">
                  <span className="min-w-0">
                    <span className="label mr-2">{COLUMN_META[i.column].name}</span>
                    {i.title}
                  </span>
                  <ArrowRight size={14} aria-hidden className="shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
