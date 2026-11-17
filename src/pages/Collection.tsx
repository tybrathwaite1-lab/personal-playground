import { useState, type FormEvent } from 'react';
import { ArrowUpRight, NotebookPen, Plus, Trash2 } from 'lucide-react';
import { ChipGroup, Empty, Field, Modal, SearchBox, SectionHeader } from '../components/ui';
import { href } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';
import type { SavedItem, SavedKind } from '../types';
import { formatDate, hostname, includesText, isSafeUrl, normalizeUrl, uid } from '../utils/helpers';

const KINDS: { value: 'all' | SavedKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'experience', label: 'Experiences' },
  { value: 'place', label: 'Places' },
  { value: 'website', label: 'Websites' },
  { value: 'interest', label: 'Interests' },
  { value: 'discovery', label: 'Discoveries' },
  { value: 'plan', label: 'Plans' },
  { value: 'event', label: 'Events' },
  { value: 'community', label: 'Communities' },
  { value: 'drop', label: 'Weekly Drop' },
];

function linkFor(s: SavedItem): { href: string; external: boolean } | null {
  switch (s.kind) {
    case 'experience':
      return { href: href('discover', { exp: s.refId }), external: false };
    case 'place':
      return { href: href('local', { place: s.refId }), external: false };
    case 'interest':
      return { href: href('interests'), external: false };
    default:
      return isSafeUrl(s.url) ? { href: s.url, external: true } : null;
  }
}

function SavedRow({ item }: { item: SavedItem }) {
  const { removeSaved, updateSavedNote } = useStore();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note ?? '');
  const link = linkFor(item);

  return (
    <li className="border-b border-line py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="label mb-1">
            {KINDS.find((k) => k.value === item.kind)?.label.replace(/s$/, '')} · {formatDate(item.savedAt)}
          </p>
          {link ? (
            <a
              href={link.href}
              {...(link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              className="display inline-flex items-center gap-2 text-2xl hover:text-rust"
            >
              {item.title}
              {link.external && <ArrowUpRight size={16} aria-hidden />}
            </a>
          ) : (
            <p className="display text-2xl">{item.title}</p>
          )}
          {item.subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.subtitle}</p>}
          {item.url && item.kind === 'discovery' && <p className="font-mono text-xs text-muted">{hostname(item.url)}</p>}
          {!editing && item.note && <p className="mt-2 border-l-2 border-rust pl-3 text-sm italic text-paper/85">{item.note}</p>}
          {editing && (
            <div className="mt-2">
              <textarea
                className="input min-h-[70px] text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label={`Note for ${item.title}`}
                autoFocus
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    updateSavedNote(item.id, note.trim());
                    setEditing(false);
                  }}
                >
                  Save note
                </button>
                <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0">
          <button type="button" className="btn-ghost" aria-label={`Note on ${item.title}`} onClick={() => setEditing((e) => !e)}>
            <NotebookPen size={17} aria-hidden />
          </button>
          <button
            type="button"
            className="btn-ghost"
            aria-label={`Remove ${item.title}`}
            onClick={() => confirm(`Remove “${item.title}” from your collection?`) && removeSaved(item.id)}
          >
            <Trash2 size={17} aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

function DiscoveryForm({ onDone }: { onDone: () => void }) {
  const { toggleSave } = useStore();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const u = normalizeUrl(url);
    toggleSave({
      kind: 'discovery',
      refId: uid('disc'),
      title: title.trim(),
      note: note.trim() || undefined,
      url: isSafeUrl(u) ? u : undefined,
    });
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <Field label="What did you find?">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="Link (optional)">
        <input className="input" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Note (optional)">
        <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button type="submit" className="btn-primary w-full">
        Save discovery
      </button>
    </form>
  );
}

export default function Collection() {
  const { data } = useStore();
  const [kind, setKind] = useState<'all' | SavedKind>('all');
  const [q, setQ] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const results = data.saved.filter(
    (s) => (kind === 'all' || s.kind === kind) && includesText([s.title, s.subtitle, s.note, s.url], q),
  );

  return (
    <div>
      <SectionHeader
        number="06"
        title="My Collection"
        jp="収集品"
        blurb="Everything you’ve kept. No counts, no completion — just a shelf."
        actions={
          <button type="button" className="btn" onClick={() => setFormOpen(true)}>
            <Plus size={16} aria-hidden /> Add a discovery
          </button>
        }
      />

      <div className="mb-6 space-y-4">
        <SearchBox value={q} onChange={setQ} placeholder="Search your collection" />
        <ChipGroup label="Show" value={kind} onChange={setKind} options={KINDS} />
      </div>

      {data.saved.length === 0 ? (
        <Empty>
          <p className="display text-3xl text-paper">An empty shelf.</p>
          <p className="mt-2">
            Tap the bookmark on any experience, place or website. Or{' '}
            <a href={href('discover')} className="underline underline-offset-4">
              go find something
            </a>
            .
          </p>
        </Empty>
      ) : results.length === 0 ? (
        <Empty>Nothing matches.</Empty>
      ) : (
        <ul className="border-t border-line">
          {results.map((s) => (
            <SavedRow key={s.id} item={s} />
          ))}
        </ul>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New discovery">
        <DiscoveryForm onDone={() => setFormOpen(false)} />
      </Modal>
    </div>
  );
}
