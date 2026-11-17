import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DropEdition, DropFile, DropItem, ThreadNode } from '../types/drop';
import { visibleEditions } from '../utils/dropValidate';
import { nyDate } from '../utils/pulse';

/**
 * Loads the published Weekly Drop library (public/data/drop.json, built from
 * content/drop/). Editions appear on their publishDate in New York time.
 * Preview editions imported on the Editorial Desk live only on this device.
 */
interface DropState {
  loading: boolean;
  error: string | null;
  /** Visible editions, newest first. */
  editions: DropEdition[];
  latest: DropEdition | null;
  nodes: ThreadNode[];
  previews: DropEdition[];
  setPreviews: (p: DropEdition[]) => void;
  itemById: (id: string) => { item: DropItem; edition: DropEdition } | null;
  nodeById: (id: string) => ThreadNode | null;
}

const Ctx = createContext<DropState | null>(null);
const CACHE = 'personal-playground:drop-cache';
const PREVIEW = 'personal-playground:drop-previews';

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

export function DropProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<DropFile | null>(() => read<DropFile>(CACHE));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviewsState] = useState<DropEdition[]>(() => read<DropEdition[]>(PREVIEW) ?? []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/drop.json?t=${Date.now()}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as DropFile;
        setFile(j);
        try {
          localStorage.setItem(CACHE, JSON.stringify(j));
        } catch {
          /* ignore */
        }
      })
      .catch((e: Error) => setError(navigator.onLine ? e.message : 'offline'))
      .finally(() => setLoading(false));
  }, []);

  const setPreviews = useCallback((p: DropEdition[]) => {
    setPreviewsState(p);
    try {
      localStorage.setItem(PREVIEW, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const editions = useMemo(() => visibleEditions(file?.editions ?? [], nyDate(Date.now())), [file]);
  const all = useMemo(() => [...editions, ...previews], [editions, previews]);
  const nodes = file?.nodes ?? [];

  const itemById = useCallback(
    (id: string) => {
      for (const edition of all) {
        const item = edition.items.find((i) => i.id === id);
        if (item) return { item, edition };
      }
      return null;
    },
    [all],
  );
  const nodeById = useCallback((id: string) => nodes.find((n) => n.id === id) ?? null, [nodes]);

  return (
    <Ctx.Provider value={{ loading, error, editions, latest: editions[0] ?? null, nodes, previews, setPreviews, itemById, nodeById }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDrop(): DropState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDrop must be used inside <DropProvider>');
  return v;
}
