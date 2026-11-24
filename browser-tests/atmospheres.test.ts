/**
 * Creative Slice 03, Phase 3.3: shell atmospheres in a real browser, at desktop and phone
 * widths. No controls ship yet, so a saved appearance is seeded into localStorage as a future
 * build would store it. Checks: the default Playground is unchanged; each atmosphere sets the
 * shell (colour, type, rules, indicators) and every colour set reaches the page and the
 * browser's chrome; it survives navigation and reloads; malformed values fall back to the
 * default; the saved atmosphere is on screen before the app's code runs (no flash); keyboard
 * navigation and the owner tools still work. Synthetic data only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Page, Route } from 'playwright-core';
import { browserSuite, MOBILE, scenario } from './helpers/harness.ts';
import { contrast, type RGB } from '../tests/helpers/contrast.ts';

browserSuite();

const KEY = 'personal-playground:appearance';
const saved = (look: string, palette?: string, type?: string) => ({ v: 1, look, custom: palette ? { [look]: { palette, type } } : {} });

/** Each colour set's page colour, read from the tokens (so this test can't drift from them). */
const tokens = readFileSync(new URL('../src/styles/atmospheres/tokens.css', import.meta.url), 'utf8');
function pageColour(look: string, palette: string) {
  const block = new RegExp(`html\\[data-look='${look}'\\]\\[data-look-palette='${palette}'\\] \\{([^}]*)\\}`).exec(tokens)![1];
  const [r, g, b] = /--pp-ink: (\d+) (\d+) (\d+);/.exec(block)!.slice(1).map(Number);
  const scheme = /color-scheme: (light|dark);/.exec(block)![1];
  return { rgb: `rgb(${r}, ${g}, ${b})`, hex: `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase(), scheme };
}

const rgbOf = (c: string) => /^rgba?\((\d+), (\d+), (\d+)/.exec(c)!.slice(1, 4).map(Number) as RGB;

/** What the shell looks like right now, measured. */
interface Shell {
  look: string | null;
  palette: string | null;
  type: string | null;
  body: string;
  themeColor: string;
  colorScheme: string;
  grain: string;
  rule: { width: string; color: string; image: string };
  headerBg: string;
  wordmark: { font: string; transform: string };
  nav: { font: string; transform: string };
  cover: string | null;
  atmosphere: string | undefined;
}
// Sent as source text: tsx would wrap the named helpers below in __name(), which the page lacks.
const SHELL = `(() => {
    const q = (s) => document.querySelector(s);
    const cs = (s) => (q(s) ? getComputedStyle(q(s)) : null);
    const d = document.documentElement.dataset;
    const header = cs('[data-shell="header"]');
    const wordmark = cs('[data-shell="wordmark"]');
    const visible = (s) => !!q(s) && q(s).getBoundingClientRect().width > 0;
    const navSel = visible('[data-shell="nav"]') ? '[data-shell="nav"] .nav-link' : '[data-shell="tabbar"] .tab-link span';
    const nav = cs(navSel);
    return {
      look: d.look ?? null,
      palette: d.lookPalette ?? null,
      type: d.lookType ?? null,
      body: getComputedStyle(document.body).backgroundColor,
      themeColor: q('meta[name="theme-color"]').getAttribute('content'),
      colorScheme: q('meta[name="color-scheme"]').getAttribute('content'),
      grain: getComputedStyle(document.body, '::before').display,
      rule: { width: header.borderTopWidth, color: header.borderTopColor, image: header.backgroundImage },
      headerBg: header.backgroundColor,
      wordmark: { font: wordmark.fontFamily.split(',')[0].replace(/["']/g, '').trim(), transform: wordmark.textTransform },
      nav: { font: nav.fontFamily.split(',')[0].replace(/["']/g, '').trim(), transform: nav.textTransform },
      cover: q('[data-home-area="cover"]')?.getAttribute('data-surface') ?? null,
      atmosphere: d.atmosphere,
    };
})()`;
const shell = (page: Page) => page.evaluate(SHELL) as Promise<Shell>;
const withoutColour = (r: Shell['rule']) => ({ width: r.width, image: r.image });

/** The default Playground, as it is on main (time-of-day atmosphere at 3 PM: afternoon). The rule's colour is the
 * time-of-day atmosphere's own concern (tests/atmosphere.test.ts), not compared here. */
const DEFAULT = {
  look: null,
  palette: null,
  type: null,
  body: 'rgb(20, 22, 20)',
  themeColor: '#141614',
  colorScheme: 'dark',
  grain: 'block',
  rule: { width: '3px', image: 'none' },
  wordmark: { font: 'Anton', transform: 'uppercase' },
  cover: 'teal',
  atmosphere: 'afternoon',
};

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`with nothing chosen, the shell is exactly the default Playground (${label})`, scenario({ viewport }, async ({ page, open, raw }) => {
    const fonts: string[] = [];
    page.on('request', (r) => /newsreader/i.test(r.url()) && fonts.push(r.url()));
    for (const route of ['', 'plan', 'collection', 'backup']) {
      await open(route);
      if (route === '') await page.locator('[data-home-area="cover"]').waitFor();
      const { nav, cover, headerBg, ...rest } = await shell(page);
      // The translucent, blurred bar (bg-ink/90; the serialisation differs between build tools).
      assert.match(headerBg, /0\.9\)$/, `#/${route} header ${headerBg}`);
      const { cover: wantCover, ...want } = DEFAULT;
      assert.deepEqual({ ...rest, rule: withoutColour(rest.rule) }, want, `#/${route}`);
      assert.deepEqual(nav, { font: 'IBM Plex Mono', transform: 'uppercase' }, `#/${route} navigation labels`);
      if (route === '') assert.equal(cover, wantCover);
    }
    assert.deepEqual(fonts, [], 'the default never requests the Quiet Room serif');
    assert.equal(await raw(KEY), null, 'nothing stored');
  }));
}

/** Each atmosphere at its default colour set and type: the traits that make it recognisable. */
const LOOKS = {
  studio: {
    palette: 'poster',
    type: 'sans',
    wordmark: { font: 'IBM Plex Sans', transform: 'none' },
    nav: { font: 'IBM Plex Sans', transform: 'none' },
    grain: 'none',
    rule: (r: { width: string; image: string }) => r.width === '4px' && /linear-gradient/.test(r.image),
  },
  'quiet-room': {
    palette: 'linen',
    type: 'book',
    wordmark: { font: 'Newsreader', transform: 'none' },
    nav: { font: 'Newsreader', transform: 'none' },
    grain: 'none',
    rule: (r: { width: string; color: string; image: string }) => r.color === 'rgba(0, 0, 0, 0)' && r.image === 'none',
  },
  underground: {
    palette: 'newsstand',
    type: 'poster',
    wordmark: { font: 'Anton', transform: 'uppercase' },
    nav: { font: 'IBM Plex Mono', transform: 'uppercase' },
    grain: 'block',
    rule: (r: { width: string; color: string }) => r.width === '6px' && r.color === 'rgb(244, 198, 50)',
  },
} as const;

for (const [look, want] of Object.entries(LOOKS)) {
  for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
    test(`${look} sets the whole shell and survives navigation and reloads (${label})`, scenario({ viewport, storage: { [KEY]: saved(look) } }, async ({ page, open, reload, raw }) => {
      const stored = await (async () => (await open(''), raw(KEY)))();
      const page0 = pageColour(look, want.palette);
      const check = async (where: string) => {
        const s = await shell(page);
        assert.deepEqual({ look: s.look, palette: s.palette, type: s.type }, { look, palette: want.palette, type: want.type }, where);
        assert.equal(s.body, page0.rgb, `${where}: the page takes the colour set`);
        assert.equal(s.headerBg, page0.rgb, `${where}: an opaque top bar in the page colour`);
        assert.equal(s.themeColor, page0.hex, `${where}: browser chrome in the page colour`);
        assert.equal(s.colorScheme, page0.scheme, where);
        assert.deepEqual(s.wordmark, want.wordmark, `${where}: wordmark type`);
        assert.deepEqual(s.nav, want.nav, `${where}: navigation type`);
        assert.equal(s.grain, want.grain, `${where}: film grain`);
        assert.ok(want.rule(s.rule), `${where}: top rule ${JSON.stringify(s.rule)}`);
        assert.equal(s.atmosphere, 'afternoon', `${where}: time of day still tracked`);
        return s;
      };
      await page.locator('[data-home-area="cover"]').waitFor();
      assert.equal((await check('#/')).cover, 'teal', 'the Living Cover keeps its Newsstand surface');

      // Through the shell's own navigation: desktop links, or the phone's tab bar and menu.
      if (viewport) {
        await page.locator('[data-shell="tabbar"]').getByRole('link', { name: 'Pulse' }).click();
        await page.waitForURL(/#\/pulse$/);
        await check('#/pulse via the tab bar');
        await page.locator('[data-shell="tabbar"]').getByRole('button', { name: 'More' }).click();
        await page.locator('[data-shell="menu"]').getByRole('link', { name: /Field Notes/ }).click();
        await page.waitForURL(/#\/notes$/);
        await check('#/notes via the menu');
      } else {
        await page.locator('[data-shell="nav"]').getByRole('link', { name: 'Plan' }).click();
        await page.waitForURL(/#\/plan$/);
        assert.equal(await page.locator('[data-shell="nav"] [aria-current="page"]').textContent(), 'Plan');
        await check('#/plan via the top bar');
        await page.locator('[data-shell="settings"]').click();
        await page.waitForURL(/#\/backup$/);
        await check('#/backup via Settings');
      }
      await page.goBack();
      await check('after Back');
      await reload();
      await check('after a reload');
      assert.equal(await raw(KEY), stored, 'never rewritten by reading it');
    }));
  }
}

test('every colour set and type pairing reaches the page and the browser chrome', scenario({}, async ({ page, open }) => {
  await open('');
  const all: [string, string[], string[]][] = [
    ['studio', ['poster', 'sherbet', 'night'], ['sans', 'mono']],
    ['quiet-room', ['linen', 'sage', 'lamplight'], ['book', 'serif-sans']],
    ['underground', ['newsstand', 'daylight', 'forest'], ['poster', 'zine']],
  ];
  const seen = new Set<string>();
  for (const [look, palettes, types] of all) {
    for (const palette of palettes) {
      for (const type of types) {
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved(look, palette, type))]);
        await page.reload();
        await page.locator('main#main').waitFor({ state: 'attached' });
        const s = await shell(page);
        const want = pageColour(look, palette);
        assert.deepEqual([s.look, s.palette, s.type, s.body, s.themeColor, s.colorScheme], [look, palette, type, want.rgb, want.hex, want.scheme], `${look}/${palette}/${type}`);
        seen.add(`${s.wordmark.font}|${s.nav.font}|${s.nav.transform}`);
      }
    }
  }
  assert.ok(seen.size >= 5, `type pairings are distinct (${[...seen].join(' · ')})`);
}));

const MALFORMED: [string, string][] = [
  ['not JSON', '{look: studio'],
  ['a bare string', '"studio"'],
  ['an unversioned object', '{"look":"studio"}'],
  ['a future version', '{"v":2,"look":"studio"}'],
  ['an unknown atmosphere', '{"v":1,"look":"brutalist"}'],
  ['a look that is not a string', '{"v":1,"look":["studio"]}'],
  ['an inherited property name', '{"v":1,"look":"constructor"}'],
];
for (const [what, value] of MALFORMED) {
  test(`malformed storage (${what}) shows the default shell, from the first paint`, scenario({ storage: { [KEY]: value } }, async ({ page, open, raw }) => {
    await open('');
    await page.locator('[data-home-area="cover"]').waitFor();
    const s = await shell(page);
    assert.deepEqual({ look: s.look, palette: s.palette, type: s.type, body: s.body, themeColor: s.themeColor, colorScheme: s.colorScheme, grain: s.grain, rule: withoutColour(s.rule), wordmark: s.wordmark, cover: s.cover, atmosphere: s.atmosphere }, DEFAULT);
    assert.equal(await raw(KEY), value, 'left as it was');
  }));
}

test('an unknown colour set or type inside a valid atmosphere falls back to that atmosphere’s own', scenario(
  { storage: { [KEY]: '{"v":1,"look":"underground","custom":{"underground":{"palette":"linen","type":"mono"}}}' } },
  async ({ page, open }) => {
    await open('');
    const s = await shell(page);
    assert.deepEqual([s.look, s.palette, s.type, s.body, s.themeColor], ['underground', 'newsstand', 'poster', pageColour('underground', 'newsstand').rgb, pageColour('underground', 'newsstand').hex]);
  },
));

for (const [look, palette, type] of [['quiet-room', 'sage', 'serif-sans'], ['underground', 'daylight', 'zine'], ['studio', 'night', 'mono']] as const) {
  test(`no flash: ${look}/${palette} is on screen before the app's code runs`, scenario({ storage: { [KEY]: saved(look, palette, type) } }, async ({ page, origin }) => {
    // Every frame the browser renders is recorded, from the first, until the app mounts.
    await page.addInitScript(`
      window.__frames = [];
      requestAnimationFrame(function tick() {
        var root = document.getElementById('root');
        window.__frames.push({ bg: getComputedStyle(document.documentElement).backgroundColor, look: document.documentElement.getAttribute('data-look'), mounted: !!root && root.childElementCount > 0 });
        if (window.__frames.length < 400) requestAnimationFrame(tick);
      });
    `);
    // Hold the app's JavaScript: whatever is on screen meanwhile comes from index.html and CSS.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/assets\/[^/]*\.js(\?.*)?$/, async (route: Route) => {
      await held;
      await route.continue();
    });
    await page.goto(`${origin}/personal-playground/#/`, { waitUntil: 'commit' });
    const want = pageColour(look, palette);
    await page.waitForFunction((bg) => getComputedStyle(document.documentElement).backgroundColor === bg, want.rgb);
    const before = await page.evaluate(() => ({
      mounted: document.getElementById('root')!.childElementCount > 0,
      look: document.documentElement.dataset.look,
      palette: document.documentElement.dataset.lookPalette,
      type: document.documentElement.dataset.lookType,
      body: getComputedStyle(document.body).backgroundColor,
      themeColor: document.querySelector('meta[name="theme-color"]')!.getAttribute('content'),
      colorScheme: document.querySelector('meta[name="color-scheme"]')!.getAttribute('content'),
    }));
    assert.deepEqual(before, { mounted: false, look, palette, type, body: want.rgb, themeColor: want.hex, colorScheme: want.scheme }, 'before any app code ran');
    release();
    await page.locator('main#main').waitFor({ state: 'attached' });
    await page.waitForFunction(() => (window as unknown as { __frames: { mounted: boolean }[] }).__frames.some((f) => f.mounted));
    const frames = await page.evaluate(() => (window as unknown as { __frames: { bg: string; look: string | null; mounted: boolean }[] }).__frames);
    const painted = frames.filter((f) => f.bg !== 'rgba(0, 0, 0, 0)');
    assert.ok(painted.length > 0, 'frames were recorded');
    assert.deepEqual([...new Set(painted.map((f) => f.bg))], [want.rgb], 'every styled frame shows the chosen page colour: the default never appears');
    assert.ok(painted.every((f) => f.look === look));
    const s = await shell(page);
    assert.equal(s.themeColor, want.hex, 'the app keeps the same browser colour');
  }));
}

test('browser colours follow a change from another tab, and return to the default exactly', scenario({}, async ({ page, ctx, open }) => {
  await open('');
  const metas = () => shell(page).then((s) => [s.themeColor, s.colorScheme, s.body]);
  assert.deepEqual(await metas(), ['#141614', 'dark', 'rgb(20, 22, 20)']);
  const other = await ctx.newPage();
  await other.goto(page.url());
  await other.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, look: 'quiet-room', custom: {} })), KEY);
  const linen = pageColour('quiet-room', 'linen');
  // (Reduced motion still gives every property a 0.01 ms transition, so wait for the frame.)
  await page.waitForFunction((bg) => document.documentElement.dataset.look === 'quiet-room' && getComputedStyle(document.body).backgroundColor === bg, linen.rgb);
  assert.deepEqual(await metas(), [linen.hex, 'light', linen.rgb]);
  await other.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.waitForFunction(() => !document.documentElement.dataset.look && getComputedStyle(document.body).backgroundColor === 'rgb(20, 22, 20)');
  assert.deepEqual(await metas(), ['#141614', 'dark', 'rgb(20, 22, 20)']);
  await other.close();
}));

test('only The Quiet Room loads its serif', scenario({}, async ({ page, open }) => {
  const requests: string[] = [];
  page.on('request', (r) => /newsreader/i.test(r.url()) && requests.push(new URL(r.url()).pathname));
  await open('');
  for (const look of ['studio', 'underground']) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved(look))]);
    await page.reload();
    await page.locator('main#main').waitFor({ state: 'attached' });
  }
  assert.deepEqual(requests, [], 'Studio and The Underground request no Newsreader file');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(saved('quiet-room'))]);
  await page.reload();
  await page.locator('main#main').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.fonts.check('400 24px Newsreader'));
  await page.evaluate(() => document.fonts.ready);
  assert.ok(requests.length >= 1 && requests.every((p) => /newsreader-latin-400-normal|newsreader-latin-400-italic/.test(p)), requests.join(', '));
}));

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`keyboard: skip link, navigation and the menu work in an atmosphere, with a visible focus ring (${label})`, scenario(
    { viewport, storage: { [KEY]: saved('underground', 'daylight', 'zine') } },
    async ({ page, open }) => {
      await open('');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Skip to content');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
      // The first shell link gets a focus ring in the set's focus colour (tested ≥ 3:1).
      await page.locator('[data-shell="header"] a').first().focus();
      const ring = await page.evaluate(() => {
        const cs = getComputedStyle(document.activeElement!);
        return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
      });
      assert.notEqual(ring.style, 'none');
      assert.ok(parseFloat(ring.width) >= 2, `ring ${ring.width}`);
      const ratio = contrast(rgbOf(ring.color), rgbOf(pageColour('underground', 'daylight').rgb));
      assert.ok(ratio >= 3, `focus ring ${ring.color} is ${ratio.toFixed(2)}:1 on the Daylight page`);
      // Open the menu from the keyboard, close it with Escape, and land back on the opener.
      const opener = viewport ? page.locator('[data-shell="tabbar"]').getByRole('button', { name: 'More' }) : page.getByRole('button', { name: 'Open menu' });
      await opener.focus();
      await page.keyboard.press('Enter');
      await page.locator('[data-shell="menu"]').waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close menu');
      await page.keyboard.press('Escape');
      await page.locator('[data-shell="menu"]').waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-controls') === 'more-menu');
      // Follow a link from the keyboard.
      const link = viewport ? page.locator('[data-shell="tabbar"]').getByRole('link', { name: 'Discover' }) : page.locator('[data-shell="nav"]').getByRole('link', { name: 'Discover' });
      await link.focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/#\/discover$/);
      await page.locator(`${viewport ? '[data-shell="tabbar"]' : '[data-shell="nav"]'} [aria-current="page"]`, { hasText: 'Discover' }).waitFor();
    },
  ));
}

test('owner tools open as usual in an atmosphere', scenario({ storage: { [KEY]: saved('studio', 'night', 'mono') } }, async ({ page, open }) => {
  await open('backup');
  await page.getByLabel('Private repository').waitFor();
  await page.getByLabel('Fine-grained access token').waitFor();
  assert.equal((await shell(page)).look, 'studio');
}));
