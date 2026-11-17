/**
 * Minimal GitHub client for sync. Stores one JSON file in a PRIVATE repository
 * using the REST "contents" API, authenticated with a fine-grained token that
 * only has Contents read/write on that one repo.
 *
 * The token is kept in this browser's localStorage under its own key — it is
 * never part of JSON backups and never sent anywhere except api.github.com.
 */
import type { RemoteFile } from './sync';
import { isRemoteFile } from './sync';

export interface SyncConfig {
  owner: string;
  repo: string;
  path: string;
  token: string;
}

const CONFIG_KEY = 'personal-playground:sync-config';
const API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(
    message: string,
    public kind: 'auth' | 'notfound' | 'public' | 'conflict' | 'network' | 'format',
  ) {
    super(message);
  }
}

export function loadConfig(): SyncConfig | null {
  try {
    const v = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as SyncConfig | null;
    return v && v.owner && v.repo && v.token ? { ...v, path: v.path || 'playground-data.json' } : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: SyncConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* ignore */
  }
}

/** Accepts "owner/repo", a github.com URL, or a .git URL. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = input
    .trim()
    .replace(/\.git$/, '')
    .match(/(?:github\.com[/:])?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store' });
  } catch {
    throw new SyncError('Couldn’t reach GitHub. Check your connection.', 'network');
  }
}

function explain(status: number, what: string): SyncError {
  if (status === 401) return new SyncError('GitHub rejected the token — it may have expired or been revoked.', 'auth');
  if (status === 403) return new SyncError(`The token doesn’t have permission to ${what}. It needs Contents: Read and write on this repo.`, 'auth');
  if (status === 404) return new SyncError('Repository not found — check the name, and that the token was given access to it.', 'notfound');
  if (status === 409 || status === 422) return new SyncError('The file changed on GitHub while syncing.', 'conflict');
  return new SyncError(`GitHub returned an error (${status}).`, 'network');
}

/** Confirms the repo exists, is private, and the token can write to it. */
export async function verifyRepo(c: SyncConfig): Promise<void> {
  const res = await call(`${API}/repos/${c.owner}/${c.repo}`, { headers: headers(c.token) });
  if (!res.ok) throw explain(res.status, 'read this repository');
  const repo = (await res.json()) as { private?: boolean; permissions?: { push?: boolean } };
  if (repo.private === false) {
    throw new SyncError('That repository is public. Your personal data needs a private repo — make it private or create a new one.', 'public');
  }
  if (repo.permissions && repo.permissions.push === false) {
    throw new SyncError('The token can read but not write. Give it Contents: Read and write.', 'auth');
  }
}

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
const fromB64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export async function readRemote(c: SyncConfig): Promise<{ file: RemoteFile | null; sha: string | null }> {
  const res = await call(`${API}/repos/${c.owner}/${c.repo}/contents/${encodeURIComponent(c.path)}`, { headers: headers(c.token) });
  if (res.status === 404) {
    // Either the file doesn't exist yet (fine) or the repo is empty (also fine). A missing repo is caught by verifyRepo.
    return { file: null, sha: null };
  }
  if (!res.ok) throw explain(res.status, 'read the data file');
  const j = (await res.json()) as { content?: string; sha: string };
  if (!j.content) throw new SyncError('The data file on GitHub is too large or unreadable.', 'format');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromB64(j.content));
  } catch {
    throw new SyncError('The data file on GitHub isn’t valid JSON.', 'format');
  }
  if (!isRemoteFile(parsed)) throw new SyncError('The data file on GitHub isn’t a Personal Playground sync file.', 'format');
  return { file: parsed, sha: j.sha };
}

export async function writeRemote(c: SyncConfig, file: RemoteFile, sha: string | null): Promise<string> {
  const body = {
    message: `Sync ${new Date().toISOString()}`,
    content: toB64(JSON.stringify(file, null, 1)),
    ...(sha ? { sha } : {}),
  };
  const res = await call(`${API}/repos/${c.owner}/${c.repo}/contents/${encodeURIComponent(c.path)}`, {
    method: 'PUT',
    headers: { ...headers(c.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw explain(res.status, 'write the data file');
  const j = (await res.json()) as { content?: { sha?: string } };
  return j.content?.sha ?? '';
}
