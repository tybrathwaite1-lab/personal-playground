import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Dices, Pencil, Plus, Trash2 } from 'lucide-react';
import { ChipGroup, Empty, FavoriteButton, Field, Modal, SaveButton, SearchBox, SectionHeader, Select } from '../components/ui';
import { WEBSITE_CATEGORIES } from '../data/websites';
import { useStore } from '../hooks/useStore';
import { useDrop } from '../hooks/useDrop';
import { href } from '../hooks/useRoute';
import type { Website, WebsiteCategory } from '../types';
import { hostname, includesText, isSafeUrl, normalizeUrl } from '../utils/helpers';

type Draft = Omit<Website, 'id'> & { id?: string };

function WebsiteForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const { upsertWebsite } = useStore();
  const [d, setD] = useState({ ...initial, tagText: (initial.tags ?? []).join(', ') });
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(d.url);
    if (!d.name.trim()) return setError('Add a name.');
    if (!isSafeUrl(url)) return setError('That URL doesn’t look right.');
    const { tagText, ...rest } = d;
    upsertWebsite({
      ...rest,
      name: d.name.trim(),
      url,
      tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
    });
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <Field label="Name">
        <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </Field>
      <Field label="URL">
        <input className="input" inputMode="url" value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://" />
      </Field>
      <Field label="Category">
        <Select<WebsiteCategory>
          label="Category"
          value={d.category}
          onChange={(v) => setD({ ...d, category: v })}
          options={WEBSITE_CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
      </Field>
      <Field label="Why it’s worth a visit">
        <textarea className="input min-h-[70px]" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </Field>
      <Field label="Tags" hint="Comma separated.">
        <input className="input" value={d.tagText} onChange={(e) => setD({ ...d, tagText: e.target.value })} />
      </Field>
      {error && (
        <p className="mb-3 text-sm text-rust" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full">
        {initial.id ? 'Save changes' : 'Add website'}
      </button>
    </form>
  );
}

export default function Digital() {
  const { websites, removeWebsite, restoreWebsites, data } = useStore();
  const drop = useDrop();
  /** Weekly Drop items that cite this site — the library's link into the threads. */
  const citedIn = (url: string) => {
    const host = hostname(url);
    const out: { issue: number; id: string; title: string }[] = [];
    for (const e of drop.editions) for (const it of e.items) if (it.sources.some((s) => hostname(s.url) === host)) out.push({ issue: e.issue, id: it.id, title: it.title });
    return out.slice(0, 2);
  };
  const [cat, setCat] = useState<'all' | WebsiteCategory>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [random, setRandom] = useState<Website | null>(null);

  const results = websites.filter(
    (w) => (cat === 'all' || w.category === cat) && includesText([w.name, w.description, w.url, ...(w.tags ?? [])], q),
  );

  const roll = () => {
    const pool = results.length ? results : websites;
    const options = pool.length > 1 ? pool.filter((w) => w.id !== random?.id) : pool;
    setRandom(options[Math.floor(Math.random() * options.length)] ?? null);
  };

  const categoriesInUse = WEBSITE_CATEGORIES.filter((c) => websites.some((w) => w.category === c));

  return (
    <div>
      <SectionHeader
        number="04"
        title="Digital Playground"
        jp="電子の遊び場"
        blurb="The good corners of the internet — for wandering on purpose instead of scrolling by default."
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => setEditing({ name: '', url: '', category: 'Internet exploration', description: '', tags: [] })}
          >
            <Plus size={16} aria-hidden /> Add a site
          </button>
        }
      />

      <section className="mb-8 border border-line bg-hunter/30 p-5 sm:p-6" aria-live="polite">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="label mb-1">Random destination · ランダム</p>
            {random ? (
              <>
                <h2 className="display text-4xl">{random.name}</h2>
                <p className="mt-1 text-paper/85">{random.description}</p>
              </>
            ) : (
              <h2 className="display text-4xl">Take me somewhere.</h2>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {random && (
              <a href={random.url} target="_blank" rel="noreferrer" className="btn-primary">
                Visit {hostname(random.url)} <ArrowUpRight size={16} aria-hidden />
              </a>
            )}
            <button type="button" className="btn" onClick={roll}>
              <Dices size={16} aria-hidden /> {random ? 'Another' : 'Roll the dice'}
            </button>
          </div>
        </div>
      </section>

      <div className="mb-6 space-y-4">
        <SearchBox value={q} onChange={setQ} placeholder="Search sites and tags" />
        <ChipGroup
          label="Category"
          value={cat}
          onChange={setCat}
          options={[{ value: 'all' as const, label: 'All' }, ...categoriesInUse.map((c) => ({ value: c, label: c }))]}
        />
      </div>

      {results.length === 0 ? (
        <Empty>Nothing here yet.</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {results.map((w, i) => (
            <li key={w.id} className="grid grid-cols-[auto_1fr] gap-x-4 py-4 sm:grid-cols-[3rem_1fr_auto]">
              <span className="pt-1 font-mono text-xs text-rust">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <a href={w.url} target="_blank" rel="noreferrer" className="display text-2xl hover:text-rust">
                    {w.name}
                  </a>
                  <span className="font-mono text-xs text-muted">{hostname(w.url)}</span>
                  {w.custom && <span className="tag text-rust">Yours</span>}
                </div>
                <p className="mt-1 text-sm text-paper/85">{w.description}</p>
                {citedIn(w.url).map((c) => (
                  <a key={c.id} href={href('drop', { issue: String(c.issue), item: c.id })} className="mt-1 block font-mono text-[11px] text-rust hover:underline">
                    In the Weekly Drop No.{c.issue}: {c.title} →
                  </a>
                ))}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="tag border-hunter bg-hunter/50 text-paper">{w.category}</span>
                  {w.tags?.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="col-span-2 mt-2 flex items-center gap-0.5 sm:col-span-1 sm:mt-0">
                <FavoriteButton id={w.id} name={w.name} />
                <SaveButton kind="website" refId={w.id} title={w.name} subtitle={w.category} url={w.url} compact />
                <button type="button" className="btn-ghost" aria-label={`Edit ${w.name}`} onClick={() => setEditing(w)}>
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  aria-label={`Remove ${w.name}`}
                  onClick={() => confirm(`Remove ${w.name} from the list?`) && removeWebsite(w.id)}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.hiddenWebsiteIds.length > 0 && (
        <button type="button" className="btn mt-6" onClick={restoreWebsites}>
          Restore {data.hiddenWebsiteIds.length} removed starter site{data.hiddenWebsiteIds.length > 1 ? 's' : ''}
        </button>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit website' : 'Add website'}>
        {editing && <WebsiteForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
