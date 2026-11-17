import type { Familiarity, PersonalData } from '../types';

/** Has the person told us they know this already? */
export function isFamiliar(data: PersonalData, key: string, favoriteId?: string): boolean {
  const fb = data.feedback[key];
  return Boolean(fb?.been || fb?.enjoyed || fb?.familiar || (favoriteId && data.favorites.includes(favoriteId)));
}

export function isLiked(data: PersonalData, key: string, favoriteId?: string): boolean {
  const fb = data.feedback[key];
  return Boolean(fb?.enjoyed || fb?.want || fb?.more || (favoriteId && data.favorites.includes(favoriteId)));
}

export function isRejected(data: PersonalData, key: string): boolean {
  return Boolean(data.feedback[key]?.notInterested);
}

/**
 * Familiarity filter. "Not for me" items are always skipped; favorites are never
 * removed permanently — they're simply ranked lower in "new" mode rather than hidden
 * when nothing new is left.
 */
export function applyFamiliarity<T>(
  items: T[],
  mode: Familiarity,
  data: PersonalData,
  keyOf: (t: T) => string,
  favOf: (t: T) => string | undefined = () => undefined,
): T[] {
  const open = items.filter((t) => !isRejected(data, keyOf(t)));
  if (mode === 'mix') return open;
  if (mode === 'favorites') return open.filter((t) => isLiked(data, keyOf(t), favOf(t)));
  const fresh = open.filter((t) => !isFamiliar(data, keyOf(t), favOf(t)));
  return fresh.length ? fresh : open;
}
