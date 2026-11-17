// Verbatim copy of src/utils/sync.ts from main 7a69ad8 (the version before PP-008), imports re-pointed.
// Used only to test old-client ↔ new-client compatibility. Do not edit.
/**
 * Sync engine — pure functions, no network.
 *
 * Personal data is flattened into small "entries" (one per saved item, note,
 * favorite, place note, …). Every change gets a timestamp, and every deletion
 * leaves a tombstone, so two devices can merge without losing edits and without
 * deleted things coming back.
 */
import { SEED_INTERESTS } from '../../../src/data/interests.ts';
import type { PersonalData } from '../../../src/types/index.ts';
import { EMPTY_DATA, normalizeData } from '../../../src/utils/storage.ts';

export type Entries = Record<string, unknown>;

export interface SyncMeta {
  /** key → ms timestamp of the last change made to that entry. */
  stamps: Record<string, number>;
  /** key → ms timestamp of deletion. */
  tombs: Record<string, number>;
}

export interface RemoteFile {
  app: 'personal-playground';
  format: 1;
  updatedAt: string;
  entries: Entries;
  meta: SyncMeta;
}

export const EMPTY_META: SyncMeta = { stamps: {}, tombs: {} };
const TOMB_TTL = 180 * 24 * 60 * 60 * 1000;

const LISTS = ['saved', 'customExperiences', 'customPlaces', 'websites', 'fieldNotes', 'customPresets'] as const;

// ─── Flatten / rebuild ───────────────────────────────────────────────
export function toEntries(d: PersonalData): Entries {
  const e: Entries = {};
  for (const list of LISTS) for (const item of d[list] as { id: string }[]) e[`${list}:${item.id}`] = item;
  if (d.interests) {
    e['interests:__custom'] = true;
    d.interests.forEach((i, idx) => (e[`interests:${i.id}`] = { ...i, _order: idx }));
  }
  for (const id of d.favorites) e[`favorites:${id}`] = true;
  for (const id of d.hiddenWebsiteIds) e[`hidden:${id}`] = true;
  for (const [id, note] of Object.entries(d.placeNotes)) if (note) e[`placeNotes:${id}`] = note;
  for (const [key, fb] of Object.entries(d.feedback)) e[`feedback:${key}`] = fb;
  e.settings = d.settings;
  return e;
}

export function fromEntries(e: Entries): PersonalData {
  const d: PersonalData = structuredClone(EMPTY_DATA);
  const interests: (PersonalData['interests'] & object)[number][] = [];
  const orders = new Map<string, number>();
  for (const [key, value] of Object.entries(e)) {
    const i = key.indexOf(':');
    const kind = i < 0 ? key : key.slice(0, i);
    const id = i < 0 ? '' : key.slice(i + 1);
    if ((LISTS as readonly string[]).includes(kind)) (d[kind as (typeof LISTS)[number]] as unknown[]).push(value);
    else if (kind === 'interests' && id !== '__custom') {
      const { _order, ...rest } = value as { _order?: number } & Record<string, unknown>;
      interests.push(rest as never);
      orders.set(id, typeof _order === 'number' ? _order : Number.MAX_SAFE_INTEGER);
    } else if (kind === 'favorites') d.favorites.push(id);
    else if (kind === 'hidden') d.hiddenWebsiteIds.push(id);
    else if (kind === 'placeNotes') d.placeNotes[id] = String(value);
    else if (kind === 'feedback') d.feedback[id] = value as PersonalData['feedback'][string];
    else if (key === 'settings') d.settings = value as PersonalData['settings'];
  }
  if (e['interests:__custom']) d.interests = interests.sort((a, b) => (orders.get(a.id) ?? 0) - (orders.get(b.id) ?? 0));
  d.saved.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  d.fieldNotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return normalizeData(d);
}

// ─── Change tracking ────────────────────────────────────────────────
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Record which entries changed between two snapshots. Returns updated meta. */
export function stampChanges(prev: Entries, next: Entries, meta: SyncMeta, now = Date.now()): SyncMeta {
  const stamps = { ...meta.stamps };
  const tombs = { ...meta.tombs };
  let changed = false;
  for (const [k, v] of Object.entries(next)) {
    if (!(k in prev) || !same(prev[k], v)) {
      stamps[k] = now;
      delete tombs[k];
      changed = true;
    }
  }
  for (const k of Object.keys(prev)) {
    if (!(k in next)) {
      tombs[k] = now;
      delete stamps[k];
      changed = true;
    }
  }
  // Turning custom interests off (back to defaults) must also delete each interest entry remotely —
  // handled naturally above because those keys disappear.
  return changed ? { stamps, tombs } : meta;
}

// ─── Merge ──────────────────────────────────────────────────────────
/**
 * Merge two replicas entry-by-entry: the most recent change wins, whether that
 * change was an edit or a deletion. Entries a side has never seen are adopted.
 */
export function mergeReplicas(
  local: { entries: Entries; meta: SyncMeta },
  remote: { entries: Entries; meta: SyncMeta },
  now = Date.now(),
): { entries: Entries; meta: SyncMeta } {
  const keys = new Set([
    ...Object.keys(local.entries),
    ...Object.keys(remote.entries),
    ...Object.keys(local.meta.tombs),
    ...Object.keys(remote.meta.tombs),
  ]);
  const entries: Entries = {};
  const stamps: Record<string, number> = {};
  const tombs: Record<string, number> = {};

  const version = (side: typeof local, k: string) => {
    if (k in side.entries) return { t: side.meta.stamps[k] ?? 0, alive: true, value: side.entries[k] };
    if (k in side.meta.tombs) return { t: side.meta.tombs[k], alive: false, value: undefined };
    return null; // never seen on this side
  };

  for (const k of keys) {
    const l = version(local, k);
    const r = version(remote, k);
    const win = !l ? r! : !r ? l : r.t > l.t ? r : l; // ties keep local
    if (win.alive) {
      entries[k] = win.value;
      if (win.t) stamps[k] = win.t;
    } else if (now - win.t < TOMB_TTL) {
      tombs[k] = win.t;
    }
  }
  return { entries, meta: { stamps, tombs } };
}

export function isRemoteFile(v: unknown): v is RemoteFile {
  const o = v as RemoteFile;
  return Boolean(o && o.app === 'personal-playground' && o.format === 1 && o.entries && o.meta?.stamps && o.meta?.tombs);
}

/** Seed interests are implicit; materialize them so edits merge cleanly on a device that never edited them. */
export function withDefaultInterests(d: PersonalData): PersonalData {
  return d.interests ? d : { ...d, interests: SEED_INTERESTS };
}

/** The entries used for syncing: default interests are made explicit first. */
export function syncEntries(d: PersonalData): Entries {
  return toEntries(withDefaultInterests(d));
}

// ─── Local persistence of sync metadata ─────────────────────────────
const META_KEY = 'personal-playground:sync-meta';

export function loadMeta(): SyncMeta {
  try {
    const v = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as SyncMeta | null;
    return v && v.stamps && v.tombs ? v : EMPTY_META;
  } catch {
    return EMPTY_META;
  }
}

export function saveMeta(m: SyncMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
