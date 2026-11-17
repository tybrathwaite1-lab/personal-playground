import type { PersonalData } from '../types';

export const STORAGE_KEY = 'personal-playground:v1';
export const SEEN_KEY = 'personal-playground:seen';

export const EMPTY_DATA: PersonalData = {
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
  settings: { showAutopilot: false },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Accept partial / older data and fill in anything missing. Never throws. */
export function normalizeData(raw: unknown): PersonalData {
  if (!isObj(raw)) return { ...EMPTY_DATA };
  const settings = isObj(raw.settings) ? raw.settings : {};
  return {
    version: 1,
    saved: arr(raw.saved),
    favorites: arr<string>(raw.favorites).filter((x) => typeof x === 'string'),
    placeNotes: isObj(raw.placeNotes) ? (raw.placeNotes as Record<string, string>) : {},
    customExperiences: arr(raw.customExperiences),
    customPlaces: arr(raw.customPlaces),
    websites: arr(raw.websites),
    hiddenWebsiteIds: arr<string>(raw.hiddenWebsiteIds),
    interests: Array.isArray(raw.interests) ? (raw.interests as PersonalData['interests']) : null,
    fieldNotes: arr(raw.fieldNotes),
    settings: { showAutopilot: settings.showAutopilot === true },
  };
}

export function loadData(): PersonalData {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? normalizeData(JSON.parse(s)) : { ...EMPTY_DATA };
  } catch {
    return { ...EMPTY_DATA };
  }
}

export function saveData(data: PersonalData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSeen(): Record<string, string[]> {
  try {
    const s = localStorage.getItem(SEEN_KEY);
    const v: unknown = s ? JSON.parse(s) : {};
    return isObj(v) ? (v as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export function saveSeen(seen: Record<string, string[]>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* non-essential */
  }
}

// ─── Backup ──────────────────────────────────────────────────────────
export interface BackupFile {
  app: 'personal-playground';
  exportedAt: string;
  data: PersonalData;
}

export function buildBackup(data: PersonalData): BackupFile {
  return { app: 'personal-playground', exportedAt: new Date().toISOString(), data };
}

export function downloadBackup(data: PersonalData): void {
  const blob = new Blob([JSON.stringify(buildBackup(data), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `personal-playground-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseBackup(text: string): { ok: true; data: PersonalData } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (isObj(parsed) && parsed.app === 'personal-playground' && isObj(parsed.data)) {
    return { ok: true, data: normalizeData(parsed.data) };
  }
  // Also accept a bare data object.
  if (isObj(parsed) && parsed.version === 1) {
    return { ok: true, data: normalizeData(parsed) };
  }
  return { ok: false, error: 'This does not look like a Personal Playground backup.' };
}

/** Merge an import into existing data: union by id, imported entries win. */
export function mergeData(current: PersonalData, incoming: PersonalData): PersonalData {
  const byId = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const m = new Map(a.map((x) => [x.id, x]));
    b.forEach((x) => m.set(x.id, x));
    return [...m.values()];
  };
  return {
    version: 1,
    saved: byId(current.saved, incoming.saved),
    favorites: [...new Set([...current.favorites, ...incoming.favorites])],
    placeNotes: { ...current.placeNotes, ...incoming.placeNotes },
    customExperiences: byId(current.customExperiences, incoming.customExperiences),
    customPlaces: byId(current.customPlaces, incoming.customPlaces),
    websites: byId(current.websites, incoming.websites),
    hiddenWebsiteIds: [...new Set([...current.hiddenWebsiteIds, ...incoming.hiddenWebsiteIds])],
    interests: incoming.interests ?? current.interests,
    fieldNotes: byId(current.fieldNotes, incoming.fieldNotes),
    settings: { ...current.settings, ...incoming.settings },
  };
}
