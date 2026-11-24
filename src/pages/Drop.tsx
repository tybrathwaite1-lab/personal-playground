import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Clock, Copy, GitBranch, Upload, X } from 'lucide-react';
import { EditorialImage } from '../components/EditorialImage';
import { FeedbackBar } from '../components/FeedbackBar';
import { Empty, SaveButton, SectionHeader } from '../components/ui';
import { COMMUNITIES } from '../data/communities';
import { IMAGES } from '../data/images';
import { SEED_PLACES } from '../data/places';
import { useDrop } from '../hooks/useDrop';
import { href } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';
import { COLUMN_META, type DropEdition, type DropItem, type DropRelation, type ThreadNode } from '../types/drop';
import { buildAssistantPrompt } from '../utils/dropPrompt';
import { validateEdition, type ValidationResult } from '../utils/dropValidate';
import { formatYmd } from '../utils/community';
import { hostname, isSafeUrl } from '../utils/helpers';

const FRESHNESS_LABEL: Record<DropItem['freshness'], string> = {
  archive: 'From the archive',
  timeless: 'Timeless',
  contemporary: 'Recent',
  emerging: 'Emerging',
};

const GITHUB_EDITORIAL = 'https://github.com/tybrathwaite1-lab/personal-playground/blob/main/EDITORIAL.md';

export default function Drop({ params }: { params: URLSearchParams }) {
  const drop = useDrop();
  const issueParam = params.get('issue');
  const [thread, setThread] = useState<string | null>(params.get('item'));
  const [desk, setDesk] = useState(params.get('desk') === '1');

  const all = [...drop.previews.map((p) => ({ ...p, _preview: true })), ...drop.editions];
  const edition: (DropEdition & { _preview?: boolean }) | null =
    (issueParam ? all.find((e) => String(e.issue) === issueParam) : null) ?? all[0] ?? null;

  return (
    <div>
      <SectionHeader
        number="09"
        title="The Weekly Drop"
        jp="今週の発見"
        blurb="Worth exploring. A small Friday magazine of music, film, games, art and corners of the internet — archive-first, sourced, and never in a hurry."
        actions={
          <button type="button" className="btn" onClick={() => setDesk((d) => !d)} aria-expanded={desk}>
            <Upload size={14} aria-hidden /> Editorial desk
          </button>
        }
      />

      {desk && <EditorialDesk onClose={() => setDesk(false)} />}

      {!edition ? (
        <Empty>
          <p className="display text-3xl text-paper">{drop.loading ? 'Fetching the latest issue…' : 'No issue published yet.'}</p>
          <p className="mt-2">The first edition appears on its publication date.</p>
        </Empty>
      ) : (
        <EditionView edition={edition} preview={Boolean(edition._preview)} onThread={setThread} />
      )}

      {thread && <ThreadPanel startId={thread} onClose={() => setThread(null)} />}

      {/* Archive */}
      {drop.editions.length > 0 && (
        <section className="mt-16 border-t border-line pt-6" aria-labelledby="archive-title">
          <h2 id="archive-title" className="display text-3xl">
            Back issues <span className="font-jp text-sm tracking-[0.3em] text-muted">バックナンバー</span>
          </h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {drop.editions.map((e) => (
              <li key={e.issue}>
                <a href={href('drop', { issue: String(e.issue) })} className="grid grid-cols-[4rem_1fr] items-baseline gap-3 py-3 hover:text-rust sm:grid-cols-[4rem_1fr_auto]">
                  <span className="font-mono text-xs text-rust">No.{String(e.issue).padStart(2, '0')}</span>
                  <span>
                    <span className="display text-2xl">{e.title}</span>
                    <span className="block text-sm text-muted">{e.theme}</span>
                  </span>
                  <span className="col-start-2 font-mono text-[11px] text-muted sm:col-start-auto">{formatYmd(e.publishDate)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EditionView({ edition, preview, onThread }: { edition: DropEdition; preview: boolean; onThread: (id: string) => void }) {
  const { data } = useStore();
  const featured = edition.items.find((i) => i.id === edition.featured) ?? edition.items[0];
  const rest = edition.items.filter((i) => i.id !== featured.id);
  // Gentle personalization: "not my thing" items sink to the end; nothing is hidden.
  const ordered = [...rest].sort(
    (a, b) => Number(Boolean(data.feedback[`drop:${a.id}`]?.notInterested)) - Number(Boolean(data.feedback[`drop:${b.id}`]?.notInterested)),
  );
  return (
    <article aria-labelledby="edition-title">
      {preview && (
        <p className="mb-4 border border-dashed border-rust px-3 py-2 font-mono text-xs uppercase tracking-wider text-rust">
          Preview on this device only — not published
        </p>
      )}
      <header className="mb-8 grid grid-cols-1 gap-4 border-b border-line pb-6 md:grid-cols-[auto_1fr] md:gap-8">
        <div className="flex items-baseline gap-3 md:block">
          <p className="font-display text-7xl leading-none text-rust md:text-8xl">{String(edition.issue).padStart(2, '0')}</p>
          <p className="label md:mt-2">{formatYmd(edition.publishDate)}</p>
        </div>
        <div>
          <p className="label">{edition.theme}</p>
          <h2 id="edition-title" className="display mt-1 text-5xl md:text-6xl">
            {edition.title}
          </h2>
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-paper/90">{edition.intro}</p>
          {edition.corrections?.map((c) => (
            <p key={c.date + c.note} className="mt-2 text-xs text-muted">
              Correction ({c.date}): {c.note}
            </p>
          ))}
        </div>
      </header>

      <DropItemCard item={featured} lead onThread={onThread} />

      <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2">
        {ordered.map((it) => (
          <li key={it.id}>
            <DropItemCard item={it} onThread={onThread} />
          </li>
        ))}
      </ul>
    </article>
  );
}

export function DropItemCard({ item, lead, onThread }: { item: DropItem; lead?: boolean; onThread: (id: string) => void }) {
  const meta = COLUMN_META[item.column];
  const { data } = useStore();
  const dismissed = Boolean(data.feedback[`drop:${item.id}`]?.notInterested);
  const [open, setOpen] = useState(lead || item.format === 'brief');
  const place = item.local?.placeId ? SEED_PLACES.find((p) => p.id === item.local!.placeId) : null;
  const community = item.local?.communityId ? COMMUNITIES.find((c) => c.id === item.local!.communityId) : null;
  return (
    <section aria-labelledby={`drop-${item.id}`} className={`${dismissed ? 'opacity-50' : ''} ${lead ? 'grid grid-cols-1 gap-6 lg:grid-cols-[3fr_4fr]' : ''}`}>
      {(lead || item.image) && <EditorialImage subject={item.image ?? item.id} fallbackTags={item.tags} ratio={lead ? '4/5' : '16/9'} priority={lead} />}
      <div>
        <p className="label flex flex-wrap items-center gap-x-2">
          <span className="text-rust">{meta.name}</span>
          <span className="font-jp normal-case tracking-[0.2em]" lang="ja">
            {meta.jp}
          </span>
          <span>· {FRESHNESS_LABEL[item.freshness]}{item.year ? ` · ${item.year}` : ''}</span>
          {item.format === 'feature' && <span>· Feature</span>}
        </p>
        <h3 id={`drop-${item.id}`} className={`display mt-2 ${lead ? 'text-5xl md:text-6xl' : 'text-3xl'}`}>
          {item.title}
        </h3>
        <p className="mt-2 text-paper/80">{item.dek}</p>
        {open ? (
          <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-paper/90">
            {item.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <button type="button" className="btn mt-4" onClick={() => setOpen(true)}>
            Read the feature
          </button>
        )}
        <p className="mt-4 border-l-2 border-rust pl-3 text-sm italic text-paper/85">
          <span className="not-italic text-muted">Why it might land: </span>
          {item.why}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="tag">{item.depth}</span>
          {item.exploreMinutes && (
            <span className="tag">
              <Clock size={10} aria-hidden className="mr-1" /> ~{item.exploreMinutes} min
            </span>
          )}
          {item.tags.slice(0, 4).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {item.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-rust">
                <ArrowUpRight size={13} aria-hidden /> {s.label}
                <span className="font-mono text-[10px] text-muted">{hostname(s.url)}</span>
              </a>
            </li>
          ))}
        </ul>
        {(place || community) && (
          <p className="mt-2 text-sm">
            {place && (
              <a href={href('local', { place: place.id })} className="underline-offset-4 hover:underline">
                {place.name} in the Local Playground →
              </a>
            )}
            {community && (
              <a href={href('pulse', { view: 'anytime' })} className="underline-offset-4 hover:underline">
                {community.name} in the Local Pulse →
              </a>
            )}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SaveButton kind="drop" refId={item.id} title={item.title} subtitle={`${meta.name} · ${item.dek}`} url={item.sources[0]?.url} />
          {(item.related?.length ?? 0) > 0 && (
            <button type="button" className="btn" onClick={() => onThread(item.id)}>
              <GitBranch size={14} aria-hidden /> Follow the thread
            </button>
          )}
        </div>
        <div className="mt-3">
          <FeedbackBar itemKey={`drop:${item.id}`} kind="editorial" label={item.title} />
        </div>
      </div>
    </section>
  );
}

// ─── Follow the Thread ──────────────────────────────────────────────
interface ThreadEntity {
  id: string;
  title: string;
  kind: string;
  year?: string;
  summary: string;
  url?: string;
  related: DropRelation[];
  isItem: boolean;
}

function ThreadPanel({ startId, onClose }: { startId: string; onClose: () => void }) {
  const drop = useDrop();
  const [trail, setTrail] = useState<string[]>([startId]);
  const ref = useRef<HTMLDivElement>(null);

  const entity = (id: string): ThreadEntity | null => {
    const it = drop.itemById(id);
    if (it)
      return { id, title: it.item.title, kind: COLUMN_META[it.item.column].name, year: it.item.year, summary: it.item.dek, url: it.item.sources[0]?.url, related: it.item.related ?? [], isItem: true };
    const n: ThreadNode | null = drop.nodeById(id);
    if (n) return { id, title: n.title, kind: n.type, year: n.year, summary: n.summary, url: n.url, related: n.related ?? [], isItem: false };
    return null;
  };

  // Links in both directions: what this points to, and what points here.
  const current = entity(trail[trail.length - 1]);
  const links = useMemo(() => {
    if (!current) return [];
    const out = current.related.map((r) => ({ ...r, dir: 'out' as const }));
    const incoming: (DropRelation & { dir: 'in' })[] = [];
    const scan = (fromId: string, rel: DropRelation[] | undefined) =>
      rel?.forEach((r) => r.to === current.id && !out.some((o) => o.to === fromId) && incoming.push({ ...r, to: fromId, dir: 'in' }));
    drop.editions.forEach((e) => e.items.forEach((i) => scan(i.id, i.related)));
    drop.nodes.forEach((n) => scan(n.id, n.related));
    return [...out, ...incoming];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, drop.editions, drop.nodes]);

  if (!current) return null;
  const maxDepth = 6;
  const visited = new Set(trail);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Follow the thread"
        className="pb-safe max-h-[92dvh] w-full max-w-xl animate-rise overflow-y-auto border border-line bg-ink2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-ink2 px-5 py-3">
          <p className="label">Follow the thread · 糸をたどる</p>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="p-5">
          <nav aria-label="Trail" className="mb-4 flex flex-wrap items-center gap-1 font-mono text-[11px] text-muted">
            {trail.map((id, i) => (
              <span key={id} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden>→</span>}
                <button type="button" className={i === trail.length - 1 ? 'text-paper' : 'hover:text-paper'} onClick={() => setTrail(trail.slice(0, i + 1))}>
                  {entity(id)?.title ?? id}
                </button>
              </span>
            ))}
          </nav>
          <p className="label">
            {current.kind}
            {current.year && ` · ${current.year}`}
          </p>
          <h3 className="display mt-1 text-4xl">{current.title}</h3>
          <p className="mt-2 text-paper/85">{current.summary}</p>
          {/* Thread nodes and items come from the published drop.json; the build validates their URLs as https,
              and the link is still only rendered when it passes the app's URL safety check. */}
          {isSafeUrl(current.url) && (
            <a href={current.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm hover:text-rust">
              <ArrowUpRight size={13} aria-hidden /> {hostname(current.url)}
            </a>
          )}
          {trail.length > 1 && (
            <button type="button" className="btn mt-4" onClick={() => setTrail([trail[0]])}>
              <ArrowLeft size={14} aria-hidden /> Back to the article
            </button>
          )}
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {links.map((l) => {
              const target = entity(l.to);
              if (!target) return null;
              const seen = visited.has(l.to);
              const tooDeep = trail.length >= maxDepth;
              return (
                <li key={`${l.dir}-${l.to}`} className="py-3">
                  <p className="label flex flex-wrap gap-x-2">
                    <span className={l.basis === 'fact' ? 'text-paper' : 'text-rust'}>{l.basis === 'fact' ? 'Documented' : 'Our pick'}</span>
                    <span>· {l.dir === 'out' ? l.relation : `${l.relation} (from ${target.title})`}</span>
                  </p>
                  {seen || tooDeep ? (
                    <p className="display mt-1 text-2xl text-muted">
                      {target.title} {seen && <span className="font-mono text-[10px] uppercase">· already on your trail</span>}
                    </p>
                  ) : (
                    <button type="button" className="display mt-1 text-left text-2xl hover:text-rust" onClick={() => setTrail([...trail, l.to])}>
                      {target.title} →
                    </button>
                  )}
                  <p className="mt-1 text-sm text-muted">{l.note}</p>
                </li>
              );
            })}
            {links.length === 0 && <li className="py-3 text-sm text-muted">The thread ends here — for now.</li>}
          </ul>
          {trail.length >= maxDepth && <p className="mt-3 text-xs text-muted">That’s a long way from where you started. Head back to the article whenever you like.</p>}
          {!current.isItem && (
            <p className="mt-4 text-xs text-muted">This stop is part of the thread library, not a full article — open its link to go further.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Editorial desk: import, validate, preview ───────────────────────
function EditorialDesk({ onClose }: { onClose: () => void }) {
  const drop = useDrop();
  const { data, setSettings, notify } = useStore();
  const [notes, setNotes] = useState(data.settings.readerNotes);
  const [text, setText] = useState('');
  const [result, setResult] = useState<(ValidationResult & { edition?: DropEdition }) | null>(null);
  const [leads, setLeads] = useState<{ generatedAt: string; candidates: { id: string; feedName: string; column: string; title: string; url: string; published?: string; linkOk: boolean }[] } | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/candidates.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setLeads)
      .catch(() => setLeads(null));
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const ctx = {
    knownImages: new Set(IMAGES.map((i) => i.id)),
    knownPlaces: new Set(SEED_PLACES.map((p) => p.id)),
    knownCommunities: new Set(COMMUNITIES.map((c) => c.id)),
  };

  const check = (raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setResult({ errors: [{ path: '', message: `Not valid JSON: ${(e as Error).message}` }], warnings: [] });
      return;
    }
    const r = validateEdition(parsed, ctx);
    const ed = parsed as DropEdition;
    if (drop.editions.some((x) => x.issue === ed.issue) && !r.errors.length)
      r.warnings.push({ path: 'issue', message: `issue ${ed.issue} is already published — publishing this will replace it (use corrections[] for fixes)` });
    setResult({ ...r, edition: r.errors.length ? undefined : ed });
  };

  return (
    <section className="card mb-8 p-5" aria-label="Editorial desk">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="label">Editorial desk</p>
          <p className="mt-1 max-w-2xl text-sm text-paper/85">
            Paste or upload an edition JSON (e.g. one prepared by an AI research assistant) to validate it and preview it on this device. To publish,
            add the file to <code className="font-mono">content/drop/editions/</code> in the repository — the guide explains the one-minute way to do
            that from the GitHub website.
          </p>
          <a href={GITHUB_EDITORIAL} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm hover:text-rust">
            <ArrowUpRight size={13} aria-hidden /> EDITORIAL.md
          </a>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close desk">
          <X size={18} aria-hidden />
        </button>
      </div>
      <details className="mt-5 border-y border-line py-4">
        <summary className="label cursor-pointer">Prepare issue {drop.next.issue} with an assistant</summary>
        <p className="mt-3 max-w-2xl text-sm text-paper/85">
          Your reader notes — favorite artists, games, films, eras — make the assistant’s picks personal. They stay on your devices and in your
          private sync repo, and are added to the prompt only when you copy it. They are never part of the public site.
        </p>
        <label className="mt-3 block">
          <span className="label mb-1 block">Reader notes (private)</span>
          <textarea
            className="input min-h-[120px] text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== data.settings.readerNotes && setSettings({ readerNotes: notes.slice(0, 6000) })}
            placeholder="Music: … · Games: … · Anime & manga: … · Film: … · Eras I love: …"
          />
        </label>
        <button
          type="button"
          className="btn mt-3"
          onClick={async () => {
            if (notes !== data.settings.readerNotes) setSettings({ readerNotes: notes.slice(0, 6000) });
            const prompt = buildAssistantPrompt({ issue: drop.next.issue, publishDate: drop.next.publishDate, notes });
            try {
              await navigator.clipboard.writeText(prompt);
              notify('Prompt copied — attach the schema and an example edition');
            } catch {
              setText(prompt);
              notify('Couldn’t copy — the prompt is in the box below');
            }
          }}
        >
          <Copy size={14} aria-hidden /> Copy prompt for issue {drop.next.issue} · {formatYmd(drop.next.publishDate)}
        </button>
      </details>
      <textarea
        className="input mt-4 min-h-[160px] font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{ "schemaVersion": 1, "issue": 9, … }'
        aria-label="Edition JSON"
        spellCheck={false}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => check(text)} disabled={!text.trim()}>
          Validate
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={14} aria-hidden /> Upload .json
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              const t = await f.text();
              setText(t);
              check(t);
            }
          }}
        />
        {drop.previews.length > 0 && (
          <button type="button" className="btn-ghost text-sm" onClick={() => drop.setPreviews([])}>
            Clear {drop.previews.length} preview{drop.previews.length > 1 ? 's' : ''}
          </button>
        )}
      </div>
      {leads && leads.candidates.length > 0 && (
        <details className="mt-5 border-t border-line pt-4">
          <summary className="label cursor-pointer">Unreviewed leads from feeds · {leads.candidates.length} (research starting points, never auto-published)</summary>
          <ul className="mt-3 divide-y divide-line text-sm">
            {leads.candidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 hover:text-rust">
                  {c.title}
                </a>
                <span className="font-mono text-[10px] text-muted">
                  {c.feedName} · {c.column}
                  {c.published && ` · ${c.published.slice(0, 10)}`}
                  {!c.linkOk && ' · link didn’t respond'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {result && (
        <div className="mt-4 text-sm" role="status">
          {result.errors.length === 0 ? (
            <p className="text-paper">✓ Valid edition{result.warnings.length ? ` with ${result.warnings.length} note(s)` : ''}.</p>
          ) : (
            <p className="text-rust">✗ {result.errors.length} problem(s) to fix before it can publish:</p>
          )}
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {result.errors.map((e, i) => (
              <li key={`e${i}`} className="text-rust">
                {e.path || 'edition'} — {e.message}
              </li>
            ))}
            {result.warnings.map((w, i) => (
              <li key={`w${i}`} className="text-muted">
                note: {w.path} — {w.message}
              </li>
            ))}
          </ul>
          {result.edition && (
            <button
              type="button"
              className="btn mt-3"
              onClick={() => {
                drop.setPreviews([result.edition!, ...drop.previews.filter((p) => p.issue !== result.edition!.issue)]);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Preview it here
            </button>
          )}
        </div>
      )}
    </section>
  );
}
