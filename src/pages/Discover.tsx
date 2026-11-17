import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Plus, RotateCcw, Shuffle, Trash2 } from 'lucide-react';
import { ExperienceCard, ExperienceTile } from '../components/ExperienceCard';
import { ExperienceForm } from '../components/ExperienceForm';
import { ChipGroup, Empty, Modal, SearchBox, SectionHeader } from '../components/ui';
import { useStore } from '../hooks/useStore';
import type { DiscoveryFilters, Experience } from '../types';
import {
  DEFAULT_FILTERS,
  activeFilterKeys,
  filterExperiences,
  filtersSignature,
  pickExperience,
  suggestPairRelaxation,
  suggestRelaxations,
} from '../utils/discovery';
import { FILTER_GROUPS, optionLabel } from '../utils/labels';
import { includesText } from '../utils/helpers';
import { loadSeen, saveSeen } from '../utils/storage';

const FILTER_SESSION_KEY = 'personal-playground:filters';

function loadFilters(): DiscoveryFilters {
  try {
    const s = sessionStorage.getItem(FILTER_SESSION_KEY);
    return s ? { ...DEFAULT_FILTERS, ...(JSON.parse(s) as Partial<DiscoveryFilters>) } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

export default function Discover({ params }: { params: URLSearchParams }) {
  const { experiences, addExperience, deleteExperience, notify } = useStore();
  const [filters, setFilters] = useState<DiscoveryFilters>(loadFilters);
  const [current, setCurrent] = useState<Experience | null>(null);
  const [pickCount, setPickCount] = useState(0);
  const [noMatch, setNoMatch] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const catalogueRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (params.get('q')) {
      setQuery(params.get('q') ?? '');
      requestAnimationFrame(() => catalogueRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }, [params]);
  const seenRef = useRef<Record<string, string[]>>(loadSeen());
  const resultRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => filterExperiences(experiences, filters), [experiences, filters]);
  const active = activeFilterKeys(filters);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_SESSION_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  const generate = useCallback(
    (f: DiscoveryFilters = filters, scroll = true) => {
      const candidates = filterExperiences(experiences, f);
      if (candidates.length === 0) {
        setCurrent(null);
        setNoMatch(true);
        return;
      }
      const sig = filtersSignature(f);
      const { pick, seen, cycled } = pickExperience(candidates, seenRef.current[sig] ?? [], current?.id ?? null);
      seenRef.current = { ...seenRef.current, [sig]: seen };
      saveSeen(seenRef.current);
      setNoMatch(false);
      setCurrent(pick);
      setPickCount((c) => c + 1);
      if (cycled && candidates.length > 1) notify(`You've seen all ${candidates.length} — starting fresh`);
      if (scroll) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
    [experiences, filters, current, notify],
  );

  // Deep links: #/discover?exp=<id> shows a specific card; ?surprise=1 rolls immediately.
  const handledParams = useRef<string | null>(null);
  useEffect(() => {
    const key = params.toString();
    if (handledParams.current === key) return;
    handledParams.current = key;
    const expId = params.get('exp');
    if (expId) {
      const found = experiences.find((e) => e.id === expId);
      if (found) {
        setCurrent(found);
        setNoMatch(false);
      }
    } else if (params.get('surprise')) {
      setFilters(DEFAULT_FILTERS);
      generate(DEFAULT_FILTERS, false);
    }
  }, [params, experiences, generate]);

  const setFilter = <K extends keyof DiscoveryFilters>(key: K, value: DiscoveryFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setNoMatch(false);
  };

  const relax = (key: keyof DiscoveryFilters) => {
    const next = { ...filters, [key]: DEFAULT_FILTERS[key] };
    setFilters(next);
    generate(next);
  };

  const clear = () => {
    setFilters(DEFAULT_FILTERS);
    setNoMatch(false);
  };

  const relaxations = noMatch ? suggestRelaxations(experiences, filters) : [];
  const pair = noMatch && relaxations.length === 0 ? suggestPairRelaxation(experiences, filters) : null;
  const catalogue = experiences.filter((e) =>
    includesText([e.name, e.description, ...e.interests, ...e.activities], query),
  );

  return (
    <div>
      <SectionHeader
        number="01"
        title="Discovery Engine"
        jp="発見装置"
        blurb="Set as many or as few dials as you like. Every filter is optional — leave them all alone for a pure surprise."
      />

      <section aria-label="Filters" className="card p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {FILTER_GROUPS.map((g) => (
            <ChipGroup
              key={g.key}
              label={g.title}
              number={g.number}
              options={g.options}
              value={filters[g.key]}
              onChange={(v) => setFilter(g.key, v as never)}
            />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
          <button type="button" className="btn-primary sm:min-w-[240px]" onClick={() => generate()}>
            <Dices size={18} aria-hidden /> {pickCount ? 'Generate another' : 'What sounds good?'}
          </button>
          <button type="button" className="btn" onClick={clear} disabled={active.length === 0}>
            <RotateCcw size={14} aria-hidden /> Clear filters
          </button>
          <p className="label sm:ml-auto" aria-live="polite">
            {matches.length} {matches.length === 1 ? 'experience fits' : 'experiences fit'}
          </p>
        </div>
      </section>

      <div ref={resultRef} className="scroll-mt-20 pt-8">
        {noMatch && (
          <div className="card animate-rise p-5 sm:p-7" role="status">
            <p className="label mb-2 text-rust">No exact match</p>
            <h2 className="display text-3xl">Nothing fits all six dials.</h2>
            <p className="mt-2 text-muted">Loosen one filter? Here’s what each would open up:</p>
            {relaxations.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {relaxations.map((r) => (
                  <li key={r.key}>
                    <button type="button" className="btn" onClick={() => relax(r.key)}>
                      Drop “{optionLabel(r.key, filters[r.key])}” · {r.count}
                    </button>
                  </li>
                ))}
              </ul>
            ) : pair ? (
              <div className="mt-4">
                <p className="mb-2 text-sm text-muted">No single change is enough. Loosening two would work:</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const next = { ...filters, [pair.keys[0]]: DEFAULT_FILTERS[pair.keys[0]], [pair.keys[1]]: DEFAULT_FILTERS[pair.keys[1]] };
                    setFilters(next);
                    generate(next);
                  }}
                >
                  Drop “{optionLabel(pair.keys[0], filters[pair.keys[0]])}” + “{optionLabel(pair.keys[1], filters[pair.keys[1]])}” · {pair.count}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-muted">This combination is a tough one — try clearing a few filters.</p>
            )}
            <button type="button" className="btn mt-4" onClick={clear}>
              <RotateCcw size={14} aria-hidden /> Clear all filters
            </button>
          </div>
        )}

        {current && (
          <ExperienceCard
            key={`${current.id}-${pickCount}`}
            exp={current}
            index={String(pickCount || 1).padStart(2, '0')}
            footer={
              <button type="button" className="btn" onClick={() => generate()}>
                <Shuffle size={16} aria-hidden /> Another one
              </button>
            }
          />
        )}

        {!current && !noMatch && (
          <Empty>
            <p className="display text-3xl text-paper">What sounds good today?</p>
            <p className="mt-2">Press the button. Nothing is mandatory.</p>
          </Empty>
        )}
      </div>

      <section ref={catalogueRef} className="mt-14 scroll-mt-20" aria-labelledby="catalogue-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <div>
            <p className="label">The full catalogue · 目録</p>
            <h2 id="catalogue-title" className="display text-4xl">
              All experiences
            </h2>
          </div>
          <button type="button" className="btn" onClick={() => setFormOpen(true)}>
            <Plus size={16} aria-hidden /> Add your own
          </button>
        </div>
        <div className="mb-4 max-w-md">
          <SearchBox value={query} onChange={setQuery} placeholder="Search experiences, tags, activities" />
        </div>
        {catalogue.length === 0 ? (
          <Empty>No experiences match “{query}”.</Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalogue.map((e) => (
              <li key={e.id} className="relative">
                <ExperienceTile
                  exp={e}
                  onOpen={() => {
                    setCurrent(e);
                    setNoMatch(false);
                    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }));
                  }}
                />
                {e.custom && (
                  <button
                    type="button"
                    className="btn-ghost absolute right-1 top-1"
                    aria-label={`Delete ${e.name}`}
                    onClick={() => {
                      if (confirm(`Delete “${e.name}”?`)) {
                        deleteExperience(e.id);
                        if (current?.id === e.id) setCurrent(null);
                      }
                    }}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New experience">
        <ExperienceForm
          onCancel={() => setFormOpen(false)}
          onSubmit={(d) => {
            const created = addExperience(d);
            setFormOpen(false);
            setCurrent(created);
            requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }));
          }}
        />
      </Modal>
    </div>
  );
}
