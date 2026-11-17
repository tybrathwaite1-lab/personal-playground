import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  loadConfig,
  readRemote,
  saveConfig,
  sameConfig,
  verifyRepo,
  writeRemote,
  type SyncConfig,
} from '../utils/github';
import { syncOnce } from '../utils/syncRun';
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
  /** Bumped on disconnect, so a round already in flight stops before writing. */
  const generation = useRef(0);

  const run = useCallback(async (cfg: SyncConfig | null = loadConfig()) => {
    if (!cfg || !loadConfig()) return; // disconnected since this run was scheduled
    if (!navigator.onLine) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    const gen = generation.current;
    /** False once disconnected or reconfigured: a stale round must not touch status or errors. */
    const isCurrent = () => generation.current === gen && sameConfig(loadConfig(), cfg);
    try {
      const outcome = await syncOnce(cfg, {
        verify: verifyRepo,
        read: readRemote,
        write: writeRemote,
        getLocal: () => storeRef.current.getSyncState(),
        apply: (data, meta, version) => storeRef.current.applySynced(data, meta, version),
        stillCurrent: isCurrent,
      });
      if (outcome === 'aborted' || !isCurrent()) return; // status already reflects the new config
      const now = Date.now();
      setLast(now);
      try {
        localStorage.setItem(LAST_KEY, String(now));
      } catch {
        /* ignore */
      }
      setError(null);
      setStatus('idle');
    } catch (e) {
      if (!isCurrent()) return; // a stale round's error must not show against the new config
      setError(e instanceof Error ? e.message : 'Sync failed.');
      setStatus('error');
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        void run(loadConfig());
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
      generation.current += 1; // any round still running for the previous config stops
      saveConfig(c);
      setConfig(c); // the effect above runs the first sync
    },
    [config],
  );

  const disconnect = useCallback(() => {
    generation.current += 1;
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
