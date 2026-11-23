import { useId } from 'react';
import { useAtmosphere } from '../hooks/useAtmosphere';
import { ATMOSPHERES, type AtmosphereChoice } from '../utils/atmosphere';

/**
 * The atmosphere selector: Auto, Morning, Afternoon, After hours. Native radio buttons (arrow
 * keys move between them) styled as surface-aware chips, so it reads correctly on any surface.
 */
export function AtmospherePicker({ className = '' }: { className?: string }) {
  const { choice, atmosphere, choose } = useAtmosphere();
  const name = useId();
  const current = ATMOSPHERES.find((a) => a.id === atmosphere)!;
  const options: { id: AtmosphereChoice; label: string; title: string }[] = [
    { id: 'auto', label: 'Auto', title: `Follows your clock (now ${current.label.toLowerCase()})` },
    ...ATMOSPHERES.map((a) => ({ id: a.id, label: a.label, title: a.hours })),
  ];
  return (
    <fieldset className={`min-w-0 ${className}`} data-atmosphere-picker="">
      <legend className="ui-label mb-1.5">Atmosphere</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.id} title={o.title} className="relative">
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={choice === o.id}
              onChange={() => choose(o.id)}
              className="peer absolute inset-0 cursor-pointer opacity-0"
            />
            <span className="atmos-chip">
              {o.label}
              {o.id === 'auto' && choice === 'auto' && <span className="ml-1 normal-case tracking-normal">({current.label.toLowerCase()})</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
