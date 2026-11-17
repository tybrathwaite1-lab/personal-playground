import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Field, Modal, SaveButton, SectionHeader, Select } from '../components/ui';
import { INTEREST_CATEGORIES } from '../data/interests';
import { href } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';
import type { Interest, InterestCategory } from '../types';
import { uid } from '../utils/helpers';

const CATEGORY_OPTIONS = INTEREST_CATEGORIES.map((c) => ({ value: c.id, label: c.title }));

function AddInline({ onAdd }: { onAdd: (name: string) => void }) {
  const [v, setV] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (v.trim()) {
      onAdd(v.trim());
      setV('');
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder="Add an interest" aria-label="New interest name" />
      <button type="submit" className="btn shrink-0" aria-label="Add interest">
        <Plus size={16} aria-hidden />
      </button>
    </form>
  );
}

export default function Interests() {
  const { interests, setInterests, resetInterests, data, setShowAutopilot, experiences } = useStore();
  const [editing, setEditing] = useState<Interest | null>(null);
  const showAutopilot = data.settings.showAutopilot;

  const save = (list: Interest[]) => setInterests(list);
  const add = (category: InterestCategory, name: string) =>
    save([...interests, { id: uid('int'), name, category }]);
  const remove = (i: Interest) => {
    if (confirm(`Remove “${i.name}”?`)) save(interests.filter((x) => x.id !== i.id));
  };
  const countFor = (name: string) =>
    experiences.filter((e) => e.interests.some((t) => t.toLowerCase() === name.toLowerCase())).length;

  const visible = INTEREST_CATEGORIES.filter((c) => c.id !== 'autopilot' || showAutopilot);

  return (
    <div>
      <SectionHeader
        number="02"
        title="My Interests"
        jp="興味の索引"
        blurb="An index of what you’re into — and what you might be. Edit freely; it all stays on this device."
        actions={
          data.interests && (
            <button
              type="button"
              className="btn"
              onClick={() => confirm('Restore the original interest list? Your edits will be replaced.') && resetInterests()}
            >
              <RotateCcw size={14} aria-hidden /> Restore defaults
            </button>
          )
        }
      />

      <div className="space-y-12">
        {visible.map((cat) => {
          const items = interests.filter((i) => i.category === cat.id);
          const groups = [...new Set(items.map((i) => i.group ?? ''))];
          return (
            <section key={cat.id} aria-labelledby={`cat-${cat.id}`} className={cat.id === 'autopilot' ? 'opacity-90' : ''}>
              <div className="mb-3 grid grid-cols-1 gap-2 border-b border-line pb-3 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <p className="label">
                    <span className="text-rust">{cat.number}</span> · {items.length} entries
                  </p>
                  <h2 id={`cat-${cat.id}`} className="display text-4xl">
                    {cat.title}{' '}
                    <span className="font-jp text-base tracking-[0.2em] text-muted" lang="ja">
                      {cat.jp}
                    </span>
                  </h2>
                  <p className="mt-1 max-w-xl text-sm text-muted">{cat.blurb}</p>
                </div>
              </div>

              {groups.map((g) => (
                <div key={g || 'none'} className="mb-4">
                  {g && <p className="label mb-2 mt-4">{g}</p>}
                  <ul className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                    {items
                      .filter((i) => (i.group ?? '') === g)
                      .map((i) => {
                        const n = countFor(i.name);
                        return (
                          <li key={i.id} className="flex items-center gap-1 bg-ink pl-3">
                            <div className="min-w-0 flex-1 py-2.5">
                              <p className="truncate">{i.name}</p>
                              {i.note && <p className="truncate text-xs text-muted">{i.note}</p>}
                            </div>
                            {n > 0 && cat.id !== 'autopilot' && (
                              <a
                                href={href('discover', { q: i.name })}
                                className="btn-ghost text-xs"
                                aria-label={`${n} experiences for ${i.name}`}
                                title={`${n} related experiences`}
                              >
                                <Search size={14} aria-hidden />
                                <span className="font-mono">{n}</span>
                              </a>
                            )}
                            {cat.id !== 'autopilot' && (
                              <SaveButton kind="interest" refId={i.id} title={i.name} subtitle={cat.title} compact />
                            )}
                            <button type="button" className="btn-ghost" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)}>
                              <Pencil size={15} aria-hidden />
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
              {items.length === 0 && cat.id === 'autopilot' && (
                <p className="mb-2 text-sm text-muted">
                  Empty by design. Anything you add here stays private to this device and your backups.
                </p>
              )}
              <AddInline onAdd={(name) => add(cat.id, name)} />
            </section>
          );
        })}
      </div>

      <div className="mt-12 border-t border-line pt-5">
        <button type="button" className="btn" onClick={() => setShowAutopilot(!showAutopilot)} aria-pressed={showAutopilot}>
          {showAutopilot ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
          {showAutopilot ? 'Hide' : 'Show'} habit & autopilot reference
        </button>
        <p className="mt-2 text-xs text-muted">An optional, private reference list. Hidden by default.</p>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit interest">
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing.name.trim()) return;
              save(interests.map((i) => (i.id === editing.id ? { ...editing, name: editing.name.trim() } : i)));
              setEditing(null);
            }}
          >
            <Field label="Name">
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Category" hint="Move an interest between sections.">
              <Select
                label="Category"
                value={editing.category}
                options={CATEGORY_OPTIONS}
                onChange={(v) => setEditing({ ...editing, category: v, group: v === editing.category ? editing.group : undefined })}
              />
            </Field>
            <Field label="Note (optional)">
              <input className="input" value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1">
                Save
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const target = editing;
                  setEditing(null);
                  remove(target);
                }}
              >
                <Trash2 size={14} aria-hidden /> Remove
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
