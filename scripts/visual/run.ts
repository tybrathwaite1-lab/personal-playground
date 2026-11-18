/**
 * Visual verification harness: browser screenshots, layout overflow and accessibility checks
 * for every route at several widths, against the production build in `dist/`.
 *
 *   npm run build && npx tsx scripts/visual/run.ts [--out visual-out] [--strict] [--no-axe]
 *        [--widths 390,1280] [--routes home,pulse] [--branch name] [--commit sha]
 *
 * Deterministic and private by design:
 *  - serves `dist/` from a local static server under the production base path;
 *  - freezes the clock (Sat 2026-11-21 3 PM New York) and uses synthetic fixtures for the
 *    Local Pulse and weather (tests/fixtures/visual/); the Weekly Drop is the public
 *    `dist/data/drop.json` from the same commit;
 *  - blocks every other external request (map tiles, geocoding, GitHub) and lists them;
 *  - fresh browser profile: no saved data, no sync config, service worker blocked.
 *
 * Output (in --out): <width>/<route>.jpg (+ -fold.jpg), states/*.jpg, report.json and REPORT.md.
 * By default it reports findings and exits 0; --strict exits 1 on any finding: page errors,
 * horizontal overflow, any WCAG A/AA accessibility violation (every impact level) or a failed
 * keyboard check. Strict gating is turned on once the baseline is clean.
 *
 * Accessibility checks are mandatory: if axe can't be loaded the run fails in every mode.
 * `--no-axe` skips them explicitly, for local diagnostics only, and can't be combined with
 * --strict. (PP_VISUAL_AXE_MODULE overrides the module name; the self-test uses it to simulate
 * a missing install.)
 */
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { ROUTES } from '../../src/hooks/useRoute.ts';

const BASE = '/personal-playground/';
export const FROZEN_TIME = '2026-11-21T15:00:00-05:00';
const DEFAULT_WIDTHS = [320, 390, 768, 1280, 1440];
const HEIGHTS: Record<number, number> = { 320: 640, 390: 844, 768: 1024, 1280: 800, 1440: 900 };
const AXE_WIDTHS = [390, 1280];
const KEY_WIDTHS = [390, 1280];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES = join(ROOT, 'tests/fixtures/visual');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// ─── Options ──────────────────────────────────────────────────────────
function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

// ─── Static server for dist/ under the production base path ────────────
export function serveDist(dist: string): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (!path.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    const rel = normalize(path.slice(BASE.length) || 'index.html');
    if (rel.startsWith('..')) {
      res.writeHead(403).end();
      return;
    }
    let file = join(dist, rel);
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

// ─── Page checks ──────────────────────────────────────────────────────
interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: number;
  targets: string[];
}
interface Shot {
  route: string;
  width: number;
  file: string;
  fold: string;
  overflowPx: number;
  offenders: string[];
  axe?: AxeViolation[];
  pageErrors: string[];
  ok: boolean;
}

/** How far the page scrolls sideways, and which elements stick out past the viewport. */
export async function measureOverflow(page: Page): Promise<{ overflowPx: number; offenders: string[] }> {
  return page.evaluate(() => {
    const d = document.documentElement;
    const overflowPx = Math.max(0, d.scrollWidth - d.clientWidth);
    const offenders: string[] = [];
    if (overflowPx > 1) {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > d.clientWidth + 1) {
          const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
          offenders.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''} (right ${Math.round(r.right)}px)`);
          if (offenders.length >= 5) break;
        }
      }
    }
    return { overflowPx, offenders };
  });
}

/** Hide position:fixed elements and the body grain pseudo-element (full-page screenshots only). */
async function hideFixedOverlays(page: Page): Promise<string[]> {
  await page.addStyleTag({ content: 'body::before { display: none !important; }' });
  return page.evaluate(() => {
    const hidden: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') {
        // `visibility` is animatable: without this, the app's transitions delay the change past the screenshot.
        el.style.setProperty('transition', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        hidden.push(`${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}:${cs.display}`);
      }
    }
    return hidden;
  }).then(async (hidden) => {
    // Let style changes reach a painted frame.
    await page.evaluate(() => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))));
    return hidden;
  });
}

/** Diagnostic: fixed elements that are still visible (should be none after hiding). */
async function visibleFixed(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => getComputedStyle(el).position === 'fixed' && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none')
      .map((el) => el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : '')),
  );
}

type AxeRunner = (page: Page) => Promise<AxeViolation[]>;

/** Load axe; failing to load is an error, never a silent skip (see --no-axe for diagnostics). */
async function loadAxe(): Promise<AxeRunner> {
  const name = process.env.PP_VISUAL_AXE_MODULE ?? '@axe-core/playwright';
  let mod: typeof import('@axe-core/playwright');
  try {
    mod = (await import(name)) as typeof import('@axe-core/playwright');
  } catch (e) {
    throw new Error(
      `Accessibility checks are required but ${name} could not be loaded (${e instanceof Error ? e.message.split('\n')[0] : String(e)}). ` +
        'Install dev dependencies, or pass --no-axe for local diagnostics only.',
    );
  }
  const { AxeBuilder } = mod;
  return async (page) => {
    const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    // Every violation under the WCAG A/AA tags, whatever its impact.
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  };
}

// ─── Keyboard verification ────────────────────────────────────────────
export interface KeyCheck {
  name: string;
  pass: boolean;
  detail: string;
}
interface FocusStop {
  id: number;
  desc: string;
  body: boolean;
  interactive: boolean;
  inViewport: boolean;
  indicator: boolean;
  inPageLink: boolean;
}

/** Describe the currently focused element (identity is stable across calls via a WeakMap). */
async function focusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const w = window as unknown as { __vtIds?: WeakMap<Element, number>; __vtNext?: number };
    w.__vtIds ??= new WeakMap();
    w.__vtNext ??= 1;
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement)
      return { id: 0, desc: 'body', body: true, interactive: false, inViewport: false, indicator: false, inPageLink: false };
    if (!w.__vtIds.has(el)) w.__vtIds.set(el, w.__vtNext++);
    const INTERACTIVE =
      'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,iframe,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const shadow = cs.boxShadow !== 'none' && cs.boxShadow !== '';
    const name = (el.getAttribute('aria-label') ?? (el as HTMLElement).innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const href = el.getAttribute('href') ?? '';
    return {
      id: w.__vtIds.get(el) ?? 0,
      desc: `${el.tagName.toLowerCase()}${href ? `[href="${href.slice(0, 30)}"]` : ''}${name ? ` "${name}"` : ''}`,
      body: false,
      interactive: el.matches(INTERACTIVE),
      inViewport: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
      indicator: outline || shadow,
      inPageLink: href.startsWith('#') && href.length > 1 && !href.startsWith('#/') && Boolean(document.getElementById(href.slice(1))),
    };
  });
}

/**
 * Tab through the first `presses` stops and assert real keyboard behavior, not just that
 * something is focused: focus leaves the body, lands only on interactive elements, keeps
 * progressing (no traps or repeats), is scrolled into view, shows a focus indicator, Shift+Tab
 * goes back, and the first stop is a skip link to an element that exists.
 */
export async function verifyKeyboard(page: Page, presses = 8): Promise<{ checks: KeyCheck[]; sequence: string[] }> {
  const total = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex]')).filter(
        (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
      ).length,
  );
  const n = Math.min(presses, Math.max(total, 1));
  const stops: FocusStop[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    stops.push(await focusStop(page));
  }
  await page.keyboard.press('Shift+Tab');
  const back = await focusStop(page);

  const list = (xs: FocusStop[]) => xs.map((x) => x.desc).join('; ');
  const last = stops[stops.length - 1];
  const prevDistinct = last ? [...stops].reverse().find((x) => x.id !== last.id) : undefined;
  const firstRepeat = stops.findIndex((x, i) => stops.findIndex((y) => y.id === x.id) !== i);
  const notInteractive = stops.filter((x) => !x.body && !x.interactive);
  const offscreen = stops.filter((x) => !x.body && !x.inViewport);
  const noIndicator = stops.filter((x) => !x.body && !x.indicator);
  const checks: KeyCheck[] = [
    { name: 'Tab moves focus into the page', pass: stops.length > 0 && !stops[0].body, detail: stops[0]?.desc ?? 'no focus' },
    { name: 'First stop is a skip link to existing content', pass: Boolean(stops[0]?.inPageLink), detail: stops[0]?.desc ?? 'no focus' },
    {
      name: 'Every stop is an interactive element',
      pass: !stops.some((x) => x.body) && !notInteractive.length,
      detail: stops.some((x) => x.body) ? 'focus fell back to the page body' : notInteractive.length ? list(notInteractive) : `${stops.length} stops`,
    },
    {
      name: 'Focus keeps progressing (no repeats or traps)',
      pass: firstRepeat < 0,
      detail: firstRepeat < 0 ? `${stops.length} distinct stops of ${total} tabbable` : `repeated at press ${firstRepeat + 1}: ${stops[firstRepeat].desc}`,
    },
    { name: 'Focused elements are scrolled into view', pass: !offscreen.length, detail: offscreen.length ? list(offscreen) : 'all in view' },
    { name: 'Focused elements show a focus indicator (outline or ring)', pass: !noIndicator.length, detail: noIndicator.length ? list(noIndicator) : 'all indicated' },
    {
      // Compared with the previous *different* stop, so a trap (same element twice) can't pass.
      name: 'Shift+Tab returns to the previous stop',
      pass: !prevDistinct || back.id === prevDistinct.id,
      detail: !prevDistinct ? 'only one distinct stop' : `${back.desc} (expected ${prevDistinct.desc})`,
    },
  ];
  return { checks, sequence: stops.map((x) => x.desc) };
}

/** A fresh, private browser context with the fixtures and frozen clock in place. */
async function newContext(browser: Browser, origin: string, width: number, blocked: Set<string>): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHTS[width] ?? 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const pulse = await readFile(join(FIXTURES, 'pulse.json'), 'utf8');
  const weather = await readFile(join(FIXTURES, 'weather.json'), 'utf8');
  // Later routes take priority in Playwright, so the catch-all goes first.
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    blocked.add(url.host);
    return route.abort('blockedbyclient');
  });
  await ctx.route(/api\.open-meteo\.com/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: weather }));
  await ctx.route(/\/data\/pulse\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: pulse }));
  return ctx;
}

async function openRoute(ctx: BrowserContext, origin: string, route: string): Promise<{ page: Page; errors: string[] }> {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // With the clock installed, exceptions thrown inside timers surface as console errors rather
  // than page errors, so count those too. Failed loads of deliberately blocked hosts are noise.
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/^Failed to load resource/.test(t) && /(^|\s)(Uncaught|[A-Za-z]*Error)\b/.test(t)) errors.push(t.split('\n')[0]);
  });
  await page.clock.setFixedTime(new Date(FROZEN_TIME));
  await page.goto(`${origin}${BASE}#/${route === 'home' ? '' : route}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(250);
  return { page, errors };
}

// ─── Report ───────────────────────────────────────────────────────────
function markdown(r: Report): string {
  const lines: string[] = [];
  const bad = r.shots.filter((s) => !s.ok);
  lines.push(`# Visual check: ${r.branch ?? 'local'} @ ${r.commit?.slice(0, 7) ?? 'working tree'}`, '');
  lines.push(`Frozen time ${r.frozenTime} (New York) · synthetic Pulse and weather fixtures · ${r.shots.length} screenshots · generated ${r.generatedAt}`, '');
  const byImpact = ['critical', 'serious', 'moderate', 'minor'].map((i) => `${i} ${r.axeSummary.filter((a) => a.impact === i).length}`).join(', ');
  const keyFails = r.keyboard.reduce((n, k) => n + k.checks.filter((c) => !c.pass).length, 0);
  lines.push(
    `**${bad.length ? `${bad.length} screenshot(s) with findings` : 'No screenshot findings'}** · overflow: ${r.shots.filter((s) => s.overflowPx > 1).length} · page errors: ${r.shots.filter((s) => s.pageErrors.length).length} · accessibility (WCAG A/AA, all impacts): ${r.axeAvailable ? `${r.axeSummary.length} rule(s) — ${byImpact}` : 'NOT RUN (--no-axe)'} · keyboard checks failed: ${keyFails}`,
    '',
  );
  lines.push('Thumbnails are full-page shots with fixed overlays (bottom navigation, film grain) hidden; **fold** links show the first screen exactly as rendered, fixed navigation included.', '');
  lines.push(`| Route | ${r.widths.map((w) => `${w}px`).join(' | ')} |`, `|---|${r.widths.map(() => '---').join('|')}|`);
  for (const route of r.routes) {
    const cells = r.widths.map((w) => {
      const s = r.shots.find((x) => x.route === route && x.width === w);
      if (!s) return '—';
      const mark = s.ok ? '' : ' ⚠️';
      return `[<img src="${s.file}" width="120" alt="${route} at ${w}px">](${s.file}) [fold](${s.fold})${mark}`;
    });
    lines.push(`| \`#/${route === 'home' ? '' : route}\` | ${cells.join(' | ')} |`);
  }
  lines.push('', '## Keyboard (verified checks)', '');
  for (const k of r.keyboard) {
    lines.push(`**#/${k.route === 'home' ? '' : k.route} @ ${k.width}px**, focus order: ${k.sequence.map((x) => `\`${x.replace(/`/g, "'")}\``).join(' → ')}`, '');
    lines.push('| Check | Result | Detail |', '|---|---|---|');
    for (const c of k.checks) lines.push(`| ${c.name} | ${c.pass ? '✅ pass' : '❌ fail'} | ${c.detail.replace(/\|/g, '/')} |`);
    lines.push('');
  }
  lines.push('## States (screenshot evidence)', '');
  for (const s of r.states) lines.push(`- **${s.name}**: [${s.file}](${s.file})${s.note ? ` — ${s.note}` : ''}`);
  if (r.axeSummary.length) {
    lines.push('', '## Accessibility (axe, WCAG 2.2 A/AA tags, all impacts)', '', '| Rule | Impact | Help | Where (route@width × nodes) |', '|---|---|---|---|');
    for (const a of r.axeSummary) lines.push(`| \`${a.id}\` | ${a.impact} | ${a.help} | ${a.where.join(', ')} |`);
  }
  const over = r.shots.filter((s) => s.overflowPx > 1);
  if (over.length) {
    lines.push('', '## Horizontal overflow', '');
    for (const s of over) lines.push(`- \`#/${s.route}\` @ ${s.width}px: ${s.overflowPx}px — ${s.offenders.join('; ')}`);
  }
  const errs = r.shots.filter((s) => s.pageErrors.length);
  if (errs.length) {
    lines.push('', '## Page errors', '');
    for (const s of errs) lines.push(`- \`#/${s.route}\` @ ${s.width}px: ${s.pageErrors.join(' | ')}`);
  }
  lines.push('', '## Blocked external requests', '', r.blockedHosts.length ? r.blockedHosts.map((h) => `\`${h}\``).join(', ') : 'none', '');
  return lines.join('\n');
}

interface Report {
  branch?: string;
  commit?: string;
  generatedAt: string;
  frozenTime: string;
  widths: number[];
  routes: string[];
  axeAvailable: boolean;
  shots: Shot[];
  states: { name: string; file: string; note?: string; ok: boolean }[];
  axeSummary: { id: string; impact: string | null; help: string; where: string[] }[];
  keyboard: { width: number; route: string; checks: KeyCheck[]; sequence: string[] }[];
  blockedHosts: string[];
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  const out = resolve(opt('out') ?? 'visual-out');
  const dist = resolve(opt('dist') ?? 'dist');
  const widths = opt('widths')?.split(',').map(Number) ?? DEFAULT_WIDTHS;
  const routes = opt('routes')?.split(',') ?? [...ROUTES];
  if (flag('strict') && flag('no-axe')) throw new Error('--strict requires accessibility checks; it cannot be combined with --no-axe.');
  const axe = flag('no-axe') ? null : await loadAxe();
  if (!axe) console.warn('! --no-axe: accessibility checks skipped (local diagnostics only)');

  await stat(join(dist, 'index.html')).catch(() => {
    throw new Error(`No build found at ${dist}. Run \`npm run build\` first.`);
  });
  const { server, origin } = await serveDist(dist);
  const browser = await chromium.launch(process.env.PP_CHROME ? { executablePath: process.env.PP_CHROME } : {});
  const blocked = new Set<string>();
  const shots: Shot[] = [];
  const states: Report['states'] = [];
  const keyboard: Report['keyboard'] = [];

  try {
    for (const width of widths) {
      await mkdir(join(out, String(width)), { recursive: true });
      const ctx = await newContext(browser, origin, width, blocked);
      for (const route of routes) {
        const { page, errors } = await openRoute(ctx, origin, route);
        // Checks run on the untouched page.
        const { overflowPx, offenders } = await measureOverflow(page);
        const axeResult = axe && AXE_WIDTHS.includes(width) ? await axe(page) : undefined;
        // "Fold": exactly what the screen shows, fixed navigation included.
        const fold = `${width}/${route}-fold.jpg`;
        await page.screenshot({ path: join(out, fold), type: 'jpeg', quality: 70 });
        // Full page: fixed overlays (bottom nav, grain) would otherwise be painted where the screen
        // ended and cover content, so they're hidden for this shot only.
        await hideFixedOverlays(page);
        const stillVisible = await visibleFixed(page);
        if (stillVisible.length) throw new Error(`#/${route} @ ${width}px: fixed overlays still visible before full-page shot: ${stillVisible.join(', ')}`);
        const file = `${width}/${route}.jpg`;
        await page.screenshot({ path: join(out, file), fullPage: true, type: 'jpeg', quality: 70 });
        const ok = overflowPx <= 1 && !errors.length && !(axeResult && axeResult.length);
        shots.push({ route, width, file, fold, overflowPx, offenders, axe: axeResult, pageErrors: errors, ok });
        console.log(`${ok ? '✓' : '⚠'} ${String(width).padStart(4)}px #/${route}${overflowPx > 1 ? ` overflow ${overflowPx}px` : ''}${errors.length ? ` errors ${errors.length}` : ''}${axeResult?.length ? ` axe ${axeResult.map((a) => a.id).join(',')}` : ''}`);
        await page.close();
      }
      await ctx.close();
    }

    // Interaction states.
    await mkdir(join(out, 'states'), { recursive: true });
    if (widths.includes(390) || widths.includes(320)) {
      const w = widths.includes(390) ? 390 : 320;
      const ctx = await newContext(browser, origin, w, blocked);
      const { page } = await openRoute(ctx, origin, 'home');
      const menu = page.getByRole('button', { name: 'Open menu' });
      const visible = await menu.isVisible().catch(() => false);
      if (visible) await menu.click();
      await page.waitForTimeout(200);
      const file = `states/menu-${w}.jpg`;
      await page.screenshot({ path: join(out, file), type: 'jpeg', quality: 70 });
      const axeMenu = visible && axe ? await axe(page) : [];
      states.push({ name: `Contents menu open (${w}px)`, file, note: visible ? (axeMenu.length ? `axe: ${axeMenu.map((a) => a.id).join(', ')}` : undefined) : 'menu button not found', ok: visible && !axeMenu.length });
      await ctx.close();
    }
    // Keyboard: verified assertions on Home at a phone and a desktop width, plus a screenshot
    // (evidence only) of the focus ring after three Tabs on a fresh page.
    for (const w of KEY_WIDTHS.filter((x) => widths.includes(x))) {
      const ctx = await newContext(browser, origin, w, blocked);
      const { page } = await openRoute(ctx, origin, 'home');
      const kb = await verifyKeyboard(page);
      keyboard.push({ width: w, route: 'home', ...kb });
      const fresh = (await openRoute(ctx, origin, 'home')).page;
      for (let i = 0; i < 3; i++) await fresh.keyboard.press('Tab');
      const file = `states/keyboard-focus-${w}.jpg`;
      await fresh.screenshot({ path: join(out, file), type: 'jpeg', quality: 70 });
      states.push({ name: `Focus ring after 3 × Tab (${w}px) — screenshot evidence; see the verified keyboard checks`, file, ok: true });
      const failed = kb.checks.filter((c) => !c.pass);
      console.log(`${failed.length ? '⚠' : '✓'} keyboard @ ${w}px: ${kb.checks.length - failed.length}/${kb.checks.length} checks pass${failed.length ? ` — failed: ${failed.map((c) => c.name).join('; ')}` : ''}`);
      await ctx.close();
    }
    {
      const w = widths.includes(1280) ? 1280 : widths[widths.length - 1];
      const ctx = await newContext(browser, origin, w, blocked);
      // Unknown routes must fall back to Home rather than dead-ending.
      const u = await openRoute(ctx, origin, 'no-such-page');
      const home = await u.page.locator('#cover-title').count();
      const fileU = `states/unknown-route-${w}.jpg`;
      await u.page.screenshot({ path: join(out, fileU), type: 'jpeg', quality: 70 });
      states.push({ name: 'Unknown route falls back to Home', file: fileU, note: home ? undefined : 'Home cover title not found', ok: home > 0 });
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const axeMap = new Map<string, Report['axeSummary'][number]>();
  for (const s of shots)
    for (const a of s.axe ?? []) {
      const e = axeMap.get(a.id) ?? { id: a.id, impact: a.impact, help: a.help, where: [] };
      e.where.push(`${s.route}@${s.width}×${a.nodes}`);
      axeMap.set(a.id, e);
    }
  const report: Report = {
    branch: opt('branch'),
    commit: opt('commit'),
    generatedAt: new Date().toISOString(),
    frozenTime: FROZEN_TIME,
    widths,
    routes,
    axeAvailable: Boolean(axe),
    shots,
    states,
    axeSummary: [...axeMap.values()],
    keyboard,
    blockedHosts: [...blocked].sort(),
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 1));
  await writeFile(join(out, 'REPORT.md'), markdown(report));

  const findings =
    shots.filter((s) => !s.ok).length + states.filter((s) => !s.ok).length + keyboard.reduce((n, k) => n + k.checks.filter((c) => !c.pass).length, 0);
  console.log(`\n${shots.length} screenshots, ${states.length} states, ${findings} with findings → ${join(out, 'REPORT.md')}`);
  if (flag('strict') && findings) {
    console.log('Strict mode: failing because of the findings above.');
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('run.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
