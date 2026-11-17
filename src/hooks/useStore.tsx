import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SEED_EXPERIENCES } from '../data/experiences';
import { SEED_INTERESTS } from '../data/interests';
import { SEED_PLACES } from '../data/places';
import { SEED_WEBSITES } from '../data/websites';
import type {
  Experience,
  FieldNote,
  Interest,
  PersonalData,
  Place,
  SavedItem,
  SavedKind,
  Website,
} from '../types';
import { uid } from '../utils/helpers';
import { EMPTY_DATA, STORAGE_KEY, loadData, mergeData, normalizeData, saveData } from '../utils/storage';

type SaveInput = Omit<SavedItem, 'id' | 'savedAt'>;

interface Store {
  data: PersonalData;
  experiences: Experience[];
  places: Place[];
  websites: Website[];
  interests: Interest[];
  storageOk: boolean;
  toast: string | null;
  notify: (msg: string) => void;

  isSaved: (kind: SavedKind, refId: string) => boolean;
  toggleSave: (item: SaveInput) => void;
  removeSaved: (id: string) => void;
  updateSavedNote: (id: string, note: string) => void;

  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  setPlaceNote: (id: string, note: string) => void;

  addExperience: (exp: Omit<Experience, 'id' | 'custom'>) => Experience;
  deleteExperience: (id: string) => void;
  addPlace: (place: Omit<Place, 'id' | 'custom'>) => void;
  deletePlace: (id: string) => void;
  upsertWebsite: (site: Omit<Website, 'id'> & { id?: string }) => void;
  removeWebsite: (id: string) => void;
  restoreWebsites: () => void;

  setInterests: (list: Interest[]) => void;
  resetInterests: () => void;

  addFieldNote: (note: Omit<FieldNote, 'id' | 'createdAt'>) => void;
  updateFieldNote: (note: FieldNote) => void;
  deleteFieldNote: (id: string) => void;

  setShowAutopilot: (v: boolean) => void;
  setSettings: (patch: Partial<PersonalData['settings']>) => void;
  replaceAll: (d: PersonalData) => void;
  mergeIn: (d: PersonalData) => void;
  resetAll: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PersonalData>(() => loadData());
  const [storageOk, setStorageOk] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setStorageOk(saveData(data));
  }, [data]);

  // Keep multiple open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setData(normalizeData(JSON.parse(e.newValue)));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const update = useCallback((fn: (d: PersonalData) => PersonalData) => setData((d) => fn(d)), []);

  const experiences = useMemo(() => [...SEED_EXPERIENCES, ...data.customExperiences], [data.customExperiences]);
  const places = useMemo(() => [...SEED_PLACES, ...data.customPlaces], [data.customPlaces]);
  const websites = useMemo(() => {
    const overrides = new Map(data.websites.map((w) => [w.id, w]));
    const seeded = SEED_WEBSITES.map((w) => overrides.get(w.id) ?? w);
    const seedIds = new Set(SEED_WEBSITES.map((w) => w.id));
    const custom = data.websites.filter((w) => !seedIds.has(w.id));
    return [...seeded, ...custom].filter((w) => !data.hiddenWebsiteIds.includes(w.id));
  }, [data.websites, data.hiddenWebsiteIds]);
  const interests = data.interests ?? SEED_INTERESTS;

  const store: Store = {
    data,
    experiences,
    places,
    websites,
    interests,
    storageOk,
    toast,
    notify,

    isSaved: (kind, refId) => data.saved.some((s) => s.kind === kind && s.refId === refId),
    toggleSave: (item) => {
      const exists = data.saved.some((s) => s.kind === item.kind && s.refId === item.refId);
      update((d) => ({
        ...d,
        saved: exists
          ? d.saved.filter((s) => !(s.kind === item.kind && s.refId === item.refId))
          : [{ ...item, id: uid('saved'), savedAt: new Date().toISOString() }, ...d.saved],
      }));
      notify(exists ? 'Removed from collection' : 'Saved to collection');
    },
    removeSaved: (id) => update((d) => ({ ...d, saved: d.saved.filter((s) => s.id !== id) })),
    updateSavedNote: (id, note) =>
      update((d) => ({ ...d, saved: d.saved.map((s) => (s.id === id ? { ...s, note } : s)) })),

    isFavorite: (id) => data.favorites.includes(id),
    toggleFavorite: (id) =>
      update((d) => ({
        ...d,
        favorites: d.favorites.includes(id) ? d.favorites.filter((f) => f !== id) : [...d.favorites, id],
      })),
    setPlaceNote: (id, note) => update((d) => ({ ...d, placeNotes: { ...d.placeNotes, [id]: note } })),

    addExperience: (exp) => {
      const created: Experience = { ...exp, id: uid('exp'), custom: true };
      update((d) => ({ ...d, customExperiences: [...d.customExperiences, created] }));
      notify('Experience added');
      return created;
    },
    deleteExperience: (id) =>
      update((d) => ({
        ...d,
        customExperiences: d.customExperiences.filter((e) => e.id !== id),
        saved: d.saved.filter((s) => !(s.kind === 'experience' && s.refId === id)),
      })),
    addPlace: (place) => {
      update((d) => ({ ...d, customPlaces: [...d.customPlaces, { ...place, id: uid('pl'), custom: true }] }));
      notify('Place added');
    },
    deletePlace: (id) =>
      update((d) => ({
        ...d,
        customPlaces: d.customPlaces.filter((p) => p.id !== id),
        favorites: d.favorites.filter((f) => f !== id),
        saved: d.saved.filter((s) => !(s.kind === 'place' && s.refId === id)),
      })),
    upsertWebsite: (site) => {
      const id = site.id ?? uid('web');
      const isSeed = SEED_WEBSITES.some((w) => w.id === id);
      const full: Website = { ...site, id, custom: isSeed ? undefined : true };
      update((d) => ({ ...d, websites: [...d.websites.filter((w) => w.id !== id), full] }));
      notify(site.id ? 'Website updated' : 'Website added');
    },
    removeWebsite: (id) => {
      const isSeed = SEED_WEBSITES.some((w) => w.id === id);
      update((d) => ({
        ...d,
        websites: d.websites.filter((w) => w.id !== id),
        hiddenWebsiteIds: isSeed ? [...d.hiddenWebsiteIds, id] : d.hiddenWebsiteIds,
        favorites: d.favorites.filter((f) => f !== id),
      }));
    },
    restoreWebsites: () => update((d) => ({ ...d, hiddenWebsiteIds: [] })),

    setInterests: (list) => update((d) => ({ ...d, interests: list })),
    resetInterests: () => update((d) => ({ ...d, interests: null })),

    addFieldNote: (note) => {
      update((d) => ({
        ...d,
        fieldNotes: [{ ...note, id: uid('note'), createdAt: new Date().toISOString() }, ...d.fieldNotes],
      }));
      notify('Field note added');
    },
    updateFieldNote: (note) =>
      update((d) => ({ ...d, fieldNotes: d.fieldNotes.map((n) => (n.id === note.id ? note : n)) })),
    deleteFieldNote: (id) => update((d) => ({ ...d, fieldNotes: d.fieldNotes.filter((n) => n.id !== id) })),

    setShowAutopilot: (v) => update((d) => ({ ...d, settings: { ...d.settings, showAutopilot: v } })),
    setSettings: (patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    replaceAll: (d) => setData(normalizeData(d)),
    mergeIn: (incoming) => update((d) => mergeData(d, incoming)),
    resetAll: () => setData({ ...EMPTY_DATA }),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
