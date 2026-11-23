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

/** True when two configs point at the same file with the same token. */
export function sameConfig(a: SyncConfig | null, b: SyncConfig | null): boolean {
  return Boolean(a && b && a.owner === b.owner && a.repo === b.repo && a.path === b.path && a.token === b.token);
}

export function saveConfig(c: SyncConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * GitHub account names: letters, digits and hyphens, starting with a letter or digit; at most 39.
 * (New names can't end in or repeat a hyphen, but some older accounts do, so those are allowed.)
 */
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
/** GitHub repository names: letters, digits, ".", "_" and "-"; at most 100; not "." or "..". */
const REPO = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

/**
 * Reads a repository from exactly these forms, and rejects anything else rather than guessing:
 *  - "owner/repo"
 *  - a github.com web or clone URL: "https://github.com/owner/repo" (also http, "www.", or no
 *    scheme)
 *  - SSH: "git@github.com:owner/repo"
 * Each may end in "/" or ".git". Other hosts, extra path segments (e.g. /tree/main), queries,
 * credentials, ports and spaces are rejected.
 */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = input.trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i) ?? s.match(/^git@github\.com:(.*)$/i);
  const parts = (url ? url[1] : s).replace(/\/$/, '').replace(/\.git$/, '').split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  return OWNER.test(owner) && REPO.test(repo) ? { owner, repo } : null;
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

/**
 * Confirms the repo exists, is private, and the token can write to it.
 * Called when connecting, at the start of every sync attempt, and again immediately
 * before every write. Checking and writing are separate requests, so this is not atomic.
 */
export async function verifyRepo(c: SyncConfig): Promise<void> {
  const res = await call(`${API}/repos/${c.owner}/${c.repo}`, { headers: headers(c.token) });
  if (!res.ok) throw explain(res.status, 'read this repository');
  let repo: { private?: unknown; permissions?: { push?: boolean } } | null;
  try {
    repo = (await res.json()) as typeof repo;
  } catch {
    repo = null; // unreadable response: treated as "privacy not confirmed" below
  }
  if (!repo || typeof repo !== 'object') {
    throw new SyncError('Sync stopped: GitHub didn’t confirm the repository is private. Nothing was written. Try Sync now in a moment.', 'public');
  }
  // Fail closed: anything other than an explicit "private: true" stops sync.
  if (repo.private === false) {
    throw new SyncError('Sync stopped: that repository is public. Your personal data needs a private repo — make it private again, then tap Sync now.', 'public');
  }
  if (repo.private !== true) {
    throw new SyncError('Sync stopped: GitHub didn’t confirm the repository is private. Nothing was written. Try Sync now in a moment.', 'public');
  }
  if (repo.permissions && repo.permissions.push === false) {
    throw new SyncError('The token can read but not write. Give it Contents: Read and write.', 'auth');
  }
}

/**
 * A GitHub API reply as a JSON object. Anything else (an HTML page from a proxy, `null`, an
 * array) is a typed error, never a raw parser exception: nothing is applied or assumed.
 */
async function replyObject(res: Response, message: string): Promise<Record<string, unknown>> {
  let v: unknown;
  try {
    v = await res.json();
  } catch {
    v = undefined;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SyncError(message, 'network');
  return v as Record<string, unknown>;
}
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const UNREADABLE_READ = 'GitHub sent a reply about the data file that couldn’t be read. Nothing was changed — try Sync now in a moment.';
const UNCONFIRMED_WRITE = 'GitHub’s reply to the save couldn’t be read, so it isn’t confirmed. Nothing on this device was changed — tap Sync now to check.';

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
  const j = await replyObject(res, UNREADABLE_READ);
  // The sha is what the next write is based on; without it a write can't be made safely.
  if (!nonEmptyString(j.sha)) throw new SyncError(UNREADABLE_READ, 'network');
  if (!nonEmptyString(j.content)) throw new SyncError('The data file on GitHub is too large or unreadable.', 'format');
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
  // A 2xx without a readable confirmation (the new file's sha) is not treated as saved.
  const j = await replyObject(res, UNCONFIRMED_WRITE);
  const newSha = j.content && typeof j.content === 'object' ? (j.content as { sha?: unknown }).sha : undefined;
  if (!nonEmptyString(newSha)) throw new SyncError(UNCONFIRMED_WRITE, 'network');
  return newSha;
}
