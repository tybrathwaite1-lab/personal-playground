/**
 * Atmosphere (Creative Slice 01): the time-of-day look of the Editorial Cover. It changes
 * visual styling only — never data, routes, saved content, features or the order of anything.
 *
 *   Morning      06:00–10:59
 *   Afternoon    11:00–17:59
 *   After hours  18:00–05:59
 *
 * "Auto" follows the browser's local time. A manual choice is a per-device preference kept in
 * localStorage (not personal data: it isn't synced or part of backups) until Auto is chosen again.
 */
import type { SurfaceTone } from '../components/graphic/Surface';

export type Atmosphere = 'morning' | 'afternoon' | 'after-hours';
export type AtmosphereChoice = 'auto' | Atmosphere;

export const ATMOSPHERE_KEY = 'personal-playground:atmosphere';

export const ATMOSPHERES: { id: Atmosphere; label: string; hours: string }[] = [
  { id: 'morning', label: 'Morning', hours: '6–11 am' },
  { id: 'afternoon', label: 'Afternoon', hours: '11 am–6 pm' },
  { id: 'after-hours', label: 'After hours', hours: '6 pm–6 am' },
];

const CHOICES: readonly AtmosphereChoice[] = ['auto', 'morning', 'afternoon', 'after-hours'];
export const isChoice = (v: unknown): v is AtmosphereChoice => typeof v === 'string' && (CHOICES as readonly string[]).includes(v);

/** The atmosphere for a moment, by its local hour. */
export function atmosphereAt(d: Date): Atmosphere {
  const h = d.getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 18) return 'afternoon';
  return 'after-hours';
}

export const resolveAtmosphere = (choice: AtmosphereChoice, now: Date): Atmosphere => (choice === 'auto' ? atmosphereAt(now) : choice);

/** The stored choice; Auto when nothing (or anything unrecognised) is stored, or storage is unavailable. */
export function loadAtmosphereChoice(): AtmosphereChoice {
  try {
    const v = localStorage.getItem(ATMOSPHERE_KEY);
    return isChoice(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** Stores a manual choice; choosing Auto clears it. Storage failures are ignored (the choice still applies this session). */
export function saveAtmosphereChoice(choice: AtmosphereChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(ATMOSPHERE_KEY);
    else localStorage.setItem(ATMOSPHERE_KEY, choice);
  } catch {
    /* storage blocked: keep the choice in memory only */
  }
}

/** The tested surfaces each atmosphere paints: the cover, and the band that carries The Window. */
export const ATMOSPHERE_SURFACES: Record<Atmosphere, { cover: SurfaceTone; band: SurfaceTone }> = {
  morning: { cover: 'cream', band: 'orange' },
  afternoon: { cover: 'teal', band: 'cream' },
  'after-hours': { cover: 'editorial', band: 'teal' },
};
