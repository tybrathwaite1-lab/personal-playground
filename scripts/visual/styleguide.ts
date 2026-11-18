/**
 * Style-guide evidence (Sprint 02 PR 2): screenshots and checks for the hidden #/styleguide
 * route at mobile and desktop widths. Separate from the standard screenshot harness and its
 * publisher (whose matrix and security policy are unchanged); it reuses the harness's static
 * server, overflow measurement and keyboard verifier read-only.
 *
 * Output (--out, default styleguide-out):
 *   <w>/full.jpg, <w>/fold.jpg, <w>/<section-or-composition>.jpg, <w>/focus-*.jpg,
 *   reduced-motion/<w>.jpg, report.json, REPORT.md
 * Checks: axe (WCAG A/AA, all impacts), horizontal overflow, page errors, keyboard, focus
 * visibility, reduced motion, decorative layers hidden, and the Caveat font's loading and
 * transfer size (loaded by the style guide, never by the app shell).
 *
 * Usage: npm run build && npx tsx scripts/visual/styleguide.ts [--out dir] [--strict]
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { AxeBuilder } from '@axe-core/playwright';
import { FROZEN_TIME, measureOverflow, serveDist, verifyKeyboard, type KeyCheck } from './run.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BASE = '/personal-playground/';
const WIDTHS: Record<number, number> = { 390: 844, 1280: 800 };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FONT_BUDGET = 64 * 1024; // the one handwritten face, Latin bold
const opt = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = join(ROOT, opt('out') ?? 'styleguide-out');
const DIST = join(ROOT, opt('dist') ?? 'dist');

interface WidthResult {
  width: number;
  files: string[];
  overflowPx: number;
  offenders: string[];
  pageErrors: string[];
  axe: { id: string; impact: string | null; nodes: number; targets: string[] }[];
  keyboard: KeyCheck[];
  focus: { name: string; pass: boolean; detail: string }[];
  decor: { total: number; exposed: number };
  fonts: { caveatLoaded: boolean; caveatRequests: { url: string; bytes: number }[] };
}

async function newContext(browser: Browser, origin: string, width: number, reducedMotion: 'reduce' | 'no-preference', blocked: Set<string>) {
  const ctx = await browser.newContext({
    viewport: { width, height: WIDTHS[width] },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    reducedMotion,
    serviceWorkers: 'block',
  });
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    blocked.add(url.host);
    return route.abort('blockedbyclient');
  });
  return ctx;
}

async function open(ctx: BrowserContext, origin: string, hash: string) {
  const page = await ctx.newPage();
  const errors: string[] = [];
  const fontRequests: { url: string; bytes: number }[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/^Failed to load resource/.test(t) && /(^|\s)(Uncaught|[A-Za-z]*Error)\b/.test(t)) errors.push(t.split('\n')[0]);
  });
  page.on('response', async (r) => {
    if (/caveat/i.test(r.url())) fontRequests.push({ url: r.url().replace(/^.*\/assets\//, 'assets/'), bytes: (await r.body().catch(() => Buffer.alloc(0))).length });
  });
  await page.clock.setFixedTime(new Date(FROZEN_TIME));
  await page.goto(`${origin}${BASE}${hash}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(700); // let entrance and stamp animations finish
  return { page, errors, fontRequests };
}

/** Hide the app's fixed full-page grain so full-page screenshots aren't streaked. */
async function hideBodyGrain(page: Page) {
  await page.addStyleTag({ content: 'body::before{display:none!important}' });
}

async function capture(browser: Browser, origin: string, width: number, blocked: Set<string>): Promise<WidthResult> {
  const dir = join(OUT, String(width));
  await mkdir(dir, { recursive: true });
  const ctx = await newContext(browser, origin, width, 'no-preference', blocked);
  const { page, errors, fontRequests } = await open(ctx, origin, '#/styleguide');
  const files: string[] = [];
  const shot = async (name: string, take: (path: string) => Promise<unknown>) => {
    const path = join(dir, `${name}.jpg`);
    await take(path);
    files.push(`${width}/${name}.jpg`);
  };

  await shot('fold', (path) => page.screenshot({ path, type: 'jpeg', quality: 75 }));
  const axe = (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
  }));
  const { overflowPx, offenders } = await measureOverflow(page);
  const decor = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[data-decor]'));
    return { total: all.length, exposed: all.filter((el) => el.getAttribute('aria-hidden') !== 'true' || getComputedStyle(el).pointerEvents !== 'none').length };
  });
  const caveatLoaded = await page.evaluate(() => document.fonts.check('700 26px Caveat'));

  await hideBodyGrain(page);
  await shot('full', (path) => page.screenshot({ path, type: 'jpeg', quality: 62, fullPage: true }));
  // Each section and each composition on its own, for review at readable size.
  const parts = await page.$$eval('section[aria-labelledby], article[aria-labelledby], [role="group"][aria-labelledby]', (els) =>
    els.map((e) => e.getAttribute('aria-labelledby')).filter((x): x is string => Boolean(x)),
  );
  for (const id of parts) {
    const el = await page.$(`[aria-labelledby="${id}"]`);
    if (el) await shot(id.replace(/^sg-/, ''), (path) => el.screenshot({ path, type: 'jpeg', quality: 72 }));
  }

  // Focus: the keyboard verifier from the harness (skip link, order, indicator, Shift+Tab) …
  await page.evaluate(() => window.scrollTo(0, 0));
  const keyboard = (await verifyKeyboard(page)).checks;
  // … and a focused control of each kind on a light and a dark surface.
  const focus: WidthResult['focus'] = [];
  for (const [label, selector] of [
    ['cream-input', '[data-surface="cream"] .ui-input'],
    ['cobalt-chip', '[data-surface="cobalt"] .ui-chip'],
    ['mustard-primary', '[data-surface="mustard"] .ui-button-primary'],
  ] as const) {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    await page.keyboard.press('Shift+Tab').catch(() => undefined);
    await el.focus();
    // Focus via keyboard semantics so :focus-visible applies to buttons as well.
    await page.keyboard.press('Shift');
    const ring = await el.evaluate((n) => {
      const s = getComputedStyle(n);
      return { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, visible: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2, focused: document.activeElement === n };
    });
    focus.push({ name: `Focus ring on ${label}`, pass: ring.focused && ring.visible, detail: ring.outline });
    const form = el.locator('xpath=ancestor::*[@data-surface][1]');
    await shot(`focus-${label}`, (path) => form.screenshot({ path, type: 'jpeg', quality: 80 }));
  }
  await ctx.close();
  return {
    width,
    files,
    overflowPx,
    offenders,
    pageErrors: errors,
    axe,
    keyboard,
    focus,
    decor,
    fonts: { caveatLoaded, caveatRequests: fontRequests },
  };
}

async function reducedMotion(browser: Browser, origin: string, width: number, blocked: Set<string>) {
  const ctx = await newContext(browser, origin, width, 'reduce', blocked);
  const page = await ctx.newPage();
  await page.goto(`${origin}${BASE}#/styleguide`, { waitUntil: 'networkidle' });
  const motion = page.locator('[aria-labelledby="sg-motion"]');
  await motion.scrollIntoViewIfNeeded();
  // Immediately, with no settling time: under reduced motion the stamp is already at rest.
  const state = await motion.evaluate((s) => {
    const stamp = s.querySelector('.animate-stamp-in');
    const cs = stamp ? getComputedStyle(stamp) : null;
    return { status: s.querySelector('[role="status"]')?.textContent ?? '', duration: cs?.animationDuration ?? '', opacity: cs?.opacity ?? '' };
  });
  await mkdir(join(OUT, 'reduced-motion'), { recursive: true });
  await motion.screenshot({ path: join(OUT, 'reduced-motion', `${width}.jpg`), type: 'jpeg', quality: 80 });
  await ctx.close();
  const seconds = parseFloat(state.duration);
  return {
    width,
    file: `reduced-motion/${width}.jpg`,
    status: state.status,
    animationDuration: state.duration,
    pass: /Reduced motion is on/.test(state.status) && seconds <= 0.001 && state.opacity === '1',
  };
}

/** The app shell must not load the handwritten face. */
async function homeLoadsNoCaveat(browser: Browser, origin: string, blocked: Set<string>) {
  const ctx = await newContext(browser, origin, 390, 'reduce', blocked);
  const { page, fontRequests } = await open(ctx, origin, '#/');
  const caveat = await page.evaluate(() => Array.from(document.fonts).some((f) => /caveat/i.test(f.family) && f.status === 'loaded'));
  await ctx.close();
  return { requests: fontRequests.length, loaded: caveat, pass: fontRequests.length === 0 && !caveat };
}

/** Bundle facts from dist/: font files, the style guide chunk, and the app entry. */
async function bundle() {
  const assets = await readdir(join(DIST, 'assets'));
  const size = async (f: string) => {
    const b = await readFile(join(DIST, 'assets', f));
    return { file: f, bytes: b.length, gzip: gzipSync(b).length };
  };
  const caveat = await Promise.all(assets.filter((f) => /^caveat-latin-700-normal.*\.woff2$/.test(f)).map(size));
  const caveatAll = assets.filter((f) => /caveat/i.test(f));
  const html = await readFile(join(DIST, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/assets\/([^"]+\.(?:js|css))/g)].map((m) => m[1]);
  const entryText = (await Promise.all(entries.map((e) => readFile(join(DIST, 'assets', e), 'utf8')))).join('\n');
  const guide = await Promise.all(assets.filter((f) => /^StyleGuide-.*\.(js|css)$/.test(f)).map(size));
  return {
    caveatFiles: caveatAll,
    caveatLatinBold: caveat,
    entryFiles: entries,
    entryReferencesCaveat: /caveat/i.test(entryText),
    entryContainsStyleGuide: /Skip to style guide/.test(entryText),
    styleGuideChunks: guide,
  };
}

function markdown(r: Awaited<ReturnType<typeof run>>) {
  const L: string[] = ['# Style guide evidence', '', `Branch \`${r.branch}\` · commit \`${r.commit}\` · frozen clock ${FROZEN_TIME}`, ''];
  L.push(`**${r.findings} finding(s)** · widths ${r.widths.map((w) => `${w.width}px`).join(', ')}`, '');
  for (const w of r.widths) {
    L.push(`## ${w.width}px`, '');
    L.push(`- Accessibility (axe, WCAG A/AA, all impacts): ${w.axe.length ? w.axe.map((a) => `\`${a.id}\` (${a.impact}, ${a.nodes}) ${a.targets.join(' / ')}`).join('; ') : 'no violations'}`);
    L.push(`- Horizontal overflow: ${w.overflowPx}px${w.offenders.length ? ` (${w.offenders.join(', ')})` : ''}`);
    L.push(`- Page errors: ${w.pageErrors.length ? w.pageErrors.join(' / ') : 'none'}`);
    L.push(`- Decorative layers: ${w.decor.total}, exposed to assistive tech or pointer: ${w.decor.exposed}`);
    L.push(`- Caveat loaded on the style guide: ${w.fonts.caveatLoaded ? 'yes' : 'no'} (${w.fonts.caveatRequests.map((f) => `${f.url} ${f.bytes} B`).join(', ') || 'no request'})`);
    for (const k of [...w.keyboard, ...w.focus]) L.push(`- ${k.pass ? '✅' : '❌'} ${k.name}: ${k.detail}`);
    L.push('', `Screenshots: ${w.files.map((f) => `[${f}](${f})`).join(' · ')}`, '');
  }
  L.push('## Reduced motion', '');
  for (const m of r.reducedMotion) L.push(`- ${m.pass ? '✅' : '❌'} ${m.width}px: "${m.status}", stamp animation-duration ${m.animationDuration} ([${m.file}](${m.file}))`);
  L.push('', '## Fonts and bundle', '');
  L.push(`- ${r.home.pass ? '✅' : '❌'} The app shell (#/) requests no Caveat files (${r.home.requests} requests, loaded: ${r.home.loaded})`);
  L.push(`- ${r.bundle.entryReferencesCaveat ? '❌' : '✅'} App entry files (${r.bundle.entryFiles.join(', ')}) don't reference Caveat`);
  L.push(`- ${r.bundle.entryContainsStyleGuide ? '❌' : '✅'} The style guide is a separate chunk: ${r.bundle.styleGuideChunks.map((c) => `${c.file} ${c.bytes} B (${c.gzip} B gzip)`).join(', ')}`);
  L.push(`- Caveat Bold, Latin: ${r.bundle.caveatLatinBold.map((c) => `${c.file} ${c.bytes} B`).join(', ')} (budget ${FONT_BUDGET} B; WOFF2 is already compressed)`);
  L.push(`- All Caveat files in the build: ${r.bundle.caveatFiles.join(', ')}`);
  L.push(`- Blocked external requests: ${r.blockedHosts.length ? r.blockedHosts.join(', ') : 'none'}`, '');
  return L.join('\n');
}

async function run() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await stat(join(DIST, 'index.html'));
  const { server, origin } = await serveDist(DIST);
  const browser = await chromium.launch(process.env.PP_CHROME ? { executablePath: process.env.PP_CHROME } : {});
  const blocked = new Set<string>();
  try {
    const widths: WidthResult[] = [];
    for (const w of Object.keys(WIDTHS).map(Number)) widths.push(await capture(browser, origin, w, blocked));
    const motion = [];
    for (const w of Object.keys(WIDTHS).map(Number)) motion.push(await reducedMotion(browser, origin, w, blocked));
    const home = await homeLoadsNoCaveat(browser, origin, blocked);
    const b = await bundle();
    const fontOk = b.caveatLatinBold.length === 1 && b.caveatLatinBold.every((c) => c.bytes <= FONT_BUDGET);
    const findings =
      widths.reduce(
        (n, w) =>
          n +
          w.axe.length +
          (w.overflowPx > 1 ? 1 : 0) +
          w.pageErrors.length +
          w.decor.exposed +
          (w.fonts.caveatLoaded ? 0 : 1) +
          [...w.keyboard, ...w.focus].filter((k) => !k.pass).length,
        0,
      ) +
      motion.filter((m) => !m.pass).length +
      (home.pass ? 0 : 1) +
      (b.entryReferencesCaveat ? 1 : 0) +
      (b.entryContainsStyleGuide ? 1 : 0) +
      (fontOk ? 0 : 1);
    return { branch: opt('branch') ?? 'local', commit: opt('commit') ?? 'local', findings, widths, reducedMotion: motion, home, bundle: b, blockedHosts: [...blocked].sort() };
  } finally {
    await browser.close();
    server.close();
  }
}

const result = await run();
await writeFile(join(OUT, 'report.json'), JSON.stringify(result, null, 1));
await writeFile(join(OUT, 'REPORT.md'), markdown(result));
console.log(markdown(result));
if (process.argv.includes('--strict') && result.findings) {
  console.log(`Strict mode: ${result.findings} finding(s).`);
  process.exit(1);
}
