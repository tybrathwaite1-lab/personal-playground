/**
 * Synthetic personal data for the browser tests. Nothing here is real: titles say "Sample",
 * and every working link points at example.org / example.com.
 */
export const CREATED = '2026-11-20T15:00:00.000Z';

export function note(id: string, title: string, url?: string, extra: Record<string, unknown> = {}) {
  return { id, title, category: 'Place', notes: `${title} — notes stay readable.`, tags: ['sample'], createdAt: CREATED, ...(url !== undefined ? { url } : {}), ...extra };
}

export function site(id: string, name: string, url: string) {
  return { id, name, url, category: 'Internet exploration', description: `${name} — description stays readable.`, tags: ['sample'], custom: true };
}

/** A custom experience that qualifies as a Plan a Day stop and has no place, so its first link shows. */
export function experience(id: string, name: string, mood: string, url: string) {
  return {
    id,
    name,
    description: `${name} — description stays readable.`,
    activities: ['sample'],
    cost: { min: 0, max: 0 },
    duration: { min: 60, max: 90 },
    energy: 'low',
    moods: [mood],
    company: ['solo', 'partner', 'friends'],
    environments: ['indoor', 'outdoors'],
    interests: [],
    links: [{ label: `${name} link label`, url }],
    custom: true,
  };
}

/** A complete current-format personal-data record. */
export function personal(parts: Record<string, unknown> = {}) {
  return {
    version: 1,
    saved: [],
    favorites: [],
    placeNotes: {},
    customExperiences: [],
    customPlaces: [],
    websites: [],
    hiddenWebsiteIds: [],
    interests: null,
    fieldNotes: [],
    feedback: {},
    customPresets: [],
    settings: { showAutopilot: false, weatherAware: true, location: null, radiusMiles: 10, transport: 'car', readerNotes: '' },
    ...parts,
  };
}

/** A backup file as the app exports it. */
export function backup(data: Record<string, unknown>) {
  return { app: 'personal-playground', exportedAt: CREATED, data };
}

/** Uploads `content` through the Backup page's file input. */
export function file(name: string, content: unknown) {
  return { name, mimeType: 'application/json', buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)) };
}
