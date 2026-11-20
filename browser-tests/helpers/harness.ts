/**
 * Browser behaviour harness (M2-6). Each `scenario` runs in a fresh, isolated browser context
 * against the production build in `dist/`, served locally under the production base path:
 *
 *  - frozen clock (the visual check's time, Sat 2026-11-21 3 PM New York); timers still run;
 *  - synthetic Local Pulse and weather fixtures (tests/fixtures/visual/); the GitHub API is
 *    answered by an in-process fake (helpers/fake-github.ts) when a scenario asks for one;
 *  - every other request off the local origin is aborted and recorded, so nothing reaches the
 *    internet (map tiles, geocoding, real GitHub, the external sites behind links);
 *  - service workers blocked; storage starts empty or with the scenario's synthetic seed;
 *  - page errors fail the scenario.
 *
 * On failure the scenario saves a screenshot and a text report to browser-out/ (uploaded by CI)
 * and appends the same diagnostics to the error: URL, page errors, console errors, dialogs,
 * blocked hosts and the fake GitHub's request log and outstanding holds.
 *
 * Execution is bounded: each browser action or wait fails after ACTION_MS, each scenario after
 * SCENARIO_MS (the CI step has its own timeout as well). Holds are released and the browser
 * context is closed however the scenario ends.
 */
import { after, before } from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { FROZEN_TIME, serveDist } from '../../scripts/visual/run.ts';
import type { FakeGitHub } from './fake-github.ts';

export const BASE = '/personal-playground/';
export const STORAGE_KEY = 'personal-playground:v1';
export const SYNC_CONFIG_KEY = 'personal-playground:sync-config';
export const DESKTOP = { width: 1280, height: 800 };
export const MOBILE = { width: 390, height: 844 };
/** Upper bound for any single browser action or wait (Playwright's default is 30 s). */
export const ACTION_MS = 10_000;
/** Upper bound for a whole scenario (the slowest takes a few seconds). */
export const SCENARIO_MS = 60_000;
export { FROZEN_TIME };

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(ROOT, 'browser-out');
const FIXTURES = join(ROOT, 'tests/fixtures/visual');

export interface ScenarioOptions {
  viewport?: { width: number; height: number };
  /** localStorage entries present before the app first loads (synthetic data only). */
  storage?: Record<string, unknown>;
  /** Answers https://api.github.com when set; otherwise GitHub is blocked like any other host. */
  github?: FakeGitHub;
  /** Replace Math.random with a constant, for screens that pick at random (Plan a Day). */
  random?: number;
}

export interface Session {
  page: Page;
  ctx: BrowserContext;
  origin: string;
  /** The scenario's fake GitHub, if it has one. */
  github?: FakeGitHub;
  /** Opens a route (`'notes'`, `'discover?exp=x'`, `''` for Home) and waits for the app. */
  open: (route: string) => Promise<void>;
  /** Reloads and waits for the app. */
  reload: () => Promise<void>;
  /** The parsed personal-data record in localStorage (null when absent). */
  stored: () => Promise<Record<string, unknown> | null>;
  /** The raw localStorage value for a key. */
  raw: (key: string) => Promise<string | null>;
  /** Browser dialogs seen so far (confirm texts). The next ones are accepted unless queued otherwise. */
  dialogs: string[];
  dismissNextDialog: () => void;
  /** Hosts whose requests were blocked. */
  blocked: Set<string>;
  pageErrors: string[];
  consoleErrors: string[];
}

let browser: Browser;
let server: Server;
let origin: string;
let fixtures: { pulse: string; weather: string };

/** Registers the shared browser and server for this file. Call once at the top of a test file. */
export function browserSuite() {
  before(async () => {
    await readFile(join(ROOT, 'dist/index.html')).catch(() => {
      throw new Error('No build found in dist/. Run `npm run build` before the browser tests.');
    });
    ({ server, origin } = await serveDist(join(ROOT, 'dist')));
    browser = await chromium.launch(process.env.PP_CHROME ? { executablePath: process.env.PP_CHROME } : {});
    fixtures = { pulse: await readFile(join(FIXTURES, 'pulse.json'), 'utf8'), weather: await readFile(join(FIXTURES, 'weather.json'), 'utf8') };
  });
  after(async () => {
    await browser?.close();
    server?.close();
  });
}

/** Waits until the app has rendered its shell (the main landmark). */
async function appReady(page: Page) {
  await page.locator('main#main').waitFor({ state: 'attached' });
}

/**
 * The body of one isolated browser scenario: `test(name, scenario(opts, async (s) => …))`.
 * (The test() call stays in the test file, so the integrity checks see it there.)
 */
export function scenario(opts: ScenarioOptions, fn: (s: Session) => Promise<void>): (t: { name: string }) => Promise<void> {
  return async ({ name }) => {
    const viewport = opts.viewport ?? DESKTOP;
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      acceptDownloads: true,
      storageState: {
        cookies: [],
        origins: opts.storage
          ? [{ origin, localStorage: Object.entries(opts.storage).map(([name, v]) => ({ name, value: typeof v === 'string' ? v : JSON.stringify(v) })) }]
          : [],
      },
    });
    ctx.setDefaultTimeout(ACTION_MS);
    const blocked = new Set<string>();
    await ctx.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        if (url.pathname === `${BASE}data/pulse.json`) return route.fulfill({ status: 200, contentType: 'application/json', body: fixtures.pulse });
        return route.continue();
      }
      if (url.host === 'api.open-meteo.com') return route.fulfill({ status: 200, contentType: 'application/json', body: fixtures.weather });
      if (url.host === 'api.github.com' && opts.github) return opts.github.handle(route);
      blocked.add(url.host);
      return route.abort('blockedbyclient');
    });
    if (opts.random !== undefined) await ctx.addInitScript((r) => (Math.random = () => r), opts.random);

    const page = await ctx.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const dialogs: string[] = [];
    let dismiss = false;
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && consoleErrors.push(m.text().split('\n')[0]));
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      const act = dismiss ? d.dismiss() : d.accept();
      dismiss = false;
      void act.catch(() => undefined);
    });
    await page.clock.setFixedTime(new Date(FROZEN_TIME));

    const s: Session = {
      page,
      ctx,
      origin,
      github: opts.github,
      open: async (route) => {
        await page.goto(`${origin}${BASE}#/${route}`);
        await appReady(page);
      },
      reload: async () => {
        await page.reload();
        await appReady(page);
      },
      stored: async () => {
        const v = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
        return v ? (JSON.parse(v) as Record<string, unknown>) : null;
      },
      raw: (key) => page.evaluate((k) => localStorage.getItem(k), key),
      dialogs,
      dismissNextDialog: () => {
        dismiss = true;
      },
      blocked,
      pageErrors,
      consoleErrors,
    };

    const run = fn(s);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, fail) => {
      timer = setTimeout(() => fail(new Error(`Scenario did not finish within ${SCENARIO_MS / 1000}s`)), SCENARIO_MS);
    });
    try {
      await Promise.race([run, deadline]);
      if (pageErrors.length) throw new Error(`Page errors during the scenario: ${pageErrors.join(' | ')}`);
    } catch (err) {
      throw await withDiagnostics(name, s, opts, err);
    } finally {
      clearTimeout(timer);
      run.catch(() => undefined); // a scenario abandoned at the deadline fails once the context closes
      opts.github?.releaseAll();
      await ctx.close();
    }
  };
}

/** Saves a screenshot and report for a failed scenario and returns the error with them attached. */
async function withDiagnostics(name: string, s: Session, opts: ScenarioOptions, err: unknown): Promise<Error> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  const lines = [
    `Scenario: ${name}`,
    `Viewport: ${(opts.viewport ?? DESKTOP).width}px`,
    `URL: ${s.page.isClosed() ? '(page closed)' : s.page.url()}`,
    `Page errors: ${s.pageErrors.join(' | ') || 'none'}`,
    `Console errors: ${s.consoleErrors.slice(-10).join(' | ') || 'none'}`,
    `Dialogs: ${s.dialogs.join(' | ') || 'none'}`,
    `Blocked hosts: ${[...s.blocked].sort().join(', ') || 'none'}`,
  ];
  if (opts.github) {
    lines.push(`Fake GitHub requests: ${opts.github.log.join(' | ') || 'none'}`);
    lines.push(`Outstanding holds: ${opts.github.outstanding().join(' | ') || 'none'}`);
  }
  try {
    await mkdir(OUT, { recursive: true });
    if (!s.page.isClosed()) await s.page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: true });
    lines.push(`Screenshot: browser-out/${slug}.png`);
    await writeFile(join(OUT, `${slug}.txt`), `${lines.join('\n')}\n\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  } catch {
    lines.push('(diagnostics could not be saved)');
  }
  const e = err instanceof Error ? err : new Error(String(err));
  const block = `\n\n--- browser diagnostics ---\n${lines.join('\n')}`;
  e.message += block;
  // The runner prints the stack, which was fixed when the error was created.
  if (e.stack) e.stack += block;
  return e;
}

/** Every link on the page whose href is not http(s), an app route or an in-page anchor. */
export async function unsafeHrefs(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href], area[href]'))
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => {
        if (h.startsWith('#') || h.startsWith('blob:')) return false;
        try {
          const u = new URL(h, location.href);
          return !(u.protocol === 'https:' || u.protocol === 'http:');
        } catch {
          return true;
        }
      }),
  );
}
