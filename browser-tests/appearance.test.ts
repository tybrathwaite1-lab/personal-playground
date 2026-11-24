/**
 * Creative Slice 03, Phase 3.2: the appearance foundation in a real browser. No controls ship
 * yet, so a saved appearance is seeded into localStorage as a future build would store it.
 * Checks: the default Playground is untouched; a saved atmosphere is applied and survives
 * reloads and navigation; anything malformed falls back safely without being rewritten;
 * blocked storage and other tabs are handled; owner Sync never carries it. Synthetic data only.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright-core';
import { browserSuite, MOBILE, scenario, STORAGE_KEY, type Session } from './helpers/harness.ts';
import { note, personal } from './helpers/data.ts';
import { FakeGitHub, SYNTHETIC_TOKEN } from './helpers/fake-github.ts';

browserSuite();

const KEY = 'personal-playground:appearance';
const lookAttrs = (page: Page) =>
  page.evaluate(() => {
    const d = document.documentElement.dataset;
    return { look: d.look ?? null, palette: d.lookPalette ?? null, type: d.lookType ?? null };
  });
const NONE = { look: null, palette: null, type: null };
/** What the default Playground looks like, measured: page colour, Living Cover surface, atmosphere. */
const defaultLook = (page: Page) =>
  page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    cover: document.querySelector('[data-home-area="cover"]')?.getAttribute('data-surface'),
    atmosphere: document.documentElement.dataset.atmosphere,
  }));

for (const [label, viewport] of [['desktop', undefined], ['phone', MOBILE]] as const) {
  test(`with nothing chosen, the Playground is exactly as before and nothing is stored (${label})`, scenario({ viewport }, async ({ page, open, raw }) => {
    await open('');
    await page.locator('[data-home-area="cover"]').waitFor();
    assert.deepEqual(await lookAttrs(page), NONE, 'no appearance attributes on <html>');
    assert.deepEqual(await defaultLook(page), { body: 'rgb(20, 22, 20)', cover: 'teal', atmosphere: 'afternoon' }, 'the Living Cover at 3 PM, as today');
    for (const route of ['discover', 'pulse', 'collection', '']) await open(route);
    assert.equal(await raw(KEY), null, 'loading and navigating never write an appearance');
  }));
}

test('a saved atmosphere is applied, survives reloads and navigation, and is never rewritten by reading it', scenario(
  { storage: { [KEY]: { v: 1, look: 'quiet-room', custom: { 'quiet-room': { palette: 'lamplight', type: 'serif-sans' }, studio: { palette: 'night', type: 'mono' } } } } },
  async ({ page, open, reload, raw }) => {
    const stored = await (async () => {
      await open('');
      return raw(KEY);
    })();
    const want = { look: 'quiet-room', palette: 'lamplight', type: 'serif-sans' };
    assert.deepEqual(await lookAttrs(page), want);
    await reload();
    assert.deepEqual(await lookAttrs(page), want, 'after a reload');
    for (const route of ['discover', 'plan', 'notes', 'backup', '']) {
      await open(route);
      assert.deepEqual(await lookAttrs(page), want, `on #/${route}`);
    }
    assert.equal(await raw(KEY), stored, 'the stored value is byte-identical');
    // No styles use these attributes yet: the page still renders the default Playground.
    await page.locator('[data-home-area="cover"]').waitFor();
    assert.deepEqual(await defaultLook(page), { body: 'rgb(20, 22, 20)', cover: 'teal', atmosphere: 'afternoon' });
  },
));

const MALFORMED: [string, string, Record<string, string | null>][] = [
  ['not JSON', '{look: studio', NONE],
  ['a bare string', '"studio"', NONE],
  ['an unversioned object', '{"look":"studio"}', NONE],
  ['a future version', '{"v":2,"look":"studio"}', NONE],
  ['an unknown atmosphere', '{"v":1,"look":"brutalist"}', NONE],
  ['an unknown colour set', '{"v":1,"look":"studio","custom":{"studio":{"palette":"neon","type":"mono"}}}', { look: 'studio', palette: 'poster', type: 'mono' }],
  ['another atmosphere’s colour set', '{"v":1,"look":"underground","custom":{"underground":{"palette":"linen","type":"zine"}}}', { look: 'underground', palette: 'newsstand', type: 'zine' }],
  ['a malformed adjustment', '{"v":1,"look":"quiet-room","custom":{"quiet-room":"sage"}}', { look: 'quiet-room', palette: 'linen', type: 'book' }],
];
for (const [what, value, want] of MALFORMED) {
  test(`malformed storage (${what}) falls back safely and is left as it was`, scenario({ storage: { [KEY]: value } }, async ({ page, open, raw }) => {
    await open('');
    await page.locator('[data-home-area="cover"]').waitFor();
    assert.deepEqual(await lookAttrs(page), want);
    assert.equal(await raw(KEY), value, 'not rewritten');
  }));
}

test('blocked storage: the app opens normally with the default Playground', scenario({}, async ({ page, ctx, open }) => {
  await ctx.addInitScript((k) => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === k) throw new DOMException('The operation is insecure.', 'SecurityError');
      return get.call(this, key);
    };
  }, KEY);
  await open('');
  await page.locator('[data-home-area="cover"]').waitFor();
  assert.deepEqual(await lookAttrs(page), NONE);
}));

test('another tab saving or clearing an appearance updates this one', scenario({}, async ({ page, ctx, open }) => {
  await open('');
  const other = await ctx.newPage();
  await other.goto(page.url());
  await other.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, look: 'underground', custom: { underground: { palette: 'forest', type: 'poster' } } })), KEY);
  await page.waitForFunction(() => document.documentElement.dataset.look === 'underground');
  assert.deepEqual(await lookAttrs(page), { look: 'underground', palette: 'forest', type: 'poster' });
  await other.evaluate((k) => localStorage.setItem(k, 'garbage'), KEY);
  await page.waitForFunction(() => !document.documentElement.dataset.look);
  await other.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, look: 'studio', custom: {} })), KEY);
  await page.waitForFunction(() => document.documentElement.dataset.look === 'studio');
  await other.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.waitForFunction(() => !document.documentElement.dataset.look);
  await other.close();
}));

test('owner Sync never carries the appearance: not in personal data, the sync file or its settings mirror', scenario(
  {
    storage: {
      [STORAGE_KEY]: personal({ fieldNotes: [note('mine-1', 'Sample note on this device')] }),
      [KEY]: { v: 1, look: 'studio', custom: { studio: { palette: 'sherbet', type: 'mono' } } },
    },
    github: new FakeGitHub(),
  },
  async (s: Session) => {
    const repo = s.github!.addRepo('sample-owner/sample-data');
    await s.open('backup');
    await s.page.getByLabel('Private repository').fill('sample-owner/sample-data');
    await s.page.getByLabel('Fine-grained access token').fill(SYNTHETIC_TOKEN);
    await s.page.getByRole('button', { name: 'Connect & sync' }).click();
    await s.page.getByText('Last synced just now').waitFor();
    assert.equal((await lookAttrs(s.page)).look, 'studio', 'the appearance is in effect on this device');
    const file = JSON.stringify(repo.file);
    assert.ok(file.includes('fieldNotes:mine-1'), 'personal data synced');
    assert.equal(/appearance|sherbet|"look"/i.test(file), false, 'no appearance in the sync file or its settings mirror');
    assert.equal(/appearance|sherbet/.test((await s.raw(STORAGE_KEY))!), false, 'none in personal data');
  },
));
