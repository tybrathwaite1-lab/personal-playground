import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  SyncError,
  loadConfig,
  readRemote,
  saveConfig,
  verifyRepo,
  writeRemote,
  type SyncConfig,
} from '../utils/github';
import { EMPTY_META, fromEntries, mergeReplicas, type RemoteFile } from '../utils/sync';
import { useStore } from './useStore';

type Status = 'off' | 'idle' | 'syncing' | 'error';

interface SyncState {
  config: SyncConfig | null;
  status: Status;
  error: string | null;
  lastSyncedAt: number | null;
  connect: (c: SyncConfig) => Promise<void>;
  disconnect: () => void;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<SyncState | null>(null);
const LAST_KEY = 'personal-playground:sync-last';
const AUTO_DELAY = 4000;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  const [config, setConfig] = useState<SyncConfig | null>(() => loadConfig());
  const [status, setStatus] = useState<Status>(() => (loadConfig() ? 'idle' : 'off'));
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLast] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(LAST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const running = useRef(false);
  const again = useRef(false);

  const run = useCallback(async (cfg: SyncConfig | null = loadConfig()) => {
    if (!cfg) return;
    if (!navigator.onLine) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { file, sha } = await readRemote(cfg);
        const local = storeRef.current.getSyncState();
        const merged = mergeReplicas(local, file ? { entries: file.entries, meta: file.meta } : { entries: {}, meta: EMPTY_META });

        const remoteNeedsUpdate = !file || !same(merged.entries, file.entries) || !same(merged.meta, file.meta);
        if (remoteNeedsUpdate) {
          const out: RemoteFile = {
            app: 'personal-playground',
            format: 1,
            updatedAt: new Date().toISOString(),
            entries: merged.entries,
            meta: merged.meta,
          };
          try {
            await writeRemote(cfg, out, sha);
          } catch (e) {
            if (e instanceof SyncError && e.kind === 'conflict') continue; // someone else wrote — merge again
            throw e;
          }
        }
        if (!storeRef.current.applySynced(fromEntries(merged.entries), merged.meta, local.version)) {
          continue; // the user edited during the sync — go round again so nothing is lost
        }
        const now = Date.now();
        setLast(now);
        try {
          localStorage.setItem(LAST_KEY, String(now));
        } catch {
          /* ignore */
        }
        setError(null);
        setStatus('idle');
        return;
      }
      throw new SyncError('Sync kept colliding with other changes — try again in a moment.', 'conflict');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.');
      setStatus('error');
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void run(cfg);
      }
    }
  }, []);

  // Sync shortly after local edits.
  useEffect(() => {
    if (!config || store.localVersion === 0) return;
    const t = window.setTimeout(() => void run(config), AUTO_DELAY);
    return () => window.clearTimeout(t);
  }, [store.localVersion, config, run]);

  // Sync on open, when coming back to the app, and when the connection returns.
  useEffect(() => {
    if (!config) return;
    void run(config);
    const onVisible = () => document.visibilityState === 'visible' && void run(config);
    const onOnline = () => void run(config);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [config, run]);

  const connect = useCallback(
    async (c: SyncConfig) => {
      setStatus('syncing');
      setError(null);
      try {
        await verifyRepo(c);
      } catch (e) {
        setStatus(config ? 'idle' : 'off');
        throw e;
      }
      saveConfig(c);
      setConfig(c); // the effect above runs the first sync
    },
    [config],
  );

  const disconnect = useCallback(() => {
    saveConfig(null);
    setConfig(null);
    setStatus('off');
    setError(null);
  }, []);

  const syncNow = useCallback(() => run(config), [run, config]);

  return (
    <Ctx.Provider value={{ config, status, error, lastSyncedAt, connect, disconnect, syncNow }}>{children}</Ctx.Provider>
  );
}

export function useSync(): SyncState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync must be used inside <SyncProvider>');
  return v;
}
