import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PulseFile } from '../types/pulse';

/**
 * Loads /data/pulse.json (generated daily by the build). Keeps the last good copy
 * on the device so the Pulse still opens offline, clearly marked with its age.
 */
interface PulseState {
  data: PulseFile | null;
  loading: boolean;
  error: string | null;
  /** True when the data is older than ~36 hours. */
  stale: boolean;
  /** True when we're showing the on-device copy because the network fetch failed. */
  fromCache: boolean;
  refresh: () => void;
}

const Ctx = createContext<PulseState | null>(null);
const CACHE_KEY = 'personal-playground:pulse-cache';
const STALE_MS = 36 * 3_600_000;

function readCache(): PulseFile | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as PulseFile | null;
  } catch {
    return null;
  }
}

export function PulseProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PulseFile | null>(() => readCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`${import.meta.env.BASE_URL}data/pulse.json?t=${Date.now()}`, { signal: ctrl.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'No local listings have been published yet.' : `HTTP ${r.status}`);
        const j = (await r.json()) as PulseFile;
        if (!Array.isArray(j.events) || !Array.isArray(j.sources)) throw new Error('Unexpected listings format.');
        setData(j);
        setFromCache(false);
        setError(null);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(j));
        } catch {
          /* ignore quota */
        }
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        const cached = readCache();
        if (cached) {
          setData(cached);
          setFromCache(true);
        }
        setError(navigator.onLine ? e.message : 'You’re offline.');
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const stale = Boolean(data && Date.now() - Date.parse(data.generatedAt) > STALE_MS);

  return <Ctx.Provider value={{ data, loading, error, stale, fromCache, refresh }}>{children}</Ctx.Provider>;
}

export function usePulse(): PulseState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePulse must be used inside <PulseProvider>');
  return v;
}
