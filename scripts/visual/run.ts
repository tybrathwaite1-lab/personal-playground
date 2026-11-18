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
 * Output (in --out): <width>/<route>.jpg, states/*.jpg, report.json and REPORT.md.
 * By default it reports findings and exits 0; --strict exits 1 on page errors, horizontal
 * overflow or serious/critical accessibility violations (turned on once the baseline is clean).
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
async function hideFixedOverlays(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'body::before { display: none !important; }' });
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (getComputedStyle(el).position === 'fixed') el.style.visibility = 'hidden';
    }
  });
}

type AxeRunner = (page: Page) => Promise<AxeViolation[]>;
async function loadAxe(): Promise<AxeRunner | null> {
  try {
    const { AxeBuilder } = await import('@axe-core/playwright');
    return async (page) => {
      const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ id: v.id, impact: v.impact ?? null, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
    };
  } catch {
    return null;
  }
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
  lines.push(`**${bad.length ? `${bad.length} screenshot(s) with findings` : 'No findings'}** · overflow: ${r.shots.filter((s) => s.overflowPx > 1).length} · page errors: ${r.shots.filter((s) => s.pageErrors.length).length} · serious/critical accessibility issues: ${r.axeSummary.length} rule(s)${r.axeAvailable ? '' : ' (axe not run)'}`, '');
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
  lines.push('', '## States', '');
  for (const s of r.states) lines.push(`- **${s.name}**: [${s.file}](${s.file})${s.note ? ` — ${s.note}` : ''}`);
  if (r.axeSummary.length) {
    lines.push('', '## Accessibility (axe, serious and critical)', '', '| Rule | Impact | Help | Where (route@width × nodes) |', '|---|---|---|---|');
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
  blockedHosts: string[];
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  const out = resolve(opt('out') ?? 'visual-out');
  const dist = resolve(opt('dist') ?? 'dist');
  const widths = opt('widths')?.split(',').map(Number) ?? DEFAULT_WIDTHS;
  const routes = opt('routes')?.split(',') ?? [...ROUTES];
  const axe = flag('no-axe') ? null : await loadAxe();
  if (!flag('no-axe') && !axe) console.warn('! @axe-core/playwright not available: accessibility checks skipped');

  await stat(join(dist, 'index.html')).catch(() => {
    throw new Error(`No build found at ${dist}. Run \`npm run build\` first.`);
  });
  const { server, origin } = await serveDist(dist);
  const browser = await chromium.launch(process.env.PP_CHROME ? { executablePath: process.env.PP_CHROME } : {});
  const blocked = new Set<string>();
  const shots: Shot[] = [];
  const states: Report['states'] = [];

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
    {
      const w = widths.includes(1280) ? 1280 : widths[widths.length - 1];
      const ctx = await newContext(browser, origin, w, blocked);
      const { page } = await openRoute(ctx, origin, 'home');
      for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
      const file = `states/keyboard-focus-${w}.jpg`;
      await page.screenshot({ path: join(out, file), type: 'jpeg', quality: 70 });
      const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120) ?? '');
      states.push({ name: `Keyboard focus after 3 × Tab (${w}px)`, file, note: focused ? `focused: ${focused.replace(/\|/g, '/')}` : undefined, ok: Boolean(focused) });
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
    blockedHosts: [...blocked].sort(),
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 1));
  await writeFile(join(out, 'REPORT.md'), markdown(report));

  const findings = shots.filter((s) => !s.ok).length + states.filter((s) => !s.ok).length;
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
