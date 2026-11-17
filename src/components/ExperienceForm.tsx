import { useState, type FormEvent } from 'react';
import type { Company, Energy, Environment, Experience, Mood } from '../types';
import { COMPANY_LABEL, ENVIRONMENT_LABEL, MOOD_LABEL } from '../utils/labels';
import { Field } from './ui';

type Draft = Omit<Experience, 'id' | 'custom'>;

function MultiChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, string>;
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="label mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(options) as T[]).map((k) => (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={value.includes(k)}
            onClick={() => onChange(value.includes(k) ? value.filter((v) => v !== k) : [...value, k])}
          >
            {options[k]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ExperienceForm({ onSubmit, onCancel }: { onSubmit: (d: Draft) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activities, setActivities] = useState('');
  const [costMin, setCostMin] = useState('0');
  const [costMax, setCostMax] = useState('0');
  const [durMin, setDurMin] = useState('60');
  const [durMax, setDurMax] = useState('120');
  const [energy, setEnergy] = useState<Energy>('low');
  const [moods, setMoods] = useState<Mood[]>(['relax']);
  const [company, setCompany] = useState<Company[]>(['solo']);
  const [envs, setEnvs] = useState<Environment[]>(['home']);
  const [interests, setInterests] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give it a name.');
    if (!moods.length || !company.length || !envs.length) return setError('Pick at least one mood, company and place.');
    const n = (s: string) => Math.max(0, Math.round(Number(s) || 0));
    const cMin = n(costMin);
    const dMin = Math.max(5, n(durMin));
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      activities: activities
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean),
      cost: { min: cMin, max: Math.max(cMin, n(costMax)) },
      duration: { min: dMin, max: Math.max(dMin, n(durMax)) },
      energy,
      moods,
      company,
      environments: envs,
      interests: interests
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean),
    });
  };

  return (
    <form onSubmit={submit}>
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Description">
        <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Suggested activities" hint="One per line.">
        <textarea className="input min-h-[90px]" value={activities} onChange={(e) => setActivities(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cost from ($)">
          <input className="input" inputMode="numeric" value={costMin} onChange={(e) => setCostMin(e.target.value)} />
        </Field>
        <Field label="Cost up to ($)">
          <input className="input" inputMode="numeric" value={costMax} onChange={(e) => setCostMax(e.target.value)} />
        </Field>
        <Field label="Minutes from">
          <input className="input" inputMode="numeric" value={durMin} onChange={(e) => setDurMin(e.target.value)} />
        </Field>
        <Field label="Minutes up to">
          <input className="input" inputMode="numeric" value={durMax} onChange={(e) => setDurMax(e.target.value)} />
        </Field>
      </div>
      <MultiChips label="Energy" options={{ low: 'Low', medium: 'Medium', high: 'High' } as Record<Energy, string>} value={[energy]} onChange={(v) => v.length && setEnergy(v[v.length - 1])} />
      <MultiChips label="Mood" options={MOOD_LABEL} value={moods} onChange={setMoods} />
      <MultiChips label="Company" options={COMPANY_LABEL} value={company} onChange={setCompany} />
      <MultiChips label="Where" options={ENVIRONMENT_LABEL} value={envs} onChange={setEnvs} />
      <Field label="Interest tags" hint="Comma separated.">
        <input className="input" value={interests} onChange={(e) => setInterests(e.target.value)} />
      </Field>
      {error && (
        <p className="mb-3 text-sm text-rust" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1">
          Add experience
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
