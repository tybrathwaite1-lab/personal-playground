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
 * Creative Slice 01: the homepage in each atmosphere (atmosphere/<state>-<w>.jpg and -fold.jpg),
 * with the same axe, overflow and page-error checks, counted as findings in strict mode.
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

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

interface WidthResult {
  width: number;
  files: string[];
  overflowPx: number;
  offenders: string[];
  pageErrors: string[];
  axe: { id: string; impact: string | null; nodes: number; targets: string[] }[];
  keyboard: KeyCheck[];
  focus: { name: string; pass: boolean; detail: string }[];
  /** Activated in the browser: skip link, internal links, stray fragments, artwork recovery. */
  navigation: Check[];
  /** Measured in the browser: rendered colors of control states (hover, pressed, focus). */
  states: Check[];
  decor: { total: number; exposed: number };
  fonts: { caveatLoaded: boolean; caveatRequests: { url: string; bytes: number }[] };
}

/**
 * tsx (esbuild keepNames) wraps named functions in `__name(...)`; functions sent to the page via
 * evaluate() then need that helper in the browser too. It only labels functions.
 */
const NAME_SHIM = 'window.__name = window.__name || function (f) { return f; };';

async function newContext(browser: Browser, origin: string, width: number, reducedMotion: 'reduce' | 'no-preference', blocked: Set<string>) {
  const ctx = await browser.newContext({
    viewport: { width, height: WIDTHS[width] },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    reducedMotion,
    serviceWorkers: 'block',
  });
  await ctx.addInitScript(NAME_SHIM);
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
  const states = await controlStates(page);
  await ctx.close();
  const navigation = await navigationChecks(browser, origin, width, blocked);
  return {
    width,
    files,
    overflowPx,
    offenders,
    pageErrors: errors,
    axe,
    keyboard,
    focus,
    navigation,
    states,
    decor,
    fonts: { caveatLoaded, caveatRequests: fontRequests },
  };
}

/** Where the page is: route hash, whether the style guide is rendered, and what has focus. */
async function where(page: Page) {
  return page.evaluate(() => ({
    hash: location.hash,
    guide: document.querySelector('h1')?.textContent === 'Style guide',
    focused: document.activeElement?.id ?? '',
    title: document.title,
  }));
}

/**
 * Activate (not just focus) the skip link and every internal link, by keyboard and pointer, and
 * check the route, the page, focus and scroll; then a stray fragment, the app's own skip link,
 * and the failed-image recovery.
 */
async function navigationChecks(browser: Browser, origin: string, width: number, blocked: Set<string>): Promise<Check[]> {
  const checks: Check[] = [];
  const ctx = await newContext(browser, origin, width, 'reduce', blocked);
  const { page } = await open(ctx, origin, '#/styleguide');

  // Skip link: Tab to it, press Enter.
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.dataset.inPageLink ?? '');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  let w = await where(page);
  checks.push({
    name: 'Skip link (keyboard Enter) moves focus to the content and keeps the route',
    pass: first === 'sg-main' && w.hash === '#/styleguide' && w.guide && w.focused === 'sg-main',
    detail: `first stop ${first || 'none'} → hash ${w.hash}, style guide ${w.guide ? 'shown' : 'GONE'}, focus #${w.focused}`,
  });

  // Every internal link: clicked, and the first one also by keyboard.
  const links = [...new Set(await page.$$eval('a[data-in-page-link]:not([data-in-page-link="sg-main"])', (as) => as.map((a) => (a as HTMLElement).dataset.inPageLink!)))];
  for (const [i, to] of links.entries()) {
    for (const how of i === 0 ? (['click', 'Enter'] as const) : (['click'] as const)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const link = page.locator(`a[data-in-page-link="${to}"]`).first();
      if (how === 'click') await link.click();
      else {
        await link.focus();
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(200);
      w = await where(page);
      const top = await page.evaluate((id) => document.getElementById(id)?.getBoundingClientRect().top ?? NaN, to);
      checks.push({
        name: `Internal link to #${to} (${how})`,
        pass: w.hash === '#/styleguide' && w.guide && w.focused === to && top >= -2 && top < (WIDTHS[width] ?? 800),
        detail: `hash ${w.hash}, style guide ${w.guide ? 'shown' : 'GONE'}, focus #${w.focused}, target top ${Math.round(top)}px`,
      });
    }
  }
  if (links.length < 3) checks.push({ name: 'Internal links found', pass: false, detail: `${links.length}` });

  // A stray bare fragment (e.g. a link's default navigation) must not replace the route.
  await page.evaluate(() => {
    location.hash = '#sg-controls';
  });
  await page.waitForTimeout(200);
  w = await where(page);
  checks.push({ name: 'A bare #fragment keeps the style guide', pass: w.guide, detail: `hash ${w.hash}, style guide ${w.guide ? 'shown' : 'GONE'}` });

  // Failed image → replacement recovers.
  await page.evaluate(() => {
    location.hash = '#/styleguide';
  });
  await page.waitForTimeout(200);
  const demo = page.locator('[data-demo="artwork-recovery"]');
  await demo.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const before = await demo.evaluate((d) => ({ missing: Boolean(d.querySelector('[data-artwork="missing"]')), img: Boolean(d.querySelector('img')) }));
  await demo.getByRole('button', { name: 'Load a replacement' }).click();
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-demo="artwork-recovery"] img') as HTMLImageElement | null;
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }, undefined, { timeout: 5000 }).catch(() => undefined);
  const after = await demo.evaluate((d) => {
    const img = d.querySelector('img') as HTMLImageElement | null;
    return { missing: Boolean(d.querySelector('[data-artwork="missing"]')), loaded: Boolean(img && img.complete && img.naturalWidth > 0), credit: d.querySelector('figcaption')?.textContent ?? '' };
  });
  checks.push({
    name: 'A failed image shows the fallback, then recovers when the source is replaced',
    pass: before.missing && !before.img && !after.missing && after.loaded && /Illustration · /.test(after.credit),
    detail: `before: ${before.missing ? 'fallback' : 'no fallback'}; after: ${after.loaded ? 'image loaded' : 'NOT loaded'}, ${after.missing ? 'fallback still shown' : 'fallback gone'}, caption "${after.credit}"`,
  });
  await ctx.close();

  // The app's in-page links (skip link, Pulse "Sources"): activated by keyboard from a scrolled
  // position; the exact original hash (route + parameters) must survive, focus and scroll must
  // reach the target, and a reload must reopen the same route.
  const cases = [
    { start: '#/discover?exp=exp-analog-evening', link: 'main', label: 'App skip link on Discover (with route parameters)' },
    { start: '#/pulse', link: 'main', label: 'App skip link on Pulse' },
    { start: '#/pulse', link: 'pulse-sources', label: 'Pulse "Sources" link' },
  ];
  for (const c of cases) {
    const app = await newContext(browser, origin, width, 'reduce', blocked);
    const { page: p2 } = await open(app, origin, c.start);
    const before = await p2.evaluate(() => ({ hash: location.hash, title: document.title, h1: document.querySelector('main h1')?.textContent ?? '' }));
    const link = p2.locator(`a[data-in-page-link="${c.link}"]`).first();
    if (c.link === 'main') {
      await p2.keyboard.press('Tab'); // the skip link is the first stop
      await p2.evaluate(() => window.scrollTo(0, 600)); // focus stays on the link
    } else {
      await link.scrollIntoViewIfNeeded();
      await link.focus();
    }
    const onLink = await p2.evaluate((to) => (document.activeElement as HTMLElement | null)?.dataset.inPageLink === to, c.link);
    await p2.keyboard.press('Enter');
    await p2.waitForTimeout(250);
    const after = await p2.evaluate((id) => {
      const t = document.getElementById(id);
      return { hash: location.hash, title: document.title, h1: document.querySelector('main h1')?.textContent ?? '', focused: document.activeElement?.id ?? '', top: t ? t.getBoundingClientRect().top : NaN };
    }, c.link);
    await p2.reload({ waitUntil: 'networkidle' });
    await p2.waitForTimeout(250);
    const reloaded = await p2.evaluate(() => ({ hash: location.hash, title: document.title, h1: document.querySelector('main h1')?.textContent ?? '' }));
    const vh = WIDTHS[width] ?? 800;
    checks.push({
      name: `${c.label}: Enter keeps ${c.start}, focuses and scrolls to #${c.link}, survives reload`,
      pass:
        onLink &&
        after.hash === before.hash &&
        before.hash === c.start &&
        after.focused === c.link &&
        after.top >= -2 &&
        after.top < vh &&
        after.title === before.title &&
        after.h1 === before.h1 &&
        reloaded.hash === c.start &&
        reloaded.title === before.title &&
        reloaded.h1 === before.h1,
      detail: `activated from the link: ${onLink}; hash ${before.hash} → ${after.hash} → after reload ${reloaded.hash}; focus #${after.focused}; target top ${Math.round(after.top)}px; page "${before.title}" → "${after.title}" → after reload "${reloaded.title}"`,
    });
    await app.close();
  }
  return checks;
}

/**
 * Rendered colors of control states, measured in the browser: hovered and pressed chips,
 * primary buttons, and focus rings, composited over their surface.
 */
async function controlStates(page: Page): Promise<Check[]> {
  const checks: Check[] = [];
  const forms = await page.$$eval('form[data-surface]', (fs) => fs.map((f) => f.getAttribute('data-surface')!));
  const measure = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0', '1']).map(Number) as number[];
      const surfaceEl = el.closest('[data-surface]')!;
      const bgS = parse(getComputedStyle(surfaceEl).backgroundColor);
      const s = getComputedStyle(el);
      const bg = parse(s.backgroundColor);
      const a = bg.length > 3 ? bg[3] : 1;
      const fill = [0, 1, 2].map((i) => bg[i] * a + bgS[i] * (1 - a));
      const lum = (c: number[]) => {
        const [r, g, b] = c.slice(0, 3).map((x) => {
          const v = x / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const cr = (x: number[], y: number[]) => {
        const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p);
        return (h + 0.05) / (l + 0.05);
      };
      const text = parse(s.color);
      const ring = parse(s.outlineColor);
      return {
        text: cr(text, fill),
        fillVsSurface: cr(fill, bgS),
        ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 ? cr(ring, bgS) : 0,
      };
    });
  for (const t of forms) {
    const scope = `form[data-surface="${t}"]`;
    const pressed = `${scope} .ui-chip[aria-pressed="true"]`;
    const plain = `${scope} .ui-chip[aria-pressed="false"]`;
    const primary = `${scope} .ui-button-primary`;
    await page.mouse.move(0, 0);
    const pressedRest = await measure(pressed);
    await page.locator(pressed).hover();
    await page.waitForTimeout(250);
    const pressedHover = await measure(pressed);
    await page.locator(plain).first().hover();
    await page.waitForTimeout(250);
    const plainHover = await measure(`${plain} >> nth=0`);
    await page.locator(primary).hover();
    await page.waitForTimeout(250);
    const primaryHover = await measure(primary);
    await page.mouse.move(0, 0);
    await page.keyboard.press('Shift');
    await page.locator(pressed).focus();
    await page.waitForTimeout(250);
    const pressedFocus = await measure(pressed);
    const f = (n: number) => n.toFixed(2);
    checks.push(
      { name: `${t}: pressed chip text (rest / hover)`, pass: pressedRest.text >= 4.5 && pressedHover.text >= 4.5, detail: `${f(pressedRest.text)} / ${f(pressedHover.text)}:1` },
      { name: `${t}: pressed chip fill vs surface (rest / hover)`, pass: pressedRest.fillVsSurface >= 3 && pressedHover.fillVsSurface >= 3, detail: `${f(pressedRest.fillVsSurface)} / ${f(pressedHover.fillVsSurface)}:1` },
      { name: `${t}: pressed chip focus ring vs surface`, pass: pressedFocus.ring >= 3 && pressedFocus.text >= 4.5, detail: `ring ${f(pressedFocus.ring)}:1, text ${f(pressedFocus.text)}:1` },
      { name: `${t}: chip hover text`, pass: plainHover.text >= 4.5, detail: `${f(plainHover.text)}:1` },
      { name: `${t}: primary button hover text`, pass: primaryHover.text >= 4.5, detail: `${f(primaryHover.text)}:1` },
    );
  }
  if (forms.length < 4) checks.push({ name: 'Control surfaces found', pass: false, detail: `${forms.length}` });
  return checks;
}

/** The cover headline at narrow, intermediate and wide widths: words never break, ≤ 2 lines. */
async function coverChecks(browser: Browser, origin: string, blocked: Set<string>) {
  const out: { width: number; file: string; fontSize: string; lines: number; brokenWords: string[]; overflow: boolean; pass: boolean }[] = [];
  await mkdir(join(OUT, 'cover'), { recursive: true });
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addInitScript(NAME_SHIM);
    await ctx.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      blocked.add(url.host);
      return route.abort('blockedbyclient');
    });
    const page = await ctx.newPage();
    await page.goto(`${origin}${BASE}#/styleguide`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await hideBodyGrain(page);
    const r = await page.evaluate(() => {
      const h = document.getElementById('sg-cover-title')!;
      const node = h.firstChild as Text;
      const words: string[] = [];
      const tops = new Set<number>();
      const text = node.textContent ?? '';
      for (const m of text.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, m.index!);
        range.setEnd(node, m.index! + m[0].length);
        const rects = [...range.getClientRects()].filter((x) => x.width > 0);
        if (new Set(rects.map((x) => Math.round(x.top))).size > 1) words.push(m[0]);
        rects.forEach((x) => tops.add(Math.round(x.top)));
      }
      return { fontSize: getComputedStyle(h).fontSize, lines: tops.size, brokenWords: words, overflow: h.scrollWidth > h.clientWidth + 1 };
    });
    const file = `cover/${width}.jpg`;
    await page.locator('[aria-labelledby="sg-cover-title"]').screenshot({ path: join(OUT, file), type: 'jpeg', quality: 75 });
    out.push({ width, file, ...r, pass: r.brokenWords.length === 0 && !r.overflow && r.lines <= 2 });
    await ctx.close();
  }
  return out;
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

/** The Editorial Cover homepage in each atmosphere: screenshots plus axe, overflow and errors. */
async function atmosphereChecks(browser: Browser, origin: string, blocked: Set<string>) {
  const surfaces: Record<string, string> = { morning: 'cream', afternoon: 'teal', 'after-hours': 'editorial' };
  const out: { atmosphere: string; width: number; applied: boolean; nameplate: { lines: number; broken: string[]; pass: boolean }; overflowPx: number; offenders: string[]; pageErrors: string[]; axe: WidthResult['axe']; files: string[] }[] = [];
  await mkdir(join(OUT, 'atmosphere'), { recursive: true });
  for (const width of Object.keys(WIDTHS).map(Number))
    for (const atmosphere of Object.keys(surfaces)) {
      const ctx = await newContext(browser, origin, width, 'reduce', blocked);
      await ctx.addInitScript((a) => localStorage.setItem('personal-playground:atmosphere', a), atmosphere);
      const { page, errors } = await open(ctx, origin, '#/');
      await hideBodyGrain(page);
      const applied = await page.evaluate(
        ([a, tone]) => document.documentElement.dataset.atmosphere === a && document.querySelector('[data-home-area="cover"]')?.getAttribute('data-surface') === tone,
        [atmosphere, surfaces[atmosphere]],
      );
      // The nameplate never breaks a word: two lines on phones, one on wider screens.
      const np = await page.evaluate(() => {
        const h = document.getElementById('cover-title')!;
        const tops = new Set<number>();
        const broken: string[] = [];
        const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent ?? '';
          for (const m of text.matchAll(/\S+/g)) {
            const r = document.createRange();
            r.setStart(n, m.index!);
            r.setEnd(n, m.index! + m[0].length);
            const rows = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
            rows.forEach((t) => tops.add(t));
            if (rows.size > 1) broken.push(m[0]);
          }
        }
        return { lines: tops.size, broken };
      });
      const nameplate = { ...np, pass: !np.broken.length && np.lines === (width < 768 ? 2 : 1) };
      const axe = (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')),
      }));
      const { overflowPx, offenders } = await measureOverflow(page);
      const files = [`atmosphere/${atmosphere}-${width}-fold.jpg`, `atmosphere/${atmosphere}-${width}.jpg`];
      await page.screenshot({ path: join(OUT, files[0]), type: 'jpeg', quality: 78 });
      await page.screenshot({ path: join(OUT, files[1]), type: 'jpeg', quality: 70, fullPage: true });
      out.push({ atmosphere, width, applied, nameplate, overflowPx, offenders, pageErrors: errors, axe, files });
      await ctx.close();
    }
  return out;
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
    // Loading means an @font-face URL to a Caveat file; the `font-hand` utility naming the
    // family is fine (the browser fetches nothing until a font-face for it is declared).
    entryReferencesCaveat: /caveat-[\w-]+\.(?:woff2?|ttf|otf)/i.test(entryText),
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
    L.push('', '**Activated in the browser**', '');
    for (const k of w.navigation) L.push(`- ${k.pass ? '✅' : '❌'} ${k.name}: ${k.detail}`);
    L.push('', '**Control states, measured**', '');
    for (const k of w.states) L.push(`- ${k.pass ? '✅' : '❌'} ${k.name}: ${k.detail}`);
    L.push('', `Screenshots: ${w.files.map((f) => `[${f}](${f})`).join(' · ')}`, '');
  }
  L.push('## Homepage atmospheres (Creative Slice 01)', '');
  for (const a of r.atmospheres)
    L.push(
      `- ${a.applied && a.nameplate.pass && !a.axe.length && a.overflowPx <= 1 && !a.pageErrors.length ? '✅' : '❌'} ${a.atmosphere} @ ${a.width}px: ${a.applied ? 'applied' : 'NOT APPLIED'}; nameplate ${a.nameplate.lines} line(s)${a.nameplate.broken.length ? `, BROKEN: ${a.nameplate.broken.join(', ')}` : ', no broken words'}; axe ${a.axe.length ? a.axe.map((x) => `\`${x.id}\` (${x.impact}, ${x.nodes}) ${x.targets.join(' / ')}`).join('; ') : 'no violations'}; overflow ${a.overflowPx}px${a.offenders.length ? ` (${a.offenders.join(', ')})` : ''}; errors ${a.pageErrors.length ? a.pageErrors.join(' / ') : 'none'} (${a.files.map((f) => `[${f}](${f})`).join(' · ')})`,
    );
  L.push('');
  L.push('## Cover headline', '');
  for (const c of r.cover) L.push(`- ${c.pass ? '✅' : '❌'} ${c.width}px: ${c.fontSize}, ${c.lines} line(s), ${c.brokenWords.length ? `BROKEN: ${c.brokenWords.join(', ')}` : 'no broken words'}${c.overflow ? ', OVERFLOW' : ''} ([${c.file}](${c.file}))`);
  L.push('');
  L.push('## Reduced motion', '');
  for (const m of r.reducedMotion) L.push(`- ${m.pass ? '✅' : '❌'} ${m.width}px: "${m.status}", stamp animation-duration ${m.animationDuration} ([${m.file}](${m.file}))`);
  L.push('', '## Fonts and bundle', '');
  L.push(`- ${r.home.pass ? '✅' : '❌'} The app shell (#/) requests no Caveat files (${r.home.requests} requests, loaded: ${r.home.loaded})`);
  L.push(`- ${r.bundle.entryReferencesCaveat ? '❌' : '✅'} App entry files (${r.bundle.entryFiles.join(', ')}) declare no Caveat font files`);
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
    const cover = await coverChecks(browser, origin, blocked);
    const atmospheres = await atmosphereChecks(browser, origin, blocked);
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
          [...w.keyboard, ...w.focus, ...w.navigation, ...w.states].filter((k) => !k.pass).length,
        0,
      ) +
      motion.filter((m) => !m.pass).length +
      cover.filter((c) => !c.pass).length +
      atmospheres.reduce((n, a) => n + (a.applied ? 0 : 1) + (a.nameplate.pass ? 0 : 1) + a.axe.length + (a.overflowPx > 1 ? 1 : 0) + a.pageErrors.length, 0) +
      (home.pass ? 0 : 1) +
      (b.entryReferencesCaveat ? 1 : 0) +
      (b.entryContainsStyleGuide ? 1 : 0) +
      (fontOk ? 0 : 1);
    return { branch: opt('branch') ?? 'local', commit: opt('commit') ?? 'local', findings, widths, reducedMotion: motion, cover, atmospheres, home, bundle: b, blockedHosts: [...blocked].sort() };
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
