/**
 * One sync round, separated from React so it can be tested with a fake GitHub.
 *
 * Safety rules (PP-008):
 *  - Before every attempt that could write, re-check that the repository is private.
 *    Anything but an explicit "private" stops the round before reading or writing.
 *  - If the device disconnects (or the config changes) mid-round, nothing more is
 *    written or applied.
 *  - A write conflict (another device wrote first) re-reads and merges again.
 *  - A local edit made during the round restarts it, so the edit isn't lost.
 *
 * Residual risk, documented: the repository could be made public in the moment between
 * the check and the write (one attempt, typically well under a second). Data written
 * before a repo is made public is in its history and becomes public with it.
 */
import { SyncError, type SyncConfig } from './github';
import { EMPTY_META, fromEntries, mergeReplicas, type Entries, type RemoteFile, type SyncMeta } from './sync';
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
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

    if (!file || !same(merged.entries, file.entries) || !same(merged.meta, file.meta)) {
      if (!deps.stillCurrent()) return 'aborted';
      const out: RemoteFile = { app: 'personal-playground', format: 1, updatedAt: new Date(now()).toISOString(), entries: merged.entries, meta: merged.meta };
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
