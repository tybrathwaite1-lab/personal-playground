import { useMemo, useState, type FormEvent } from 'react';
import { Heart, Plus, RotateCcw } from 'lucide-react';
import { PlaceCard } from '../components/PlaceCard';
import { Empty, Field, Modal, SearchBox, SectionHeader, Select } from '../components/ui';
import { PLACE_CATEGORIES } from '../data/places';
import { useStore } from '../hooks/useStore';
import type { Place, PlaceCategory } from '../types';
import { includesText, normalizeUrl } from '../utils/helpers';

const BUDGETS: { value: 'any' | Place['budget']; label: string }[] = [
  { value: 'any', label: 'Any budget' },
  { value: 'free', label: 'Free' },
  { value: 'low', label: '$ — low' },
  { value: 'mid', label: '$$ — mid' },
  { value: 'high', label: '$$$ — splurge' },
  { value: 'unknown', label: 'Unknown cost' },
];

function PlaceForm({ onDone }: { onDone: () => void }) {
  const { addPlace } = useStore();
  const [f, setF] = useState({
    name: '',
    category: PLACE_CATEGORIES[0] as PlaceCategory,
    description: '',
    address: '',
    neighborhood: '',
    city: 'St. Petersburg',
    website: '',
    costNote: '',
    budget: 'unknown' as Place['budget'],
    interests: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    addPlace({
      name: f.name.trim(),
      categories: [f.category],
      description: f.description.trim(),
      address: f.address.trim() || undefined,
      neighborhood: f.neighborhood.trim() || f.city,
      city: f.city.trim(),
      website: normalizeUrl(f.website) || undefined,
      costNote: f.costNote.trim() || undefined,
      budget: f.budget,
      interests: f.interests.split(',').map((s) => s.trim()).filter(Boolean),
      status: 'verified',
      verifiedOn: new Date().toISOString().slice(0, 10),
      sourceNote: 'Added by you',
    });
    onDone();
  };
  return (
    <form onSubmit={submit}>
      <Field label="Name">
        <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required />
      </Field>
      <Field label="Category">
        <Select label="Category" value={f.category} onChange={(v) => set('category', v)} options={PLACE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
      </Field>
      <Field label="Description">
        <textarea className="input min-h-[70px]" value={f.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <Field label="Address">
        <input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Neighborhood">
          <input className="input" value={f.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
        </Field>
        <Field label="City">
          <input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
      </div>
      <Field label="Website">
        <input className="input" inputMode="url" value={f.website} onChange={(e) => set('website', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cost note">
          <input className="input" value={f.costNote} onChange={(e) => set('costNote', e.target.value)} placeholder="e.g. Free" />
        </Field>
        <Field label="Budget">
          <Select label="Budget" value={f.budget} onChange={(v) => set('budget', v)} options={BUDGETS.slice(1) as { value: Place['budget']; label: string }[]} />
        </Field>
      </div>
      <Field label="Interest tags" hint="Comma separated.">
        <input className="input" value={f.interests} onChange={(e) => set('interests', e.target.value)} />
      </Field>
      <button type="submit" className="btn-primary w-full">
        Add place
      </button>
    </form>
  );
}

export default function Local({ params }: { params: URLSearchParams }) {
  const { places, isFavorite } = useStore();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'all' | PlaceCategory>('all');
  const [hood, setHood] = useState('all');
  const [budget, setBudget] = useState<'any' | Place['budget']>('any');
  const [favOnly, setFavOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const highlight = params.get('place');

  const usedCategories = PLACE_CATEGORIES.filter((c) => places.some((p) => p.categories.includes(c)));
  const hoods = useMemo(() => [...new Set(places.map((p) => p.neighborhood))].sort(), [places]);

  const results = places.filter(
    (p) =>
      (category === 'all' || p.categories.includes(category)) &&
      (hood === 'all' || p.neighborhood === hood) &&
      (budget === 'any' || p.budget === budget) &&
      (!favOnly || isFavorite(p.id)) &&
      includesText([p.name, p.description, p.neighborhood, p.city, p.address, ...p.interests, ...p.categories], q),
  );
  const filtered = q || category !== 'all' || hood !== 'all' || budget !== 'any' || favOnly;
  const reset = () => {
    setQ('');
    setCategory('all');
    setHood('all');
    setBudget('any');
    setFavOnly(false);
  };

  return (
    <div>
      <SectionHeader
        number="03"
        title="Local Playground"
        jp="地元の遊び場"
        blurb="St. Petersburg & greater Tampa Bay. Verified entries were checked against published sources; anything flagged needs a quick confirm. Hours and prices always change — look before you go."
        actions={
          <button type="button" className="btn" onClick={() => setFormOpen(true)}>
            <Plus size={16} aria-hidden /> Add a place
          </button>
        }
      />

      <section aria-label="Filters" className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1.3fr_1fr_1fr_auto]">
        <SearchBox value={q} onChange={setQ} placeholder="Search places, interests, neighborhoods" />
        <Select
          label="Category"
          value={category}
          onChange={setCategory}
          options={[{ value: 'all' as const, label: 'All categories' }, ...usedCategories.map((c) => ({ value: c, label: c }))]}
        />
        <Select label="Neighborhood" value={hood} onChange={setHood} options={[{ value: 'all', label: 'All areas' }, ...hoods.map((h) => ({ value: h, label: h }))]} />
        <Select label="Budget" value={budget} onChange={setBudget} options={BUDGETS} />
        <button type="button" className="btn" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>
          <Heart size={14} aria-hidden className={favOnly ? 'fill-rust text-rust' : ''} /> Favorites
        </button>
      </section>

      <div className="mb-4 flex items-center justify-between">
        <p className="label" aria-live="polite">
          {results.length} of {places.length} places
        </p>
        {filtered && (
          <button type="button" className="btn-ghost text-xs" onClick={reset}>
            <RotateCcw size={14} aria-hidden /> Reset
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <Empty>{favOnly ? 'No favorites match yet — tap the heart on a place.' : 'Nothing matches those filters.'}</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.map((p) => (
            <li key={p.id} className="flex">
              <div className="w-full">
                <PlaceCard place={p} highlight={p.id === highlight} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Add a place">
        <PlaceForm onDone={() => setFormOpen(false)} />
      </Modal>
    </div>
  );
}
