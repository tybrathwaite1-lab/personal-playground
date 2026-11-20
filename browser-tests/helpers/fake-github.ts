/**
 * An in-process stand-in for the three GitHub REST calls the app's sync makes
 * (src/utils/github.ts): GET /repos/:owner/:repo, and GET/PUT on
 * /repos/:owner/:repo/contents/:path. Repositories, tokens and data are synthetic; nothing
 * reaches github.com.
 *
 * Scenarios can make the next matching request fail (an HTTP status or a network error), or
 * hold it until they release it, to put the app in the middle of a sync round. Waiting for a
 * held request is bounded: if it never comes, the scenario fails promptly and says which one.
 */
import type { Route } from 'playwright-core';

export const SYNTHETIC_TOKEN = 'github_pat_SYNTHETIC_TEST_TOKEN_0000';

export interface RemoteFile {
  app: 'personal-playground';
  format: 1;
  updatedAt: string;
  entries: Record<string, unknown>;
  meta: { stamps: Record<string, number>; tombs: Record<string, number> };
}

export interface FakeRepo {
  private: boolean | undefined;
  push: boolean;
  file: RemoteFile | null;
  sha: string | null;
  /** Every file successfully written, in order. */
  writes: RemoteFile[];
}

export interface Req {
  method: string;
  repo: string; // owner/repo
  kind: 'repo' | 'read' | 'write';
}

type Rule = { match: (r: Req) => boolean; status: number | 'network'; then?: () => void };
type Hold = { what: string; match: (r: Req) => boolean; arrived: () => void; came: boolean; released: Promise<void>; release: () => void };

/** How long a scenario waits for a held request to arrive. */
export const HOLD_ARRIVAL_MS = 10_000;

export class FakeGitHub {
  repos = new Map<string, FakeRepo>();
  token = SYNTHETIC_TOKEN;
  /** "GET repo o/r 200"-style lines, for assertions and failure diagnostics. */
  log: string[] = [];
  private rules: Rule[] = [];
  private holds: Hold[] = [];
  /** Every hold ever made, so a failing scenario can release them all. */
  private allHolds: Hold[] = [];
  private shaCounter = 0;

  addRepo(name: string, init: Partial<FakeRepo> = {}): FakeRepo {
    const repo: FakeRepo = { private: true, push: true, file: null, sha: null, writes: [], ...init };
    if (repo.file && !repo.sha) repo.sha = this.nextSha();
    this.repos.set(name, repo);
    return repo;
  }

  /** Replace a repository's file, as another device's sync would. */
  setFile(name: string, file: RemoteFile) {
    const repo = this.repos.get(name)!;
    repo.file = structuredClone(file);
    repo.sha = this.nextSha();
  }

  /** The next request matching `match` fails with `status` (or a network error); `then` runs first. */
  failNext(match: (r: Req) => boolean, status: number | 'network', then?: () => void) {
    this.rules.push({ match, status, then });
  }

  /**
   * Holds the next matching request (described by `what`) until `release()`. `arrived()`
   * resolves when it comes in, or rejects after `ms` with the requests seen so far.
   */
  hold(what: string, match: (r: Req) => boolean): { arrived: (ms?: number) => Promise<void>; release: () => void } {
    let arrived!: () => void;
    let release!: () => void;
    const arrivedP = new Promise<void>((ok) => (arrived = ok));
    const released = new Promise<void>((ok) => (release = ok));
    const h: Hold = { what, match, arrived: () => ((h.came = true), arrived()), came: false, released, release };
    this.holds.push(h);
    this.allHolds.push(h);
    return {
      arrived: async (ms = HOLD_ARRIVAL_MS) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<never>((_, fail) => {
          timer = setTimeout(() => fail(new Error(`Held request "${what}" did not arrive within ${ms / 1000}s. Requests so far: ${this.log.join(' | ') || 'none'}`)), ms);
        });
        try {
          await Promise.race([arrivedP, late]);
        } finally {
          clearTimeout(timer);
        }
      },
      release,
    };
  }

  /** Holds that are still waiting for their request, or still holding it (for diagnostics). */
  outstanding(): string[] {
    return this.allHolds.filter((h) => this.holds.includes(h) || h.came).map((h) => `${h.what} (${h.came ? 'arrived, held' : 'never arrived'})`);
  }

  /** Lets every held request through (used when a scenario ends, pass or fail). */
  releaseAll() {
    this.holds = [];
    for (const h of this.allHolds) h.release();
  }

  count(match: (r: Req) => boolean): number {
    return this.log.filter((l) => {
      const [method, kind, repo] = l.split(' ');
      return match({ method, kind: kind as Req['kind'], repo });
    }).length;
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(?:\/contents\/(.+))?$/);
    const req: Req | null = m ? { method: request.method(), repo: `${m[1]}/${m[2]}`, kind: !m[3] ? 'repo' : request.method() === 'PUT' ? 'write' : 'read' } : null;
    const respond = (status: number, body?: unknown) => {
      this.log.push(`${req?.method ?? request.method()} ${req?.kind ?? 'other'} ${req?.repo ?? url.pathname} ${status}`);
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body ?? { message: 'synthetic' }) }).catch(() => undefined);
    };
    if (!req) return respond(404);

    const hold = this.holds.find((h) => h.match(req));
    if (hold) {
      this.holds.splice(this.holds.indexOf(hold), 1);
      hold.arrived();
      await hold.released;
    }
    const rule = this.rules.find((r) => r.match(req));
    if (rule) {
      this.rules.splice(this.rules.indexOf(rule), 1);
      rule.then?.();
      if (rule.status === 'network') {
        this.log.push(`${req.method} ${req.kind} ${req.repo} network-error`);
        return route.abort('connectionfailed').catch(() => undefined);
      }
      return respond(rule.status);
    }

    if (request.headers()['authorization'] !== `Bearer ${this.token}`) return respond(401);
    const repo = this.repos.get(req.repo);
    if (!repo) return respond(404);
    if (req.kind === 'repo') return respond(200, { full_name: req.repo, private: repo.private, permissions: { push: repo.push } });
    if (req.kind === 'read') {
      if (!repo.file) return respond(404);
      return respond(200, { sha: repo.sha, content: Buffer.from(JSON.stringify(repo.file)).toString('base64') });
    }
    const body = JSON.parse(request.postData() ?? '{}') as { content: string; sha?: string };
    if ((body.sha ?? null) !== repo.sha) return respond(409);
    repo.file = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) as RemoteFile;
    repo.sha = this.nextSha();
    repo.writes.push(structuredClone(repo.file));
    return respond(200, { content: { sha: repo.sha } });
  }

  private nextSha() {
    return `sha${++this.shaCounter}`;
  }
}

export const isWrite = (repo: string) => (r: Req) => r.kind === 'write' && r.repo === repo;
export const isRead = (repo: string) => (r: Req) => r.kind === 'read' && r.repo === repo;
export const isRepoCheck = (repo: string) => (r: Req) => r.kind === 'repo' && r.repo === repo;
export const anyWrite = (r: Req) => r.kind === 'write';

/** A sync file holding the given entries, each stamped at `at`. */
export function remoteFile(entries: Record<string, unknown>, at: number): RemoteFile {
  return {
    app: 'personal-playground',
    format: 1,
    updatedAt: new Date(at).toISOString(),
    entries,
    meta: { stamps: Object.fromEntries(Object.keys(entries).map((k) => [k, at])), tombs: {} },
  };
}
