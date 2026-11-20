import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ChipGroup, Empty, Field, Modal, SearchBox, SectionHeader, Select } from '../components/ui';
import { useStore } from '../hooks/useStore';
import type { FieldNote, FieldNoteCategory } from '../types';
import { formatDate, hostname, includesText, isSafeUrl, normalizeUrl } from '../utils/helpers';

export const NOTE_CATEGORIES: { value: FieldNoteCategory; hint: string }[] = [
  { value: 'Place', hint: 'Interesting places I found' },
  { value: 'Album', hint: 'Albums worth revisiting' },
  { value: 'Artist', hint: 'New artists' },
  { value: 'Game', hint: 'Games' },
  { value: 'Comics / manga', hint: 'Comics or manga' },
  { value: 'DIY idea', hint: 'DIY project ideas' },
  { value: 'Website', hint: 'Websites' },
  { value: 'Experience', hint: 'Experiences I enjoyed' },
  { value: 'Try again', hint: "Things I'd like to try again" },
];

type Draft = Omit<FieldNote, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

function NoteForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const { addFieldNote, updateFieldNote } = useStore();
  const [d, setD] = useState({ ...initial, tagText: initial.tags.join(', ') });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!d.title.trim()) return;
    const url = normalizeUrl(d.url ?? '');
    const note = {
      title: d.title.trim(),
      category: d.category,
      notes: d.notes?.trim() || undefined,
      url: isSafeUrl(url) ? url : undefined,
      tags: d.tagText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    };
    if (d.id && d.createdAt) updateFieldNote({ ...note, id: d.id, createdAt: d.createdAt });
    else addFieldNote(note);
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <Field label="Title">
        <input className="input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required />
      </Field>
      <Field label="Category">
        <Select<FieldNoteCategory>
          label="Category"
          value={d.category}
          onChange={(v) => setD({ ...d, category: v })}
          options={NOTE_CATEGORIES.map((c) => ({ value: c.value, label: `${c.value} — ${c.hint}` }))}
        />
      </Field>
      <Field label="Notes (optional)">
        <textarea className="input min-h-[90px]" value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </Field>
      <Field label="URL (optional)">
        <input className="input" inputMode="url" value={d.url ?? ''} onChange={(e) => setD({ ...d, url: e.target.value })} />
      </Field>
      <Field label="Tags (optional)" hint="Comma separated.">
        <input className="input" value={d.tagText} onChange={(e) => setD({ ...d, tagText: e.target.value })} />
      </Field>
      <button type="submit" className="btn-primary w-full">
        {d.id ? 'Save changes' : 'Add note'}
      </button>
    </form>
  );
}

export default function FieldNotes() {
  const { data, deleteFieldNote } = useStore();
  const [cat, setCat] = useState<'all' | FieldNoteCategory>('all');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);

  const notes = data.fieldNotes.filter(
    (n) =>
      (cat === 'all' || n.category === cat) &&
      (!tag || n.tags.includes(tag)) &&
      includesText([n.title, n.notes, n.url, ...n.tags], q),
  );

  return (
    <div>
      <SectionHeader
        number="07"
        title="Field Notes"
        jp="手帳"
        blurb="A pocket notebook for good finds. Write when something’s worth remembering — never because it’s been a while."
        actions={
          <button type="button" className="btn" onClick={() => setEditing({ title: '', category: 'Place', tags: [] })}>
            <Plus size={16} aria-hidden /> New note
          </button>
        }
      />

      <div className="mb-6 space-y-4">
        <SearchBox value={q} onChange={setQ} placeholder="Search notes" />
        <ChipGroup
          label="Category"
          value={cat}
          onChange={setCat}
          options={[{ value: 'all' as const, label: 'All' }, ...NOTE_CATEGORIES.map((c) => ({ value: c.value, label: c.value }))]}
        />
        {tag && (
          <button type="button" className="chip" aria-pressed onClick={() => setTag(null)}>
            #{tag} <X size={12} aria-hidden />
          </button>
        )}
      </div>

      {data.fieldNotes.length === 0 ? (
        <Empty>
          <p className="display text-3xl text-paper">Blank pages.</p>
          <p className="mt-2">An album, a mural, a game, a website — jot it down whenever you like.</p>
        </Empty>
      ) : notes.length === 0 ? (
        <Empty>No notes match.</Empty>
      ) : (
        <ul className="columns-1 gap-3 md:columns-2 xl:columns-3">
          {notes.map((n) => (
            <li key={n.id} className="card mb-3 break-inside-avoid p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="label">
                  <span className="text-rust">{n.category}</span> · {formatDate(n.createdAt)}
                </p>
                <div className="-mr-2 -mt-2 flex">
                  <button type="button" className="btn-ghost" aria-label={`Edit ${n.title}`} onClick={() => setEditing(n)}>
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label={`Delete ${n.title}`}
                    onClick={() => confirm(`Delete “${n.title}”?`) && deleteFieldNote(n.id)}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              </div>
              <h2 className="display mt-1 text-2xl">{n.title}</h2>
              {n.notes && <p className="mt-2 whitespace-pre-line text-sm text-paper/85">{n.notes}</p>}
              {isSafeUrl(n.url) && (
                <a href={n.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-rust">
                  <ArrowUpRight size={13} aria-hidden /> {hostname(n.url)}
                </a>
              )}
              {n.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {n.tags.map((t) => (
                    <button key={t} type="button" className="tag hover:text-paper" onClick={() => setTag(t)}>
                      #{t}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit note' : 'New field note'}>
        {editing && <NoteForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
