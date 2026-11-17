/**
 * One sync round, separated from React so it can be tested with a fake GitHub.
 *
 * Safety rules (PP-008):
 *  - The repository's privacy is checked at the start of every attempt AND again
 *    immediately before every write. Anything but an explicit "private" stops the round.
 *  - If the device disconnects or the sync config (owner, repo, path or token) changes
 *    mid-round, nothing more is written or applied.
 *  - A write conflict (another device wrote first) re-reads and merges again.
 *  - A local edit made during the round restarts it, so the edit isn't lost.
 *
 * Known limits, documented rather than engineered around:
 *  - Checking privacy and writing are two separate GitHub requests; they are not atomic.
 *    A repository made public in the moment between them would still receive that write.
 *  - A write already sent cannot be taken back if the user disconnects while it is in flight.
 *  - Data written before a repository is made public stays in its history and becomes
 *    public with it.
 */
import { SyncError, type SyncConfig } from './github';
import { EMPTY_META, fromEntries, mergeReplicas, withLegacySettings, type Entries, type RemoteFile, type SyncMeta } from './sync';
import type { PersonalData } from '../types';

export interface SyncDeps {
  verify: (cfg: SyncConfig) => Promise<void>;
  read: (cfg: SyncConfig) => Promise<{ file: RemoteFile | null; sha: string | null }>;
  write: (cfg: SyncConfig, file: RemoteFile, sha: string | null) => Promise<string>;
  getLocal: () => { entries: Entries; meta: SyncMeta; version: number };
  /** Apply the merged result; false if the user edited meanwhile. */
  apply: (data: PersonalData, meta: SyncMeta, expectedVersion: number) => boolean;
  /** False once the device has disconnected or switched repos since the round began. */
  stillCurrent: () => boolean;
  now?: () => number;
}

export type SyncOutcome = 'synced' | 'aborted';

/** Key-order-insensitive JSON form, so "nothing changed" isn't mistaken for a change. */
const canonical = (v: unknown): string =>
  v && typeof v === 'object'
    ? Array.isArray(v)
      ? `[${v.map(canonical).join(',')}]`
      : `{${Object.keys(v as object)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
          .join(',')}}`
    : JSON.stringify(v) ?? 'null';
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const MAX_ATTEMPTS = 4;

export async function syncOnce(cfg: SyncConfig, deps: SyncDeps): Promise<SyncOutcome> {
  const now = deps.now ?? Date.now;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!deps.stillCurrent()) return 'aborted';
    await deps.verify(cfg); // throws (kind 'public') unless the repo is confirmed private
    if (!deps.stillCurrent()) return 'aborted';

    const { file, sha } = await deps.read(cfg);
    const local = deps.getLocal();
    const merged = mergeReplicas(local, file ? { entries: file.entries, meta: file.meta } : { entries: {}, meta: EMPTY_META }, now());

    // The file sent to GitHub also carries a legacy `settings` mirror for older app versions.
    const remoteView = withLegacySettings(merged);
    if (!file || !same(remoteView.entries, file.entries) || !same(remoteView.meta, file.meta)) {
      if (!deps.stillCurrent()) return 'aborted';
      await deps.verify(cfg); // re-check immediately before writing
      if (!deps.stillCurrent()) return 'aborted';
      const out: RemoteFile = { app: 'personal-playground', format: 1, updatedAt: new Date(now()).toISOString(), entries: remoteView.entries, meta: remoteView.meta };
      try {
        await deps.write(cfg, out, sha);
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'conflict') continue; // another device wrote first: merge again
        throw e;
      }
    }
    if (!deps.stillCurrent()) return 'aborted';
    if (!deps.apply(fromEntries(merged.entries), merged.meta, local.version)) continue; // edited during sync: go again
    return 'synced';
  }
  throw new SyncError('Sync kept colliding with other changes — try again in a moment.', 'conflict');
}
